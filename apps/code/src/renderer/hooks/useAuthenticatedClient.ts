import { useAuthenticatedClient as useClient } from "@features/auth/hooks/authClient";

export function useAuthenticatedClient() {
  return useClient();
}
