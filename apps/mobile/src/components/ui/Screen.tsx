import React from "react";
import { StatusBar, StyleSheet } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useThemeColors } from "../../context/ThemeContext";

interface Props {
  children: React.ReactNode;
  edges?: readonly Edge[];
  statusBarStyle?: "light-content" | "dark-content";
  /** Override the default themed safe-area background (rarely needed) */
  backgroundColor?: string;
}

/**
 * Standard screen shell: SafeAreaView + StatusBar + a themed background behind
 * the status-bar area. Centralizes what every screen used to hand-roll
 * (and hardcode a brand color into) so the status-bar-area color reacts to
 * tenant branding everywhere at once.
 */
export function Screen({ children, edges = ["bottom"], statusBarStyle = "light-content", backgroundColor }: Props) {
  const colors = useThemeColors();
  return (
    <SafeAreaView style={[s.fill, { backgroundColor: backgroundColor ?? colors.safeArea }]} edges={edges as Edge[]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor="transparent" translucent />
      {children}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
});
