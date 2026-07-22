"use server";

import { headers } from "next/headers";

import {
  INTERFACE_SERVER_ACTION_PENDING_VISUAL_FIXTURE_DELAY_MS,
  isInterfaceServerActionPendingVisualFixtureRequest,
} from "@/lib/localization/localization-visual-fixture";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * A real, bounded Next.js Server Action used only by local browser QA. It has
 * no form fields, reads no mutation payload, and performs no product write.
 */
export async function holdInterfaceServerActionPendingVisualFixtureAction() {
  const fixtureEnvironment = tryResolveVisualFixtureEnvironment(process.env);
  if (fixtureEnvironment?.target !== "local") {
    throw new Error("The Server Action pending fixture is unavailable.");
  }

  const requestHeaders = await headers();
  const origin = parseLoopbackOrigin(requestHeaders.get("origin"));
  const referer = parseRequestUrl(requestHeaders.get("referer"));
  const nextAction = requestHeaders.get("next-action")?.trim();

  if (
    !origin ||
    !referer ||
    referer.origin !== origin ||
    !nextAction ||
    !isInterfaceServerActionPendingVisualFixtureRequest(referer)
  ) {
    throw new Error("The Server Action pending fixture request was rejected.");
  }

  await new Promise<void>((resolve) => {
    setTimeout(
      resolve,
      INTERFACE_SERVER_ACTION_PENDING_VISUAL_FIXTURE_DELAY_MS,
    );
  });
}

function parseLoopbackOrigin(value: string | null) {
  const url = parseRequestUrl(value);
  if (
    !url ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
    url.origin !== value
  ) {
    return null;
  }
  return url.origin;
}

function parseRequestUrl(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
