import React, { createContext, useCallback, useContext, useState } from "react";
import { AppAlert, type AlertConfig, type AlertType } from "../components/ui/AppAlert";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConfirmOpts {
  confirmLabel?: string;
  cancelLabel?:  string;
  destructive?:  boolean;
}

interface AlertContextValue {
  show:        (config: AlertConfig) => void;
  showAlert:   (title: string, message?: string, type?: AlertType) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, opts?: ConfirmOpts) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [config,  setConfig]  = useState<AlertConfig | null>(null);
  const [visible, setVisible] = useState(false);

  const show = useCallback((cfg: AlertConfig) => {
    setConfig(cfg);
    setVisible(true);
  }, []);

  const showAlert = useCallback((title: string, message?: string, type?: AlertType) => {
    show({ title, message, type: type ?? "info", buttons: [{ label: "OK" }] });
  }, [show]);

  const showConfirm = useCallback((
    title:     string,
    message:   string,
    onConfirm: () => void,
    opts?:     ConfirmOpts,
  ) => {
    show({
      title,
      message,
      type: opts?.destructive ? "warning" : "info",
      buttons: [
        { label: opts?.cancelLabel  ?? "Cancel",  style: "cancel"  },
        { label: opts?.confirmLabel ?? "Confirm", style: opts?.destructive ? "danger" : "primary", onPress: onConfirm },
      ],
    });
  }, [show]);

  function onClose() {
    setVisible(false);
  }

  return (
    <AlertContext.Provider value={{ show, showAlert, showConfirm }}>
      {children}
      <AppAlert visible={visible} config={config} onClose={onClose} />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlert must be used within AlertProvider");
  return ctx;
}
