import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export const IconToday = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.5 2.5" />
  </svg>
);
export const IconDiary = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);
export const IconProgress = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 19h16" />
    <path d="M5 15l4-4 3 3 6-7" />
  </svg>
);
export const IconReports = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 20V11M12 20V5M18 20v-6" />
  </svg>
);
export const IconMore = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="6" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="18" cy="12" r="1.2" />
  </svg>
);
export const IconPlus = (p: IconProps) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconClose = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
