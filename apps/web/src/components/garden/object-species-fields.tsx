"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChoiceRadioList } from "@/components/garden/choice-radio-list";
import {
  ChoiceSearchList,
  type ChoiceSearchOption,
} from "@/components/garden/choice-search-list";
import { LeafIcon } from "@/components/icons/Leaf";
import { NotePencilIcon } from "@/components/icons/NotePencil";
import { PawPrintIcon } from "@/components/icons/PawPrint";
import { PlantIcon } from "@/components/icons/Plant";
import { PlusIcon } from "@/components/icons/Plus";
import { QuestionIcon } from "@/components/icons/Question";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PlantObjectKind } from "@/db/schema";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import { cultivarMatchRank, cultivarNameKey } from "@/lib/catalog/cultivar-key";
import {
  CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH,
  CATALOG_TYPEAHEAD_MIN_QUERY_LENGTH,
  parseCatalogTypeaheadResponse,
  parseCatalogTypeaheadState,
  STANDARD_SPECIES_TYPEAHEAD_PUBLIC_PATH,
} from "@/lib/garden/catalog-typeahead-contract";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { ObjectSetupCopy } from "@/lib/object-setup-copy";

export type SpeciesAnswer =
  | { kind: "unknown" }
  | { kind: "catalog"; row: FirstEntryCatalogSelection }
  | { kind: "own"; text: string };

export type CultivarAnswer =
  | { kind: "unknown" }
  | { kind: "entry"; id: string; name: string }
  | { kind: "new"; name: string }
  | { kind: "own"; text: string };

export const SPECIES_SEARCH_DEBOUNCE_MS = 180;
const SPECIES_SEARCH_TIMEOUT_MS = 5_000;
const UNKNOWN = "unknown";
const OWN = "own";
const ADD = "add";

type SearchState = "idle" | "searching" | "ready" | "empty" | "unavailable";

/**
 * «Вид» (OVE-524, DESIGN.md §5.28): «Не знаю» first and chosen until the
 * gardener chooses otherwise; species of the standard base found by typing
 * everyday words, with the Latin name under each; «Ввести свій варіант» last,
 * which turns into a text field. No list without typing. A search that fails
 * says so and leaves the other two answers working.
 */
