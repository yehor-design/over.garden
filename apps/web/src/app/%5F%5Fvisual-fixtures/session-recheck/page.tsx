import { notFound } from "next/navigation";

import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { SessionRecheckVisualFixture } from "./session-recheck-visual-fixture";

export const dynamic = "force-dynamic";

/**
 * Local/preview-only browser harness for the SessionConvergenceBoundary race.
 * It contains synthetic markup only and remains unavailable outside the
 * already fail-closed visual-fixture environment.
 */
export default function SessionRecheckVisualFixturePage() {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();

  return <SessionRecheckVisualFixture />;
}
