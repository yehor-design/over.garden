import deploymentReceiptArtifact from "../../../../contracts/auth/authenticated-mutation-deployment-receipt.v1.json";

const DEPLOYMENT_RECEIPT_SCHEMA_VERSION =
  "overgarden.authenticated-mutation-deployment-receipt.v1" as const;

export interface AuthenticatedMutationDeploymentReceipt {
  schemaVersion: typeof DEPLOYMENT_RECEIPT_SCHEMA_VERSION;
  registry: {
    digest: string;
    sourceReceiptDigest: string;
    entrypointCount: number;
    consumerEdgeCount: number;
  };
  enforcement: {
    receiptDigest: string;
    ove291EntrypointCount: number;
    ove291ConsumerEdgeCount: number;
  };
  explicitGoogleLink: {
    ownershipDigest: string;
    entrypointCount: number;
    consumerEdgeCount: number;
  };
}

/**
 * Reads the build-generated, non-secret deployment receipt bundled into the
 * immutable build. The full registry and enforcement artifacts remain outside
 * production imports; source paths, identities, and graph payloads stay private.
 */
export function buildAuthenticatedMutationDeploymentReceipt(): AuthenticatedMutationDeploymentReceipt {
  const receipt = structuredClone(
    deploymentReceiptArtifact,
  ) as AuthenticatedMutationDeploymentReceipt;

  for (const digest of [
    receipt.registry.digest,
    receipt.registry.sourceReceiptDigest,
    receipt.enforcement.receiptDigest,
    receipt.explicitGoogleLink.ownershipDigest,
  ]) {
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error("Authenticated mutation deployment digest is invalid.");
    }
  }

  if (
    receipt.schemaVersion !== DEPLOYMENT_RECEIPT_SCHEMA_VERSION ||
    !Number.isSafeInteger(receipt.registry.entrypointCount) ||
    receipt.registry.entrypointCount < 1 ||
    !Number.isSafeInteger(receipt.registry.consumerEdgeCount) ||
    receipt.registry.consumerEdgeCount < 1 ||
    receipt.enforcement.ove291EntrypointCount !== 122 ||
    receipt.enforcement.ove291ConsumerEdgeCount !== 345 ||
    receipt.explicitGoogleLink.entrypointCount !== 5 ||
    receipt.explicitGoogleLink.consumerEdgeCount !== 15 ||
    receipt.explicitGoogleLink.ownershipDigest !==
      "9f9273ac6222c4e04cc77069dc14bfebc3860218d6791623055c27420687adad"
  ) {
    throw new Error("Authenticated mutation deployment receipt is invalid.");
  }

  return receipt;
}
