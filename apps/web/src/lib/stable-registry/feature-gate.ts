/** The Release Center remains dark until OVE-259 has an approved rollout plan. */
export const STABLE_REGISTRY_RELEASE_CENTER_FLAG =
  "stable_registry_release_center" as const;

/** Guest read models are separately gated from the operator Release Center. */
export const STABLE_REGISTRY_PUBLIC_DISCOVERY_FLAG =
  "stable_registry_public_discovery" as const;

/**
 * Product selection is independent from the public guest explorer and the
 * operator Release Center. It remains dark until OVE-259 has proved the
 * activated Foundation, index parity, rollback, and signed-in save/read-back.
 */
export const STABLE_REGISTRY_PRODUCT_SELECTION_FLAG =
  "stable_registry_product_selection" as const;

export function isStableRegistryReleaseCenterEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const isVercelDeployment =
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview";
  return env.STABLE_REGISTRY_RELEASE_CENTER === "true" && !isVercelDeployment;
}

export function isStableRegistryPublicDiscoveryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.STABLE_REGISTRY_PUBLIC_DISCOVERY === "true";
}

export function isStableRegistryProductSelectionEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.STABLE_REGISTRY_PRODUCT_SELECTION === "true";
}
