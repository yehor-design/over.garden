/** Local review documents only; never a product route or downloadable asset pack. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Illustration } from "../src/components/ui/illustration";
import {
  ILLUSTRATION_ROLES,
  resolveIllustrationRole,
} from "../src/lib/illustrations";
import { productionStylesheet } from "./render-screen-states";

const titles = {
  uk: [
    "Почніть історію свого саду",
    "Створіть простір",
    "Додайте рослину або тварину",
    "Тут ще немає записів",
    "Нічого не знайдено",
    "Простір створено",
  ],
  bg: [
    "Започнете историята на градината си",
    "Създайте пространство",
    "Добавете растение или животно",
    "Все още няма записи",
    "Няма намерени резултати",
    "Пространството е създадено",
  ],
  ru: [
    "Начните историю своего сада",
    "Создайте пространство",
    "Добавьте растение или животное",
    "Здесь пока нет записей",
    "Ничего не найдено",
    "Пространство создано",
  ],
};
const document = readFileSync(
  path.join(process.cwd(), ".next/server/app/uk/support.html"),
  "utf8",
);
const rootClass = document.match(/<html[^>]*class="([^"]+)"/)?.[1];
if (!rootClass?.includes("variable"))
  throw new Error("Production font classes are missing");
const stylesheet = productionStylesheet().replace(
  /url\(([^)]+\.woff2)\)/g,
  (_match, file: string) => {
    const bytes = readFileSync(
      path.resolve(process.cwd(), ".next/static/chunks", file),
    );
    return `url(data:font/woff2;base64,${bytes.toString("base64")})`;
  },
);
const output = path.join(process.cwd(), "test-results", "illustrations");
mkdirSync(output, { recursive: true });
for (const [locale, labels] of Object.entries(titles)) {
  const cards = Object.keys(ILLUSTRATION_ROLES).map((role, index) => {
    const asset = resolveIllustrationRole(
      role as keyof typeof ILLUSTRATION_ROLES,
    );
    const bytes = readFileSync(path.join(process.cwd(), "public", asset.src));
    return h(
      "section",
      {
        key: role,
        "data-illustration-role": role,
        className:
          "grid min-w-0 justify-items-center gap-3 border-b border-border p-4 text-center",
      },
      h(Illustration, {
        asset: {
          ...asset,
          src: `data:image/webp;base64,${bytes.toString("base64")}`,
        },
      }),
      h("h2", { className: "text-h2 break-words" }, labels[index]),
      h("p", { className: "text-body-sm text-text-muted" }, role),
    );
  });
  const body = renderToStaticMarkup(
    h(
      "main",
      {
        className:
          "mx-auto grid max-w-5xl gap-6 p-4 sm:grid-cols-2 lg:grid-cols-3",
      },
      ...cards,
    ),
  );
  writeFileSync(
    path.join(output, `${locale}.html`),
    `<!doctype html><html lang="${locale}" class="${rootClass}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Illustration placement review</title><style>${stylesheet}</style></head><body>${body}</body></html>`,
  );
}
