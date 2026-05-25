/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1220',
        panel: '#111827',
        accent: '#38bdf8',
      },
    },
  },
  plugins: [],
};
