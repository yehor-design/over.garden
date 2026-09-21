import { randomUUID } from "node:crypto";
import { expect, test } from "playwright/test";
import { Pool } from "pg";

import { buildAtomicTextJournalCreateRequest } from "../scripts/atomic-journal-text-request";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";
import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "../src/lib/privacy/disclosures";
import { getTrustSurfaceCopy } from "../src/lib/trust-surface-copy";
import { requiredLocalDatabaseUrl } from "./helpers/organism-fixture";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
} from "./helpers/synthetic-gardener";

test("publication and privacy notices are readable without JavaScript in every language", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("A local server is required");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const prefix = locale === "uk" ? "" : `/${locale}`;
      const copy = getTrustSurfaceCopy(locale);
      for (const path of ["/privacy", "/first-publication-disclosure"]) {
        const response = await page.goto(`${baseURL}${prefix}${path}`);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(
          page.getByText(copy.firstPublication.lines[1], { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(copy.firstPublication.lines[3], { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(copy.firstPublication.lines[4], { exact: true }),
        ).toBeVisible();
        await expect(page.locator("main")).toContainText(
          FIRST_PUBLICATION_DISCLOSURE_VERSION,
        );
      }
      await page.goto(`${baseURL}${prefix}/privacy`);
      await expect(page.locator('main a[href="/support"]')).toBeVisible();
      await page.locator('main a[href="/support"]').click();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: copy.support.title,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('main a[href^="mailto:"]')).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("a returning gardener accepts the changed notice once, independently of entry retention", async ({
  baseURL,
  context,
  page,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("A local server is required");
  const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
  let ownerId: string | null = null;
  try {
    const gardener = await signInSyntheticGardener({
      baseURL,
      context,
      pool,
      prefix: "ove476",
    });
    ownerId = gardener.id;
    await pool.query(
      `insert into publication_disclosure_acceptances (owner_user_id, disclosure_version, accepted_at) values ($1, 'first-publication-v5', '2026-09-01T10:00:00Z')`,
      [ownerId],
    );
    const makeRequest = () =>
      buildAtomicTextJournalCreateRequest({
        publishId: randomUUID(),
        context: {
          target: "first_plant_entry",
          plantName: "Notice proof plant",
          spaceName: "Notice proof space",
          entryDate: "2026-09-21",
        },
        title: "Public notice proof",
        text: "A synthetic public observation.",
      });
    const publish = (data: ReturnType<typeof makeRequest>) =>
      context.request.post(`${baseURL}/api/garden/entries`, {
        headers: {
          origin: baseURL,
          "x-overgarden-owner-user-id": ownerId!,
          [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]:
            ATOMIC_JOURNAL_CREATE_PROTOCOL,
        },
        data,
      });
    const request = makeRequest();
    const stale = await publish({
      ...request,
      disclosureVersion: "first-publication-v5",
    });
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toEqual({ code: "disclosure_version_changed" });
    const missing = await publish({ ...request, disclosureAccepted: false });
    expect(missing.status()).toBe(400);
    expect(await missing.json()).toEqual({
      code: "first_publication_disclosure_required",
    });
    expect(
      (
        await pool.query(
          "select count(*)::int as count from journal_entries where owner_user_id=$1",
          [ownerId],
        )
      ).rows[0].count,
    ).toBe(0);
    const accepted = await publish(request);
    expect(accepted.status(), await accepted.text()).toBe(200);
    const replay = await publish(request);
    expect(replay.status()).toBe(200);
    expect(
      (
        await pool.query(
          "select count(*)::int as count from journal_entries where owner_user_id=$1",
          [ownerId],
        )
      ).rows[0].count,
    ).toBe(1);
    const receipts = (
      await pool.query(
        "select disclosure_version, accepted_at from publication_disclosure_acceptances where owner_user_id=$1 order by disclosure_version",
        [ownerId],
      )
    ).rows;
    expect(receipts.map((row) => row.disclosure_version)).toEqual([
      "first-publication-v5",
      FIRST_PUBLICATION_DISCLOSURE_VERSION,
    ]);
    expect(receipts[0].accepted_at.toISOString()).toBe(
      "2026-09-01T10:00:00.000Z",
    );
    // Simulate the final retention purge, not a private or draft transition.
    await pool.query("delete from journal_entries where owner_user_id=$1", [
      ownerId,
    ]);
    await page.goto(`${baseURL}/garden`);
    await expect(
      page.locator('input[name="publicationDisclosureAccepted"]'),
    ).toHaveCount(0);
    const returning = await publish({
      ...makeRequest(),
      disclosureAccepted: false,
    });
    expect(returning.status(), await returning.text()).toBe(200);
    const after = (
      await pool.query(
        "select accepted_at from publication_disclosure_acceptances where owner_user_id=$1 and disclosure_version=$2",
        [ownerId, FIRST_PUBLICATION_DISCLOSURE_VERSION],
      )
    ).rows;
    expect(after).toHaveLength(1);
    expect(after[0].accepted_at.toISOString()).toBe(
      receipts[1].accepted_at.toISOString(),
    );
  } finally {
    if (ownerId) {
      await pool.query("delete from journal_entries where owner_user_id=$1", [
        ownerId,
      ]);
      await pool.query("delete from plant_objects where owner_user_id=$1", [
        ownerId,
      ]);
      await pool.query("delete from spaces where owner_user_id=$1", [ownerId]);
      await removeSyntheticGardener(pool, ownerId);
      expect(
        (
          await pool.query(
            "select count(*)::int as count from publication_disclosure_acceptances where owner_user_id=$1",
            [ownerId],
          )
        ).rows[0].count,
      ).toBe(0);
    }
    await pool.end();
  }
});
