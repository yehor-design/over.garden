import type { PublicSurfaceIndexState } from "./public-surface-indexing-policy";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  type PublicSurfaceDiscoverySource,
} from "./public-surface-discovery";

export type PublicVarietyIndexState = PublicSurfaceIndexState;

export function evaluatePublicVarietyIndexState(
  source: PublicSurfaceDiscoverySource & {
    consumerId: "public_variety_repository";
  },
): PublicVarietyIndexState {
  return resolvePublicSurfaceDiscoveryForRequest(source).decision;
}
