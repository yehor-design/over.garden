/**
 * A dynamic route segment, spelled the way the address law spells it.
 *
 * A route receives its segments as the URL carried them, and the URL carries a
 * Cyrillic slug percent-encoded and `@` as either itself or `%40`. Every
 * address builder in `public-paths.ts` encodes what it is given, so handing it
 * a segment straight from `params` encodes an already-encoded string a second
 * time: `%D1%82…` becomes `%25D1%2582…`, which matches no address at all.
 *
 * That is not a hypothetical. It is why `/@{handle}/objects/{slug}` — every
 * object passport at its own address — answered `200` and rendered the
 * not-found page from the day the addresses moved under their authors
 * (ADR-0029 D9) until 2026-09-12.
 *
 * Decoding first is right for both spellings: on an encoded segment it undoes
 * the URL, and on a decoded one it is a no-op, because a decoded slug holds no
 * `%` — the address alphabets do not admit one (D12).
 */
export function decodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape is not an address; hand it on unchanged and let the
    // matcher refuse it, rather than throwing inside a page render.
    return segment;
  }
}

/** The gardener's handle a `/@{handle}` segment names, without the `@`. */
export function routeHandleSegment(segment: string): string {
  return decodeRouteSegment(segment).replace(/^@/u, "").toLowerCase();
}
