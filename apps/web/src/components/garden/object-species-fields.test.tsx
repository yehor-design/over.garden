// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { getObjectSetupCopy } from "@/lib/object-setup-copy";

import {
  ObjectCultivarField,
  type CultivarAnswer,
  type SpeciesAnswer,
} from "./object-species-fields";

const copy = getObjectSetupCopy("uk");
const TOMATO: Extract<SpeciesAnswer, { kind: "catalog" }> = {
  kind: "catalog",
  row: {
    id: "00000000-0000-4000-8000-000000000101",
    displayName: "Помідор",
    kind: "species",
  },
};
const FORMS = [
  { id: "00000000-0000-4000-8000-000000000201", name: "Черокі" },
  { id: "00000000-0000-4000-8000-000000000202", name: "Бичаче серце" },
];

function Cultivar({
  species = TOMATO,
  onAnswer = vi.fn(),
}: {
  species?: Exclude<SpeciesAnswer, { kind: "unknown" }>;
  onAnswer?: (answer: CultivarAnswer) => void;
}) {
  const [answer, setAnswer] = useState<CultivarAnswer>({ kind: "unknown" });
  return (
    <ObjectCultivarField
      objectKind="plant"
      species={species}
      copy={copy.cultivar}
      ownLabel={copy.cultivar.ownLabel.plant}
      answer={answer}
      onAnswer={(next) => {
        onAnswer(next);
        setAnswer(next);
      }}
      fetchForms={async () => FORMS}
    />
  );
}

function optionKeys(listbox: HTMLElement) {
  return within(listbox)
    .getAllByRole("option")
    .map((option) => option.getAttribute("data-choice-option"));
}

describe("ObjectCultivarField", () => {
  it("opens on «Не знаю», with the species' list and no hint", async () => {
    render(<Cultivar />);
    const listbox = screen.getByRole("listbox", { name: "Сорт" });
    await waitFor(() =>
      expect(optionKeys(listbox)).toEqual([
        "unknown",
        `entry:${FORMS[0]!.id}`,
        `entry:${FORMS[1]!.id}`,
      ]),
    );
    expect(
      within(listbox).getByRole("option", { selected: true }).textContent,
    ).toContain("Не знаю");
    expect(
      screen
        .getByRole("combobox", { name: "Пошук сорту" })
        .getAttribute("placeholder"),
    ).toBeNull();
  });

  it("filters by what is typed, forgiving spelling, and offers to add a name that matches nothing", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<Cultivar onAnswer={onAnswer} />);
    const listbox = screen.getByRole("listbox", { name: "Сорт" });
    await waitFor(() => expect(optionKeys(listbox)).toHaveLength(3));
    const search = screen.getByRole("combobox", { name: "Пошук сорту" });

    // A Russian spelling finds the Ukrainian entry, and it is the same name.
    await user.type(search, "Чероки");
    expect(optionKeys(listbox)).toEqual(["unknown", `entry:${FORMS[0]!.id}`]);

    await user.clear(search);
    await user.type(search, "Брама");
    expect(optionKeys(listbox)).toEqual(["unknown", "add"]);
    await user.click(
      within(listbox).getByRole("option", { name: /Додати «Брама»/u }),
    );
    expect(onAnswer).toHaveBeenLastCalledWith({ kind: "new", name: "Брама" });
  });

  it("takes only a highlighted row on Enter", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<Cultivar onAnswer={onAnswer} />);
    const listbox = screen.getByRole("listbox", { name: "Сорт" });
    await waitFor(() => expect(optionKeys(listbox)).toHaveLength(3));
    const search = screen.getByRole("combobox", { name: "Пошук сорту" });
    await user.type(search, "серце{Enter}");
    expect(onAnswer).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onAnswer).toHaveBeenLastCalledWith({
      kind: "entry",
      id: FORMS[1]!.id,
      name: "Бичаче серце",
    });
  });

  it("after an own species offers «Не знаю» or the gardener's own text, with no list", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(
      <Cultivar
        species={{ kind: "own", text: "Помідор бабусин" }}
        onAnswer={onAnswer}
      />,
    );
    const group = screen.getByRole("group", { name: "Сорт" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Ваш варіант сорту" }));
    const field = screen.getByRole("textbox", { name: "Ваш варіант сорту" });
    expect(document.activeElement).toBe(field);
    await user.type(field, "Рожевий");
    expect(onAnswer).toHaveBeenLastCalledWith({ kind: "own", text: "Рожевий" });
  });
});
