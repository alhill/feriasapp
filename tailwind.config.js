/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff9ff',
          100: '#daf1ff',
          200: '#b9e7ff',
          300: '#84d8ff',
          400: '#47c2ff',
          500: '#1da3f5',
          600: '#0784d2',
          700: '#0968aa',
          800: '#0d588c',
          900: '#114a75',
        },
      },
    },
  },
  plugins: [],
};
