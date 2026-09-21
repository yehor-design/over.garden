import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { productionStylesheet } from "./render-screen-states";

/** Real interactive UI, bundled only into ignored local test artifacts. */
export async function renderComponentSpecimens() {
  const out = path.join(process.cwd(), "test-results/component-specimens");
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: ["scripts/fixtures/component-specimen.tsx"],
    outfile: path.join(out, "specimen.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    minify: true,
    alias: { "@": path.join(process.cwd(), "src") },
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  });
  const document = readFileSync(
    path.join(process.cwd(), ".next/server/app/uk/support.html"),
    "utf8",
  );
  const rootClass = document.match(/<html[^>]*class="([^"]+)"/)?.[1];
  if (!rootClass?.includes("variable"))
    throw new Error("Production font classes are missing");
  const stylesheet = productionStylesheet().replace(
    /url\(([^)]+\.woff2)\)/g,
    (_match, file: string) => {
      const font = readFileSync(
        path.resolve(process.cwd(), ".next/static/chunks", file),
      );
      return `url(data:font/woff2;base64,${font.toString("base64")})`;
    },
  );
  for (const locale of ["uk", "bg", "ru"])
    writeFileSync(
      path.join(out, `${locale}.html`),
      `<!doctype html><html lang="${locale}" class="${rootClass}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OverGarden component specimen</title><style>${stylesheet}</style></head><body><div id="specimen"></div><script src="./specimen.js"></script></body></html>`,
    );
  return out;
}
if (process.argv[1]?.endsWith("render-component-specimens.ts"))
  renderComponentSpecimens().then((out) => console.log(out));
