/** @type {import('tailwindcss').Config} */
// Matches apps/site/public/index.html's design tokens exactly (colors,
// fonts, card radius) — this portal is reached from that site's nav, so it
// needs to feel like the same site continuing, not a separate product.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "Noto Sans Devanagari", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        heading: ["Fredoka", "Noto Sans Devanagari", "sans-serif"],
      },
      colors: {
        primary: { DEFAULT: "#8f2e23", foreground: "#ffffff" },
        secondary: { DEFAULT: "#B45309", foreground: "#ffffff" },
        accent: { DEFAULT: "#F59E0B", foreground: "#1a1200" },
        surface: "#f6f5e3",
        ink: "#211A3A",
        "ink-soft": "#5B5478",
      },
      boxShadow: {
        card: "0 12px 28px -18px rgba(33,26,58,0.2)",
        "card-md": "0 20px 40px -18px rgba(33,26,58,0.28)",
      },
      borderRadius: { "2xl": "1rem", "3xl": "1.5rem" },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up": { "0%": { opacity: "0", transform: "translateY(14px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease",
        "slide-up": "slide-up 0.38s ease",
      },
    },
  },
  plugins: [],
};
