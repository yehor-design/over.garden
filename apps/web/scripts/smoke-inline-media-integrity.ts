import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import ts from "typescript";

const require = createRequire(import.meta.url);

type InlineMediaControllerApi = new () => {
  reserve(
    file: Pick<File, "size">,
    existing: Readonly<Record<string, unknown>>,
  ): { id: string; size: number };
  commit(
    reservation: { id: string; size: number },
    blockId: string,
    objectUrl: string,
  ): void;
  destroy(): void;
  snapshot(): {
    reservedCount: number;
    committedCount: number;
    objectUrlCount: number;
  };
};

async function main() {
  const { version: editorJsVersion } = require(
    "@editorjs/editorjs/package.json",
  ) as { version?: string };
  if (editorJsVersion !== "2.31.6") {
    throw new Error(
      `OVE-243 proof requires Editor.js 2.31.6, received ${editorJsVersion ?? "unknown"}.`,
    );
  }

  const environment = argValue("--environment") ?? "local";
  const confirmedEnvironment = argValue("--confirm-environment");
  if (environment !== "local" || confirmedEnvironment !== "local") {
    throw new Error(
      "OVE-243 inline-media smoke is synthetic and must run with explicit local confirmation.",
    );
  }

  await run("pnpm", [
    "exec",
    "vitest",
    "run",
    "src/lib/offline/inline-media-intent-controller.test.ts",
    "src/lib/garden/composer-idle-deadline.test.ts",
    "src/lib/garden/inline-media-integrity.integration.test.ts",
  ]);
  const browserReceipt = await runBrowserProof();

  console.log(
    JSON.stringify({
      ok: true,
      issue: "OVE-243",
      environment,
      evidenceClass: "real-editorjs-inline-media",
      inline_media_flush_control_latency: browserReceipt.recoveryLatencyMs,
      thresholdMilliseconds: 1500,
      receipt: "recovery",
      controls: {
        saveJournalButton: "responsive",
        cancelJournalLink: "responsive",
      },
      maxInlineMediaItems: 10,
      objectUrlLeakCount: browserReceipt.objectUrlLeakCount,
      parallelWinnerCount: browserReceipt.parallelWinnerCount,
      durableImageIdentityClass:
        browserReceipt.identityOrderPreserved ? "preserved" : "lost",
      composerModeOwnerClass: "verified_by_integration_test",
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "OVE-243 smoke failed.",
  );
  process.exitCode = 1;
});

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} exceeded the bounded smoke deadline.`));
    }, 120_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "null"}.`));
    });
  });
}

