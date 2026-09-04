import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'dashboard'
  | 'products'
  | 'orders'
  | 'earnings'
  | 'reviews'
  | 'promotions'
  | 'profile'
  | 'menu'
  | 'close'
  | 'bell'
  | 'arrow-right'
  | 'plus';

const paths: Record<IconName, ReactNode> = {
  dashboard: <><path d="M3 12h7V3H3v9Zm0 9h7v-5H3v5Zm11 0h7v-9h-7v9Zm0-18v5h7V3h-7Z" /></>,
  products: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></>,
  orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  earnings: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M16 12h3M7 9h5M7 15h3" /></>,
  reviews: <><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></>,
  promotions: <><path d="M20 13 13 20l-9-9V4h7l9 9Z" /><path d="M8.5 8.5h.01" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  'arrow-right': <><path d="m9 18 6-6-6-6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
