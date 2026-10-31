/* eslint-disable react-refresh/only-export-components -- icon factory: every export is a component */
import type { ReactNode, SVGProps } from 'react';

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

const mk = (paths: ReactNode) =>
  function Icon(p: IconProps) {
    return (
      <svg {...base} {...p}>
        {paths}
      </svg>
    );
  };

export const IconSearch = mk(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </>,
);
export const IconBarcode = mk(<path d="M4 6v12M7 6v12M10.5 6v12M14 6v12M17 6v12M20 6v12" />);
export const IconText = mk(<path d="M5 6h14M5 11h14M5 16h9" />);
export const IconCamera = mk(
  <>
    <path d="M4 8a2 2 0 012-2h2l1.5-2h5L16 6h2a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </>,
);
export const IconTag = mk(
  <>
    <path d="M3 12V4h8l9 9-8 8z" />
    <circle cx="7.5" cy="8.5" r="1" />
  </>,
);
export const IconBolt = mk(<path d="M13 3L5 14h6l-1 7 8-11h-6z" />);
export const IconRepeat = mk(
  <path d="M17 2l3 3-3 3M20 5H8a4 4 0 00-4 4v1M7 22l-3-3 3-3M4 19h12a4 4 0 004-4v-1" />,
);
export const IconCopy = mk(
  <>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </>,
);
export const IconBook = mk(<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13" />);
export const IconUser = mk(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0116 0" />
  </>,
);
export const IconPulse = mk(<path d="M3 12h4l3-8 4 16 3-8h4" />);
export const IconTrophy = mk(
  <path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5v2a3 3 0 003 3M16 6h3v2a3 3 0 01-3 3M12 13v4M9 21h6M10 17h4" />,
);
export const IconBell = mk(<path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0" />);
export const IconSpark = mk(<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />);
export const IconDownload = mk(<path d="M12 4v11M7 11l5 5 5-5M4 20h16" />);
export const IconDatabase = mk(
  <>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </>,
);
export const IconInfo = mk(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </>,
);
export const IconChevron = mk(<path d="M9 5l7 7-7 7" />);
export const IconScale = mk(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M8.5 9.5a4.5 4.5 0 017 0M12 9.5l1.6-1.6" />
  </>,
);
export const IconDrop = mk(<path d="M12 3s6 6.2 6 10.5a6 6 0 01-12 0C6 9.2 12 3 12 3z" />);
