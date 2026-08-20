import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForegroundAutosyncProvider,
  useOptionalForegroundAutosync,
} from "./foreground-autosync-provider";

interface AutosyncContext {
  runManualMutation(mutationId: string): Promise<never>;
}

function Probe({ onReady }: { onReady(value: AutosyncContext | null): void }) {
  onReady(useOptionalForegroundAutosync());
  return <span>fixture child</span>;
}

describe("retired foreground autosync provider", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  it("keeps its compatibility context inert for every session state", async () => {
    let current: AutosyncContext | null = null;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ForegroundAutosyncProvider
          documentMutationGeneration="opaque-generation"
          enabled={true}
        >
          <Probe onReady={(value) => (current = value)} />
        </ForegroundAutosyncProvider>,
      );
    });

    const context = current as AutosyncContext | null;
    if (!context) throw new Error("Expected the compatibility context.");
    await expect(context.runManualMutation("legacy-id")).rejects.toThrow(
      "Legacy journal autosync is retired.",
    );
    await act(async () => renderer.unmount());
  });

  it("contains no storage, timer, connectivity-listener, or replay dependency", async () => {
    const source = await readFile(
      fileURLToPath(
        new URL("./foreground-autosync-provider.tsx", import.meta.url),
      ),
      "utf8",
    );

    expect(source).not.toMatch(
      /@\/lib\/offline|navigator\.onLine|addEventListener|setInterval|setTimeout|IndexedDB|localStorage|serviceWorker|syncClaimed/u,
    );
  });
});
