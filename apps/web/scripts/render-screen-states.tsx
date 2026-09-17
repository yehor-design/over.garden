/**
 * Renders the six states of DESIGN.md §5.4 into standalone HTML documents.
 *
 * It exists because Playwright transforms every `.tsx` it loads with its own
 * JSX runtime, which produces `{__pw_type}` objects React refuses to render —
 * so a Playwright spec cannot import this product's components at all. The
 * rendering happens here, under `tsx` and React's own runtime, and
 * `tests/screen-states.spec.ts` reads the files and scans them with axe in a
 * real engine.
 *
 * The documents are also openable by a person, which is the nearest thing to a
 * component gallery this product will have: a surface nobody asked for must not
 * reach the menu (ADR-0031, and the two removals that taught it).
 *
 *   pnpm build && pnpm screen-states:render
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createElement as h, type ReactNode } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import { Badge } from "../src/components/ui/badge";
import { Button } from "../src/components/ui/button";
import { Callout } from "../src/components/ui/callout";
import { Card } from "../src/components/ui/card";
import { Chip } from "../src/components/ui/chip";
import { EmptyState } from "../src/components/ui/empty-state";
import { ErrorState } from "../src/components/ui/error-state";
import { ListRow } from "../src/components/ui/list-row";
import { PageHeader } from "../src/components/ui/page-header";
import { Pagination } from "../src/components/ui/pagination";
import { SCREEN_STATES } from "../src/components/ui/screen-state";
import { resolveIllustration } from "../src/lib/illustrations";
import { Skeleton } from "../src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../src/components/ui/table";

/**
 * The same illustration the product resolves, inlined.
 *
 * These documents are opened over `file://` — by this spec, and by a person
 * looking at a state. A root-relative `/illustrations/…` resolves to the
 * filesystem root there and renders a broken box, which is exactly the thing an
 * axe scan does not notice and a reader does. The path still comes from the
 * manifest; only the transport changes.
 */
function inlineIllustration(key: Parameters<typeof resolveIllustration>[0]) {
  const illustration = resolveIllustration(key);
  const file = path.join(process.cwd(), "public", illustration.src);
  return {
    ...illustration,
    src: `data:image/webp;base64,${readFileSync(file).toString("base64")}`,
  };
}

const page = (...children: ReactNode[]) =>
  renderToStaticMarkup(h("main", null, ...children));

const STATES: Record<(typeof SCREEN_STATES)[number], () => string> = {
  "empty-first-run": () =>
    page(
      h(PageHeader, {
        key: "header",
        title: "Журнали",
        description: "Ваші рослини і тварини.",
      }),
      h(EmptyState, {
        key: "state",
        illustration: inlineIllustration("empty-journal"),
        title: "Тут ще нічого немає",
        description: "Перший запис починає історію цієї рослини.",
        action: h(Button, null, "Новий запис"),
      }),
    ),
  "empty-no-results": () =>
    page(
      h(PageHeader, { key: "header", title: "Журнали" }),
      h(EmptyState, {
        key: "state",
        variant: "no-results",
        title: "Нічого не збіглося",
        description: "Спробуйте прибрати один із фільтрів.",
        filters: [
          h(Chip, {
            key: "a",
            label: "Томати",
            removeLabel: "Прибрати фільтр: томати",
            onRemove: () => {},
          }),
          h(Chip, {
            key: "b",
            label: "2026",
            removeLabel: "Прибрати фільтр: 2026",
            onRemove: () => {},
          }),
        ],
        action: h(Button, { variant: "secondary" }, "Очистити фільтри"),
      }),
    ),
  loading: () =>
    page(
      h(PageHeader, { key: "header", title: "Журнали" }),
      h(
        "section",
        {
          key: "state",
          "aria-busy": "true",
          "aria-label": "Завантаження записів",
        },
        [0, 1, 2].map((row) =>
          h(
            "div",
            { key: row, className: "flex items-center gap-4 py-4" },
            h(Skeleton, { className: "size-16 shrink-0" }),
            h(
              "div",
              { className: "min-w-0 flex-1" },
              h(Skeleton, { className: "h-4 w-2/3" }),
              h(Skeleton, { className: "mt-2 h-3 w-1/2" }),
            ),
          ),
        ),
      ),
    ),
  degraded: () =>
    page(
      h(PageHeader, { key: "header", title: "Простір саду" }),
      h(
        "ul",
        { key: "list" },
        h(ListRow, {
          title: "Балконні томати",
          href: "/garden/objects/1",
          description: "Три з п'яти зійшли.",
          meta: "14 квітня",
          actions: h(Badge, { tone: "success" }, "Росте"),
        }),
      ),
      h(ErrorState, {
        key: "state",
        failureClass: "connection_unavailable",
        digest: "16JQ1ET",
        title: "Цей блок зараз недоступний",
        description: "Спробуйте ще раз за хвилину.",
        reference: "Код звернення: 16JQ1ET",
        retryHref: "/garden",
        retryLabel: "Спробувати ще раз",
      }),
    ),
  error: () =>
    page(
      h(ErrorState, {
        key: "state",
        headingLevel: 1,
        failureClass: "unknown",
        digest: "0ZK4M2P",
        title: "Щось пішло не так",
        description:
          "Оновіть сторінку. Якщо не допоможе — напишіть у підтримку.",
        reference: "Код звернення: 0ZK4M2P",
        retryHref: "/garden",
        retryLabel: "Оновити",
      }),
    ),
  "signed-out": () =>
    page(
      h(PageHeader, {
        key: "header",
        title: "Простір саду",
        description: "Ваш приватний сад.",
      }),
      h(
        Callout,
        { key: "callout", tone: "info", title: "Потрібен вхід" },
        h(
          "p",
          null,
          "Публічні журнали залишаються відкритими. ",
          h(
            "a",
            { href: "/auth/sign-in", className: "text-link underline" },
            "Увійти",
          ),
        ),
      ),
      h(
        Card,
        {
          key: "card",
          as: "section",
          "aria-label": "Публічні журнали",
          className: "p-4",
        },
        h(
          Table,
          { caption: "Останні журнали" },
          h(
            TableHead,
            null,
            h(
              TableRow,
              null,
              h(TableHeader, { scope: "col" }, "Назва"),
              h(TableHeader, { scope: "col" }, "Записів"),
            ),
          ),
          h(
            TableBody,
            null,
            h(
              TableRow,
              null,
              h(TableHeader, { scope: "row" }, "Балконні томати"),
              h(TableCell, { numeric: true }, "12"),
            ),
          ),
        ),
        h(Pagination, {
          label: "Сторінки журналів",
          previousLabel: "Попередня",
          nextHref: "/journals?page=2",
          nextLabel: "Наступна",
          status: "Сторінка 1 з 9",
        }),
      ),
    ),
};

