/** @type {import('tailwindcss').Config} */
const ghostoveSlate = {
  50: '#f4f4f0',
  100: '#e8ede8',
  200: '#d6ded7',
  300: '#c0cbc2',
  400: '#a6b0a8',
  500: '#87938a',
  600: '#66776a',
  700: '#435449',
  800: '#2a382f',
  900: '#1a201c',
  950: '#111512',
};
const ghostoveAccent = {
  50: '#f0f6f1',
  100: '#e0eee3',
  200: '#c9dfce',
  300: '#b6d5c0',
  400: '#8fb39c',
  500: '#5b7c6a',
  600: '#436354',
  700: '#2f4a3a',
  800: '#243d30',
  900: '#192d23',
  950: '#101a14',
};

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: ghostoveSlate[950],
        surface: ghostoveSlate[900],
        border: ghostoveSlate[800],
        slate: ghostoveSlate,
        emerald: ghostoveAccent,
        teal: ghostoveAccent,
        violet: ghostoveAccent,
        purple: ghostoveAccent,
        indigo: ghostoveAccent,
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
