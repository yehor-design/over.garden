import { resolveVisualCommunityScenario } from "@/lib/visual-fixtures/community-scenarios";
import type { VisualFixtureCommunityScenario } from "@/lib/visual-fixtures/manifest";

interface VisualCommunityFormData {
  get(name: string): FormDataEntryValue | null;
}

export interface VisualCommunityMutationActor {
  actorId: string;
  scenario: VisualFixtureCommunityScenario;
}

export function resolveVisualCommunityMutationActor(
  formData: VisualCommunityFormData,
  env: Record<string, string | undefined> = process.env,
): VisualCommunityMutationActor | null {
  const id = stringValue(formData.get("visualCommunity"));
  const slug = stringValue(formData.get("slug"));
  if (!id || !slug) return null;

  const scenario = resolveVisualCommunityScenario(id, env);
  if (
    !scenario?.actorId ||
    scenario.communitySlug !== slug ||
    scenario.expectedStatus !== 200
  ) {
    return null;
  }
  return { actorId: scenario.actorId, scenario };
}

function stringValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 96 ? normalized : null;
}
