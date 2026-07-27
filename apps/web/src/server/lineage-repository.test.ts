import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import {
  buildFindProvenanceEdgeByClientMutationQuery,
  buildInsertProvenanceEdgeQuery,
  buildInsertLineagePendingSourceIdentityQuery,
  buildInsertLineageClaimAuditEventQuery,
  buildLineageInvitationClaimPreviewQuery,
  buildLineageClaimInboxQuery,
  buildLineageSourceObjectOptionsQuery,
  buildObjectProvenanceEdgesQuery,
  buildResolveLineageInvitationClaimEdgeQuery,
  buildResolveLineagePendingSourceIdentityClaimQuery,
  buildResolveLineageClaimQuery,
  normalizeLineagePendingSourceLabel,
  normalizeLineageSourceReferenceLabel,
  resolveLineageInvitationClaim,
  resolveLineageClaim,
} from "./lineage-repository";
import { signLineageInviteToken } from "./lineage-invite-token";
import { PreciseLocationTextError } from "@/lib/privacy/precise-location-text";

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });
const scope = scopedToUser("00000000-0000-4000-8000-000000000001");
const subjectPlantObjectId = "00000000-0000-4000-8000-000000000101";
const sourcePlantObjectId = "00000000-0000-4000-8000-000000000102";
const edgeId = "00000000-0000-4000-8000-000000000201";
const pendingIdentityId = "00000000-0000-4000-8000-000000000301";

