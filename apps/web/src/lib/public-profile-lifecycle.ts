import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath, stripLocalePrefix } from "@/lib/public-localization";

const PUBLIC_PROFILE_PATH = /^\/@([a-z0-9][a-z0-9_]{2,29})\/?$/i;

const PROFILE_NOT_FOUND_COPY: Record<
  InterfaceLocale,
  { title: string; description: string; home: string }
> = {
  uk: {
    title: "Профіль не знайдено",
    description:
      "Ця сторінка недоступна. Перевірте адресу або поверніться до публічної стрічки.",
    home: "До публічної стрічки",
  },
  bg: {
    title: "Профилът не е намерен",
    description:
      "Тази страница не е достъпна. Проверете адреса или се върнете към публичния поток.",
    home: "Към публичния поток",
  },
  ru: {
    title: "Профиль не найден",
    description:
      "Эта страница недоступна. Проверьте адрес или вернитесь к публичной ленте.",
    home: "К публичной ленте",
  },
};

const PROFILE_GONE_COPY: typeof PROFILE_NOT_FOUND_COPY = {
  uk: {
    title: "Профіль більше недоступний",
    description:
      "Цю публічну сторінку видалено. Поверніться до публічної стрічки.",
    home: "До публічної стрічки",
  },
  bg: {
    title: "Профилът вече не е достъпен",
    description:
      "Тази публична страница е премахната. Върнете се към публичния поток.",
    home: "Към публичния поток",
  },
  ru: {
    title: "Профиль больше недоступен",
    description: "Эта публичная страница удалена. Вернитесь к публичной ленте.",
    home: "К публичной ленте",
  },
};

export function matchPublicProfilePath(pathname: string) {
  const basePath = stripLocalePrefix(pathname).path;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(basePath);
  } catch {
    return null;
  }
  return PUBLIC_PROFILE_PATH.exec(decodedPath)?.[1]?.toLowerCase() ?? null;
}

export function renderNotFoundPublicProfileHtml(locale: InterfaceLocale) {
  return renderPublicProfileLifecycleHtml(
    locale,
    PROFILE_NOT_FOUND_COPY[locale],
  );
}

export function renderGonePublicProfileHtml(locale: InterfaceLocale) {
  return renderPublicProfileLifecycleHtml(locale, PROFILE_GONE_COPY[locale]);
}

function renderPublicProfileLifecycleHtml(
  locale: InterfaceLocale,
  copy: { title: string; description: string; home: string },
) {
  const homePath = localizedPath(locale, "/");

  return `<!doctype html>
<html lang="${escapeAttribute(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(copy.title)} | OverGarden</title>
    <style>
      :root { --fg: rgb(23 23 23); --bg: rgb(255 255 255); --brand: rgb(47 125 50); --muted: rgb(102 102 102); --line: rgb(212 212 212); color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; }
      header { height: 56px; display: flex; align-items: center; padding: 0 20px; color: var(--bg); background: var(--fg); font-weight: 700; }
      header span { display: inline-flex; height: 56px; align-items: center; padding: 0 18px; background: var(--brand); }
      main { width: min(760px, 100%); margin: 0 auto; padding: 40px 20px; }
      h1 { margin: 0; font-size: 2rem; line-height: 1.15; }
      p { max-width: 42rem; margin: 16px 0 0; color: var(--muted); line-height: 1.65; }
      a { display: inline-flex; margin-top: 24px; border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; color: inherit; font-weight: 650; text-decoration: none; }
      a:hover { border-color: var(--brand); color: var(--brand); }
    </style>
  </head>
  <body>
    <header><span>OverGarden</span></header>
    <main>
      <h1>${escapeHtml(copy.title)}</h1>
      <p>${escapeHtml(copy.description)}</p>
      <a href="${escapeAttribute(homePath)}">${escapeHtml(copy.home)}</a>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
