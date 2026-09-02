import { connection } from "next/server";

import {
  SITEMAP_RESPONSE_HEADERS,
  parsePublicSitemapChunkId,
  renderSitemapUrlsetXml,
} from "@/server/public-sitemap";
import { readPublicSitemapChunk } from "@/server/public-cache";

export async function GET(
  _request: Request,
  context: { params: Promise<{ chunk: string }> },
) {
  await connection();
  const id = parsePublicSitemapChunkId((await context.params).chunk);
  if (!id) return new Response(null, { status: 404 });
  return new Response(
    renderSitemapUrlsetXml(await readPublicSitemapChunk(id)),
    {
      headers: SITEMAP_RESPONSE_HEADERS,
    },
  );
}
