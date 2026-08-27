/** The Release Center remains dark until OVE-259 has an approved rollout plan. */
export const STABLE_REGISTRY_RELEASE_CENTER_FLAG =
  "stable_registry_release_center" as const;

export function isStableRegistryReleaseCenterEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const isVercelDeployment =
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview";
  return env.STABLE_REGISTRY_RELEASE_CENTER === "true" && !isVercelDeployment;
}
