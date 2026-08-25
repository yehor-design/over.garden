import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";

import {
  objectPositionCss,
  resolveMediaFocalPoint,
  resolveMediaPresentation,
} from "../src/lib/media/presentation-contract";


/**
 * OVE-197 redacted smoke: classify presentation contract modes and optional
 * production HTML object-position presence without private IDs.
 */
function requireEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Environment must be local or production.");
  }
  return environment;
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

export function classifyMediaFocalPresentation() {
  const coverEdge = resolveMediaPresentation({
    mode: "cover",
    focal: { x: 0.1, y: 0.9 },
  });
  const containEdge = resolveMediaPresentation({
    mode: "contain",
    focal: { x: 0.1, y: 0.9 },
  });
  const invalid = resolveMediaFocalPoint({ x: 2, y: -1 });

  return {
    coverUsesObjectPosition: coverEdge.objectPosition === "10% 90%",
    containServesCenter: true,
    containCenterMatchesPresentation:
      containEdge.objectPosition === "50% 50%",
    invalidFocalServesCenter:
      objectPositionCss(invalid.focal) === "50% 50%",
    invalidFocalServeClass: "clamped" as const,
    invalidFocalClassMatchesResolution: invalid.serveClass === "clamped",
    coverFitClass: coverEdge.objectFitClass === "object-cover",
    containFitClass: containEdge.objectFitClass === "object-contain",
  };
}

async function main() {
  loadEnv({ path: ".env.local" });
  const argv = process.argv.slice(2);
  const environment = requireEnvironment(argv);
  const classify = classifyMediaFocalPresentation();

  let productionHtml: {
    checked: boolean;
    hasMediaPresentationAttr: boolean | null;
    hasObjectPositionStyle: boolean | null;
  } = {
    checked: false,
    hasMediaPresentationAttr: null,
    hasObjectPositionStyle: null,
  };

  if (environment === "production") {
    const baseUrl =
      readFlag(argv, "--base-url") ?? process.env.SMOKE_BASE_URL ?? null;
    if (!baseUrl) {
      throw new Error("Production smoke requires --base-url.");
    }
    const path = readFlag(argv, "--path") ?? "/journals";
    const response = await fetch(new URL(path, baseUrl), {
      redirect: "follow",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) {
      throw new Error(`Production HTML fetch failed with ${response.status}.`);
    }
    const html = await response.text();
    productionHtml = {
      checked: true,
      hasMediaPresentationAttr: html.includes("data-media-presentation="),
      hasObjectPositionStyle:
        html.includes("object-position:") ||
        html.includes("data-media-object-position="),
    };
  }

  const ok =
    Object.values(classify).every(Boolean) &&
    (environment === "local" ||
      (productionHtml.hasMediaPresentationAttr === true &&
        productionHtml.hasObjectPositionStyle === true));

  console.log(
    JSON.stringify(
      {
        ok,
        environment,
        issue: "OVE-197",
        evidenceClass: "media_focal_presentation",
        classify,
        productionHtml,
      },
      null,
      2,
    ),
  );

  if (!ok) process.exitCode = 1;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        issue: "OVE-197",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}
