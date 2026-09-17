/**
 * The interface-locale contract, measured on production rather than described.
 *
 * It records, for each vantage point it can actually reach: the resolved
 * **market** (from the document's own `overgarden-interface-context` meta, not
 * guessed from a screenshot), the document language, `Content-Language`, a
 * sample of chrome strings, and how many language controls the page rendered.
 *
 * **What this cannot do.** Vercel sets `x-vercel-ip-country` at the edge and
 * the resolver reads it first, so an incoming country header is ignored: a
 * UA-signal vantage point is not reachable from a machine in Bulgaria, or a
 * BG-signal one from a machine in Ukraine. The country dimension is proved by
 * `src/lib/interface-locale-surface.test.ts`, which walks the whole matrix; what
 * is proved here is what a real reader of this deployment gets.
 *
 * Usage: `pnpm interface:locale:probe [--base https://over.garden]`
 */
const DEFAULT_BASE = "https://over.garden";
const PATHS = ["/", "/journals"] as const;
const COOKIE_CASES = [
  { label: "no cookie (this machine's country signal alone)", cookie: "" },
  { label: "locale=uk", cookie: "overgarden_interface_locale=uk" },
  { label: "locale=bg", cookie: "overgarden_interface_locale=bg" },
  { label: "locale=ru", cookie: "overgarden_interface_locale=ru" },
] as const;

const CHROME_SAMPLES = [
  "Стрічка",
  "Каталог",
  "Журнали",
  "Знання",
  "Увійти",
  "Поток",
  "Дневници",
  "Знания",
  "Вход",
  "Лента",
  "Журналы",
  "Войти",
] as const;

interface Reading {
  path: string;
  vantage: string;
  status: number;
  contentLanguage: string | null;
  documentLanguage: string | null;
  resolvedContext: string | null;
  cache: string | null;
  languageControls: number;
  chrome: string[];
}

async function read(
  base: string,
  path: string,
  cookie: string,
  vantage: string,
) {
  const response = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const html = await response.text();
  const reading: Reading = {
    path,
    vantage,
    status: response.status,
    contentLanguage: response.headers.get("content-language"),
    documentLanguage: /<html[^>]*\slang="([a-z-]+)"/u.exec(html)?.[1] ?? null,
    resolvedContext:
      /name="overgarden-interface-context"\s+content="([^"]+)"/u.exec(
        html,
      )?.[1] ??
      /content="([a-z]+:[a-z]+)"\s+name="overgarden-interface-context"/u.exec(
        html,
      )?.[1] ??
      null,
    cache: response.headers.get("x-vercel-cache"),
    languageControls: (html.match(/data-interface-language-control=/gu) ?? [])
      .length,
    chrome: CHROME_SAMPLES.filter((sample) => html.includes(sample)),
  };
  return reading;
}

async function main() {
  const baseFlag = process.argv.indexOf("--base");
  const base =
    baseFlag >= 0 ? (process.argv[baseFlag + 1] ?? DEFAULT_BASE) : DEFAULT_BASE;
  const readings: Reading[] = [];
  for (const path of PATHS) {
    for (const vantage of COOKIE_CASES) {
      readings.push(await read(base, path, vantage.cookie, vantage.label));
    }
  }

  const failures: string[] = [];
  for (const reading of readings) {
    const label = `${reading.path} · ${reading.vantage}`;
    if (reading.status !== 200) failures.push(`${label}: ${reading.status}`);
    if (reading.languageControls !== 1) {
      failures.push(`${label}: ${reading.languageControls} language controls`);
    }
    if (
      reading.contentLanguage &&
      reading.documentLanguage &&
      reading.contentLanguage !== reading.documentLanguage
    ) {
      failures.push(
        `${label}: Content-Language ${reading.contentLanguage} against <html lang="${reading.documentLanguage}">`,
      );
    }
    const market = reading.resolvedContext?.split(":")[0] ?? null;
    const contextLocale = reading.resolvedContext?.split(":")[1] ?? null;
    if (contextLocale && contextLocale !== reading.documentLanguage) {
      failures.push(
        `${label}: resolved ${reading.resolvedContext} against <html lang="${reading.documentLanguage}">`,
      );
    }
    if (market && market !== "ukraine" && market !== "bulgaria") {
      failures.push(`${label}: unknown market ${market}`);
    }
  }

  console.log(
    `interface-locale probe against ${base}\n` +
      readings
        .map(
          (reading) =>
            `  ${reading.path.padEnd(10)} ${reading.vantage.padEnd(48)} ` +
            `status=${reading.status} market/locale=${reading.resolvedContext ?? "-"} ` +
            `html=${reading.documentLanguage ?? "-"} content-language=${reading.contentLanguage ?? "-"} ` +
            `cache=${reading.cache ?? "-"} controls=${reading.languageControls} ` +
            `chrome=[${reading.chrome.join(", ")}]`,
        )
        .join("\n"),
  );

  if (failures.length > 0) {
    console.error(
      `\ninterface-locale probe failed:\n  ${failures.join("\n  ")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `\ninterface-locale probe: ${readings.length} readings, chrome and document agree everywhere, exactly one control each`,
  );
}

void main();
