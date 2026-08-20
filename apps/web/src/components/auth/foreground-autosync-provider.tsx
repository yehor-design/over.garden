"use client";

import { createContext, useContext, useMemo } from "react";

interface ForegroundAutosyncContextValue {
  runManualMutation(mutationId: string): Promise<never>;
}

const ForegroundAutosyncContext =
  createContext<ForegroundAutosyncContextValue | null>(null);

/**
 * Compatibility shell retained until OVE-323 removes the old PWA surface.
 * Online-only composers never enqueue work, so this provider owns no timer,
 * connectivity listener, browser store, or automatic replay path.
 */
export function ForegroundAutosyncProvider({
  children,
}: {
  children: React.ReactNode;
  documentMutationGeneration: string | null;
  enabled: boolean;
}) {
  const value = useMemo<ForegroundAutosyncContextValue>(
    () => ({
      async runManualMutation(mutationId: string): Promise<never> {
        void mutationId;
        throw new Error("Legacy journal autosync is retired.");
      },
    }),
    [],
  );

  return (
    <ForegroundAutosyncContext.Provider value={value}>
      {children}
    </ForegroundAutosyncContext.Provider>
  );
}

export function useOptionalForegroundAutosync() {
  return useContext(ForegroundAutosyncContext);
}
