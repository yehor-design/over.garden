import { connection } from "next/server";

import {
  SITEMAP_RESPONSE_HEADERS,
  renderSitemapIndexXml,
} from "@/server/public-sitemap";
import { readPublicSitemapChunkIds } from "@/server/public-cache";

/** The sitemap index: one chunk per content family, 5 000 URLs each. */
export async function GET() {
  await connection();
  return new Response(
    renderSitemapIndexXml(await readPublicSitemapChunkIds()),
    {
      headers: SITEMAP_RESPONSE_HEADERS,
    },
  );
}
