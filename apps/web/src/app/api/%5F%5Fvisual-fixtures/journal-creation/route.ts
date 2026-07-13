import {
  tryResolveVisualFixtureEnvironment,
  type VisualFixtureEnvironment,
} from "@/lib/visual-fixtures/environment";
import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  executeVisualJournalCreationEvidence,
  type VisualJournalCreationEvidenceAction,
} from "@/server/visual-fixtures/journal-creation-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function POST(request: Request) {
  const environment = tryResolveVisualFixtureEnvironment(process.env);
  if (
    !environment ||
    !requestOriginMatchesEnvironment(request, environment, process.env)
  ) {
    return notFoundResponse();
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    scenarioId?: unknown;
  } | null;
  const action = normalizeAction(body?.action);
  const scenarioId =
    typeof body?.scenarioId === "string" ? body.scenarioId.trim() : "";
  const scenario = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.find(
    (candidate) => candidate.id === scenarioId,
  );

  if (!action || !scenario) {
    return Response.json(
      { error: "A manifest-owned scenario and valid action are required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const evidence = await executeVisualJournalCreationEvidence(
      action,
      scenario,
    );
    return Response.json(evidence, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Journal creation evidence failed.",
      },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }
}

export function requestOriginMatchesEnvironment(
  request: Request,
  environment: VisualFixtureEnvironment,
  env: Record<string, string | undefined> = process.env,
) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (environment.target === "local") {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  }

  const configuredHosts = [
    hostFromUrl(env.PUBLIC_SITE_URL),
    hostFromUrl(env.BETTER_AUTH_URL),
    hostFromVercelUrl(env.VERCEL_URL),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return configuredHosts.includes(hostname);
}

function hostFromUrl(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostFromVercelUrl(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? hostFromUrl(`https://${normalized}`) : null;
}

function normalizeAction(
  value: unknown,
): VisualJournalCreationEvidenceAction | null {
  return value === "reset" || value === "run" || value === "verify"
    ? value
    : null;
}

function notFoundResponse() {
  return new Response(null, {
    status: 404,
    headers: NO_STORE_HEADERS,
  });
}
