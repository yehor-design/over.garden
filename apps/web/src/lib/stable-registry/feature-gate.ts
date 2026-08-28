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

/**
 * Extension-pack writes are gated separately from the Foundation Release
 * Center: importing and activating a variety or breed pack is a distinct
 * decision from activating the Foundation itself.
 */
export const STABLE_REGISTRY_EXTENSION_PACKS_FLAG =
  "stable_registry_extension_packs" as const;

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

export function isStableRegistryExtensionPacksEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const isVercelDeployment =
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview";
  return env.STABLE_REGISTRY_EXTENSION_PACKS === "true" && !isVercelDeployment;
}

/**
 * The edition lifecycle is gated separately again: preparing and rolling back a
 * later edition is a distinct decision from activating the Foundation or
 * importing an extension pack.
 */
export const STABLE_REGISTRY_EDITIONS_FLAG =
  "stable_registry_editions" as const;

export function isStableRegistryEditionsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const isVercelDeployment =
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview";
  return env.STABLE_REGISTRY_EDITIONS === "true" && !isVercelDeployment;
}
