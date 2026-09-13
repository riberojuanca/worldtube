import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    borderRadius: {
      none: '0',
      sm: '3px',
      DEFAULT: '3px',
      md: '3px',
      lg: '3px',
      xl: '3px',
      '2xl': '3px',
      '3xl': '3px',
      full: '3px'
    },
    extend: {}
  },
  plugins: []
} satisfies Config
