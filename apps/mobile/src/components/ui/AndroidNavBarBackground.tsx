import { View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../context/ThemeContext";

// Expo SDK 56 enforces edge-to-edge on Android, so the system navigation bar
// is always transparent — expo-navigation-bar no longer even exposes a
// background-color setter (removed, not just broken; confirmed against the
// SDK 56 docs). The only way to make that strip read as brand-colored is to
// paint a real View behind it, sized to the bottom safe-area inset — same
// technique used for the status bar in BatchListScreen's modal. Rendered
// once at the app root so every screen gets it without per-screen edits.
export function AndroidNavBarBackground() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  if (Platform.OS !== "android" || insets.bottom <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position:        "absolute",
        left:            0,
        right:           0,
        bottom:          0,
        height:          insets.bottom,
        backgroundColor: colors.primary,
      }}
    />
  );
}
