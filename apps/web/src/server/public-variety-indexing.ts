import type { PublicSurfaceIndexState } from "./public-surface-indexing-policy";
import { PUBLIC_SURFACE_INDEXABILITY_THRESHOLD } from "./public-surface-indexing-policy";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  type PublicSurfaceDiscoverySource,
} from "./public-surface-discovery";

export const PUBLIC_VARIETY_INDEXABILITY_THRESHOLD =
  PUBLIC_SURFACE_INDEXABILITY_THRESHOLD;

export type PublicVarietyIndexState = PublicSurfaceIndexState;

export function evaluatePublicVarietyIndexState(
  source: PublicSurfaceDiscoverySource & {
    consumerId: "public_variety_repository";
  },
  evaluatedAt?: string | Date,
): PublicVarietyIndexState {
  return resolvePublicSurfaceDiscoveryForRequest(source, evaluatedAt).decision;
}