export function ObjectSpeciesField({
  locale,
  objectKind,
  copy,
  answer,
  onAnswer,
  error,
  onQueryChange,
}: {
  locale: InterfaceLocale;
  objectKind: PlantObjectKind;
  copy: ObjectSetupCopy["species"];
  answer: SpeciesAnswer;
  onAnswer: (answer: SpeciesAnswer) => void;
  error?: string;
  /** Every change of the search text, for the pick measurement (OVE-398). */
  onQueryChange?: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<FirstEntryCatalogSelection[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  // Choosing «Ввести свій варіант» puts the caret in the field it opens.
  const focusOwn = useRef(false);
  const trimmed = query.trim().replace(/\s+/gu, " ");
  const searchable = trimmed.length >= CATALOG_TYPEAHEAD_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("searching");
      const deadline = window.setTimeout(
        () => controller.abort(),
        SPECIES_SEARCH_TIMEOUT_MS,
      );
      try {
        const params = new URLSearchParams({
          q: trimmed.slice(0, CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH),
          kind: objectKind,
          locale,
        });
        const response = await fetch(
          `${STANDARD_SPECIES_TYPEAHEAD_PUBLIC_PATH}?${params.toString()}`,
          { signal: controller.signal },
        );
        const body = response.ok ? ((await response.json()) as unknown) : null;
        const found = parseCatalogTypeaheadResponse(body).filter(
          (row) => row.kind === "species",
        );
        const answerState = response.ok ? parseCatalogTypeaheadState(body) : "unavailable";
        setRows(found);
        setState(
          answerState === "unavailable"
            ? "unavailable"
            : found.length > 0
              ? "ready"
              : "empty",
        );
      } catch {
        if (controller.signal.aborted && !deadlineHit(controller.signal)) return;
        setRows([]);
        setState("unavailable");
      } finally {
        window.clearTimeout(deadline);
      }
    }, SPECIES_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort("superseded");
    };
  }, [locale, objectKind, searchable, trimmed]);

  const shownRows = useMemo(() => (searchable ? rows : []), [rows, searchable]);
  const shownState: SearchState = searchable ? state : "idle";

  const options = useMemo<ChoiceSearchOption[]>(() => {
    const glyph =
      objectKind === "animal" ? (
        <PawPrintIcon size={16} />
      ) : (
        <PlantIcon size={16} />
      );
    const list: ChoiceSearchOption[] = [
      { key: UNKNOWN, title: copy.unknown, glyph: <QuestionIcon size={16} /> },
    ];
    const chosen = answer.kind === "catalog" ? answer.row : null;
    const rowsWithChosen =
      chosen && !shownRows.some((row) => row.id === chosen.id)
        ? [chosen, ...shownRows]
        : shownRows;
    for (const row of rowsWithChosen) {
      list.push({
        key: `species:${row.id}`,
        title: row.displayName,
        subtitle:
          row.scientificName && row.scientificName !== row.displayName
            ? row.scientificName
            : (row.matchedName ?? null),
        glyph,
        data: { "data-species-id": row.id },
      });
    }
    list.push({ key: OWN, title: copy.own, glyph: <NotePencilIcon size={16} /> });
    return list;
  }, [answer, copy.own, copy.unknown, objectKind, shownRows]);

  const selectedKey =
    answer.kind === "catalog"
      ? `species:${answer.row.id}`
      : answer.kind === "own"
        ? OWN
        : UNKNOWN;

  function choose(key: string) {
    if (key === UNKNOWN) {
      onAnswer({ kind: "unknown" });
      return;
    }
    if (key === OWN) {
      onAnswer({
        kind: "own",
        text: answer.kind === "own" ? answer.text : trimmed,
      });
      focusOwn.current = true;
      return;
    }
    const id = key.slice("species:".length);
    const row =
      shownRows.find((candidate) => candidate.id === id) ??
      (answer.kind === "catalog" && answer.row.id === id ? answer.row : null);
    if (row) onAnswer({ kind: "catalog", row });
  }

  const status =
    shownState === "searching"
      ? copy.searching
      : shownState === "unavailable"
        ? copy.unavailable
        : shownState === "empty"
          ? copy.empty
          : shownState === "ready"
            ? copy.resultCount(shownRows.length)
            : "";

  return (
    <div className="grid min-w-0 gap-4">
      <ChoiceSearchList
        inputLabel={copy.searchLabel}
        placeholder={copy.placeholder[objectKind]}
        query={query}
        onQueryChange={(value) => {
          onQueryChange?.(value);
          setQuery(value);
        }}
        clearLabel={copy.clear}
        options={options}
        selectedKey={selectedKey}
        onChoose={choose}
        listLabel={copy.listLabel}
        status={status}
        statusTone={shownState === "unavailable" ? "danger" : "muted"}
        statusState={shownState}
        maxLength={CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH}
        inputData={{ "data-object-setup-species-search": "true" }}
      />
      {answer.kind === "own" ? (
        <Field label={copy.ownLabel} error={error}>
          <Input
            ref={(node) => {
              if (node && focusOwn.current) {
                focusOwn.current = false;
                node.focus();
              }
            }}
            name="speciesText"
            value={answer.text}
            autoComplete="off"
            maxLength={200}
            enterKeyHint="next"
            data-object-setup-species-own="true"
            onChange={(event) =>
              onAnswer({ kind: "own", text: event.currentTarget.value })
            }
          />
        </Field>
      ) : null}
    </div>
  );
}

type ListState = "loading" | "ready" | "unavailable";

