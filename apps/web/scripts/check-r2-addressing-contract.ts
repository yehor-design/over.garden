import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  resolveR2AddressingReceipt,
  type R2AddressingReceipt,
} from "../src/lib/r2-addressing-contract";

export type R2AddressingCliArgs =
  | { mode: "prebuild"; environment?: undefined }
  | { mode: "read_back"; environment: "production" };

export function parseR2AddressingCliArgs(
  input: readonly string[],
): R2AddressingCliArgs {
  const argv = input.filter((value) => value !== "--");
  if (argv.length === 0) return { mode: "prebuild" };

  const supportedFlags = new Set([
    "--environment",
    "--confirm-environment",
    "--read-back",
  ]);
  const unsupportedFlag = argv.find(
    (value) => value.startsWith("--") && !supportedFlags.has(value),
  );
  if (unsupportedFlag) {
    throw new Error(`unsupported flag: ${unsupportedFlag}`);
  }
  if (!argv.includes("--read-back")) {
    throw new Error("explicit invocation requires --read-back");
  }
  if (flagValue(argv, "--environment") !== "production") {
    throw new Error("--environment must be production");
  }
  if (flagValue(argv, "--confirm-environment") !== "production") {
    throw new Error("requires --confirm-environment production");
  }
  return { mode: "read_back", environment: "production" };
}

export function runR2AddressingCheck(
  input: readonly string[] = [],
  env: Readonly<Record<string, string | undefined>> = process.env,
): R2AddressingReceipt {
  const args = parseR2AddressingCliArgs(input);
  return resolveR2AddressingReceipt(
    env,
    args.mode === "read_back" ? args.environment : undefined,
  );
}

export function formatR2AddressingCheck(receipt: R2AddressingReceipt) {
  return JSON.stringify(receipt);
}

function flagValue(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    pathToFileURL(path.resolve(entrypoint)).href ===
      pathToFileURL(fileURLToPath(import.meta.url)).href
  );
}

if (isDirectExecution()) {
  try {
    const receipt = runR2AddressingCheck(process.argv.slice(2));
    process.stdout.write(`${formatR2AddressingCheck(receipt)}\n`);
    if (receipt.enforcement === "refused") process.exitCode = 1;
  } catch {
    process.stdout.write(
      `${formatR2AddressingCheck({
        schemaVersion: "overgarden.r2-addressing.v1",
        environmentClass: "production",
        addressingClass: "invalid_configuration",
        enforcement: "refused",
      })}\n`,
    );
    process.exitCode = 1;
  }
}
