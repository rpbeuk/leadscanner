/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: {
            DEFAULT: '#002B49',
            light: '#005587',
            dark: '#001829',
            surface: '#F0F5F9'
          },
          orange: {
            DEFAULT: '#EB690B',
            light: '#F28522',
            dark: '#C85300'
          }
        }
      }
    },
  },
  plugins: [],
}
