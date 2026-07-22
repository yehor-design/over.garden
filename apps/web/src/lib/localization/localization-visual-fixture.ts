export const INTERFACE_GLOBAL_ERROR_VISUAL_FIXTURE_HEADER =
  "x-overgarden-internal-visual-global-error";

const GLOBAL_ERROR_VISUAL_FIXTURE_PARAM = "visualLocaleState";
const GLOBAL_ERROR_VISUAL_FIXTURE_VALUE = "global-error";
const SAFE_FLUSH_FAILURE_VISUAL_FIXTURE_VALUE = "safe-flush-failure";
const SERVER_ACTION_PENDING_VISUAL_FIXTURE_VALUE = "server-action-pending";

export const INTERFACE_SERVER_ACTION_PENDING_VISUAL_FIXTURE_DELAY_MS = 2_000;

/**
 * A deterministic, environment-gated browser probe for the real App Router
 * global-error boundary. Proxy is the sole authority that may convert this
 * semantically exact query into the internal request header consumed by
 * RootLayout. URL-equivalent unreserved percent-encoding may be normalized by
 * Next before Proxy; the security boundary is one exact key/value and no
 * additional request state.
 */
export function isInterfaceGlobalErrorVisualFixtureRequest(url: URL) {
  const keys = [...url.searchParams.keys()];
  return (
    url.pathname === "/garden" &&
    keys.length === 1 &&
    keys[0] === GLOBAL_ERROR_VISUAL_FIXTURE_PARAM &&
    url.searchParams.getAll(GLOBAL_ERROR_VISUAL_FIXTURE_PARAM).length === 1 &&
    url.searchParams.get(GLOBAL_ERROR_VISUAL_FIXTURE_PARAM) ===
      GLOBAL_ERROR_VISUAL_FIXTURE_VALUE &&
    url.hash === ""
  );
}

export function isInterfaceSafeFlushFailureVisualFixtureValue(
  value: string | string[] | undefined,
) {
  return (
    typeof value === "string" &&
    value === SAFE_FLUSH_FAILURE_VISUAL_FIXTURE_VALUE
  );
}

/**
 * Exact query gate for the local-only Server Action browser probe. Additional
 * query state must never accidentally expose a synthetic mutation surface.
 */
export function isInterfaceServerActionPendingVisualFixtureSearchParams(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
) {
  const keys = Object.keys(searchParams);
  return (
    keys.length === 1 &&
    keys[0] === GLOBAL_ERROR_VISUAL_FIXTURE_PARAM &&
    searchParams[GLOBAL_ERROR_VISUAL_FIXTURE_PARAM] ===
      SERVER_ACTION_PENDING_VISUAL_FIXTURE_VALUE
  );
}

/** Defense-in-depth request gate used again inside the Server Action. */
export function isInterfaceServerActionPendingVisualFixtureRequest(url: URL) {
  return (
    url.pathname === "/garden" &&
    url.search ===
      `?${GLOBAL_ERROR_VISUAL_FIXTURE_PARAM}=${SERVER_ACTION_PENDING_VISUAL_FIXTURE_VALUE}` &&
    url.hash === ""
  );
}
