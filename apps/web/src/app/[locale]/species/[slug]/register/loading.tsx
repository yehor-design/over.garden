import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";

/**
 * This page still reads request data from its first line, so it renders at
 * request time and needs a boundary to stream behind (ADR-0032 D6). The
 * boundary is here, beside the page, rather than at the root of the tree: a
 * static page may not have one above it.
 */
export default function Loading() {
  return <RootLoadingSkeleton />;
}