describe("lineage provenance repository query contracts", () => {
  it("lists source object candidates only inside the current owner scope", () => {
    const compiled = buildLineageSourceObjectOptionsQuery(
      testDb,
      scope,
      subjectPlantObjectId,
    ).compile();

    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $1');
    expect(compiled.sql).toContain('"plant_objects"."id" != $2');
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|analytics_events|coarse_region|location_visibility|email|token/i,
    );
    expect(compiled.parameters).toEqual([scope.userId, subjectPlantObjectId]);
  });

  it("inserts proposed provenance edges idempotently by owner and client mutation", () => {
    const compiled = buildInsertProvenanceEdgeQuery(testDb, {
      owner_user_id: scope.userId,
      subject_plant_object_id: subjectPlantObjectId,
      source_kind: "own_object",
      source_plant_object_id: sourcePlantObjectId,
      source_owner_user_id: scope.userId,
      source_reference_kind: null,
      source_reference_label: null,
      edge_type: "provenance",
      consent_state: "proposed",
      visibility_policy: "owner_only_until_confirmed",
      erasure_state: "active",
      client_mutation_id: "lineage-1",
    }).compile();

    expect(compiled.sql).toContain('insert into "lineage_provenance_edges"');
    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "client_mutation_id") do nothing',
    );
    expect(compiled.sql).toContain("returning *");
    expect(compiled.parameters).toEqual([
      scope.userId,
      subjectPlantObjectId,
      "own_object",
      sourcePlantObjectId,
      scope.userId,
      null,
      null,
      "provenance",
      "proposed",
      "owner_only_until_confirmed",
      "active",
      "lineage-1",
    ]);
  });

  it("creates pending source identities with minimal bounded fields only", () => {
    const compiled = buildInsertLineagePendingSourceIdentityQuery(testDb, {
      created_by_user_id: scope.userId,
      display_label: "Maria saved seeds",
      invite_state: "pending",
    }).compile();

    expect(compiled.sql).toContain(
      'insert into "lineage_pending_source_identities"',
    );
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toMatch(
      /token|raw_url|referrer|ip|user_agent|email|phone|coarse_region|location_visibility|journal_entries|media_assets|body|quarantine|derivative/i,
    );
    expect(compiled.parameters).toEqual([
      scope.userId,
      "Maria saved seeds",
      "pending",
    ]);
  });

  it("inserts pending identity provenance edges without source owner or public visibility changes", () => {
    const compiled = buildInsertProvenanceEdgeQuery(testDb, {
      owner_user_id: scope.userId,
      subject_plant_object_id: subjectPlantObjectId,
      source_kind: "pending_identity",
      source_plant_object_id: null,
      source_owner_user_id: null,
      source_pending_identity_id: pendingIdentityId,
      source_reference_kind: null,
      source_reference_label: null,
      edge_type: "provenance",
      consent_state: "proposed",
      visibility_policy: "owner_only_until_confirmed",
      erasure_state: "active",
      client_mutation_id: "lineage-invite-1",
    }).compile();

    expect(compiled.sql).toContain('insert into "lineage_provenance_edges"');
    expect(compiled.sql).toContain('"source_pending_identity_id"');
    expect(compiled.sql).not.toMatch(
      /visibility\s*=|token|raw_url|referrer|ip|user_agent|email|phone|coarse_region|location_visibility|journal_entries|media_assets|body|quarantine|derivative/i,
    );
    expect(compiled.parameters).toEqual([
      scope.userId,
      subjectPlantObjectId,
      "pending_identity",
      null,
      null,
      pendingIdentityId,
      null,
      null,
      "provenance",
      "proposed",
      "owner_only_until_confirmed",
      "active",
      "lineage-invite-1",
    ]);
  });

  it("finds idempotent provenance edges only inside the current owner scope", () => {
    const compiled = buildFindProvenanceEdgeByClientMutationQuery(
      testDb,
      scope,
      "lineage-1",
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"client_mutation_id" = $2');
    expect(compiled.parameters).toEqual([scope.userId, "lineage-1"]);
  });

  it("resolves a stored stable person target through its current public handle without mutable-label dependence", () => {
    const compiled = buildObjectProvenanceEdgesQuery(
      testDb,
      scope,
      subjectPlantObjectId,
    ).compile();

    expect(compiled.sql).toContain('from "lineage_provenance_edges"');
    expect(compiled.sql).toContain(
      '"source_person_handles"."user_id" = "lineage_provenance_edges"."source_owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"source_person_handles"."lifecycle_state" = $1',
    );
    expect(compiled.sql).toContain(
      '"source_person_profiles"."normalized_handle" = "source_person_handles"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"source_person_profiles"."profile_visibility" = $5',
    );
    expect(compiled.sql).toContain(
      '"source_person_profiles"."profile_lifecycle_state" = $6',
    );
    expect(compiled.sql).toContain(
      '"source_person_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain(
      '"source_person_profiles"."handle" as "sourcePersonHandle"',
    );
    expect(compiled.sql).toContain("from profile_blocks");
    expect(compiled.sql).toContain("profile_blocks.block_state = 'active'");
    expect(compiled.sql).toContain(
      'profile_blocks.blocked_user_id = "lineage_provenance_edges"."source_owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."owner_user_id" = $7',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."subject_plant_object_id" = $8',
    );
    expect(compiled.sql).toContain(
      '"source_objects"."owner_user_id" = "lineage_provenance_edges"."source_owner_user_id"',
    );
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|analytics_events|body|quarantine|derivative|ip|user_agent|email|phone|token|referrer|coarse_region|location_visibility/i,
    );
    expect(compiled.parameters).toEqual([
      "current",
      "source_reference",
      "person",
      "current",
      "public",
      "active",
      scope.userId,
      subjectPlantObjectId,
    ]);
  });

  it("reads invitation claim previews only for token-scoped pending identity edges", () => {
    const compiled = buildLineageInvitationClaimPreviewQuery(testDb, {
      pendingIdentityId,
      edgeId,
      expiresAt: 1790000000,
    }).compile();

    expect(compiled.sql).toContain('from "lineage_provenance_edges"');
    expect(compiled.sql).toContain('"lineage_provenance_edges"."id" = $1');
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_pending_identity_id" = $2',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_kind" = $3',
    );
    expect(compiled.sql).toContain('"pending_identities"."id" = $6');
    expect(compiled.sql).toContain('"pending_identities"."invite_state" = $7');
    expect(compiled.sql).not.toMatch(
      /token|raw_url|referrer|ip|user_agent|email|phone|coarse_region|location_visibility|journal_entries|media_assets|body|quarantine|derivative/i,
    );
    expect(compiled.parameters).toEqual([
      edgeId,
      pendingIdentityId,
      "pending_identity",
      "proposed",
      "active",
      pendingIdentityId,
      "pending",
    ]);
  });

  it("confirms or declines invitation edges only when the token matches edge and pending identity", () => {
    const now = new Date("2026-07-03T18:10:00.000Z");
    const compiled = buildResolveLineageInvitationClaimEdgeQuery(
      testDb,
      {
        pendingIdentityId,
        edgeId,
        expiresAt: 1790000000,
      },
      {
        decision: "confirmed",
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('update "lineage_provenance_edges"');
    expect(compiled.sql).toContain('"consent_state" = $1');
    expect(compiled.sql).toContain('"updated_at" = $2');
    expect(compiled.sql).toContain('"id" = $3');
    expect(compiled.sql).toContain('"source_pending_identity_id" = $4');
    expect(compiled.sql).toContain('"source_kind" = $5');
    expect(compiled.sql).toContain('"consent_state" = $6');
    expect(compiled.sql).toContain('"erasure_state" = $7');
    expect(compiled.sql).not.toMatch(
      /visibility_policy\s*=|token|raw_url|referrer|ip|user_agent|email|phone|coarse_region|location_visibility|journal_entries|media_assets|body|quarantine|derivative/i,
    );
    expect(compiled.parameters).toEqual([
      "confirmed",
      now,
      edgeId,
      pendingIdentityId,
      "pending_identity",
      "proposed",
      "active",
    ]);
  });

  it("links the signed-in claimer to a pending source identity with bounded state only", () => {
    const now = new Date("2026-07-03T18:10:00.000Z");
    const compiled = buildResolveLineagePendingSourceIdentityClaimQuery(
      testDb,
      {
        pendingIdentityId,
        edgeId,
        expiresAt: 1790000000,
      },
      {
        claimedByUserId: scope.userId,
        inviteState: "claimed",
        now,
      },
    ).compile();

    expect(compiled.sql).toContain(
      'update "lineage_pending_source_identities"',
    );
    expect(compiled.sql).toContain('"invite_state" = $1');
    expect(compiled.sql).toContain('"claimed_by_user_id" = $2');
    expect(compiled.sql).toContain('"claimed_at" = $3');
    expect(compiled.sql).toContain('"updated_at" = $4');
    expect(compiled.sql).toContain('"id" = $5');
    expect(compiled.sql).toContain('"invite_state" = $6');
    expect(compiled.sql).not.toMatch(
      /display_label\s*=|token|raw_url|referrer|ip|user_agent|email|phone|coarse_region|location_visibility|journal_entries|media_assets|body|quarantine|derivative/i,
    );
    expect(compiled.parameters).toEqual([
      "claimed",
      scope.userId,
      now,
      now,
      pendingIdentityId,
      "pending",
    ]);
  });

  it("lists target claim inbox rows only for proposed cross-user source-owned edges", () => {
    const compiled = buildLineageClaimInboxQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "lineage_provenance_edges"');
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_owner_user_id" = $1',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."owner_user_id" != $2',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_kind" = $3',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."consent_state" = $4',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."erasure_state" = $5',
    );
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|analytics_events|body|quarantine|derivative|ip|user_agent|email|phone|coarse_region|location_visibility|source_reference_label/i,
    );
    expect(compiled.parameters).toEqual([
      scope.userId,
      scope.userId,
      "own_object",
      "proposed",
      "active",
    ]);
  });

  it("confirms or declines only proposed active claims scoped to the target owner", () => {
    const now = new Date("2026-07-03T18:00:00.000Z");
    const compiled = buildResolveLineageClaimQuery(testDb, scope, {
      edgeId,
      decision: "confirmed",
      now,
    }).compile();

    expect(compiled.sql).toContain('update "lineage_provenance_edges"');
    expect(compiled.sql).toContain('"consent_state" = $1');
    expect(compiled.sql).toContain('"updated_at" = $2');
    expect(compiled.sql).toContain('"id" = $3');
    expect(compiled.sql).toContain('"source_owner_user_id" = $4');
    expect(compiled.sql).toContain('"owner_user_id" != $5');
    expect(compiled.sql).toContain('"source_kind" = $6');
    expect(compiled.sql).toContain('"consent_state" = $7');
    expect(compiled.sql).toContain('"erasure_state" = $8');
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toMatch(
      /visibility_policy\s*=|journal_entries|media_assets|analytics_events|body|quarantine|derivative|ip|user_agent|email|phone|coarse_region|location_visibility/i,
    );
    expect(compiled.parameters).toEqual([
      "confirmed",
      now,
      edgeId,
      scope.userId,
      scope.userId,
      "own_object",
      "proposed",
      "active",
    ]);
  });

  it("audits claim decisions with bounded enum metadata only", () => {
    const compiled = buildInsertLineageClaimAuditEventQuery(testDb, {
      edge_id: edgeId,
      actor_user_id: scope.userId,
      target_user_id: scope.userId,
      action: "confirm",
      previous_consent_state: "proposed",
      new_consent_state: "confirmed",
      visibility_policy: "owner_only_until_confirmed",
    }).compile();

    expect(compiled.sql).toContain(
      'insert into "lineage_provenance_edge_audit_events"',
    );
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|analytics_events|body|quarantine|derivative|ip|user_agent|email|phone|coarse_region|location_visibility|source_reference_label|client_mutation_id/i,
    );
    expect(compiled.parameters).toEqual([
      edgeId,
      scope.userId,
      scope.userId,
      "confirm",
      "proposed",
      "confirmed",
      "owner_only_until_confirmed",
    ]);
  });

  it("rejects source labels that look like private contact details or precise coordinates", () => {
    expect(normalizeLineageSourceReferenceLabel("Spring seed swap")).toBe(
      "Spring seed swap",
    );

    for (const unsafe of [
      "maria@example.com",
      "+380 67 123 45 67",
      "https://example.com/source",
      "@private-handle",
    ]) {
      expect(() => normalizeLineageSourceReferenceLabel(unsafe)).toThrow(
        /contact details/i,
      );
    }
  });

  it("rejects pending source labels that look like contact details or precise coordinates", () => {
    expect(normalizeLineagePendingSourceLabel("Maria saved seeds")).toBe(
      "Maria saved seeds",
    );

    for (const unsafe of [
      "maria@example.com",
      "+380 67 123 45 67",
      "https://example.com/source",
      "@private-handle",
    ]) {
      expect(() => normalizeLineagePendingSourceLabel(unsafe)).toThrow(
        /contact details/i,
      );
    }
  });

  it("rejects precise coordinates in source labels with the OVE-234 typed error", () => {
    for (const normalize of [
      normalizeLineageSourceReferenceLabel,
      normalizeLineagePendingSourceLabel,
    ]) {
      for (const unsafe of [
        "50.450100, 30.523400",
        "50°27'0.4\" N 30°31'24.2\" E",
        "geo:50.45010,30.52340",
      ]) {
        expect(() => normalize(unsafe)).toThrow(PreciseLocationTextError);
        expect(() => normalize(unsafe)).not.toThrow(/50\.45/);
      }
    }
  });

  it("rejects unsupported claim decisions before touching storage", async () => {
    await expect(
      resolveLineageClaim(scope, {
        edgeId,
        decision: "published",
      }),
    ).rejects.toThrow(/unsupported lineage claim decision/i);
  });

  it("rejects unsupported invitation decisions before touching storage", async () => {
    const token = signLineageInviteToken({
      pendingIdentityId,
      edgeId,
      createdAt: new Date("2026-07-03T18:00:00.000Z"),
    });

    await expect(
      resolveLineageInvitationClaim(scope, {
        token,
        decision: "published",
      }),
    ).rejects.toThrow(/unsupported lineage claim decision/i);
  });
});
