import type { ReactNode } from "react";

type ListSize = "1" | "1.5" | "2" | "3";

interface ListProps {
  children: ReactNode;
  size?: ListSize;
  as?: "ul" | "ol";
}

interface ListItemProps {
  children: ReactNode;
  size?: ListSize;
}

const sizeStyles: Record<ListSize, { className: string; itemSpacing: string }> =
  {
    "1": {
      className: "text-[13px] leading-snug",
      itemSpacing: "mb-1",
    },
    "1.5": {
      className: "text-[13.5px] leading-snug",
      itemSpacing: "mb-1",
    },
    "2": {
      className: "text-sm leading-snug",
      itemSpacing: "mb-1",
    },
    "3": {
      className: "text-base leading-snug",
      itemSpacing: "mb-2",
    },
  };

export function List({ children, as = "ul" }: ListProps) {
  const Component = as;

  return (
    <Component
      className={`mt-2 mb-3 list-outside marker:text-[var(--accent-10)] ${
        as === "ol" ? "list-decimal pl-6" : "list-disc pl-4"
      }`}
    >
      {children}
    </Component>
  );
}

export function ListItem({ children, size = "2" }: ListItemProps) {
  const styles = sizeStyles[size];

  return (
    <li
      className={`text-(--gray-12) ${styles.className} ${styles.itemSpacing}`}
    >
      {children}
    </li>
  );
}
