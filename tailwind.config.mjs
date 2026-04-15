// tailwind.config.mjs
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:           '#0d1117',
        surface:      '#161b22',
        border:       '#21262d',
        'border-subtle': '#30363d',
        text:         '#e6edf3',
        muted:        '#8b949e',
        blue:         '#388bfd',
        'blue-light': '#79c0ff',
        green:        '#3fb950',
        purple:       '#d2a8ff',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
};
