import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
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
