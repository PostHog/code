import { motion } from "framer-motion";

interface TourHighlightProps {
  active: boolean;
  children: React.ReactNode;
  borderRadius?: string;
  /** Set true for elements that should stretch to fill their container (e.g. editor) */
  fullWidth?: boolean;
  /** When true and not active, dim to show it's not the focus of attention */
  dimWhenInactive?: boolean;
  /**
   * Keep opacity at 1 without triggering the glow — use when a child component
   * is highlighted so this wrapper doesn't dim it via CSS opacity inheritance.
   */
  opaque?: boolean;
}

export function TourHighlight({
  active,
  children,
  borderRadius = "var(--radius-2)",
  fullWidth,
  dimWhenInactive,
  opaque,
}: TourHighlightProps) {
  const targetOpacity = active || opaque ? 1 : dimWhenInactive ? 0.35 : 1;

  return (
    <motion.div
      style={{
        borderRadius,
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        position: "relative",
        overflow: "visible",
      }}
      animate={
        active
          ? {
              boxShadow: [
                "0 0 0 1.5px var(--accent-a8), 0 0 8px 2px var(--accent-a5)",
                "0 0 0 1.5px var(--accent-a9), 0 0 12px 4px var(--accent-a6)",
                "0 0 0 1.5px var(--accent-a8), 0 0 8px 2px var(--accent-a5)",
              ],
              opacity: 1,
            }
          : {
              boxShadow: "0 0 0 0px transparent",
              opacity: targetOpacity,
            }
      }
      transition={
        active
          ? {
              boxShadow: {
                duration: 3,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              },
              opacity: { duration: 0.3 },
            }
          : { duration: 0.3 }
      }
    >
      {children}
    </motion.div>
  );
}