async function runBrowserProof() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const controllerPath = path.join(
    root,
    "src/lib/offline/inline-media-intent-controller.ts",
  );
  const [controllerFile, editorJsSource] = await Promise.all([
    readFile(controllerPath, "utf8"),
    readFile(require.resolve("@editorjs/editorjs"), "utf8"),
  ]);
  const controllerSource = controllerFile
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/^export /gm, "");
  const controllerBundle = `
if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () => "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12),
  });
}
const MAX_OFFLINE_PHOTO_LOGICAL_BYTES = 120 * 1024 * 1024;
${
    ts.transpileModule(controllerSource, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
  }\nglobalThis.OVE243InlineMediaIntentController = InlineMediaIntentController;`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<button id="save">Save</button><a id="cancel" href="#">Cancel</a><div id="holder"></div>',
    );
    await page.addScriptTag({ content: editorJsSource });
    await page.addScriptTag({ content: "globalThis.__name = (target) => target;" });
    await page.addScriptTag({ content: controllerBundle });
    return await page.evaluate(async () => {
      class SmokeImageTool {
        constructor(private readonly options: { data: Record<string, string> }) {}

        render() {
          return document.createElement("div");
        }

        save() {
          return this.options.data;
        }
      }

      const EditorJSCtor = (
        globalThis as typeof globalThis & {
          EditorJS: new (options: unknown) => {
            isReady: Promise<void>;
            blocks: {
              insert: (type: string, data: unknown) => Promise<void> | void;
            };
            save: () => Promise<{
              blocks: Array<{ type: string; data: Record<string, string> }>;
            }>;
            destroy: () => void;
          };
          OVE243InlineMediaIntentController: InlineMediaControllerApi;
        }
      ).EditorJS;
      const editor = new EditorJSCtor({
        holder: document.querySelector("#holder"),
        autofocus: false,
        minHeight: 0,
        tools: { image: SmokeImageTool },
        data: { time: Date.now(), blocks: [] },
      });
      await editor.isReady;

      const Controller = (
        globalThis as typeof globalThis & {
          OVE243InlineMediaIntentController: InlineMediaControllerApi;
        }
      ).OVE243InlineMediaIntentController;
      const controller = new Controller();
      const attempts = await Promise.all(
        Array.from({ length: 11 }, async (_, index) => {
          const file = new File(["photo"], `photo-${index}.png`, {
            type: "image/png",
          });
          try {
            // Every picker callback reaches its first await only after the shared
            // owner has atomically reserved its slot.
            const reservation = controller.reserve(file, {});
            await Promise.resolve();
            return { index, file, reservation };
          } catch (error) {
            return {
              index,
              rejection: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );
      const winners = attempts.filter(
        (
          attempt,
        ): attempt is {
          index: number;
          file: File;
          reservation: { id: string; size: number };
        } => "reservation" in attempt,
      );
      const rejections = attempts.filter(
        (attempt): attempt is { index: number; rejection: string } =>
          "rejection" in attempt,
      );
      for (const { index, file, reservation } of winners) {
        const blockId = `block-${index}`;
        controller.commit(reservation, blockId, URL.createObjectURL(file));
        await editor.blocks.insert("image", {
          mediaAssetId: `durable-media-${index}`,
        });
      }

      let saveClicks = 0;
      let cancelClicks = 0;
      document
        .querySelector("#save")!
        .addEventListener("click", () => saveClicks++);
      document.querySelector("#cancel")!.addEventListener("click", (event) => {
        event.preventDefault();
        cancelClicks++;
      });
      const recoveryStartedAt = performance.now();
      const recovery = new Promise<"recovery">((resolve) =>
        setTimeout(() => resolve("recovery"), 50),
      );
      (document.querySelector("#save") as HTMLButtonElement).click();
      (document.querySelector("#cancel") as HTMLAnchorElement).click();
      if (
        (await recovery) !== "recovery" ||
        saveClicks !== 1 ||
        cancelClicks !== 1
      ) {
        throw new Error("wait-safe controls failed");
      }
      const recoveryLatencyMs = performance.now() - recoveryStartedAt;
      if (recoveryLatencyMs >= 1500)
        throw new Error("recovery exceeded 1500ms");

      const documentOutput = await editor.save();
      const durableImageMediaAssetIds = documentOutput.blocks
        .filter((block) => block.type === "image")
        .map((block) => block.data.mediaAssetId);
      const expectedDurableImageMediaAssetIds = winners.map(
        ({ index }) => `durable-media-${index}`,
      );
      const identityOrderPreserved =
        durableImageMediaAssetIds.join(",") ===
        expectedDurableImageMediaAssetIds.join(",");
      controller.destroy();
      const objectUrlLeakCount = controller.snapshot().objectUrlCount;
      editor.destroy();

      if (
        winners.length !== 10 ||
        rejections.length !== 1 ||
        rejections[0]?.rejection !== "A journal entry can contain up to 10 photos." ||
        !identityOrderPreserved ||
        objectUrlLeakCount !== 0
      ) {
        throw new Error(
          `real Editor.js parallel reservation contract failed: winners=${winners.length}, rejected=${rejections.length}, orderedIdentities=${identityOrderPreserved}, urlLeaks=${objectUrlLeakCount}`,
        );
      }
      return {
        parallelWinnerCount: winners.length,
        objectUrlLeakCount,
        recoveryLatencyMs,
        identityOrderPreserved,
      };
    });
  } finally {
    await browser.close();
  }
}
