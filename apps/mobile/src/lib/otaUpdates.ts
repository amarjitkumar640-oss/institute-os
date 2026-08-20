import * as Updates from "expo-updates";
import { AppState, type AppStateStatus } from "react-native";

// Silent OTA updates for JS-only changes — never for native changes, which
// use the separate manual-APK flow (see AppUpdateContext.tsx). A fetched
// update is applied automatically on the next cold launch by expo-updates
// itself; reloadAsync() is deliberately never called here, so an update
// never lands mid-session (e.g. mid-form-fill).
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min
let lastCheckAt = 0;

export async function checkAndApplyUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;

  const now = Date.now();
  if (now - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
  lastCheckAt = now;

  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
    }
  } catch (e) {
    console.error("[ota] update check failed", e);
  }
}

// Checks once immediately (covers a resumed-from-background launch, since
// the native EXPO_UPDATES_CHECK_ON_LAUNCH scaffold only covers a true cold
// start) and again on every foreground transition thereafter.
export function registerOtaUpdateListener(): () => void {
  checkAndApplyUpdate();
  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") checkAndApplyUpdate();
  });
  return () => sub.remove();
}
