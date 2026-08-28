import "server-only";

// The approved catalog remains a Stable Registry owner even though it shares
// bounded request parsing and cursor primitives with the adjacent source
// explorer. Consumers import catalog reads through this namespace so source
// evidence never becomes an implicit catalog dependency.
export {
  buildPublicStableCatalogQuery,
  findPublicStableCatalogRecord,
  listPublicStableCatalogPage,
  type PublicStableCatalogRecord,
  type PublicStableRegistryPage,
  type PublicStableRegistryRequest,
} from "@/server/catalog-source/public-eppo-explorer-repository";
