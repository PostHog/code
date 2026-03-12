import { ThemeWrapper } from "@components/ThemeWrapper";
import { TRPCProvider, trpcClient } from "@renderer/trpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@utils/queryClient";
import type React from "react";
import { HotkeysProvider } from "react-hotkeys-hook";

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  return (
    <HotkeysProvider>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <ThemeWrapper>{children}</ThemeWrapper>
        </TRPCProvider>
      </QueryClientProvider>
    </HotkeysProvider>
  );
};
