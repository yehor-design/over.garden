import { redirect } from "next/navigation";

/**
 * Stable Registry Release Center is the one canonical owner of Foundation
 * decisions. Keep the historical operator URL as a compatibility entrypoint
 * without retaining a parallel mutation surface.
 */
export default function CatalogCurationPage() {
  redirect("/garden/catalog/registry");
}
