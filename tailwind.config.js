/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TSM — sistema "industry" (blueprint industrial)
        bg: "#f2f2f3",
        surface: "#e9e9ea",
        ink: {
          DEFAULT: "#1d1f20",
        },
        // Rampa azul (accent) del design system
        brand: {
          100: "#eef6ff",
          200: "#d6ebff",
          300: "#b5d9fd",
          400: "#94bce3",
          500: "#749dc4",
          600: "#597ea3",
          700: "#416180",
          800: "#2c455d",
          900: "#1d2d3d",
          DEFAULT: "#5980a6",
        },
        navy: "#1d2d3d",
        // Estados
        st: {
          amberBg: "#f6ecd9",
          amberBd: "#d9b877",
          amberTx: "#8a5a12",
          amberDot: "#b0731f",
          blueBg: "#d6ebff",
          blueBd: "#94bce3",
          blueTx: "#2c455d",
          blueDot: "#5980a6",
          greenBg: "#e0eee3",
          greenBd: "#8fbf9e",
          greenTx: "#2f6340",
          greenDot: "#3f7d4e",
          redBg: "#f6e2df",
          redBd: "#cf9a92",
          redTx: "#8c2f24",
          redDot: "#a63d33",
        },
      },
      fontFamily: {
        sans: ["'Public Sans'", "system-ui", "sans-serif"],
        cond: ["'Bricolage Grotesque'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        // La estética blueprint es de esquinas rectas.
        none: "0",
      },
      boxShadow: {
        "elev-sm": "0 1px 2px rgba(43,43,45,.14)",
        "elev-md": "0 3px 10px rgba(43,43,45,.16)",
        "elev-lg": "0 12px 32px rgba(43,43,45,.22)",
      },
    },
  },
  plugins: [],
};
