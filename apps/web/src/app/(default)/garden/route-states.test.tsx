import { readdir } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderServerHtml } from "@test/render-server-html";
import { SiteShellLocaleProvider } from "@/components/site-shell/site-shell-locale-context";
import { WorkspaceLoadingWatchdogView } from "@/components/garden/workspace-state-controls";
import {
  WORKSPACE_LOADING_NOTICE_MS,
  WORKSPACE_LOADING_RELOAD_MS,
  WORKSPACE_LOADING_SCHEDULE,
  workspaceLoadingStage,
} from "@/lib/garden/workspace-loading-thresholds";
import type { InterfaceLocale } from "@/lib/interface-localization";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

/**
 * Every workspace surface, with the `loading.tsx` that stands in for it and the
 * shell both of them render.
 *
 * ADR-0023: a skeleton belongs to its own page. Before this, one
 * `garden/loading.tsx` stood in for every child route, so opening the editions
 * page showed the garden home's skeleton and a reader watched the wrong page
 * fail to arrive. The parity asserted here is what stops that recurring: the
 * fallback and the page agree on surface and heading, so arrival is a
 * substitution rather than a jump.
 */
const SURFACES = [
  {
    surface: "garden-home",
    loading: () => import("./(home)/loading"),
    heading: "Простір саду",
  },
  {
    surface: "stable-registry",
    loading: () => import("./catalog/registry/(center)/loading"),
    heading: "Stable Registry — Foundation",
  },
  {
    surface: "stable-registry-extensions",
    loading: () => import("./catalog/registry/extensions/loading"),
    heading: "Stable Registry — пакети розширень",
  },
  {
    surface: "stable-registry-editions",
    loading: () => import("./catalog/registry/editions/loading"),
    heading: "Stable Registry — видання",
  },
  {
    surface: "object",
    loading: () => import("./objects/[objectId]/loading"),
    heading: "Живий об",
  },
  {
    surface: "entry-edit",
    loading: () => import("./entries/[entryId]/edit/loading"),
    heading: "Редагування запису",
  },
  {
    surface: "profile",
    loading: () => import("./profile/loading"),
    heading: "Мій публічний профіль",
  },
  {
    surface: "lineage-claims",
    loading: () => import("./lineage/claims/loading"),
    heading: "Запити щодо походження",
  },
  {
    surface: "lineage-questions",
    loading: () => import("./lineage/questions/loading"),
    heading: "Оновлення походження",
  },
  {
    surface: "lineage-invitation-claim",
    loading: () => import("./lineage/invitations/claim/loading"),
    heading: "Запрошення щодо походження",
  },
  {
    surface: "erasure-requests",
    loading: () => import("./privacy/erasure-requests/loading"),
    heading: "Запити на видалення",
  },
] as const;

describe("/garden route states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
  });

  it.each(SURFACES)(
    "$surface renders its own shell while its data streams",
    async ({ surface, loading, heading }) => {
      const { default: Loading } = await loading();
      const html = await renderServerHtml(await Loading());

      expect(html).toContain(`data-workspace-surface="${surface}"`);
      expect(html).toContain('data-workspace-state="loading"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain(heading);
      expect(html).toContain('data-workspace-section="loading"');
    },
  );

  it("no longer keeps a garden-wide skeleton that stands in for every child", async () => {
    // `garden/loading.tsx` wrapped every child route, so a reader opening the
    // editions page watched the garden home's skeleton fail to arrive. The home
    // skeleton now lives in its own route group and covers only the home page.
    const files = await readdir(new URL(".", import.meta.url));
    expect(files).not.toContain("loading.tsx");
  });

  it.each(["uk", "bg", "ru"] as const)(
    "localizes the %s home skeleton without a locale segment",
    async (locale: InterfaceLocale) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      const { default: Loading } = await import("./(home)/loading");
      const html = await renderServerHtml(await Loading());

      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain('data-workspace-surface="garden-home"');
    },
  );

  it("scopes each registry skeleton to its own page", async () => {
    // A `loading.tsx` covers its segment and every child of it, so the Release
    // Center's fallback was the first thing a reader saw on the extensions and
    // editions pages — the wrong heading, which is the defect ADR-0023 exists
    // to remove. The `(center)` group scopes it to the page it belongs to.
    const registry = await readdir(
      new URL("./catalog/registry/", import.meta.url),
    );
    expect(registry).not.toContain("loading.tsx");
    expect(registry).toContain("(center)");
  });
});

describe("workspace loading watchdog", () => {
  it("says nothing before ten seconds, speaks at ten, offers a reload at thirty", () => {
    vi.useFakeTimers();
    try {
      let stage = workspaceLoadingStage(0);
      const timers = WORKSPACE_LOADING_SCHEDULE.map((step) =>
        setTimeout(() => {
          stage = step.stage;
        }, step.delayMs),
      );

      vi.advanceTimersByTime(WORKSPACE_LOADING_NOTICE_MS - 1);
      expect(stage).toBe("none");

      vi.advanceTimersByTime(1);
      expect(stage).toBe("notice");

      vi.advanceTimersByTime(
        WORKSPACE_LOADING_RELOAD_MS - WORKSPACE_LOADING_NOTICE_MS - 1,
      );
      expect(stage).toBe("notice");

      vi.advanceTimersByTime(1);
      expect(stage).toBe("reload");

      for (const timer of timers) clearTimeout(timer);
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules only what it renders, and never a reload of its own", () => {
    expect(WORKSPACE_LOADING_SCHEDULE.map((step) => step.stage)).toEqual([
      "notice",
      "reload",
    ]);
    expect(workspaceLoadingStage(WORKSPACE_LOADING_NOTICE_MS)).toBe("notice");
    expect(workspaceLoadingStage(WORKSPACE_LOADING_RELOAD_MS)).toBe("reload");
  });

  it("renders one control per stage and no apology on first paint", () => {
    const markup = (stage: "none" | "notice" | "reload") =>
      renderToStaticMarkup(
        <WorkspaceLoadingWatchdogView
          stage={stage}
          stillLoadingLabel="Розділ усе ще завантажується."
          reloadLabel="Перезавантажити сторінку"
        />,
      );

    expect(markup("none")).not.toContain("усе ще завантажується");
    expect(markup("none")).not.toContain("<button");
    expect(markup("notice")).toContain("усе ще завантажується");
    expect(markup("notice")).not.toContain("<button");
    expect(markup("reload")).toContain("Перезавантажити сторінку");
    expect(markup("reload")).toContain("<button");
  });
});

describe("/garden error boundary", () => {
  it.each([
    {
      locale: "uk",
      error: "Дані простору тимчасово недоступні",
      retry: "Спробувати ще раз",
    },
    {
      locale: "bg",
      error: "Данните за работното пространство временно не са достъпни",
      retry: "Опитайте отново",
    },
    {
      locale: "ru",
      error: "Данные рабочего пространства временно недоступны",
      retry: "Попробовать снова",
    },
  ] as const)(
    "offers a localized $locale recovery action and the digest, never details",
    async ({ locale, error, retry }) => {
      const retrySpy = vi.fn();
      const { default: GardenError } = await import("./error");
      const html = renderToStaticMarkup(
        <SiteShellLocaleProvider locale={locale}>
          <GardenError
            error={Object.assign(new Error("private database detail"), {
              digest: "3141592",
            })}
            unstable_retry={retrySpy}
          />
        </SiteShellLocaleProvider>,
      );

      expect(html).toContain('data-garden-workspace="unexpected-error"');
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(error);
      expect(html).toContain(retry);
      expect(html).toContain("3141592");
      expect(html).not.toContain("private database detail");
    },
  );
});
