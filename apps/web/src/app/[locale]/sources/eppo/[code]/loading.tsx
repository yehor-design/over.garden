import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";

/**
 * A record of the EPPO capture still reads its row at request time, so it
 * needs a boundary to stream behind (ADR-0032 D6). The boundary sits beside
 * this page rather than above the archive: `/sources/eppo` itself is a static
 * document and may not have one over it (OVE-467).
 */
export default function Loading() {
  return <RootLoadingSkeleton />;
}
