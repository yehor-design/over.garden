import process from "node:process";

import { config as loadEnv } from "dotenv";

import {
  runVisualFixtureCommand,
  type VisualFixtureCommand,
} from "../src/lib/visual-fixtures/command";

export async function runVisualFixtureCli(command: VisualFixtureCommand) {
  loadEnv({ path: ".env.local", quiet: true });

  try {
    const summary = await runVisualFixtureCommand(command, {
      env: process.env,
      rootDirectory: process.cwd(),
    });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          command,
          error: safeErrorMessage(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

function safeErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Visual fixture command failed.";
  return message
    .replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi, "[redacted-url]")
    .replace(/(secret|password|token|key)=\S+/gi, "$1=[redacted]");
}
