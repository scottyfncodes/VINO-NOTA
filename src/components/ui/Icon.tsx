import type { SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  atlas: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17M6.2 6.2c3.4 2.2 8.2 2.2 11.6 0M6.2 17.8c3.4-2.2 8.2-2.2 11.6 0" />
    </>
  ),
  journal: (
    <>
      <path d="M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" />
      <path d="M5 17.5a2 2 0 0 1 2-2h11.5M9 8.5h6M9 11.5h4" />
    </>
  ),
  capture: (
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  compendium: (
    <>
      <path d="M4 19.5h16" />
      <path d="M6.5 16.5v-5M10.5 16.5v-9M14.5 16.5v-6.5M18.5 16.5v-3" />
    </>
  ),
  regions: (
    <>
      <path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  down: <path d="m6 9.5 6 6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  edit: (
    <>
      <path d="M14.5 5.5l4 4L9 19H5v-4z" />
      <path d="M12.5 7.5l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M10 4h4M7 7l1 12.5h8L17 7" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" />
    </>
  ),
  grid: (
    <>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20 15.5-4.5-4.5L7 19.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9" />
      <path d="M5 15v3.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V15" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 20.5 19h-17z" />
      <path d="M12 10v4M12 16.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ),
  bottle: (
    <>
      <path d="M10 3.5h4v4c0 1 2.5 2 2.5 5.5v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7C7.5 9.5 10 8.5 10 7.5z" />
      <path d="M7.5 13h9" />
    </>
  ),
  merge: (
    <>
      <path d="M7 4.5v4c0 3 5 4 5 7.5v4M17 4.5v4c0 3-5 4-5 7.5" />
    </>
  ),
  signout: (
    <>
      <path d="M14 4.5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h8" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
