import { ArrowsClockwise, Gift, Spinner } from "@phosphor-icons/react";
import { Box } from "@radix-ui/themes";
import { useUpdateStore } from "@stores/updateStore";
import { AnimatePresence, motion } from "framer-motion";

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const isEnabled = useUpdateStore((s) => s.isEnabled);
  const installUpdate = useUpdateStore((s) => s.installUpdate);

  const isVisible = isEnabled && status !== "idle";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="shrink-0 overflow-hidden border-gray-6 border-t"
        >
          <AnimatePresence mode="wait">
            {status === "checking" && (
              <BannerContent key="checking">
                <Spinner size={14} className="animate-spin" />
                <span>Checking for updates...</span>
              </BannerContent>
            )}

            {status === "downloading" && (
              <BannerContent key="downloading">
                <Spinner size={14} className="animate-spin" />
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
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-medium text-[13px] transition-colors"
                    style={{
                      backgroundColor: "var(--green-a3)",
                      color: "var(--green-11)",
                    }}
                    onClick={() => void installUpdate()}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--green-4)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--green-a3)";
                    }}
                  >
                    <Gift size={16} weight="duotone" className="shrink-0" />
                    <span className="flex-1">
                      {version ? `Update to ${version}` : "Update available"}
                    </span>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 font-semibold text-[11px]"
                      style={{
                        backgroundColor: "var(--green-a4)",
                        color: "var(--green-11)",
                      }}
                    >
                      Relaunch
                    </span>
                  </button>
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
      className="flex items-center gap-2 px-3 py-2 text-[13px]"
      style={{ color: "var(--green-11)" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
