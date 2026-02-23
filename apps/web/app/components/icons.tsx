interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export function DownloadIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Download icon"
      {...props}
    >
      <title>Download</title>
      <path
        d="M10 3V13M10 13L6 9M10 13L14 9M3 17H17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowRightIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Arrow icon"
      {...props}
    >
      <title>Arrow</title>
      <path
        d="M7 10H17M17 10L13 6M17 10L13 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
