import { describe, expect, it } from "vitest";

import {
  assertMvpLearningInventorySqlIsSelectOnly,
  buildMvpLearningPlanReport,
} from "./plan";
import { buildMvpLearningReconcileReport } from "./reconcile";
import type { MvpLearningReport } from "./report";
import { blockOrderHashFromDocument } from "./composer-signals";
import { createEmptyJournalDocument } from "@/lib/garden/journal-document";
import { MVP_LEARNING_POLICY_VERSION } from "@/lib/mvp-learning/policy";

describe("mvp learning plan (OVE-200)", () => {
  it("keeps inventory SQL select-only", () => {
    expect(() => assertMvpLearningInventorySqlIsSelectOnly()).not.toThrow();
  });

  it("builds a privacy-safe plan without inventing identities", () => {
    const report = buildMvpLearningPlanReport({
      environment: "local",
      inventory: [
        {
          actor_class: "real_self_serve",
          users: 2,
          events: 5,
          journals: 3,
        },
        {
          actor_class: "visual_fixture",
          users: 1,
          events: 0,
          journals: 10,
        },
      ],
      legacyEventRemaps: [
        { from: "self_serve", to: "real_self_serve", events: 4 },
      ],
    });

    expect(report.policyVersion).toBe(MVP_LEARNING_POLICY_VERSION);
    expect(report.selectOnly).toBe(true);
    expect(report.proposedAttributionUpserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorClass: "real_self_serve",
          users: 2,
          source: "operator_plan",
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toMatch(/@/);
    expect(JSON.stringify(report)).not.toContain("http");
  });
});

describe("mvp learning reconcile (OVE-200)", () => {
  it("fails closed on unclassified activity and forbidden property keys", async () => {
    const report = {
      policyVersion: MVP_LEARNING_POLICY_VERSION,
      policyDate: "2026-07-24",
      retentionPolicyVersion: "ove349.retention.v2",
      generatedAt: new Date(),
      windowDays: 30,
      since: new Date(),
      cohorts: {
        real_self_serve: {
          cohort: "real_self_serve",
          activatedGardeners: 0,
          h1RetainedGardeners: 0,
          h1Rate: 0,
          publishedGardeners: 0,
          publishedEntries: 0,
          publishRate: 0,
          sameObjectFollowUpEntries: 0,
          sameSessionRevisitFollowUps: 0,
        },
      },
      exclusions: {
        production_smoke: 0,
        visual_fixture: 0,
        editorial_seed: 0,
        automated_bot: 0,
      },
      attributionOutbox: {
        pending: 0,
        processing: 0,
        failed: 0,
        dead: 0,
        attributed: 0,
        cancelled: 0,
      },
      unclassifiedEventCount: 2,
      unclassifiedActiveGardenerCount: 1,
      organicAcquisition: {
        status: "not_instrumented",
        decisionReady: false,
      },
      editorialPublicTrafficProxy: 0,
      decisionGate: "unclassified",
      notes: [],
    } satisfies MvpLearningReport;

    const bad = await buildMvpLearningReconcileReport({
      environment: "local",
      report,
      forbiddenPropertyKeyScanner: async () => 1,
    });
    expect(bad.ok).toBe(false);
    expect(bad.forbiddenFieldHits).toBe(1);

    const good = await buildMvpLearningReconcileReport({
      environment: "local",
      report: { ...report, unclassifiedEventCount: 0, decisionGate: "ok" },
      forbiddenPropertyKeyScanner: async () => 0,
    });
    expect(good.ok).toBe(true);
    expect(good.forbiddenFieldHits).toBe(0);
  });
});

describe("composer learning signals helpers", () => {
  it("hashes block order without media identity leakage", () => {
    const document = createEmptyJournalDocument();
    document.blocks = [
      { id: "a", type: "paragraph", spans: [{ text: "one" }] },
      { id: "b", type: "paragraph", spans: [{ text: "two" }] },
    ];
    expect(blockOrderHashFromDocument(document)).toBe("a|b");
    expect(blockOrderHashFromDocument(document)).not.toContain("one");
  });
});
