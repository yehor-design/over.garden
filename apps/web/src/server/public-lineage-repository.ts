import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  LocationVisibility,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import { getCoarseRegionLabel } from "@/lib/garden/regions";

const MAX_PUBLIC_LINEAGE_DEPTH = 5;
const MAX_PUBLIC_LINEAGE_FRONTIER = 40;

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicLineageNode {
  plantObjectId: string;
  displayName: string;
  objectKind: PlantObjectKind;
  varietyText: string | null;
  varietyState: VarietyState;
  catalogKind: CatalogKind | null;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  safeLocationLabel: string | null;
}

export interface PublicLineageEdge {
  id: string;
  depth: number;
  subjectPlantObjectId: string;
  sourcePlantObjectId: string;
  createdAt: Date | string;
}

export interface PublicLineageGraphPage {
  root: PublicLineageNode;
  nodes: PublicLineageNode[];
  edges: PublicLineageEdge[];
  depthLimit: number;
}

interface PublicLineageNodeRow {
  plantObjectId: string;
  displayName: string;
  objectKind: string;
  varietyText: string | null;
  varietyState: string;
  catalogKind: string | null;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  locationVisibility: string;
  coarseRegionCode: string | null;
}

export async function getPublicLineageGraphPage(
  plantObjectId: string,
  executor: QueryExecutor = db,
): Promise<PublicLineageGraphPage | null> {
  const normalizedPlantObjectId = normalizePublicLineageObjectId(plantObjectId);
  if (!normalizedPlantObjectId) return null;

  const rootRow = await buildPublicLineageRootObjectQuery(
    executor,
    normalizedPlantObjectId,
  ).executeTakeFirst();

  if (!rootRow) return null;

  const nodesById = new Map<string, PublicLineageNode>();
  const edges: PublicLineageEdge[] = [];
  nodesById.set(rootRow.plantObjectId, mapPublicLineageNode(rootRow));

  let frontier = [rootRow.plantObjectId];
  const visitedSubjects = new Set<string>();

  for (
    let depth = 1;
    depth <= MAX_PUBLIC_LINEAGE_DEPTH && frontier.length > 0;
    depth += 1
  ) {
    const subjects = frontier
      .filter((id) => !visitedSubjects.has(id))
      .slice(0, MAX_PUBLIC_LINEAGE_FRONTIER);
    if (subjects.length === 0) break;

    subjects.forEach((id) => visitedSubjects.add(id));
    const rows = await buildPublicLineageEdgesForSubjectsQuery(
      executor,
      subjects,
    ).execute();

    const nextFrontier: string[] = [];
    for (const row of rows) {
      if (!row.sourcePlantObjectId) continue;

      const subjectNode = mapPublicLineageNode({
        plantObjectId: row.subjectPlantObjectId,
        displayName: row.subjectDisplayName,
        objectKind: row.subjectObjectKind,
        varietyText: row.subjectVarietyText,
        varietyState: row.subjectVarietyState,
        catalogKind: row.subjectCatalogKind,
        catalogCanonicalName: row.subjectCatalogCanonicalName,
        catalogPublicSlug: row.subjectCatalogPublicSlug,
        locationVisibility: row.subjectLocationVisibility,
        coarseRegionCode: row.subjectCoarseRegionCode,
      });
      const sourceNode = mapPublicLineageNode({
        plantObjectId: row.sourcePlantObjectId,
        displayName: row.sourceDisplayName,
        objectKind: row.sourceObjectKind,
        varietyText: row.sourceVarietyText,
        varietyState: row.sourceVarietyState,
        catalogKind: row.sourceCatalogKind,
        catalogCanonicalName: row.sourceCatalogCanonicalName,
        catalogPublicSlug: row.sourceCatalogPublicSlug,
        locationVisibility: row.sourceLocationVisibility,
        coarseRegionCode: row.sourceCoarseRegionCode,
      });

      nodesById.set(subjectNode.plantObjectId, subjectNode);
      nodesById.set(sourceNode.plantObjectId, sourceNode);
      edges.push({
        id: row.id,
        depth,
        subjectPlantObjectId: row.subjectPlantObjectId,
        sourcePlantObjectId: row.sourcePlantObjectId,
        createdAt: row.createdAt,
      });

      if (!visitedSubjects.has(row.sourcePlantObjectId)) {
        nextFrontier.push(row.sourcePlantObjectId);
      }
    }

    frontier = [...new Set(nextFrontier)];
  }

  return {
    root: nodesById.get(rootRow.plantObjectId) ?? mapPublicLineageNode(rootRow),
    nodes: [...nodesById.values()],
    edges,
    depthLimit: MAX_PUBLIC_LINEAGE_DEPTH,
  };
}

