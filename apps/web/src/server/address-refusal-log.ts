import "server-only";

/**
 * Says out loud that a route refused an address the proxy had already accepted.
 *
 * The proxy decides 200, 308 and 404 from a bounded database lookup (ADR-0029
 * D3), so by the time a page renders, the address has been found. A `notFound()`
 * after that is a disagreement between two lookups, and it is invisible from
 * outside: the response is a streamed shell whose status is already 200, so the
 * reader gets an apology page and every monitor sees a healthy request.
 *
 * That is not hypothetical. On 2026-09-12 every published journal entry answered
 * `200` with the not-found page in its body, and had since the addresses moved
 * under their authors the same morning — `curl -sI` said `200` for all eleven,
 * which is what the move's proof checked.
 *
 * One line, one event name, no reader data: the address and which guard refused
 * it.
 */
export function logAddressRefusal(event: {
  route: string;
  reason: string;
  detail?: Record<string, string | null>;
}) {
  console.error(
    JSON.stringify({
      event: "public_address_refused_by_route",
      schemaVersion: "overgarden.addressRefusal.v1",
      ...event,
    }),
  );
}
