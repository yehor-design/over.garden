export const OWNER_CREDENTIAL_PROVIDER_ID = "credential";

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
