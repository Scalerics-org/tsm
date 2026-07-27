/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8ecbff",
          400: "#59acff",
          500: "#2f8bff",
          600: "#1a6cf5",
          700: "#1556e1",
          800: "#1846b6",
          900: "#1a3f8f",
        },
        ink: {
          900: "#0b1220",
          800: "#131c2e",
          700: "#1e293b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
