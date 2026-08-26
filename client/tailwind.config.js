/**
 * Theme extension mirrored from the Section 3 prototype's inline
 * `tailwind.config` (docs/prototype/01-BaringaAlumni - F04.1 Register.html).
 * Keep these values in step with that folder; it is the visual authority.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // The full type scale ships even where a screen does not yet use every step,
  // so later tickets can reach for any of them without a config change.
  safelist: ['text-32', 'text-24', 'text-20', 'text-16', 'text-14', 'text-12'],
  theme: {
    extend: {
      colors: {
        primary: '#8B5CF6',
        success: '#10B981',
        danger: '#F43F5E',
        warning: '#F59E0B',
        accent: '#14B8A6',
        'primary-text': '#6D28D9',
        'success-text': '#047857',
        'danger-text': '#BE123C',
        'warning-text': '#B45309',
        'accent-text': '#0F766E',
        'bg-page': '#F9FAFB',
        'near-black': '#111827',
        'secondary-text': '#6B7280',
        'border-light': '#E5E7EB',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        button: '8px',
        input: '8px',
        card: '12px',
      },
    },
  },
  plugins: [],
};
