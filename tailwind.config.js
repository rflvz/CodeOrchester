/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ignis Command - The Kinetic Terminal (intense red-orange heat)
        background: '#131313',
        surface: '#131313',
        'surface-container-low': '#1c1b1b',
        'surface-container': '#201f1f',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353534',
        'surface-container-lowest': '#0e0e0e',
        'surface-bright': '#3a3939',
        primary: '#ff5637',  // INTENSE orange-red for main accents
        'primary-container': '#ff3319',  // Even more intense red-orange
        'on-primary': '#ffffff',
        secondary: '#c20144',  // Deep red
        'secondary-container': '#8b0033',  // Darker deep red
        'on-secondary': '#ffffff',
        tertiary: '#7cd0ff',
        'tertiary-container': '#129bd0',
        'on-tertiary': '#00344a',
        error: '#ff5637',  // Use intense orange-red for errors too
        'error-container': '#93000a',
        'on-error': '#ffffff',
        'on-surface': '#e5e2e1',
        'on-surface-variant': '#e5bdb6',
        outline: '#ac8881',
        'outline-variant': '#5c403a',
        'surface-variant': '#353534',
        'surface-dim': '#131313',
        'surface-tint': '#ff5637',
      },
      fontFamily: {
        headline: ['Space Grotesk', 'sans-serif'],
        body: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
      },
    },
  },
  plugins: [],
};
