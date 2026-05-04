import { radixThemePreset } from "radix-themes-tw";

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [radixThemePreset],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        "sync-rotate": "sync-rotate 3s ease-in-out infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
      keyframes: {
        "sync-rotate": {
          "0%": { transform: "rotate(0deg)" },
          "33%": { transform: "rotate(0deg)" },
          "66%": { transform: "rotate(360deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      colors: {
        posthog: {
          orange: "#f54d00",
          yellow: "#f8be2a",
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
        },
      },
      // fontFamily lives in globals.css `@theme` (--font-sans / --font-mono)
      // — the Tailwind v4 source of truth. Don't re-declare here.
    },
  },
  plugins: [],
  darkMode: "class",
};
