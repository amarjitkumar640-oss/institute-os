export const C = {
  primary:     "#8B1E3F",
  secondary:   "#F5B301",
  accent:      "#2CA6A4",
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
  safeArea:    "#5C0E23",
} as const;

export type ColorToken = keyof typeof C;
