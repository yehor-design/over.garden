import {
  SITEMAP_RESPONSE_HEADERS,
  listPublicSitemapChunkIds,
  renderSitemapIndexXml,
} from "@/server/public-sitemap";

export const dynamic = "force-dynamic";

/** The sitemap index: one chunk per content family, 5 000 URLs each. */
export async function GET() {
  return new Response(
    renderSitemapIndexXml(await listPublicSitemapChunkIds()),
    {
      headers: SITEMAP_RESPONSE_HEADERS,
    },
  );
}
