import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pool: {
          DEFAULT: "#B9E5EC",
          light: "#D7EFF4",
          lighter: "#E5F6F9",
          dark: "#9FD3DD",
          darker: "#84C2CD",
          muted: "#A0C5CC",
        },
        cocoa: {
          DEFAULT: "#3D231E",
          hover: "#56342D",
          muted: "rgba(61, 35, 30, 0.55)",
        },
        solar: {
          DEFAULT: "#FFD33D",
          hover: "#FFDF66",
        },
        canopy: {
          blue: "#B9E5EC",
          cocoa: "#3D231E",
          yellow: "#FFD33D",
          ink: "#3D231E",
        },
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        soft: "0 16px 48px rgba(61, 35, 30, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
