/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: "var(--nexus-bg)",
          panel: "var(--nexus-panel)",
          panel2: "var(--nexus-panel2)",
          border: "var(--nexus-border)",
          text: "var(--nexus-text)",
          muted: "var(--nexus-muted)",
          accent: "var(--nexus-accent)",
          accent2: "var(--nexus-accent2)",
          danger: "var(--nexus-danger)",
          success: "var(--nexus-success)",
        },
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
