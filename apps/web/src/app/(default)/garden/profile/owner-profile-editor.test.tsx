import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OwnerProfileWorkspace } from "@/server/owner-profile-repository";

const reactMocks = vi.hoisted(() => ({ handlePending: false }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: vi.fn(
      (_action: unknown, initialState: unknown) =>
        [initialState, vi.fn(), reactMocks.handlePending] as const,
    ),
  };
});

vi.mock("./actions", () => ({
  updatePublicHandleAction: vi.fn(),
  updatePublicProfileAction: vi.fn(),
}));

const WORKSPACE: OwnerProfileWorkspace = {
  editor: {
    handle: "demo_olena",
    avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
    displayName: "Олена",
    bio: "Балконний город і чесні нотатки.",
    languages: ["uk", "bg"],
    locationVisibility: "region",
    coarseRegionCode: "UA-30",
    relationshipVisibility: "counts",
  },
  handleRename: {
    currentHandle: "demo_olena",
    nextEligibleAt: "2026-07-18T00:00:00.000Z",
    canRename: true,
  },
  avatarOptions: [
    {
      mediaAssetId: "00000000-0000-4000-8000-000000000111",
      publicUrl: "https://cdn.example/avatar.webp",
      alt: "Олена",
    },
  ],
  relationshipCounts: { followers: 3, following: 2 },
};

