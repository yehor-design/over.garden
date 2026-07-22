"use client";

import { useEffect } from "react";

import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";

/** Loopback/preview-only probe, gated by the server page before rendering. */
export function InterfaceSafeFlushFailureFixture() {
  useEffect(
    () =>
      interfaceLocaleChangeCoordinator.register({
        id: "visual-fixture:safe-flush-failure",
        kind: "safe-flush",
        prepare: async () => {
          throw new Error("Deterministic safe-flush failure fixture.");
        },
      }),
    [],
  );

  return <span hidden data-interface-safe-flush-failure-fixture="true" />;
}
