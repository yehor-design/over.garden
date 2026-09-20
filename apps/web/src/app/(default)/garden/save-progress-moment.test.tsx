import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SaveProgressMoment } from "./save-progress-moment";

describe("SaveProgressMoment", () => {
  it("renders first-save readback as a compact local win", () => {
    const html = renderToStaticMarkup(
      <SaveProgressMoment
        locale="uk"
        kind="first-entry"
        entryCount={1}
        objectName="Balcony tomato"
        primaryHref="#follow-up-composer"
        primaryLabel="Додати ще один запис"
        secondaryHref="/garden"
        secondaryLabel="Назад до журналу"
      />,
    );

    expect(html).toContain("Історію вашого саду розпочато");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("1 / 4 початкових нотаток");
    expect(html).toContain("#follow-up-composer");
    expect(html).toContain("Назад до журналу");
    expect(html).not.toMatch(/leaderboard|streak|likes|followers|modal/i);
  });

  it("renders follow-up readback without hiding the next action", () => {
    const html = renderToStaticMarkup(
      <SaveProgressMoment
        locale="ru"
        kind="follow-up"
        entryCount={2}
        objectName="Balcony tomato"
        primaryHref="#follow-up-composer"
        primaryLabel="Добавить ещё одну запись"
      />,
    );

    expect(html).toContain("Эта запись становится полезнее");
    expect(html).toContain("2 датированные заметки");
    // A real `progressbar` with its value, not a width class: a reader hears
    // the figure instead of seeing a rectangle (`OVE-457`).
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("Добавить ещё одну запись");
    expect(html).not.toMatch(/share|feed|public praise|leaderboard|streak/i);
  });
});