/**
 * «Сорт» / «Порода» (OVE-524, DESIGN.md §5.28), asked only after a species.
 *
 * - After a species of the base: «Не знаю» first and chosen; then the
 *   cultivars or breeds the project's objects of that species use and the
 *   ones gardeners added, most used first; typing filters them, forgiving
 *   case, a typo and Ukrainian or Russian spelling; a name that matches no
 *   entry is offered last as «Додати «…»», and becomes a shared entry.
 * - After an own species: «Не знаю», or the gardener's own text — private,
 *   with no list, because there is no catalogue species to list.
 *
 * No hint text anywhere: «Не знаю» is the default answer.
 */
export function ObjectCultivarField({
  objectKind,
  species,
  copy,
  ownLabel,
  answer,
  onAnswer,
  error,
  fetchForms = fetchSpeciesForms,
}: {
  objectKind: PlantObjectKind;
  species: Exclude<SpeciesAnswer, { kind: "unknown" }>;
  copy: ObjectSetupCopy["cultivar"];
  ownLabel: string;
  answer: CultivarAnswer;
  onAnswer: (answer: CultivarAnswer) => void;
  error?: string;
  /** Test seam: replaces the network read. */
  fetchForms?: (input: {
    speciesId: string;
    objectKind: PlantObjectKind;
  }) => Promise<Array<{ id: string; name: string }>>;
}) {
  const speciesId = species.kind === "catalog" ? species.row.id : null;
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<{
    speciesId: string;
    forms: Array<{ id: string; name: string }>;
    state: ListState;
  } | null>(null);
  // Choosing the own-variant row puts the caret in the field it opens.
  const focusOwn = useRef(false);

  useEffect(() => {
    if (!speciesId) return;
    let cancelled = false;
    fetchForms({ speciesId, objectKind })
      .then((forms) => {
        if (!cancelled) setLoaded({ speciesId, forms, state: "ready" });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ speciesId, forms: [], state: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchForms, objectKind, speciesId]);

  const listState: ListState =
    !speciesId || loaded?.speciesId !== speciesId ? "loading" : loaded.state;
  const forms = useMemo(
    () => (loaded?.speciesId === speciesId ? loaded.forms : []),
    [loaded, speciesId],
  );
  const trimmed = query.trim().replace(/\s+/gu, " ");

  const options = useMemo<ChoiceSearchOption[]>(() => {
    const glyph = <LeafIcon size={16} />;
    const list: ChoiceSearchOption[] = [
      { key: UNKNOWN, title: copy.unknown, glyph: <QuestionIcon size={16} /> },
    ];
    if (!speciesId) {
      list.push({
        key: OWN,
        title: ownLabel,
        glyph: <NotePencilIcon size={16} />,
      });
      return list;
    }
    const ranked = forms
      .map((form, order) => ({ form, order, rank: cultivarMatchRank(trimmed, form.name) }))
      .filter((item) => item.rank !== null)
      .sort((left, right) => left.rank! - right.rank! || left.order - right.order)
      .map((item) => item.form);
    const chosen = answer.kind === "entry" ? answer : null;
    const shown =
      chosen && !ranked.some((form) => form.id === chosen.id)
        ? [{ id: chosen.id, name: chosen.name }, ...ranked]
        : ranked;
    for (const form of shown) {
      list.push({
        key: `entry:${form.id}`,
        title: form.name,
        glyph,
        data: { "data-cultivar-id": form.id },
      });
    }
    const typedKey = cultivarNameKey(trimmed);
    const exact = forms.some((form) => cultivarNameKey(form.name) === typedKey);
    if (answer.kind === "new" && cultivarNameKey(answer.name) !== typedKey) {
      list.push({
        key: `${ADD}:chosen`,
        title: copy.add(answer.name),
        glyph: <PlusIcon size={16} />,
      });
    }
    if (typedKey && !exact) {
      list.push({
        key: ADD,
        title: copy.add(trimmed),
        glyph: <PlusIcon size={16} />,
        data: { "data-cultivar-add": "true" },
      });
    }
    return list;
  }, [answer, copy, forms, ownLabel, speciesId, trimmed]);

  const selectedKey =
    answer.kind === "entry"
      ? `entry:${answer.id}`
      : answer.kind === "own"
        ? OWN
        : answer.kind === "new"
          ? cultivarNameKey(answer.name) === cultivarNameKey(trimmed)
            ? ADD
            : `${ADD}:chosen`
          : UNKNOWN;

  function choose(key: string) {
    if (key === UNKNOWN) {
      onAnswer({ kind: "unknown" });
      return;
    }
    if (key === OWN) {
      onAnswer({ kind: "own", text: answer.kind === "own" ? answer.text : "" });
      focusOwn.current = true;
      return;
    }
    if (key === ADD && trimmed) {
      onAnswer({ kind: "new", name: trimmed });
      return;
    }
    if (key === `${ADD}:chosen`) return;
    const id = key.slice("entry:".length);
    const form =
      forms.find((candidate) => candidate.id === id) ??
      (answer.kind === "entry" && answer.id === id
        ? { id, name: answer.name }
        : null);
    if (form) onAnswer({ kind: "entry", id: form.id, name: form.name });
  }

  if (!speciesId) {
    // After an own species: «Не знаю» or the gardener's own text.
    return (
      <div className="grid min-w-0 gap-4">
        <ChoiceRadioList
          name="cultivar-own"
          legend={copy.listLabel[objectKind]}
          value={selectedKey}
          onChange={choose}
          options={options.map((option) => ({
            value: option.key,
            title: option.title,
            media: option.glyph,
          }))}
        />
        {answer.kind === "own" ? (
          <Field label={ownLabel} error={error}>
            <Input
              ref={(node) => {
                if (node && focusOwn.current) {
                  focusOwn.current = false;
                  node.focus();
                }
              }}
              name="cultivarText"
              value={answer.text}
              autoComplete="off"
              maxLength={200}
              enterKeyHint="done"
              data-object-setup-cultivar-own="true"
              onChange={(event) =>
                onAnswer({ kind: "own", text: event.currentTarget.value })
              }
            />
          </Field>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2">
      <ChoiceSearchList
        inputLabel={copy.searchLabel[objectKind]}
        query={query}
        onQueryChange={setQuery}
        clearLabel={copy.clear}
        options={options}
        selectedKey={selectedKey}
        onChoose={choose}
        listLabel={copy.listLabel[objectKind]}
        status={
          listState === "loading"
            ? copy.loading
            : listState === "unavailable"
              ? copy.unavailable
              : undefined
        }
        statusTone={listState === "unavailable" ? "danger" : "muted"}
        statusState={listState}
        inputData={{ "data-object-setup-cultivar-search": "true" }}
      />
      {error ? <p className="text-caption text-danger-text">{error}</p> : null}
    </div>
  );
}

export async function fetchSpeciesForms(input: {
  speciesId: string;
  objectKind: PlantObjectKind;
}): Promise<Array<{ id: string; name: string }>> {
  const params = new URLSearchParams({
    species: input.speciesId,
    kind: input.objectKind,
  });
  const response = await fetch(`/api/garden/catalog/forms?${params.toString()}`, {
    headers: { ...ownerScopeHeaders() },
  });
  if (!response.ok) throw new Error(`forms ${response.status}`);
  const body = (await response.json()) as { forms?: unknown };
  if (!Array.isArray(body.forms)) return [];
  return body.forms.flatMap((form) => {
    if (!form || typeof form !== "object") return [];
    const { id, name } = form as { id?: unknown; name?: unknown };
    return typeof id === "string" && typeof name === "string" && name.trim()
      ? [{ id, name }]
      : [];
  });
}

function deadlineHit(signal: AbortSignal) {
  return signal.reason === undefined || signal.reason instanceof DOMException;
}
