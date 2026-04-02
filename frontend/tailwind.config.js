/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        tide: '#0f766e',
        mist: '#e2f3f2',
        ember: '#f97316',
        shell: '#f8fafc',
      },
      boxShadow: {
        panel: '0 20px 50px rgba(15, 23, 42, 0.12)',
      },
      backgroundImage: {
        'smart-grid':
          'radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.08) 1px, transparent 0)',
      },
    },
  },
  plugins: [],
}
