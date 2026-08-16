import { useEffect } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { setupNotifications } from "./src/lib/pushNotifications";
import { ThemeProvider } from "./src/context/ThemeContext";
import { AppSplashScreen } from "./src/components/ui/AppSplashScreen";
import { AndroidNavBarBackground } from "./src/components/ui/AndroidNavBarBackground";

// Keep the native (OS-level) splash up until our own branded JS splash has
// painted its first frame, so there's no blank/white gap between the two —
// hidden below once App() commits its first render, whatever that is.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Set up notification handler + Android channel before any screen mounts.
setupNotifications();
import { OrgProvider } from "./src/context/OrgContext";
import { AuthProvider } from "./src/context/AuthContext";
import { NotificationBadgeProvider } from "./src/context/NotificationBadgeContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

// Apply Inter Regular as the default font for every Text in the app.
// Specific weights are handled by fontFamily alongside each fontWeight in styles.
const TextAny = Text as any;
if (!TextAny.defaultProps) TextAny.defaultProps = {};
TextAny.defaultProps.style = { fontFamily: "Inter_400Regular" };

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Runs after the first commit, regardless of fontsLoaded — that's the
  // earliest point our own JS splash (rendered by RootNavigator below,
  // gated on fontsLoaded/isLoading/orgLoading) is guaranteed to be on screen.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Always mount the full provider tree — including while fonts are still
  // loading — so AppSplashScreen renders from exactly one place (inside
  // RootNavigator) instead of a second, separate instance here. Two mounts
  // of the same splash meant two independent unmount/remount transitions
  // (a visible white flash each time) and two chances for the brand color
  // to visibly "correct itself" as ThemeProvider's async branding fetch
  // resolves — collapsing to one mount removes both.
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <OrgProvider>
          <AuthProvider>
            <NotificationBadgeProvider>
              <RootNavigator fontsLoaded={fontsLoaded} />
              <AndroidNavBarBackground />
            </NotificationBadgeProvider>
          </AuthProvider>
        </OrgProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
