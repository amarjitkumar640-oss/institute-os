// Fixed, structural colors only — these never vary by tenant. Brand-configurable
// colors (primary/secondary/accent) and the derived safeArea shade live in
// ThemeContext and must be read via useThemeColors(), not from here.
export const C = {
  orange:      "#E8752C",
  blue:        "#2563A8",
  purple:      "#5B2D8E",
  green:       "#1B9C63",
  red:         "#C0392B",
  purpleBg:    "#F3EDFF",
  greenBg:     "#EAF7F1",
  bg:          "#FFFBF0",
  card:        "#FFFFFF",
  text:        "#2B1B1F",
  muted:       "#8A7F82",
  placeholder: "#B8ACAF",
  border:      "#EDE8E3",
  inputBg:     "#FAF6F4",
} as const;
