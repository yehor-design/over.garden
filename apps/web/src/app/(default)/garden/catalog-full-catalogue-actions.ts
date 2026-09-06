"use server";

import { isColIdentifier } from "@/lib/garden/catalog-typeahead-contract";
import { organismAddressChangeTags } from "@/lib/public-cache-tags";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import {
  materializeCatalogNodeFromCol,
  toPickerSelection,
} from "@/server/catalog-source/col-materialize";
import { resolveMutationScope } from "@/server/mutation-scope";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";

/**
 * Create-on-pick from the full Catalogue of Life checklist (ADR-0026 D7).
 *
 * The picker's primary list is canonical nodes. A gardener who reaches past it
 * and chooses a checklist row gets the node from that moment: this action
 * writes it through `catalog_col_materialize`, the same function the monthly
 * ingest uses, and hands the picker back an ordinary selection.
 *
 * It is a signed-in action because it writes to the graph, and nothing else:
 * no owner role, no capability. A gardener naming their own plant is the
 * reason this path exists (D5 — curation never blocks a gardener), so a
 * refusal answers null and the picker keeps its own-name outcome.
 */
export async function materializeCatalogNodeAction(
  colId: string,
): Promise<FirstEntryCatalogSelection | null> {
  if (!isColIdentifier(colId)) return null;

  const admission = await resolveMutationScope();
  if (admission.status === "rejected") return null;

  try {
    const node = await materializeCatalogNodeFromCol(colId);
    if (node.created) {
      // A node nobody had before has an address nobody has cached. Without
      // this the card answers 404 until the address cache expires, which is
      // hours (`readPublicCatalogAddress` is `use cache`).
      revalidatePublicCacheTags(
        organismAddressChangeTags(node.catalogItemId),
        "expire",
      );
    }
    return toPickerSelection(node);
  } catch {
    // A checklist row the release no longer has, or a database that refused:
    // the gardener still has every other outcome.
    return null;
  }
}
