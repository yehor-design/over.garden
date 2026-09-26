import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";

/** The acceptance screen (ADR-0038 D2): one address, before the workspace. */
export const LEGAL_ACCEPTANCE_PATH = "/auth/terms";

/** Where a person goes after accepting when nothing else is named. */
export const LEGAL_ACCEPTANCE_DEFAULT_NEXT = "/garden";

/**
 * The acceptance screen, carrying where the person was going. The return path
 * is checked like every other one: only an address of this site survives.
 */
export function legalAcceptanceHref(next?: string | null): string {
  const returnTo = normalizeInternalReturnPath(
    next,
    LEGAL_ACCEPTANCE_DEFAULT_NEXT,
  );
  return `${LEGAL_ACCEPTANCE_PATH}?next=${encodeURIComponent(returnTo)}`;
}
