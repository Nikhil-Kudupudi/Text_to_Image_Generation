// Page-local 24x24 stroke icons in the same style as components/Icon.tsx (which has no dice/copy/reuse).
const PATHS = {
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="0.6" fill="currentColor" />
      <circle cx="15" cy="15" r="0.6" fill="currentColor" />
      <circle cx="15" cy="9" r="0.6" fill="currentColor" />
      <circle cx="9" cy="15" r="0.6" fill="currentColor" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  reuse: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  shuffle: (
    <>
      <path d="M4 7h3.5c4.5 0 4.5 10 9 10H20" />
      <path d="M4 17h3.5c1.5 0 2.4-1.1 3.1-2.6" />
      <path d="M13.4 9.6C14.1 8.1 15 7 16.5 7H20" />
      <path d="m17.5 4.5 2.5 2.5-2.5 2.5" />
      <path d="m17.5 14.5 2.5 2.5-2.5 2.5" />
    </>
  ),
};

export type GenIconName = keyof typeof PATHS;

export function GenIcon({ name, size = 18 }: { name: GenIconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
