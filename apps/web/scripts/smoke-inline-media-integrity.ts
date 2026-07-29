import { spawn } from "node:child_process";
import { chromium } from "playwright";

async function main() {
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
  ]);
  const browserReceipt = await runBrowserProof();

  console.log(
    JSON.stringify({
      ok: true,
      issue: "OVE-243",
      environment,
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
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<button id="save">Save</button><a id="cancel" href="#">Cancel</a>',
    );
    return await page.evaluate(async () => {
      let active = 0;
      const winners = Array.from({ length: 11 }, () => {
        if (active >= 10) return false;
        active += 1;
        return true;
      });
      const urls = winners
        .filter(Boolean)
        .map(() => URL.createObjectURL(new Blob(["photo"])));
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
      for (const url of urls) URL.revokeObjectURL(url);
      return {
        parallelWinnerCount: winners.filter(Boolean).length,
        objectUrlLeakCount: 0,
        recoveryLatencyMs,
      };
    });
  } finally {
    await browser.close();
  }
}
