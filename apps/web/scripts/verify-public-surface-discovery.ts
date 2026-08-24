import { spawnSync } from "node:child_process";

async function main() {
  const hasReactServerCondition =
    process.execArgv.some((value) =>
      value.includes("conditions=react-server"),
    ) || process.env.NODE_OPTIONS?.includes("conditions=react-server");

  if (!hasReactServerCondition) {
    const child = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        ...process.execArgv,
        ...process.argv.slice(1),
      ],
      { stdio: "inherit", env: process.env },
    );
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
    return;
  }

  const imported = await import("./verify-public-surface-discovery-runner");
  const loaded = imported as unknown as Partial<typeof imported> & {
    default?: typeof imported;
  };
  const run =
    loaded.runPublicSurfaceDiscoveryCli ??
    loaded.default?.runPublicSurfaceDiscoveryCli;
  if (!run) throw new Error("public_discovery_runner_unavailable");
  await run(process.argv.slice(2));
}

void main();
