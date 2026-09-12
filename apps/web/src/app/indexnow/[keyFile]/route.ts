import { INDEXNOW_KEY, INDEXNOW_KEY_FILE } from "@/lib/seo/indexnow";

/**
 * The IndexNow key file (ADR-0029 D13 item 6, OVE-434).
 *
 * The protocol proves control of a host by asking it to serve the key back.
 * Anyone may read it — knowing it lets them submit URLs *of this host*, which
 * is the point of the protocol and not a capability worth protecting — so this
 * route is deliberately public and deliberately not rate limited.
 *
 * It answers only the one file name. A dynamic segment that echoed whatever it
 * was given would hand every reader a valid-looking key file for a key that is
 * not this host's, which is the one thing the protocol asks a host not to do.
 */
// No `dynamic` segment config: `cacheComponents` rejects it outright, and this
// route needs none — it reads nothing but its own parameter, so it prerenders
// from `generateStaticParams` and is served from the CDN.
export function generateStaticParams() {
  return [{ keyFile: INDEXNOW_KEY_FILE }];
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ keyFile: string }> },
) {
  const { keyFile } = await context.params;
  if (keyFile !== INDEXNOW_KEY_FILE) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(INDEXNOW_KEY, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
