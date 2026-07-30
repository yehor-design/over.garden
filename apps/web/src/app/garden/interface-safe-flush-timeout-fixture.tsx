"use client";

import { useEffect } from "react";

import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";

/**
 * Loopback/preview-only browser fault injection. It models the critical shape:
 * a participant has synchronously acquired its recovery handle while durable
 * storage never settles. The page gate admits this component only after the
 * visual-fixture environment is fail-closed.
 */
export function InterfaceSafeFlushTimeoutFixture() {
  useEffect(
    () =>
      interfaceLocaleChangeCoordinator.register({
        id: "visual-fixture:safe-flush-timeout",
        kind: "safe-flush",
        prepare: () => ({
          ready: new Promise<void>(() => undefined),
          cancel: async () => undefined,
          resume: async () => undefined,
        }),
      }),
    [],
  );

  return <span hidden data-interface-safe-flush-timeout-fixture="true" />;
}