/**
 * Writes one HTML document per state, markup and stylesheet inlined, into
 * `test-results/screen-states/`.
 *
 * It exists because Playwright transforms every `.tsx` it loads with its own
 * JSX runtime, which produces `{__pw_type}` objects React refuses to render —
 * so a Playwright spec cannot import this product's components at all. The
 * rendering happens here, under `tsx` and React's own runtime, and the spec
 * reads the files.
 *
 * The files are also openable by a person, which is the nearest thing to a
 * component gallery this product will have: a route nobody asked for must not
 * reach the menu (ADR-0031).
 *
 *   pnpm build && pnpm screen-states:render
 */
export const SCREEN_STATE_OUTPUT = path.join(
  process.cwd(),
  "test-results",
  "screen-states",
);

export function productionStylesheet(): string {
  // Next emits the app's CSS as build-hashed chunks; the token layer is in the
  // one that declares a primitive, and its absence means no build has run.
  const directory = path.join(process.cwd(), ".next", "static", "chunks");
  const sheets = readdirSync(directory)
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(path.join(directory, name), "utf8"));
  if (!sheets.some((sheet) => sheet.includes("--og-neutral-900"))) {
    throw new Error(
      "No production stylesheet carrying the token layer: run `pnpm build` first.",
    );
  }
  return sheets.join("\n");
}

export function renderScreenStates(): string[] {
  const stylesheet = productionStylesheet();
  mkdirSync(SCREEN_STATE_OUTPUT, { recursive: true });
  const written: string[] = [];
  for (const state of SCREEN_STATES) {
    const file = path.join(SCREEN_STATE_OUTPUT, `${state}.html`);
    writeFileSync(
      file,
      `<!doctype html><html lang="uk"><head><meta charset="utf-8">` +
        `<title>${state}</title><style>${stylesheet}</style></head>` +
        `<body data-state="${state}">${STATES[state]()}</body></html>`,
      "utf8",
    );
    written.push(file);
  }
  // The falsification document: the same scan has to see these two.
  writeFileSync(
    path.join(SCREEN_STATE_OUTPUT, "falsification.html"),
    `<!doctype html><html lang="uk"><head><meta charset="utf-8">` +
      `<title>falsification</title><style>${stylesheet}</style></head>` +
      `<body data-state="falsification"><main>` +
      `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button type="button"></button>` +
      `</main></body></html>`,
    "utf8",
  );
  return written;
}

if (process.argv[1]?.includes("render-screen-states")) {
  const written = renderScreenStates();
  process.stdout.write(`${written.length + 1} documents written\n`);
}
