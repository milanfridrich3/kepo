/** @type {import('tailwindcss').Config} */

// All colours come from CSS variables defined in src/index.css (light values
// on :root, dark values on .dark). Components use these semantic names, never
// raw palette colours and never `dark:` variants — changing a token there
// re-themes the entire product.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        canvas: token('canvas'),     // page background
        surface: token('surface'),   // cards, sidebar, dialogs
        sunken: token('sunken'),     // inputs-in-context, thumbnails, segmented tracks
        hover: token('hover'),       // hover / pressed fill on surfaces
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: token('ink'),           // primary text
        muted: token('muted'),       // secondary text / metadata
        faint: token('faint'),       // placeholders, decorative icons only
        brand: token('brand'),       // the one Kepo brand colour #331DAA — never theme-shifted
        accent: {
          DEFAULT: token('accent'),  // solid fills (primary button)
          hover: token('accent-hover'),
          soft: token('accent-soft'),// selected / active backgrounds
          ink: token('accent-ink'),  // accent-coloured text & icons
          fg: token('accent-fg'),    // text on solid accent
        },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
      },
      // Compact, refined type scale.
      fontSize: {
        title: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        heading: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        meta: ['0.8125rem', { lineHeight: '1.25rem' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
      },
      // Rounded, but controlled.
      borderRadius: {
        chip: '0.5rem',
        control: '0.625rem',
        card: '1rem',
        modal: '1.25rem',
      },
      boxShadow: {
        raised: '0 1px 2px rgb(0 0 0 / 0.06)',
        overlay: '0 24px 48px -12px rgb(0 0 0 / 0.28), 0 0 0 1px rgb(var(--line) / 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'sheet-up': { from: { opacity: '0', transform: 'translateY(24px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.97) translateY(4px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out both',
        'sheet-up': 'sheet-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'pop-in 160ms ease-out both',
        'toast-in': 'toast-in 180ms ease-out both',
      },
    },
  },
  plugins: [],
};
