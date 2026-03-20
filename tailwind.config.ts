/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Dark mode driven by .light class on <html> (inverse: dark is default)
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#58A6FF',
          hover: '#79B8FF',
        },
        success: '#3FB950',
        danger: '#F85149',
      },
    },
  },
  plugins: [],
};
