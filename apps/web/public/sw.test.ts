import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

const APP_ROOT = new URL("..", import.meta.url).pathname;
const SOURCE_ROOT = join(APP_ROOT, "src");
const SERVICE_WORKER_PATH = join(APP_ROOT, "public", "sw.js");

describe("foreground-only service worker contract", () => {
  it("keeps the public service worker free of fetch and background sync handlers", () => {
    const source = readFileSync(SERVICE_WORKER_PATH, "utf8");

    expect(source).not.toMatch(/addEventListener\s*\(\s*["']sync["']/i);
    expect(source).not.toMatch(/addEventListener\s*\(\s*["']periodicsync["']/i);
    expect(source).not.toMatch(/addEventListener\s*\(\s*["']fetch["']/i);
    expect(source).not.toMatch(/\b(?:on)?sync\s*=/i);
  });

  it("contains no production registration or runtime import for Background Sync", () => {
    const sources = runtimeSources(SOURCE_ROOT);
    const joined = sources.map((path) => readFileSync(path, "utf8")).join("\n");

    expect(joined).not.toMatch(/\.sync\s*\.\s*register\s*\(/i);
    expect(joined).not.toMatch(/periodicSync\s*\.\s*register\s*\(/i);
    expect(joined).not.toMatch(/addEventListener\s*\(\s*["']sync["']/i);
    expect(joined).not.toMatch(/serviceWorker[^\n]{0,160}autosync/i);
  });
});

function runtimeSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSources(path);
    if (!entry.isFile() || ![".js", ".ts", ".tsx"].includes(extname(path))) {
      return [];
    }
    if (/\.(?:test|spec)\.[^.]+$/u.test(path)) return [];
    return [path];
  });
}