describe("OwnerProfileEditor (OVE-503)", () => {
  beforeEach(() => {
    reactMocks.handlePending = false;
  });

  it("puts how others see you first, and the public address after it", async () => {
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );

    expect(html).toContain('data-owner-profile-editor="v4"');
    for (const name of [
      "avatarMediaAssetId",
      "displayName",
      "bio",
      "languages",
      "locationVisibility",
      "coarseRegionCode",
      "relationshipVisibility",
    ]) {
      expect(html, name).toContain(`name="${name}"`);
    }
    expect(html.match(/name="handle"/g)).toHaveLength(1);
    // Updating a bio never walks past the handle: the address is below.
    expect(html.indexOf('name="displayName"')).toBeLessThan(
      html.indexOf('name="handle"'),
    );
    expect(html.indexOf('id="public-profile-editor"')).toBeLessThan(
      html.indexOf('id="public-handle-editor"'),
    );
    // Two forms, each saving only itself.
    expect(html.match(/<form\b/g)).toHaveLength(2);
    // Nothing about signing in, signing out or blocking lives here any more.
    expect(html).not.toMatch(/Вийти|Google|Заблоковані/u);
    expect(html).not.toContain("<h1");
    expect(html).not.toMatch(
      /email|provider|session|quarantine|derivative_key|owner_user_id|latitude|longitude/i,
    );
  });

  it("says beside each field who sees it", async () => {
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );

    expect(html).toContain(
      "Усе в цій формі — на вашій публічній сторінці over.garden/@demo_olena.",
    );
    // The display name's description is wired to its input.
    expect(html).toMatch(
      /<input(?=[^>]*name="displayName")(?=[^>]*aria-describedby="field-displayName-description")[^>]*>/u,
    );
    expect(html).toContain("Видно всім: у профілі й над кожним вашим записом.");
    expect(html).toContain("Видно всім у профілі, з вашими переносами рядків.");
    expect(html).toContain(
      "Лише область, для міст — лише країна. Точне місце ми ніколи не показуємо.",
    );
  });

  it.each([
    ["uk", "Україна — місто Київ"],
    ["bg", "Украйна — град Киев"],
    ["ru", "Украина — город Киев"],
  ] as const)(
    "names every region in %s and never in English",
    async (locale, kyiv) => {
      const { OwnerProfileEditor } = await import("./owner-profile-editor");
      const html = renderToStaticMarkup(
        <OwnerProfileEditor
          workspace={WORKSPACE}
          locale={locale}
          status={null}
        />,
      );
      const select = html.slice(
        html.indexOf('name="coarseRegionCode"'),
        html.indexOf("</select>"),
      );

      expect(select).toContain(kyiv);
      expect(select).not.toMatch(/Ukraine|Bulgaria|Province|Oblast/u);
    },
  );

  it("previews the header read-only, a city narrowed to its country", async () => {
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );
    const preview = html.slice(html.indexOf('id="public-profile-preview"'));
    const previewBody = preview.slice(0, preview.indexOf("</details>"));

    // A disclosure, closed until asked for, and nothing in it acts.
    expect(html).toMatch(/<details[^>]*id="public-profile-preview"/u);
    expect(html).not.toMatch(
      /<details[^>]*id="public-profile-preview"[^>]*open/u,
    );
    expect(previewBody).not.toMatch(/<form|<button|<input/u);
    expect(previewBody).toMatch(/<h3[^>]*>Олена<\/h3>/u);
    expect(previewBody).toContain("Україна");
    expect(previewBody).not.toContain("Київ");
    expect(previewBody).toContain("3 підписники");
    expect(previewBody).toContain("2 підписки");
  });

  it("says what a new address changes before it is saved", async () => {
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );
    const handleSection = html.slice(html.indexOf('id="public-handle-editor"'));

    expect(handleSection).toContain("over.garden/@demo_olena");
    expect(handleSection).toContain("Що зміниться");
    expect(handleSection).toContain(
      "Посилання на ваші записи й об’єкти за старою адресою переспрямують на нову.",
    );
    expect(handleSection).toContain("Старий нік ніхто не зможе зайняти.");
    // The consequences come before the field that makes them happen.
    expect(handleSection.indexOf("Що зміниться")).toBeLessThan(
      handleSection.indexOf('name="handle"'),
    );
    // A handle is an address, not a sign-in name.
    expect(handleSection).toMatch(
      /<input(?=[^>]*name="handle")(?=[^>]*autoComplete="off")[^>]*>/u,
    );
  });

  it.each([
    ["uk", "Нік можна буде змінити після"],
    ["bg", "Ще можете да промените потребителското име след"],
    ["ru", "Ник можно будет изменить после"],
  ] as const)(
    "renders the authoritative cooldown and safe 320px wrapping in %s",
    async (locale, cooldownCopy) => {
      const { OwnerProfileEditor } = await import("./owner-profile-editor");
      const longHandle = "a".repeat(30);
      const html = renderToStaticMarkup(
        <OwnerProfileEditor
          workspace={{
            ...WORKSPACE,
            editor: { ...WORKSPACE.editor, handle: longHandle },
            handleRename: {
              currentHandle: longHandle,
              nextEligibleAt: "2026-08-17T10:00:00.000Z",
              canRename: false,
            },
          }}
          locale={locale}
          status={null}
        />,
      );

      expect(html).toContain(cooldownCopy);
      expect(html).toContain("2026");
      expect(html).toContain("wrap-anywhere");
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
    },
  );

  it.each(["uk", "bg", "ru"] as const)(
    "puts a display-name refusal on its own field, and nowhere else, in %s",
    async (locale) => {
      const { OwnerProfileEditor } = await import("./owner-profile-editor");
      const html = renderToStaticMarkup(
        <OwnerProfileEditor
          workspace={WORKSPACE}
          locale={locale}
          status="display_name_unavailable"
        />,
      );

      expect(html).toMatch(
        /<input(?=[^>]*name="displayName")(?=[^>]*aria-invalid="true")(?=[^>]*aria-describedby="field-displayName-description field-displayName-error")[^>]*>/u,
      );
      expect(html).toContain('id="field-displayName-error"');
      // The field's own error, not a second form-wide status line.
      expect(html).not.toContain('id="public-profile-status"');
    },
  );

  it("reports a saved profile as a polite status inside its own form", async () => {
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status="updated" />,
    );

    expect(html).toMatch(
      /<p[^>]*id="public-profile-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*>Профіль збережено\.<\/p>/u,
    );
    // Inside the profile form, before the address section starts.
    expect(html.indexOf('id="public-profile-status"')).toBeLessThan(
      html.indexOf('id="public-handle-editor"'),
    );
  });

  it("keeps the submitted handle visible but read-only while its action is pending", async () => {
    reactMocks.handlePending = true;
    const { OwnerProfileEditor } = await import("./owner-profile-editor");
    const html = renderToStaticMarkup(
      <OwnerProfileEditor workspace={WORKSPACE} locale="uk" status={null} />,
    );
    const handleInput = html.match(
      /<input(?=[^>]*name="handle")(?=[^>]*value="demo_olena")(?=[^>]*readonly="")(?=[^>]*aria-busy="true")[^>]*>/i,
    )?.[0];

    expect(handleInput).toBeDefined();
    // The attribute, not the string: `disabled:bg-surface-sunken` is a Tailwind
    // variant in the control's class list and says nothing about its state.
    expect(handleInput).not.toMatch(/\sdisabled(=|\s|\/?>)/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg/);
    // The profile form says it is saving, busy but still focusable (OVE-503).
    expect(html).toMatch(
      /<button(?=[^>]*type="submit")(?=[^>]*aria-busy="true")[^>]*>[\s\S]*?Зберігаємо…<\/button>/u,
    );
  });
});
