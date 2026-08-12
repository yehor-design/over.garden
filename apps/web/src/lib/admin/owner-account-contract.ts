export const OWNER_CREDENTIAL_PROVIDER_ID = "credential";
export const SEALED_OWNER_USER_ID_ENV = "OVERGARDEN_ADMIN_OWNER_USER_ID";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OwnerAccountProjection {
  providerId: string;
  password: string | null;
}

export interface OwnerIdentityProjection {
  emailVerified: boolean;
  accounts: readonly OwnerAccountProjection[];
}

export interface VerifiedOwnerAccountEvidence {
  emailVerified: true;
  credentialOnlyVerified: true;
}

export const REDACTED_OWNER_BOOTSTRAP_FAILURE_MESSAGE =
  "Admin owner bootstrap failed. Review the private operator environment.";

export function isVerifiedCredentialOnlyOwnerAccount(
  identity: OwnerIdentityProjection,
) {
  if (!identity.emailVerified || identity.accounts.length !== 1) return false;

  const [account] = identity.accounts;
  return (
    account?.providerId === OWNER_CREDENTIAL_PROVIDER_ID &&
    typeof account.password === "string" &&
    account.password.trim().length > 0
  );
}

export function resolveConfiguredSealedOwnerUserId(
  env: Record<string, string | undefined> = process.env,
) {
  const configured = env[SEALED_OWNER_USER_ID_ENV]?.trim();
  return configured && UUID_PATTERN.test(configured) ? configured : null;
}

export function isSealedOwnerUserId(
  userId: string,
  env: Record<string, string | undefined> = process.env,
) {
  return resolveConfiguredSealedOwnerUserId(env) === userId;
}

export function buildVerifiedOwnerAccountEvidence(
  identity: OwnerIdentityProjection,
  errorMessage = "Owner account must use one verified email/password credential.",
): VerifiedOwnerAccountEvidence {
  if (!isVerifiedCredentialOnlyOwnerAccount(identity)) {
    throw new Error(errorMessage);
  }

  return {
    emailVerified: true,
    credentialOnlyVerified: true,
  };
}

export function redactOwnerBootstrapFailure() {
  return REDACTED_OWNER_BOOTSTRAP_FAILURE_MESSAGE;
}
