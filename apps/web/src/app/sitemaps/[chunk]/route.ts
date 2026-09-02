import {
  SITEMAP_RESPONSE_HEADERS,
  buildPublicSitemapChunk,
  parsePublicSitemapChunkId,
  renderSitemapUrlsetXml,
} from "@/server/public-sitemap";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ chunk: string }> },
) {
  const id = parsePublicSitemapChunkId((await context.params).chunk);
  if (!id) return new Response(null, { status: 404 });
  return new Response(
    renderSitemapUrlsetXml(await buildPublicSitemapChunk(id)),
    {
      headers: SITEMAP_RESPONSE_HEADERS,
    },
  );
}
