"use client";

import { Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { PlantObjectKind } from "@/db/schema";
import {
  catalogPickerAvailabilityForResponse,
  classifyHomonymousCatalogRows,
  offersOwnNameOutcome,
  type CatalogPickerAvailability,
  type CatalogPickerRow,
} from "@/lib/garden/catalog-availability";
import {
  buildCatalogTypeaheadUrl,
  CATALOG_SEARCH_MISS_MIN_QUERY_LENGTH,
  CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH,
  CATALOG_TYPEAHEAD_MIN_QUERY_LENGTH,
  parseCatalogFullCatalogueResponse,
  parseCatalogTypeaheadResponse,
  parseCatalogTypeaheadState,
  type CatalogFullCatalogueRow,
  type CatalogPickerSelection,
} from "@/lib/garden/catalog-typeahead-contract";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import type { GardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import { formatGardenWorkspaceTemplate } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";

export type CatalogPickerCopy = GardenWorkspaceCopy["composer"]["catalogPicker"];

export interface CatalogSearchMiss {
  query: string;
  reason: "own_name" | "abandoned";
}

export interface CatalogPickerFetchResult {
  rows: FirstEntryCatalogSelection[];
  availability: CatalogPickerAvailability;
}

export interface CatalogPickerProps {
  locale: InterfaceLocale;
  objectKind: PlantObjectKind;
  copy: CatalogPickerCopy;
  label: string;
  placeholder: string;
  clearLabel: string;
  selection: CatalogPickerSelection | null;
  onSelectionChange: (selection: CatalogPickerSelection | null) => void;
  /** Fired once per query that ends in the own-name outcome or is abandoned. */
  onSearchMiss?: (miss: CatalogSearchMiss) => void;
  disabled?: boolean;
  /** Test seam: replaces the network read. */
  fetchRows?: (
    input: { query: string; objectKind: PlantObjectKind; locale: InterfaceLocale },
    signal: AbortSignal,
  ) => Promise<CatalogPickerFetchResult>;
  /** The secondary path over the whole checklist (ADR-0026 D7). */
  fetchFullCatalogue?: (
    input: { query: string; objectKind: PlantObjectKind; locale: InterfaceLocale },
    signal: AbortSignal,
  ) => Promise<CatalogFullCatalogueRow[]>;
  /** Turns a checklist row into a node. Without it the secondary path is off. */
  materializeFromCatalogue?: (
    colId: string,
  ) => Promise<FirstEntryCatalogSelection | null>;
}

export const CATALOG_PICKER_DEBOUNCE_MS = 180;
export const CATALOG_PICKER_REQUEST_TIMEOUT_MS = 5_000;

type PickerOption =
  | { id: string; kind: "row"; row: CatalogPickerRow }
  | { id: string; kind: "full"; row: CatalogFullCatalogueRow }
  | { id: string; kind: "own_name"; name: string };

/** Below this many canonical rows the full checklist is worth offering. */
export const CATALOG_FULL_CATALOGUE_THRESHOLD = 3;

/**
 * The one picker of the organism graph (ADR-0026 D7): a WAI-ARIA combobox
 * with an inline listbox, three one-tap outcomes — a species, a form with its
 * species implied, or "add as my own name" — and no trust label, caveat or
 * source anywhere. The list comes from the public typeahead route alone; when
 * that route does not answer, the own-name outcome stays, so a gardener can
 * always continue (D5).
 */
export function CatalogPicker({
  locale,
  objectKind,
  copy,
  label,
  placeholder,
  clearLabel,
  selection,
  onSelectionChange,
  onSearchMiss,
  disabled = false,
  fetchRows = fetchCatalogRows,
  fetchFullCatalogue = fetchFullCatalogueRows,
  materializeFromCatalogue,
}: CatalogPickerProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const outcomesId = `${inputId}-outcomes`;
  const statusId = `${inputId}-status`;
  const [query, setQuery] = useState(() => selectionText(selection));
  const [rows, setRows] = useState<FirstEntryCatalogSelection[]>([]);
  const [availability, setAvailability] =
    useState<CatalogPickerAvailability>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [syncedSelection, setSyncedSelection] = useState(selection);
  const [fullRows, setFullRows] = useState<CatalogFullCatalogueRow[] | null>(null);
  const [fullSearching, setFullSearching] = useState(false);
  const reportedMissRef = useRef<string | null>(null);
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // A selection made outside the picker (a preselected catalog card) shows
  // its name; clearing it outside empties the field. Adjusted during render,
  // the way React documents for state that follows a prop.
  if (selection !== syncedSelection) {
    setSyncedSelection(selection);
    setQuery(selectionText(selection));
    if (selection) {
      setRows([]);
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const trimmedQuery = query.trim().replace(/\s+/g, " ");
  const searchable =
    !selection && trimmedQuery.length >= CATALOG_TYPEAHEAD_MIN_QUERY_LENGTH;
  // Below the minimum, or once something is picked, whatever the last read
  // returned is not shown; the read itself only starts when searchable.
  const effectiveAvailability: CatalogPickerAvailability = searchable
    ? availability
    : "idle";
  const effectiveRows = useMemo(
    () => (searchable ? rows : []),
    [rows, searchable],
  );

  useEffect(() => {
    if (!searchable) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAvailability("searching");
      const requestTimeout = window.setTimeout(
        () => controller.abort(),
        CATALOG_PICKER_REQUEST_TIMEOUT_MS,
      );
      try {
        const result = await fetchRows(
          { query: trimmedQuery, objectKind, locale },
          controller.signal,
        );
        setRows(result.rows);
        setAvailability(result.availability);
        setFullRows(null);
        setOpen(true);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError" &&
          !controller.signal.aborted
        ) {
          return;
        }
        if (controller.signal.aborted && !timedOutSignal(controller.signal)) {
          return;
        }
        setRows([]);
        setAvailability("unavailable");
        setOpen(true);
      } finally {
        window.clearTimeout(requestTimeout);
      }
    }, CATALOG_PICKER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchRows, locale, objectKind, searchable, trimmedQuery]);

  const options = useMemo<PickerOption[]>(() => {
    if (selection) return [];
    const list: PickerOption[] = [];
    if (
      effectiveAvailability === "ready" ||
      effectiveAvailability === "empty"
    ) {
      for (const row of classifyHomonymousCatalogRows(effectiveRows)) {
        list.push({ id: `${listboxId}-${row.id}`, kind: "row", row });
      }
    }
    for (const row of fullRows ?? []) {
      list.push({ id: `${listboxId}-col-${row.colId}`, kind: "full", row });
    }
    if (
      offersOwnNameOutcome(trimmedQuery) &&
      effectiveAvailability !== "idle"
    ) {
      list.push({
        id: `${listboxId}-own-name`,
        kind: "own_name",
        name: trimmedQuery,
      });
    }
    return list;
  }, [
    effectiveAvailability,
    effectiveRows,
    fullRows,
    listboxId,
    selection,
    trimmedQuery,
  ]);

  // The active option is clamped to the list it belongs to, so a shorter
  // list never points past its end.
  const clampedActiveIndex = activeIndex < options.length ? activeIndex : -1;

  const reportMiss = useCallback(
    (reason: CatalogSearchMiss["reason"]) => {
      const text = trimmedQuery;
      if (text.length < CATALOG_SEARCH_MISS_MIN_QUERY_LENGTH) return;
      const key = `${reason}:${text}`;
      if (reportedMissRef.current === key) return;
      reportedMissRef.current = key;
      onSearchMiss?.({ query: text, reason });
    },
    [onSearchMiss, trimmedQuery],
  );

  function choose(option: PickerOption) {
    if (disabled) return;
    if (option.kind === "row") {
      // The list's own flag stays in the list; the selection is the row as
      // the route sent it.
      const { homonymous, ...row } = option.row;
      void homonymous;
      onSelectionChange({ kind: "item", row });
    } else if (option.kind === "full") {
      // Create-on-pick (ADR-0026 D7): the checklist row becomes a node, and
      // the node is what the gardener's object points at. A refusal leaves
      // the picker as it was, with the own-name outcome still there.
      void pickFromFullCatalogue(option.row);
      return;
    } else {
      reportMiss("own_name");
      onSelectionChange({ kind: "own_name", name: option.name });
    }
    setOpen(false);
    setActiveIndex(-1);
  }

  async function pickFromFullCatalogue(row: CatalogFullCatalogueRow) {
    if (!materializeFromCatalogue) return;
    setFullSearching(true);
    try {
      const selected = await materializeFromCatalogue(row.colId);
      if (!selected) return;
      onSelectionChange({ kind: "item", row: selected });
      setOpen(false);
      setActiveIndex(-1);
    } catch {
      // The own-name outcome is still there; nothing else changes.
    } finally {
      setFullSearching(false);
    }
  }

  async function searchFullCatalogue() {
    if (disabled || !materializeFromCatalogue) return;
    setFullSearching(true);
    const controller = new AbortController();
    try {
      const rows = await fetchFullCatalogue(
        { query: trimmedQuery, objectKind, locale },
        controller.signal,
      );
      setFullRows(rows);
      setOpen(true);
    } catch {
      setFullRows([]);
    } finally {
      setFullSearching(false);
    }
  }

  function clear() {
    if (disabled) return;
    reportedMissRef.current = null;
    setQuery("");
    setRows([]);
    setFullRows(null);
    setAvailability("idle");
    setOpen(false);
    setActiveIndex(-1);
    onSelectionChange(null);
  }

  function updateQuery(value: string) {
    if (disabled) return;
    setQuery(value.slice(0, CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH));
    setActiveIndex(-1);
    if (selection && value !== selectionText(selection)) {
      onSelectionChange(null);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((clampedActiveIndex + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex(
        clampedActiveIndex <= 0 ? options.length - 1 : clampedActiveIndex - 1,
      );
      return;
    }
    if (event.key === "Home" && open && options.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && open && options.length > 0) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === "Enter") {
      const option =
        clampedActiveIndex >= 0
          ? options[clampedActiveIndex]
          : open
            ? options[0]
            : undefined;
      if (option) {
        event.preventDefault();
        choose(option);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function onBlur() {
    // The list closes after a click on an option had its chance to land.
    window.setTimeout(() => {
      setOpen(false);
      setActiveIndex(-1);
      if (!selectionRef.current) reportMiss("abandoned");
    }, 120);
  }

  const listVisible = open && !selection && options.length > 0;
  const activeOption =
    clampedActiveIndex >= 0 ? options[clampedActiveIndex] : undefined;
  const statusText = selection
    ? selection.kind === "own_name"
      ? formatGardenWorkspaceTemplate(copy.ownNameSelected, {
          name: selection.name,
        })
      : formatGardenWorkspaceTemplate(copy.selected, {
          kind: copy.kinds[selection.row.kind],
          name: selection.row.displayName,
        })
    : effectiveAvailability === "searching"
      ? copy.searching
      : effectiveAvailability === "unavailable"
        ? copy.unavailable
        : effectiveAvailability === "empty"
          ? copy.empty
          : "";

  return (
    <div className="flex min-w-0 flex-col gap-2" data-catalog-picker="true">
      <label
        htmlFor={inputId}
        className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <span className="relative block min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listVisible}
          aria-controls={listboxId}
          aria-activedescendant={listVisible ? activeOption?.id : undefined}
          aria-describedby={`${outcomesId} ${statusId}`}
          autoComplete="off"
          spellCheck={false}
          maxLength={CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => {
            if (options.length > 0) setOpen(true);
          }}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:h-10"
        />
        {query || selection ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={clearLabel}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </span>
      <p id={outcomesId} className="sr-only">
        {copy.outcomes}
      </p>
      <p
        id={statusId}
        aria-live="polite"
        data-catalog-availability={
          selection ? "selected" : effectiveAvailability
        }
        className={
          effectiveAvailability === "unavailable" && !selection
            ? "text-xs text-destructive"
            : "text-xs text-muted-foreground"
        }
      >
        {statusText}
      </p>
      <ul
        id={listboxId}
        role="listbox"
        aria-label={copy.listLabel}
        hidden={!listVisible}
        className="grid gap-1"
      >
        {options.map((option, index) => {
          const active = index === clampedActiveIndex;
          const optionClass = `flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left text-sm ${
            active
              ? "border-ring bg-muted"
              : "border-border hover:bg-muted"
          }`;
          if (option.kind === "own_name") {
            return (
              <li
                key={option.id}
                id={option.id}
                role="option"
                aria-selected={active}
                data-catalog-option="own_name"
                className={optionClass}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="min-w-0 font-medium text-foreground">
                  {formatGardenWorkspaceTemplate(copy.ownName, {
                    query: option.name,
                  })}
                </span>
              </li>
            );
          }
          if (option.kind === "full") {
            const checklistRow = option.row;
            const subtitle = [
              checklistRow.rank,
              checklistRow.acceptedName
                ? formatGardenWorkspaceTemplate(copy.fullCatalogueSynonym, {
                    name: checklistRow.acceptedName,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={option.id}
                id={option.id}
                role="option"
                aria-selected={active}
                data-catalog-option="full_catalogue"
                data-catalog-col-id={checklistRow.colId}
                className={optionClass}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {checklistRow.displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {subtitle}
                  </span>
                </span>
              </li>
            );
          }
          const row = option.row;
          const kindLabel = copy.kinds[row.kind];
          const subtitle = [
            row.parentDisplayName
              ? formatGardenWorkspaceTemplate(copy.formOf, {
                  kind: kindLabel,
                  parent: row.parentDisplayName,
                })
              : kindLabel,
            row.matchedName
              ? formatGardenWorkspaceTemplate(copy.matched, {
                  name: row.matchedName,
                })
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={option.id}
              id={option.id}
              role="option"
              aria-selected={active}
              data-catalog-option={row.kind}
              data-catalog-item-id={row.id}
              className={optionClass}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {row.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {subtitle}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {materializeFromCatalogue &&
      searchable &&
      fullRows === null &&
      effectiveAvailability !== "searching" &&
      effectiveRows.length < CATALOG_FULL_CATALOGUE_THRESHOLD ? (
        <button
          type="button"
          data-catalog-full-catalogue="offer"
          disabled={disabled || fullSearching}
          onClick={() => void searchFullCatalogue()}
          className="justify-self-start text-left text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {copy.fullCatalogue}
          <span className="block text-xs no-underline">
            {copy.fullCatalogueHint}
          </span>
        </button>
      ) : null}
      {fullRows !== null && fullRows.length === 0 ? (
        <p
          data-catalog-full-catalogue="empty"
          className="text-xs text-muted-foreground"
        >
          {copy.fullCatalogueEmpty}
        </p>
      ) : null}
    </div>
  );
}

export async function fetchCatalogRows(
  input: { query: string; objectKind: PlantObjectKind; locale: InterfaceLocale },
  signal: AbortSignal,
): Promise<CatalogPickerFetchResult> {
  const response = await fetch(buildCatalogTypeaheadUrl(input), { signal });
  const body = response.ok ? ((await response.json()) as unknown) : null;
  const rows = parseCatalogTypeaheadResponse(body);
  return {
    rows,
    availability: catalogPickerAvailabilityForResponse({
      ok: response.ok,
      state: parseCatalogTypeaheadState(body),
      rowCount: rows.length,
    }),
  };
}

export async function fetchFullCatalogueRows(
  input: { query: string; objectKind: PlantObjectKind; locale: InterfaceLocale },
  signal: AbortSignal,
): Promise<CatalogFullCatalogueRow[]> {
  const response = await fetch(
    buildCatalogTypeaheadUrl({ ...input, scope: "full" }),
    { signal },
  );
  if (!response.ok) return [];
  return parseCatalogFullCatalogueResponse((await response.json()) as unknown);
}

function selectionText(selection: CatalogPickerSelection | null) {
  if (!selection) return "";
  return selection.kind === "own_name"
    ? selection.name
    : selection.row.displayName;
}

function timedOutSignal(signal: AbortSignal) {
  return signal.reason === undefined || signal.reason instanceof DOMException;
}
