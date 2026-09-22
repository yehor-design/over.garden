import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";

/**
 * A discussion reads its viewer from its first line, so it renders at request
 * time and needs a boundary to stream behind (ADR-0032 D6). The boundary is
 * beside the page rather than above the community family, whose list and
 * pages are static documents and may not have one above them.
 */
export default function Loading() {
  return <RootLoadingSkeleton />;
}
