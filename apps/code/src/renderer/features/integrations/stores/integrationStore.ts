import { create } from "zustand";

export interface Integration {
  id: number;
  kind: string;
  [key: string]: unknown;
}

interface IntegrationStore {
  integrations: Integration[];
  setIntegrations: (integrations: Integration[]) => void;
}

interface IntegrationSelectors {
  githubIntegrations: Integration[];
  hasGithubIntegration: boolean;
}

export const useIntegrationStore = create<IntegrationStore>((set) => ({
  integrations: [],
  setIntegrations: (integrations) => set({ integrations }),
}));

export const useIntegrationSelectors = (): IntegrationSelectors => {
  const integrations = useIntegrationStore((state) => state.integrations);
  const githubIntegrations = integrations.filter((i) => i.kind === "github");

  return {
    githubIntegrations,
    hasGithubIntegration: githubIntegrations.length > 0,
  };
};
