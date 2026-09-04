import { randomUUID } from "node:crypto";

import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  claimVisitorEngagementLikes,
  readEngagementLikeState,
  toggleEngagementLike,
} from "./engagement-repository";

/**
 * The properties a like has to hold, executed against a real Postgres rather
 * than asserted against compiled SQL.
 *
 * Compile-only coverage is what let the previous design ship: a 24-hour expiry,
 * a ceiling of 64 per target, and a per-target capability whose token overflowed
 * its own length check on every Cyrillic slug. None of those are visible in the
 * shape of a query — only in what the database does with it.
 */

const hasLocalDatabase = Boolean(process.env.DATABASE_URL);

// A Cyrillic slug of the shape production actually uses. The retired capability
// token overflowed 256 characters on exactly this input.
const PUBLIC_SLUG = "кратък-и-отговорен-запис-след-преглед-на-кошер-29a9b986d1";
const target = { kind: "journal_entry" as const, ref: PUBLIC_SLUG };

describe.skipIf(!hasLocalDatabase)("OVE-377 owned engagement likes", () => {
  let ownerUserId: string;
  let spaceId: string;
  let plantObjectId: string;

  beforeEach(async () => {
    ownerUserId = randomUUID();
    await db
      .insertInto("user")
      .values({
        id: ownerUserId,
        name: "OVE-377 local test",
        email: `ove377-${ownerUserId}@example.test`,
        emailVerified: true,
      })
      .execute();

    const space = await sql<{ id: string }>`
      insert into spaces (owner_user_id, display_name)
      values (${ownerUserId}, 'ove377-like-fixture')
      returning id
    `.execute(db);
    spaceId = space.rows[0]!.id;

    const plantObject = await sql<{ id: string }>`
      insert into plant_objects (owner_user_id, space_id, display_name)
      values (${ownerUserId}, ${spaceId}, 'Like fixture')
      returning id
    `.execute(db);
    plantObjectId = plantObject.rows[0]!.id;

    await sql`
      insert into journal_entries (
        owner_user_id, space_id, plant_object_id, title, body,
        client_mutation_id, public_slug, visibility, published_at
      ) values (
        ${ownerUserId}, ${spaceId}, ${plantObjectId},
        'Like ownership fixture', 'Fixture body.', ${randomUUID()},
        ${PUBLIC_SLUG}, 'public', now()
      )
    `.execute(db);
  });

  afterEach(async () => {
    await db
      .deleteFrom("engagement_likes")
      .where("target_ref", "=", PUBLIC_SLUG)
      .execute();
    await db
      .deleteFrom("journal_entries")
      .where("public_slug", "=", PUBLIC_SLUG)
      .execute();
    await db
      .deleteFrom("plant_objects")
      .where("id", "=", plantObjectId)
      .execute();
    await db.deleteFrom("spaces").where("id", "=", spaceId).execute();
    await db.deleteFrom("user").where("id", "=", ownerUserId).execute();
  });

  it("keeps a like until the same owner takes it back", async () => {
    const owner = { kind: "visitor" as const, visitorId: randomUUID() };

    expect(await toggleEngagementLike({ target, owner })).toEqual({
      liked: true,
      activeLikeCount: 1,
    });
    // There is no expiry column left, so nothing retires the row with time.
    expect(await readEngagementLikeState(target, [owner])).toEqual({
      activeLikeCount: 1,
      viewerLiked: true,
    });
    expect(await toggleEngagementLike({ target, owner })).toEqual({
      liked: false,
      activeLikeCount: 0,
    });
  });

  it("counts past the ceiling the previous design enforced", async () => {
    for (let index = 0; index < 70; index += 1) {
      await toggleEngagementLike({
        target,
        owner: { kind: "visitor", visitorId: randomUUID() },
      });
    }

    // `engagement_like_target_budgets` refused the 65th. It is gone.
    expect((await readEngagementLikeState(target, [])).activeLikeCount).toBe(
      70,
    );
  });

  it("lets an account withdraw a like it cast in another session", async () => {
    const owner = { kind: "user" as const, userId: ownerUserId };
    await toggleEngagementLike({ target, owner });

    expect(await toggleEngagementLike({ target, owner })).toEqual({
      liked: false,
      activeLikeCount: 0,
    });
  });

  it("holds one like per owner per target", async () => {
    const owner = { kind: "user" as const, userId: ownerUserId };
    await toggleEngagementLike({ target, owner });
    await db
      .insertInto("engagement_likes")
      .values({
        target_kind: target.kind,
        target_ref: target.ref,
        user_id: ownerUserId,
      })
      .onConflict((builder) => builder.doNothing())
      .execute();

    expect((await readEngagementLikeState(target, [])).activeLikeCount).toBe(1);
  });

  it("moves a visitor's likes onto the account they sign up with", async () => {
    const visitorId = randomUUID();
    await toggleEngagementLike({
      target,
      owner: { kind: "visitor", visitorId },
    });

    expect(
      await claimVisitorEngagementLikes({ userId: ownerUserId, visitorId }),
    ).toEqual({ claimed: 1 });

    expect(
      await readEngagementLikeState(target, [
        { kind: "user", userId: ownerUserId },
      ]),
    ).toEqual({ activeLikeCount: 1, viewerLiked: true });

    const leftovers = await db
      .selectFrom("engagement_likes")
      .select("id")
      .where("visitor_id", "=", visitorId)
      .execute();
    expect(leftovers).toHaveLength(0);
  });

  it("does not double-count a target the account had already liked", async () => {
    const visitorId = randomUUID();
    await toggleEngagementLike({
      target,
      owner: { kind: "visitor", visitorId },
    });
    await toggleEngagementLike({
      target,
      owner: { kind: "user", userId: ownerUserId },
    });
    expect((await readEngagementLikeState(target, [])).activeLikeCount).toBe(2);

    await claimVisitorEngagementLikes({ userId: ownerUserId, visitorId });

    expect((await readEngagementLikeState(target, [])).activeLikeCount).toBe(1);
  });

  it("refuses a row that claims both owners or neither", async () => {
    await expect(
      db
        .insertInto("engagement_likes")
        .values({
          target_kind: target.kind,
          target_ref: target.ref,
          user_id: ownerUserId,
          visitor_id: randomUUID(),
        })
        .execute(),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      db
        .insertInto("engagement_likes")
        .values({ target_kind: target.kind, target_ref: target.ref })
        .execute(),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a like on a target that is not public", async () => {
    await expect(
      toggleEngagementLike({
        target: { kind: "journal_entry", ref: "no-such-entry-anywhere" },
        owner: { kind: "visitor", visitorId: randomUUID() },
      }),
    ).rejects.toThrow();
  });
});