export function buildPublicLineageRootObjectQuery(
  executor: QueryExecutor,
  plantObjectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("journal_entries as public_entries", (join) =>
      join
        .onRef("public_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "public_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("public_entries.visibility", "=", "public")
        .on("public_entries.lifecycle_state", "=", "active")
        .on("public_entries.public_gone_at", "is", null)
        .on("public_entries.public_slug", "is not", null),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as locationVisibility",
      "plant_objects.coarse_region_code as coarseRegionCode",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
    ])
    .where("plant_objects.id", "=", plantObjectId)
    .groupBy([
      "plant_objects.id",
      "plant_objects.display_name",
      "plant_objects.object_kind",
      "plant_objects.variety_text",
      "plant_objects.variety_state",
      "plant_objects.location_visibility",
      "plant_objects.coarse_region_code",
      "catalog_items.catalog_kind",
      "catalog_items.canonical_name",
      "catalog_items.public_slug",
    ]);
}

export function buildPublicLineageEdgesForSubjectsQuery(
  executor: QueryExecutor,
  subjectPlantObjectIds: string[],
) {
  const subjects = subjectPlantObjectIds.slice(0, MAX_PUBLIC_LINEAGE_FRONTIER);

  return executor
    .selectFrom("lineage_provenance_edges")
    .innerJoin("plant_objects as subject_objects", (join) =>
      join
        .onRef(
          "subject_objects.id",
          "=",
          "lineage_provenance_edges.subject_plant_object_id",
        )
        .onRef(
          "subject_objects.owner_user_id",
          "=",
          "lineage_provenance_edges.owner_user_id",
        ),
    )
    .innerJoin("plant_objects as source_objects", (join) =>
      join
        .onRef(
          "source_objects.id",
          "=",
          "lineage_provenance_edges.source_plant_object_id",
        )
        .onRef(
          "source_objects.owner_user_id",
          "=",
          "lineage_provenance_edges.source_owner_user_id",
        ),
    )
    .innerJoin("journal_entries as subject_public_entries", (join) =>
      join
        .onRef(
          "subject_public_entries.plant_object_id",
          "=",
          "subject_objects.id",
        )
        .onRef(
          "subject_public_entries.owner_user_id",
          "=",
          "subject_objects.owner_user_id",
        )
        .on("subject_public_entries.visibility", "=", "public")
        .on("subject_public_entries.lifecycle_state", "=", "active")
        .on("subject_public_entries.public_gone_at", "is", null)
        .on("subject_public_entries.public_slug", "is not", null),
    )
    .innerJoin("journal_entries as source_public_entries", (join) =>
      join
        .onRef(
          "source_public_entries.plant_object_id",
          "=",
          "source_objects.id",
        )
        .onRef(
          "source_public_entries.owner_user_id",
          "=",
          "source_objects.owner_user_id",
        )
        .on("source_public_entries.visibility", "=", "public")
        .on("source_public_entries.lifecycle_state", "=", "active")
        .on("source_public_entries.public_gone_at", "is", null)
        .on("source_public_entries.public_slug", "is not", null),
    )
    .leftJoin("catalog_items as subject_catalog_items", (join) =>
      join
        .onRef(
          "subject_catalog_items.id",
          "=",
          "subject_objects.catalog_item_id",
        )
        .on("subject_catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("catalog_items as source_catalog_items", (join) =>
      join
        .onRef("source_catalog_items.id", "=", "source_objects.catalog_item_id")
        .on("source_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "lineage_provenance_edges.id",
      "lineage_provenance_edges.subject_plant_object_id as subjectPlantObjectId",
      "lineage_provenance_edges.source_plant_object_id as sourcePlantObjectId",
      "lineage_provenance_edges.created_at as createdAt",
      "subject_objects.display_name as subjectDisplayName",
      "subject_objects.object_kind as subjectObjectKind",
      "subject_objects.variety_text as subjectVarietyText",
      "subject_objects.variety_state as subjectVarietyState",
      "subject_objects.location_visibility as subjectLocationVisibility",
      "subject_objects.coarse_region_code as subjectCoarseRegionCode",
      "subject_catalog_items.catalog_kind as subjectCatalogKind",
      "subject_catalog_items.canonical_name as subjectCatalogCanonicalName",
      "subject_catalog_items.public_slug as subjectCatalogPublicSlug",
      "source_objects.display_name as sourceDisplayName",
      "source_objects.object_kind as sourceObjectKind",
      "source_objects.variety_text as sourceVarietyText",
      "source_objects.variety_state as sourceVarietyState",
      "source_objects.location_visibility as sourceLocationVisibility",
      "source_objects.coarse_region_code as sourceCoarseRegionCode",
      "source_catalog_items.catalog_kind as sourceCatalogKind",
      "source_catalog_items.canonical_name as sourceCatalogCanonicalName",
      "source_catalog_items.public_slug as sourceCatalogPublicSlug",
    ])
    .where("lineage_provenance_edges.subject_plant_object_id", "in", subjects)
    .where("lineage_provenance_edges.source_kind", "=", "own_object")
    .where("lineage_provenance_edges.source_plant_object_id", "is not", null)
    .where("lineage_provenance_edges.source_owner_user_id", "is not", null)
    .where("lineage_provenance_edges.consent_state", "=", "confirmed")
    .where(
      "lineage_provenance_edges.visibility_policy",
      "=",
      "owner_only_until_confirmed",
    )
    .where("lineage_provenance_edges.erasure_state", "=", "active")
    .groupBy([
      "lineage_provenance_edges.id",
      "lineage_provenance_edges.subject_plant_object_id",
      "lineage_provenance_edges.source_plant_object_id",
      "lineage_provenance_edges.created_at",
      "subject_objects.display_name",
      "subject_objects.object_kind",
      "subject_objects.variety_text",
      "subject_objects.variety_state",
      "subject_objects.location_visibility",
      "subject_objects.coarse_region_code",
      "subject_catalog_items.catalog_kind",
      "subject_catalog_items.canonical_name",
      "subject_catalog_items.public_slug",
      "source_objects.display_name",
      "source_objects.object_kind",
      "source_objects.variety_text",
      "source_objects.variety_state",
      "source_objects.location_visibility",
      "source_objects.coarse_region_code",
      "source_catalog_items.catalog_kind",
      "source_catalog_items.canonical_name",
      "source_catalog_items.public_slug",
    ])
    .orderBy("lineage_provenance_edges.created_at", "desc")
    .orderBy("lineage_provenance_edges.id", "asc");
}

export function publicLineageNodeLocationLabel(input: {
  locationVisibility: LocationVisibility | string;
  coarseRegionCode: string | null;
}) {
  if (input.locationVisibility !== "region") return null;

  const label = getCoarseRegionLabel(input.coarseRegionCode);
  return label ? `Region: ${label}` : null;
}

function mapPublicLineageNode(row: PublicLineageNodeRow): PublicLineageNode {
  return {
    plantObjectId: row.plantObjectId,
    displayName: row.displayName,
    objectKind: row.objectKind as PlantObjectKind,
    varietyText: row.varietyText,
    varietyState: row.varietyState as VarietyState,
    catalogKind: row.catalogKind as CatalogKind | null,
    catalogCanonicalName: row.catalogCanonicalName,
    catalogPublicSlug: row.catalogPublicSlug,
    safeLocationLabel: publicLineageNodeLocationLabel({
      locationVisibility: row.locationVisibility,
      coarseRegionCode: row.coarseRegionCode,
    }),
  };
}

function normalizePublicLineageObjectId(value: string) {
  const normalized = value.trim();
  if (normalized.length > 80) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  )
    ? normalized
    : null;
}
