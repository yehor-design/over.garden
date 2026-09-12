/**
 * IndexNow: Bing and Yandex hear about a page in minutes (ADR-0029 D13 item 6,
 * OVE-434).
 *
 * Both are a materially larger share of search in Ukraine and Bulgaria than in
 * Western markets, and both accept IndexNow. Google does not participate — it
 * reads the sitemap — so there is no Google-specific submission here and there
 * will not be one.
 *
 * ## The key is public, and that is the design
 *
 * IndexNow proves control of a host by asking it to serve the key back at a
 * known URL. Anyone can read it; knowing it lets them submit URLs *of this
 * host*, which is the whole point and not a capability worth protecting. So it
 * is a constant in the repository rather than an environment variable: one
 * fewer thing that can be missing in one environment and present in another,
 * and the file and the submission can never disagree about what the key is.
 *
 * ## The file is at the host root, and it has to be
 *
 * The protocol allows a key in a subdirectory, but then it only authorises
 * URLs *in that subdirectory*. The first version of this served it at
 * `/indexnow/{key}.txt` and read the specification as permission to submit
 * anything with `keyLocation` pointing there. `api.indexnow.org` answered:
 *
 * > `422 InvalidRequestParameters` — One or more URLs are not related to your
 * > site verified through the keylocation parameter.
 *
 * Only submitting a real URL showed that. It is a static file in `public/`
 * now, which is the root of this host, and `indexnow-key-file.test.ts` asserts
 * the file on disk and the constant below say the same thing — the one way
 * they could ever drift.
 */
export const INDEXNOW_KEY = "e1d2d024f0edaca0ebfb710bfc63f607";

/** The file name the protocol expects, wherever it is hosted. */
export const INDEXNOW_KEY_FILE = `${INDEXNOW_KEY}.txt`;

/** Where this host serves it: the root, because a subdirectory key only covers that subdirectory. */
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY_FILE}`;

/**
 * One endpoint, not four.
 *
 * The participating engines share submissions with each other, so submitting
 * to `api.indexnow.org` reaches Bing and Yandex both. Submitting the same URL
 * to each engine separately is what the protocol's own documentation asks
 * implementers not to do.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** At most this many URLs in one submission; the protocol's own bound is 10 000. */
export const INDEXNOW_MAX_URLS_PER_SUBMISSION = 100;

/**
 * How long a URL stays announced before it may be announced again.
 *
 * IndexNow asks not to resubmit an unchanged URL, and a gardener editing an
 * entry four times in a minute is one change to a crawler. Ten minutes is long
 * enough to fold an editing session into one submission and short enough that a
 * real second change the same hour still reaches the engines that day.
 */
export const INDEXNOW_REPEAT_WINDOW_MS = 10 * 60 * 1000;

/** The most submissions one process will make in a window, whatever it is asked. */
export const INDEXNOW_RATE_LIMIT = 30;
export const INDEXNOW_RATE_WINDOW_MS = 60 * 1000;

export interface IndexNowSubmission {
  readonly host: string;
  readonly key: string;
  readonly keyLocation: string;
  readonly urlList: readonly string[];
}

/**
 * The submission body, or `null` when there is nothing to say.
 *
 * Every URL must be on the host being submitted for — the protocol rejects a
 * mixed batch outright — and a relative path is not a URL, so both are dropped
 * here rather than at the endpoint.
 */
export function buildIndexNowSubmission(
  siteUrl: string,
  urls: readonly string[],
): IndexNowSubmission | null {
  const site = safeUrl(siteUrl);
  if (!site) return null;

  const urlList = [
    ...new Set(
      urls.flatMap((candidate) => {
        const url = safeUrl(candidate);
        return url && url.host === site.host ? [url.toString()] : [];
      }),
    ),
  ].slice(0, INDEXNOW_MAX_URLS_PER_SUBMISSION);
  if (urlList.length === 0) return null;

  return {
    host: site.host,
    key: INDEXNOW_KEY,
    keyLocation: new URL(INDEXNOW_KEY_PATH, site).toString(),
    urlList,
  };
}

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Which of these URLs may be announced now.
 *
 * Two bounds, and both are about not lying to a crawler rather than about
 * load: a URL announced minutes ago has not changed again, and a process that
 * has already made its submissions this minute is looping rather than
 * publishing.
 *
 * State lives in the caller so this stays a pure function — which is what
 * makes "announced twice in one window" a test rather than a stopwatch.
 */
export function selectAnnounceableUrls(input: {
  urls: readonly string[];
  announcedAt: ReadonlyMap<string, number>;
  submissionsInWindow: number;
  now: number;
}): string[] {
  if (input.submissionsInWindow >= INDEXNOW_RATE_LIMIT) return [];
  return [...new Set(input.urls)].filter((url) => {
    const announced = input.announcedAt.get(url);
    return (
      announced === undefined ||
      input.now - announced >= INDEXNOW_REPEAT_WINDOW_MS
    );
  });
}
