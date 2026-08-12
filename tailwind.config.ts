import type { Config } from "tailwindcss";

/**
 * Every value here resolves to a CSS variable defined in app/globals.css.
 * Components must never hardcode a colour, font size, or spacing value
 * (docs/design-system.md). Spacing and font tokens are density-scaled via
 * the `--density` multiplier set by the route-group layouts.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./server/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "var(--surface-card)",
      ink: "var(--ink)",
      "ink-muted": "var(--ink-muted)",
      brand: "var(--brand)",
      "brand-wash": "var(--brand-wash)",
      surface: "var(--surface)",
      "surface-card": "var(--surface-card)",
      border: "var(--border)",
      success: "var(--success)",
      "success-wash": "var(--success-wash)",
      warn: "var(--warn)",
      "warn-wash": "var(--warn-wash)",
      danger: "var(--danger)",
      "danger-wash": "var(--danger-wash)",
    },
    spacing: {
      px: "1px",
      0: "0",
      1: "var(--space-1)",
      2: "var(--space-2)",
      3: "var(--space-3)",
      4: "var(--space-4)",
      6: "var(--space-6)",
      8: "var(--space-8)",
      12: "var(--space-12)",
    },
    borderRadius: {
      none: "0",
      control: "var(--radius-control)",
      card: "var(--radius-card)",
      pill: "var(--radius-pill)",
    },
    fontSize: {
      xs: "var(--text-xs)",
      sm: "var(--text-sm)",
      base: "var(--text-base)",
      lg: "var(--text-lg)",
      xl: "var(--text-xl)",
      "2xl": "var(--text-2xl)",
      "3xl": "var(--text-3xl)",
    },
    fontWeight: {
      normal: "400",
      medium: "500",
    },
    extend: {
      fontFamily: {
        sans: "var(--font-sans)",
      },
      minHeight: {
        touch: "var(--touch-min)",
      },
      minWidth: {
        touch: "var(--touch-min)",
      },
      ringWidth: {
        focus: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
