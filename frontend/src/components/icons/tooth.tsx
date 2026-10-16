import type { SVGProps } from "react";

/** Ícono de diente (molar) con el trazo de lucide; lucide no trae uno. */
export function ToothIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M7.5 3C5 3 3.5 5 3.5 7.5c0 2 .8 3.4 1.5 5 .8 1.8 1 4 1.5 6.2.3 1.4 1 2.3 1.9 2.3 1.1 0 1.5-1.2 1.8-2.6.3-1.5.6-3.4 1.8-3.4s1.5 1.9 1.8 3.4c.3 1.4.7 2.6 1.8 2.6.9 0 1.6-.9 1.9-2.3.5-2.2.7-4.4 1.5-6.2.7-1.6 1.5-3 1.5-5C20.5 5 19 3 16.5 3c-1.9 0-2.9 1-4.5 1S9.4 3 7.5 3Z" />
    </svg>
  );
}
