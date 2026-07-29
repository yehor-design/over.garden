import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import ts from "typescript";

type Ove213ControllerApi = {
  attachJournalBlockReorderController(options: unknown): {
    sync(): void;
    destroy(): void;
  };
};

const require = createRequire(import.meta.url);

async function main() {
  await run("pnpm", [
    "exec",
    "vitest",
    "run",
    "src/components/garden/journal-block-reorder.test.tsx",
    "src/lib/garden/journal-composer-shared-owner.integration.test.ts",
  ]);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const controllerPath = path.join(
    root,
    "src/components/garden/journal-block-reorder-controller.ts",
  );
  const [controllerFile, editorJsSource] = await Promise.all([
    readFile(controllerPath, "utf8"),
    readFile(require.resolve("@editorjs/editorjs"), "utf8"),
  ]);
  const controllerSource = controllerFile
    .replace(/import[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace(/^export /gm, "");
  const browserDependencies = `
const OWNER_COMPOSER_REORDER_GESTURE_PARTICIPANT_ID = "owner-composer-reorder-gesture";
const interfaceLocaleChangeCoordinator = { register: () => () => undefined };
const applyMoveToOrderedIds = (ids) => ids;
const computeInsertBeforeIndexFromPointer = () => 0;
const formatReorderAnnouncement = () => "";
const mapEditorToolNameToTypeClass = (name) => name === "image" ? "image" : "paragraph";
const resolveDragInsertBefore = () => ({ kind: "noop" });
const resolveMoveByOffset = () => ({ kind: "noop" });
`;
  const source = `${browserDependencies}\n${
    ts.transpileModule(controllerSource, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
  }\nglobalThis.OVE213Controller = { attachJournalBlockReorderController };`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><body>
    <button id="save">Save</button><a id="cancel" href="#cancel">Cancel</a>
    <div id="holder"></div>
    </body></html>`);
    await page.addScriptTag({ content: editorJsSource });
    await page.addScriptTag({ content: "globalThis.__name = (target) => target;" });
    await page.addScriptTag({ content: source });
    const receipt = await page.evaluate(async () => {
      class SmokeImageTool {
        static get toolbox() {
          return { title: "Image" };
        }

        constructor(private readonly options: { data: Record<string, string> }) {}

        render() {
          const element = document.createElement("div");
          element.textContent = "Synthetic image";
          return element;
        }

        save() {
          return this.options.data;
        }
      }

      const holder = document.querySelector<HTMLElement>("#holder")!;
      const save = document.querySelector<HTMLButtonElement>("#save")!;
      const cancel = document.querySelector<HTMLAnchorElement>("#cancel")!;
      let saveClicks = 0;
      let cancelClicks = 0;
      save.addEventListener("click", () => saveClicks++);
      cancel.addEventListener("click", (event) => {
        event.preventDefault();
        cancelClicks++;
      });

      const blocks = Array.from({ length: 100 }, (_, index) =>
        index < 10
          ? {
              type: "image",
              data: { mediaAssetId: `synthetic-media-${index + 1}` },
            }
          : { type: "paragraph", data: { text: `Paragraph ${index + 1}` } },
      );
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
        }
      ).EditorJS;
      const editor = new EditorJSCtor({
        holder,
        autofocus: false,
        minHeight: 0,
        tools: { image: SmokeImageTool },
        data: { time: Date.now(), blocks },
      });
      await editor.isReady;

      const copy = {
        dragHandle: "Drag",
        moveUp: "Move up",
        moveDown: "Move down",
        movedAnnouncement: "{type} {position} {total}",
        blockType: {
          paragraph: "Paragraph",
          heading: "Heading",
          list: "List",
          quote: "Quote",
          delimiter: "Divider",
          image: "Image",
          unknown: "Block",
        },
      };

      let deliveries = 0;
      const observer = new MutationObserver(() => deliveries++);
      observer.observe(holder, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      const api = (globalThis as typeof globalThis & {
        OVE213Controller: Ove213ControllerApi;
      }).OVE213Controller;
      const controller = api.attachJournalBlockReorderController({
        editor,
        holder,
        getCopy: () => copy,
        onCommittedMove: async () => undefined,
        onAnnouncement: () => undefined,
      });

      const nextFrame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const twoFrames = async () => {
        await nextFrame();
        await nextFrame();
      };
      await twoFrames();
      const stableDeliveries = deliveries;
      controller.sync();
      await twoFrames();
      const noOpDeliveries = deliveries - stableDeliveries;

      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const idleDeliveries = deliveries - stableDeliveries;

      const startedAt = performance.now();
      await editor.blocks.insert("paragraph", { text: "Burst one" });
      await editor.blocks.insert("paragraph", { text: "Burst two" });
      await editor.blocks.insert("paragraph", { text: "Burst three" });
      save.click();
      cancel.click();
      await nextFrame();
      const composerSyncLatency = performance.now() - startedAt;
      const controlCount = holder.querySelectorAll(
        "[data-og-reorder-controls]",
      ).length;
      await nextFrame();
      const output = await editor.save();
      const imageMediaAssetIds = output.blocks
        .filter((block) => block.type === "image")
        .map((block) => block.data.mediaAssetId);

      controller.destroy();
      await editor.blocks.insert("paragraph", { text: "After destroy" });
      await twoFrames();
      const lateControls = holder.querySelectorAll(
        "[data-og-reorder-controls]",
      ).length;
      observer.disconnect();
      editor.destroy();

      return {
        noOpDeliveries,
        idleDeliveries,
        composerSyncLatency,
        controlCount,
        imageMediaAssetIds,
        saveClicks,
        cancelClicks,
        lateControls,
      };
    });

    const expectedImageMediaAssetIds = Array.from(
      { length: 10 },
      (_, index) => `synthetic-media-${index + 1}`,
    );
    const identityOrderPreserved =
      receipt.imageMediaAssetIds.join(",") ===
      expectedImageMediaAssetIds.join(",");
    const ok =
      receipt.noOpDeliveries === 0 &&
      receipt.idleDeliveries === 0 &&
      receipt.composerSyncLatency <= 34 &&
      receipt.controlCount === 103 &&
      identityOrderPreserved &&
      receipt.saveClicks === 1 &&
      receipt.cancelClicks === 1 &&
      receipt.lateControls === 0;
    console.log(
      JSON.stringify({
        ok,
        issue: "OVE-213",
        evidenceClass: "real-editorjs-controller",
        idleDeliveryClass: receipt.idleDeliveries === 0 ? "zero" : "nonzero",
        syncLatencyClass:
          receipt.composerSyncLatency <= 34 ? "within_budget" : "over_budget",
        mutationBurstClass:
          receipt.controlCount === 103 ? "converged" : "partial",
        imageIdentityClass: identityOrderPreserved ? "preserved" : "lost",
        waitControlsClass:
          receipt.saveClicks === 1 && receipt.cancelClicks === 1
            ? "responsive"
            : "unresponsive",
        teardownClass: receipt.lateControls === 0 ? "fenced" : "late_write",
      }),
    );
    if (!ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
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

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "OVE-213 smoke failed.",
  );
  process.exitCode = 1;
});
