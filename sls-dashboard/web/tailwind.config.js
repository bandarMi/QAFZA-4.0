/**
 * Tailwind reads CSS custom properties, not literal hex values, so the entire UI
 * restyles when design-tokens.json changes — at runtime, with no rebuild.
 * See src/lib/tokens.ts, which pushes the token document onto :root.
 */
const v = (name) => `var(--sls-${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: v('brand-primary'), primary: v('brand-primary'), hover: v('brand-primaryHover'),
          active: v('brand-primaryActive'), soft: v('brand-primarySoft'), softer: v('brand-primarySofter'),
          on: v('brand-onPrimary'), accent: v('brand-accent'), accentHover: v('brand-accentHover'),
          accentSoft: v('brand-accentSoft'), secondary: v('brand-secondary'), secondarySoft: v('brand-secondarySoft'),
        },
        surface: { canvas: v('surface-canvas'), raised: v('surface-raised'), sunken: v('surface-sunken'), inverse: v('surface-inverse') },
        ink: { DEFAULT: v('ink-primary'), primary: v('ink-primary'), secondary: v('ink-secondary'), muted: v('ink-muted'), disabled: v('ink-disabled'), onInverse: v('ink-onInverse'), onInverseMuted: v('ink-onInverseMuted') },
        line: { subtle: v('border-subtle'), DEFAULT: v('border-default'), strong: v('border-strong') },
        state: {
          good: v('status-good'), goodSoft: v('status-goodSoft'), warning: v('status-warning'), warningSoft: v('status-warningSoft'),
          serious: v('status-serious'), seriousSoft: v('status-seriousSoft'), critical: v('status-critical'), criticalSoft: v('status-criticalSoft'),
          info: v('status-info'), infoSoft: v('status-infoSoft'), neutral: v('status-neutral'), neutralSoft: v('status-neutralSoft'),
        },
      },
      fontFamily: { sans: [v('font-sans')], mono: [v('font-mono')] },
      borderRadius: { xs: v('radius-xs'), sm: v('radius-sm'), md: v('radius-md'), lg: v('radius-lg'), xl: v('radius-xl'), pill: v('radius-pill') },
      boxShadow: { xs: v('shadow-xs'), sm: v('shadow-sm'), md: v('shadow-md'), lg: v('shadow-lg'), focus: v('shadow-focus') },
    },
  },
  plugins: [],
};
