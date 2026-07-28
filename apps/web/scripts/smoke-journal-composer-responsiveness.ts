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

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const controllerPath = path.join(
    root,
    "src/components/garden/journal-block-reorder-controller.ts",
  );
const controllerSource = (await readFile(controllerPath, "utf8"))
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
    await page.addScriptTag({ content: source });
    await page.addScriptTag({ content: "globalThis.__name = (target) => target;" });
    const receipt = await page.evaluate(async () => {
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

      const ids = Array.from({ length: 100 }, (_, index) => `block-${index}`);
      const blocks = new Map<
        string,
        { id: string; name: string; holder: HTMLElement }
      >();
      const appendBlock = (id: string, index: number) => {
        const element = document.createElement("div");
        element.className = "ce-block";
        element.dataset.id = id;
        holder.appendChild(element);
        blocks.set(id, {
          id,
          name: index < 10 ? "image" : "paragraph",
          holder: element,
        });
      };
      appendBlock(ids[0]!, 0);

      const editor = {
        blocks: {
          getBlocksCount: () => blocks.size,
          getBlockByIndex: (index: number) =>
            blocks.get([...blocks.keys()][index]!),
          getById: (id: string) => blocks.get(id),
          getBlockByElement: (element: Element) => {
            const id = (element as HTMLElement).dataset.id;
            return id ? blocks.get(id) : undefined;
          },
          getBlockIndex: (id: string) => [...blocks.keys()].indexOf(id),
          move: () => undefined,
        },
        caret: { setToBlock: () => undefined },
      };
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

      const twoFrames = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      await twoFrames();
      const stableDeliveries = deliveries;
      controller.sync();
      await twoFrames();
      const noOpDeliveries = deliveries - stableDeliveries;

      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const idleDeliveries = deliveries - stableDeliveries;

      const startedAt = performance.now();
      for (let index = 1; index < ids.length; index++)
        appendBlock(ids[index]!, index);
      save.click();
      cancel.click();
      await twoFrames();
      const composerSyncLatency = performance.now() - startedAt;
      const controlCount = holder.querySelectorAll(
        "[data-og-reorder-controls]",
      ).length;

      controller.destroy();
      const deliveriesAtDestroy = deliveries;
      appendBlock("after-destroy", 101);
      await twoFrames();
      observer.disconnect();

      return {
        noOpDeliveries,
        idleDeliveries,
        composerSyncLatency,
        controlCount,
        saveClicks,
        cancelClicks,
        lateControls: holder.querySelectorAll("[data-og-reorder-controls]")
          .length,
        lateDeliveries: deliveries - deliveriesAtDestroy,
      };
    });

    const ok =
      receipt.noOpDeliveries === 0 &&
      receipt.idleDeliveries === 0 &&
      receipt.composerSyncLatency <= 34 &&
      receipt.controlCount === 100 &&
      receipt.saveClicks === 1 &&
      receipt.cancelClicks === 1 &&
      receipt.lateControls === 0;
    console.log(
      JSON.stringify({
        ok,
        issue: "OVE-213",
        evidenceClass: "native-editorjs-controller",
        idleDeliveryClass: receipt.idleDeliveries === 0 ? "zero" : "nonzero",
        syncLatencyClass:
          receipt.composerSyncLatency <= 34 ? "within_budget" : "over_budget",
        mutationBurstClass:
          receipt.controlCount === 100 ? "converged" : "partial",
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

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "OVE-213 smoke failed.",
  );
  process.exitCode = 1;
});
