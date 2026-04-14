import { ArrowsClockwise, Gift, Spinner } from "@phosphor-icons/react";
import { Box } from "@radix-ui/themes";
import { useUpdateStore } from "@stores/updateStore";
import { AnimatePresence, motion } from "framer-motion";

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const isEnabled = useUpdateStore((s) => s.isEnabled);
  const installUpdate = useUpdateStore((s) => s.installUpdate);

  const isVisible =
    isEnabled &&
    (status === "downloading" || status === "ready" || status === "installing");

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="shrink-0 overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {status === "downloading" && (
              <BannerContent key="downloading">
                <Spinner size={16} className="animate-spin" />
                <span>Downloading update...</span>
              </BannerContent>
            )}

            {status === "ready" && (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Box className="p-2">
                  <div
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px]"
                    style={{
                      backgroundColor: "var(--green-a3)",
                      color: "var(--green-11)",
                    }}
                  >
                    <motion.div
                      className="shrink-0"
                      animate={{
                        rotate: [0, -12, 12, -8, 8, -4, 0],
                      }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        repeatDelay: 4,
                        ease: "easeInOut",
                      }}
                    >
                      <Gift size={20} weight="duotone" />
                    </motion.div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium">
                        {version ? `Updated to ${version}` : "Update available"}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--green-a11)" }}
                      >
                        Restart to apply
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded px-2 py-1 font-medium text-[12px] transition-colors"
                      style={{
                        backgroundColor: "var(--green-a4)",
                        color: "var(--green-11)",
                      }}
                      onClick={() => void installUpdate()}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--green-a5)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--green-a4)";
                      }}
                    >
                      Restart
                    </button>
                  </div>
                </Box>
              </motion.div>
            )}

            {status === "installing" && (
              <motion.div
                key="installing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Box className="p-2">
                  <div
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 font-medium text-[13px]"
                    style={{
                      backgroundColor: "var(--green-a3)",
                      color: "var(--green-11)",
                    }}
                  >
                    <ArrowsClockwise
                      size={16}
                      className="shrink-0 animate-spin"
                    />
                    <span>Restarting...</span>
                  </div>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BannerContent({
  children,
  ...props
}: { children: React.ReactNode } & React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="p-2"
      {...props}
    >
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]"
        style={{
          backgroundColor: "var(--green-a3)",
          color: "var(--green-11)",
        }}
      >
        {children}
      </div>
    </motion.div>
  );
}
