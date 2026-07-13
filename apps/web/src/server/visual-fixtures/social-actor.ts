import { resolveVisualSocialScenario } from "@/lib/visual-fixtures/social-return-scenarios";
import type {
  VisualFixtureSocialScenario,
  VisualFixtureSocialSurface,
} from "@/lib/visual-fixtures/manifest";

interface VisualSocialFormData {
  get(name: string): FormDataEntryValue | null;
}

export interface VisualSocialMutationActor {
  actorId: string;
  scenario: VisualFixtureSocialScenario;
}

export function resolveVisualSocialMutationActor(
  formData: VisualSocialFormData,
  allowedSurfaces: readonly VisualFixtureSocialSurface[],
  env: Record<string, string | undefined> = process.env,
): VisualSocialMutationActor | null {
  const directId = stringValue(formData.get("visualSocial"));
  const returnToId = visualSocialFromReturnTo(formData.get("returnTo"));
  if (directId && returnToId && directId !== returnToId) return null;

  const id = directId ?? returnToId;
  if (!id) return null;

  for (const surface of allowedSurfaces) {
    const scenario = resolveVisualSocialScenario(id, surface, env);
    if (scenario?.actorId) {
      return { actorId: scenario.actorId, scenario };
    }
  }

  return null;
}

function visualSocialFromReturnTo(value: FormDataEntryValue | null) {
  const raw = stringValue(value);
  if (!raw?.startsWith("/") || raw.startsWith("//")) return null;

  try {
    return stringValue(
      new URL(raw, "https://over.garden").searchParams.get("visualSocial"),
    );
  } catch {
    return null;
  }
}

function stringValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 96 ? normalized : null;
}
