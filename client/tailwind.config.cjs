/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        orbit: {
          bg: '#f4f6fb',
          surface: '#ffffff',
          muted: '#f0f2f9',
          border: '#e2e6f3',
          accent: '#6366f1',
          'accent-2': '#8b5cf6',
          text: '#1e2047',
          'text-2': '#6b7280',
          'text-3': '#9ca3af',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      borderRadius: {
        orbit: '12px',
        'orbit-sm': '8px',
      },
      boxShadow: {
        orbit: '0 1px 4px rgba(99,102,241,0.07), 0 4px 24px rgba(99,102,241,0.06)',
      },
    },
  },
  plugins: [],
};
