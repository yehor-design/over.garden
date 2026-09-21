import { randomUUID } from "node:crypto";
import { expect, type BrowserContext, type Page } from "playwright/test";
import type { Pool } from "pg";
import { requiredLocalDatabaseUrl } from "./organism-fixture";

export const COLLECTION_PRESETS = [
  { spaces: 0, objects: 0 },
  { spaces: 1, objects: 0 },
  { spaces: 1, objects: 1 },
  { spaces: 3, objects: 100 },
  { spaces: 20, objects: 1000 },
] as const;
export const LONG_NAMES = {
  uk: "Тераса біля південного вікна — спостереження за багаторічними рослинами",
  bg: "Терасата до южния прозорец — наблюдения на многогодишните растения",
  ru: "Терраса у южного окна — наблюдения за многолетними растениями",
} as const;

/** Only synthetic users on loopback; refuses an existing user's populated garden. */
export async function seedCollection(
  pool: Pool,
  userId: string,
  preset: (typeof COLLECTION_PRESETS)[number],
) {
  requiredLocalDatabaseUrl();
  const owner = await pool.query<{ email: string; count: string }>(
    `select email, (select count(*) from spaces where owner_user_id = u.id)::text as count
     from "user" u where id = $1`,
    [userId],
  );
  if (
    !owner.rows[0]?.email.endsWith("@example.test") ||
    owner.rows[0].count !== "0"
  )
    throw new Error("Collection fixture requires an empty synthetic gardener");
  const spaces = Array.from({ length: preset.spaces }, (_, index) => ({
    id: randomUUID(),
    name: `${Object.values(LONG_NAMES)[index % 3]} ${index + 1}`,
  }));
  const objects = Array.from({ length: preset.objects }, (_, index) => ({
    id: randomUUID(),
    spaceId: spaces[index % spaces.length].id,
    // Deliberate duplicate label across distinct spaces; IDs must carry identity.
    name:
      index < spaces.length
        ? "Томат / Домат / Tomato"
        : `${Object.values(LONG_NAMES)[index % 3]} — ${index + 1}`,
  }));
  const deletedDestinationId = randomUUID();
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    await connection.query(
      `insert into spaces (id, owner_user_id, display_name)
      select id, $1::uuid, name from unnest($2::uuid[], $3::text[]) as fixture(id, name)`,
      [userId, spaces.map((s) => s.id), spaces.map((s) => s.name)],
    );
    await connection.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
      select id, $1::uuid, space_id, name, 'plant', 'unknown'
      from unnest($2::uuid[], $3::uuid[], $4::text[]) as fixture(id, space_id, name)`,
      [
        userId,
        objects.map((o) => o.id),
        objects.map((o) => o.spaceId),
        objects.map((o) => o.name),
      ],
    );
    if (spaces.length) {
      await connection.query(
        `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
        values ($1, $2, $3, 'Deleted synthetic destination', 'plant', 'unknown')`,
        [deletedDestinationId, userId, spaces[0].id],
      );
      await connection.query(
        "delete from plant_objects where id=$1 and owner_user_id=$2",
        [deletedDestinationId, userId],
      );
    }
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
  return {
    userId,
    spaces,
    objects,
    // Invalid boundary values, never rows violating the NOT NULL/FK contract.
    unassigned: { objectId: randomUUID(), spaceId: null },
    deletedDestinationId,
  };
}

export async function cleanupCollection(pool: Pool, userId: string) {
  requiredLocalDatabaseUrl();
  const row = await pool.query<{ email: string }>(
    'select email from "user" where id = $1',
    [userId],
  );
  if (!row.rows[0]?.email.endsWith("@example.test"))
    throw new Error("Not a synthetic gardener");
  for (const table of ["journal_entries", "plant_objects", "spaces"])
    await pool.query(`delete from ${table} where owner_user_id = $1`, [userId]);
  await pool.query('delete from "user" where id = $1', [userId]);
}

/** Keep the signed token but remove the five-minute cookie cache before asking the server. */
export async function expireSyntheticSession(
  pool: Pool,
  context: BrowserContext,
  userId: string,
) {
  requiredLocalDatabaseUrl();
  await pool.query(
    `update session set "expiresAt" = now() - interval '1 minute'
    where "userId" = $1 and exists (select 1 from "user" where id = $1 and email like '%@example.test')`,
    [userId],
  );
  const cookies = (await context.cookies()).filter(
    (c) => !c.name.includes("session_data"),
  );
  await context.clearCookies();
  await context.addCookies(cookies);
}

/** Browser-made synthetic pixels, no private photographs, no external downloads or uploads. */
export async function makeSyntheticPhotograph(
  page: Page,
  orientation: "portrait" | "landscape",
) {
  const result = await page.evaluate(async (kind) => {
    const width = kind === "portrait" ? 1440 : 2560;
    const height = kind === "portrait" ? 2560 : 1440;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(width, height);
    let seed = 480;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = (seed >>> 24) / 2;
      pixels.data[i + 1] = 80 + (seed >>> 24) / 2;
      pixels.data[i + 2] = 40 + ((seed >>> 16) & 255) / 3;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!), "image/webp", 0.82),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { width, height, base64: btoa(binary), bytes: bytes.length };
  }, orientation);
  expect(result.bytes).toBeGreaterThan(100_000);
  expect(result.bytes).toBeLessThan(12 * 1024 * 1024);
  return { ...result, body: Buffer.from(result.base64, "base64") };
}
