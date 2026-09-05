/**
 * The public EPPO archive at `/sources/eppo` stays dark unless the environment
 * opens it.
 *
 * This is the one flag of the retired Stable Registry that ADR-0025 keeps: the
 * archive is the retained public reader of the EPPO observed capture. The
 * variable keeps the name production was configured with, because renaming a
 * production variable is a provider change with its own approval.
 */
export function isEppoArchiveEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.STABLE_REGISTRY_PUBLIC_DISCOVERY === "true";
}
