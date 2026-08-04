// Font family constants — loaded via @expo-google-fonts/inter in App.tsx
export const F = {
  regular:   "Inter_400Regular",
  medium:    "Inter_500Medium",
  semibold:  "Inter_600SemiBold",
  bold:      "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
} as const;

// Fixed, structural colors only — these never vary by tenant. Brand-configurable
// colors (primary/secondary/accent) and the derived safeArea shade live in
// ThemeContext and must be read via useThemeColors(), not from here.
export const C = {
  orange:      "#E8752C",
  blue:        "#2563A8",
  purple:      "#5B2D8E",
  green:       "#1B9C63",
  red:         "#C0392B",
  purpleBg:    "#F0EBFF",
  greenBg:     "#E8F7F2",
  bg:          "#F4F4F6",
  card:        "#FFFFFF",
  text:        "#1C1C1E",
  muted:       "#8E8E93",
  placeholder: "#AEAEB2",
  border:      "#E5E5EA",
  inputBg:     "#F2F2F7",
} as const;
