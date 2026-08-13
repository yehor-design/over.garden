export const CANONICAL_PRODUCTION_R2_ENDPOINT =
  "https://cb03b15042adc74edfe2d8201636300a.r2.cloudflarestorage.com" as const;

export type R2AddressingEnvironmentClass = "production" | "non_production";
export type R2AddressingClass =
  | "path_style"
  | "virtual_hosted_style"
  | "invalid_configuration"
  | "not_applicable";
export type R2AddressingEnforcement = "verified" | "refused" | "not_applicable";

export interface R2AddressingReceipt {
  schemaVersion: "overgarden.r2-addressing.v1";
  environmentClass: R2AddressingEnvironmentClass;
  addressingClass: R2AddressingClass;
  enforcement: R2AddressingEnforcement;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function resolveR2AddressingReceipt(
  env: Environment = process.env,
  environmentOverride?: "production" | "non_production",
): R2AddressingReceipt {
  const environmentClass = resolveEnvironmentClass(env, environmentOverride);
  if (environmentClass !== "production") {
    return {
      schemaVersion: "overgarden.r2-addressing.v1",
      environmentClass,
      addressingClass: "not_applicable",
      enforcement: "not_applicable",
    };
  }

  const endpointIsCanonical =
    env.R2_ENDPOINT === CANONICAL_PRODUCTION_R2_ENDPOINT;
  const forcePathStyle = env.R2_FORCE_PATH_STYLE;
  const addressingClass: R2AddressingClass = !endpointIsCanonical
    ? "invalid_configuration"
    : forcePathStyle === "true"
      ? "path_style"
      : forcePathStyle === undefined || forcePathStyle === "false"
        ? "virtual_hosted_style"
        : "invalid_configuration";

  return {
    schemaVersion: "overgarden.r2-addressing.v1",
    environmentClass,
    addressingClass,
    enforcement: addressingClass === "path_style" ? "verified" : "refused",
  };
}

export function assertCanonicalProductionR2Addressing(
  env: Environment = process.env,
  environmentOverride?: "production" | "non_production",
): R2AddressingReceipt {
  const receipt = resolveR2AddressingReceipt(env, environmentOverride);
  if (
    receipt.environmentClass === "production" &&
    receipt.enforcement !== "verified"
  ) {
    throw new Error("Production R2 addressing contract is not verified.");
  }
  return receipt;
}

export function resolveR2ForcePathStyle(
  env: Environment = process.env,
  environmentOverride?: "production" | "non_production",
): boolean {
  const receipt = assertCanonicalProductionR2Addressing(
    env,
    environmentOverride,
  );
  if (receipt.environmentClass === "production") return true;
  return env.R2_FORCE_PATH_STYLE === "true" || env.R2_FORCE_PATH_STYLE === "1";
}

function resolveEnvironmentClass(
  env: Environment,
  environmentOverride?: "production" | "non_production",
): R2AddressingEnvironmentClass {
  if (environmentOverride) return environmentOverride;
  return env.VERCEL_ENV === "production" ? "production" : "non_production";
}
