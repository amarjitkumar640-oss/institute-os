import React, {
  createContext, useContext, useEffect, useRef, useState,
} from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth } from "./AuthContext";

const PIN_KEY       = "app_lock_pin";
const BIOMETRIC_KEY = "app_lock_biometric";

export type BiometricType = "face" | "fingerprint" | null;

interface AppLockContextValue {
  hasPin:             boolean;
  isLocked:           boolean;
  pinLoaded:          boolean;
  isBiometricEnabled: boolean;
  biometricType:      BiometricType;

  setupPin:        (pin: string, enableBiometric: boolean) => Promise<void>;
  verifyPin:       (pin: string) => Promise<boolean>;
  biometricUnlock: () => Promise<boolean>;
  toggleBiometric: (enabled: boolean) => Promise<void>;
  removePin:       () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { staff } = useAuth();

  const [hasPin,             setHasPin]             = useState(false);
  const [isLocked,           setIsLocked]           = useState(false);
  const [pinLoaded,          setPinLoaded]          = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [biometricType,      setBiometricType]      = useState<BiometricType>(null);

  // Detect biometric hardware once
  useEffect(() => {
    (async () => {
      const hasHW    = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHW || !enrolled) { setBiometricType(null); return; }
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("face");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("fingerprint");
      }
    })();
  }, []);

  // Load PIN + biometric preference on mount
  useEffect(() => {
    (async () => {
      const [pinVal, bioVal] = await Promise.all([
        SecureStore.getItemAsync(PIN_KEY),
        SecureStore.getItemAsync(BIOMETRIC_KEY),
      ]);
      const pinSet = !!pinVal;
      setHasPin(pinSet);
      setIsBiometricEnabled(bioVal === "1");
      if (pinSet && staff) setIsLocked(true);
      setPinLoaded(true);
    })();
  }, []);

  // Lock state tracks staff login/logout
  const prevStaff = useRef(staff);
  useEffect(() => {
    if (!staff) {
      setIsLocked(false);
    } else if (!prevStaff.current && staff) {
      SecureStore.getItemAsync(PIN_KEY).then((v) => {
        if (v) setIsLocked(true);
      });
    }
    prevStaff.current = staff;
  }, [staff]);

  // Background → foreground re-lock
  const wasBackground = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        wasBackground.current = true;
      } else if (nextState === "active" && wasBackground.current) {
        wasBackground.current = false;
        if (staff) {
          SecureStore.getItemAsync(PIN_KEY).then((v) => {
            if (v) setIsLocked(true);
          });
        }
      }
    });
    return () => sub.remove();
  }, [staff]);

  async function setupPin(pin: string, enableBiometric: boolean) {
    await SecureStore.setItemAsync(PIN_KEY, pin);
    await SecureStore.setItemAsync(BIOMETRIC_KEY, enableBiometric ? "1" : "0");
    setHasPin(true);
    setIsBiometricEnabled(enableBiometric);
    setIsLocked(false);
  }

  async function verifyPin(pin: string): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    if (stored === pin) { setIsLocked(false); return true; }
    return false;
  }

  async function biometricUnlock(): Promise<boolean> {
    const bioVal = await SecureStore.getItemAsync(BIOMETRIC_KEY);
    if (bioVal !== "1") return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:         "Unlock Institute OS",
      fallbackLabel:         "Use PIN",
      cancelLabel:           "Cancel",
      disableDeviceFallback: false,
    });
    if (result.success) { setIsLocked(false); return true; }
    return false;
  }

  async function toggleBiometric(enabled: boolean) {
    await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? "1" : "0");
    setIsBiometricEnabled(enabled);
  }

  async function removePin() {
    await SecureStore.deleteItemAsync(PIN_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
    setHasPin(false);
    setIsBiometricEnabled(false);
    setIsLocked(false);
  }

  return (
    <AppLockContext.Provider
      value={{
        hasPin, isLocked, pinLoaded, isBiometricEnabled, biometricType,
        setupPin, verifyPin, biometricUnlock, toggleBiometric, removePin,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}
