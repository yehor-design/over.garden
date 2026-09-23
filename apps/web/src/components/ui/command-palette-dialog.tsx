"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { getInterfaceCopy } from "@/lib/interface-localization";
import type { PublicLocale } from "@/lib/public-localization";
import { cn } from "@/lib/utils";

/**
 * The palette's dialog: the search, the list and everything a reader meets
 * once it is open (DESIGN.md §5.2). It is its own module because nobody meets
 * any of it before a press (`OVE-468`) — `command-palette.tsx` keeps what has
 * to exist before one: the triggers, `⌘K` and `/`, and whether it is open.
 */
const DEBOUNCE_MS = 180;
const RECENT_STORAGE_KEY = "overgarden-palette-recent";
const MAX_RECENT = 5;
const GROUP_ORDER = [
  "journals",
  "organisms",
  "gardeners",
  "communities",
  "actions",
] as const;

type PaletteGroupKey = (typeof GROUP_ORDER)[number];

export interface CommandPaletteResult {
  key: PaletteGroupKey;
  id: string;
  label: string;
  detail: string | null;
  href: string;
  language: PublicLocale | null;
}

export interface PaletteGroup {
  key: PaletteGroupKey;
  results: CommandPaletteResult[];
}

export type PaletteSearch = (
  query: string,
  locale: PublicLocale,
) => Promise<PaletteGroup[]>;

export type PaletteActions =
  | readonly CommandPaletteResult[]
  | (() => readonly CommandPaletteResult[]);

type PaletteState = "idle" | "ready" | "empty" | "unavailable";

export function CommandPaletteDialog({
  open,
  onOpenChange,
  locale,
  actions,
  search = fetchPaletteGroups,
  initialQuery,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  locale: PublicLocale;
  actions: PaletteActions;
  search?: PaletteSearch;
  /** What the reader typed while this module was still on its way. */
  initialQuery: string;
}) {
  const copy = getInterfaceCopy(locale).palette;
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [settledQuery, setSettledQuery] = useState("");
  const [groups, setGroups] = useState<PaletteGroup[]>([]);
  const [state, setState] = useState<PaletteState>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const baseId = useId();

  const actionGroup = useMemo<PaletteGroup[]>(() => {
    const needle = settledQuery.trim().toLocaleLowerCase();
    if (needle.length === 0) return [];
    const available = typeof actions === "function" ? actions() : actions;
    const matched = available.filter((action) =>
      action.label.toLocaleLowerCase().includes(needle),
    );
    return matched.length > 0 ? [{ key: "actions", results: matched }] : [];
  }, [actions, settledQuery]);

  const visibleGroups = useMemo(() => {
    const merged = [...groups, ...actionGroup];
    return GROUP_ORDER.flatMap((key) => {
      const group = merged.find((candidate) => candidate.key === key);
      return group && group.results.length > 0 ? [group] : [];
    });
  }, [groups, actionGroup]);

  const flat = useMemo(
    () => visibleGroups.flatMap((group) => group.results),
    [visibleGroups],
  );

  // One debounce, and the settled query is what both the read and the live
  // region use — so the count a reader hears is the count they can see. The
  // "loading" state is derived rather than stored: a state variable that only
  // ever says "the query is ahead of the result" is a variable that can
  // disagree with the two it is derived from.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (trimmed.length < 2) {
        setSettledQuery("");
        setGroups([]);
        setState("idle");
        return;
      }
      void search(trimmed, locale)
        .then((next) => {
          if (cancelled) return;
          setGroups(next);
          setSettledQuery(trimmed);
          setActiveIndex(0);
          setState(
            next.some((group) => group.results.length > 0) ? "ready" : "empty",
          );
        })
        .catch(() => {
          if (cancelled) return;
          setGroups([]);
          setSettledQuery(trimmed);
          setState("unavailable");
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, locale, search]);

  const commit = useCallback(
    (result: CommandPaletteResult | undefined) => {
      if (!result) return;
      rememberRecent(settledQuery);
      onOpenChange(false);
      router.push(result.href);
    },
    [onOpenChange, router, settledQuery],
  );

  const onFieldKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (flat.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % flat.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + flat.length) % flat.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commit(flat[activeIndex]);
      }
    },
    [activeIndex, commit, flat],
  );

  const activeId = flat[activeIndex]
    ? `${baseId}-${flat[activeIndex].id}`
    : undefined;
  const showEmpty = state === "empty" || state === "unavailable";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-command-palette="true"
        closeLabel={copy.close}
        className="max-w-xl p-0"
      >
        <div className="flex flex-col gap-0">
          <div className="border-b border-border p-4 pr-12">
            <DialogTitle className="text-h4">{copy.title}</DialogTitle>
            <DialogDescription className="sr-only">
              {copy.description}
            </DialogDescription>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-border-control px-3">
              <Search
                aria-hidden="true"
                className="size-4 shrink-0 text-text-muted"
              />
              <input
                ref={inputRef}
                autoFocus
                type="text"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                aria-label={copy.title}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder={copy.placeholder}
                data-command-palette-input="true"
                className="min-h-11 w-full min-w-0 bg-transparent text-body text-text outline-none placeholder:text-text-muted"
              />
            </div>
          </div>

          <div className="max-h-80 min-h-24 overflow-y-auto p-2">
            {/* Read from storage each time the list is drawn, which is each
                time the palette opens: opening is when recents can have
                changed, and the popup is not kept mounted between opens. */}
            {query.trim().length < 2 ? (
              <RecentSearches
                label={copy.recent}
                clearLabel={copy.clearRecent}
                onPick={setQuery}
              />
            ) : null}

            {/* `EmptyState` carries `data-screen-state` itself; a wrapper
                repeating it gave the document two of the same marker, which
                is one more than any query can mean. */}
            {showEmpty ? (
              <div className="p-4">
                <EmptyState
                  variant="no-results"
                  title={
                    state === "unavailable" ? copy.unavailable : copy.emptyTitle
                  }
                  description={
                    state === "unavailable" ? undefined : copy.emptyDescription
                  }
                />
              </div>
            ) : null}

            <ul
              id={listId}
              role="listbox"
              aria-label={copy.title}
              className="flex flex-col gap-2"
            >
              {visibleGroups.map((group) => (
                <li key={group.key} role="presentation">
                  <p
                    id={`${baseId}-group-${group.key}`}
                    className="px-2 py-1 text-overline text-text-muted uppercase"
                  >
                    {copy.groups[group.key]}
                  </p>
                  <ul
                    role="group"
                    aria-labelledby={`${baseId}-group-${group.key}`}
                    className="flex flex-col"
                  >
                    {group.results.map((result) => {
                      const index = flat.indexOf(result);
                      const active = index === activeIndex;
                      return (
                        <li key={result.id} role="presentation">
                          <Link
                            id={`${baseId}-${result.id}`}
                            role="option"
                            aria-selected={active}
                            href={result.href}
                            tabIndex={-1}
                            data-command-palette-result={result.key}
                            data-active={active || undefined}
                            onClick={() => rememberRecent(settledQuery)}
                            className={cn(
                              "flex min-h-10 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-body-sm text-text",
                              active &&
                                "bg-action-subtle text-action-subtle-text",
                            )}
                          >
                            <span
                              className="min-w-0 break-words"
                              {...(result.language
                                ? { lang: result.language }
                                : {})}
                            >
                              {result.label}
                            </span>
                            {result.detail ? (
                              <span className="shrink-0 text-caption text-text-muted">
                                {result.detail}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          {/* The count a reader hears is the count they can see: written from
              the settled query, never from a keystroke. */}
          <p
            aria-live="polite"
            data-command-palette-live="true"
            className="sr-only"
          >
            {state === "ready" || state === "empty"
              ? `${copy.resultCount}: ${flat.length}`
              : ""}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-caption text-text-muted">
            <span>{copy.hintNavigate}</span>
            <span>{copy.hintOpen}</span>
            <span>{copy.hintClose}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecentSearches({
  label,
  clearLabel,
  onPick,
}: {
  label: string;
  clearLabel: string;
  onPick: (query: string) => void;
}) {
  const [queries, setQueries] = useState(readRecent);
  if (queries.length === 0) return null;

  return (
    <div data-command-palette-recent="true" className="flex flex-col gap-1 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-overline text-text-muted uppercase">{label}</p>
        <button
          type="button"
          onClick={() => {
            clearRecent();
            setQueries([]);
          }}
          className="rounded-sm text-caption text-text-muted underline-offset-4 outline-none hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {clearLabel}
        </button>
      </div>
      <ul className="flex flex-col">
        {queries.map((query) => (
          <li key={query}>
            <button
              type="button"
              onClick={() => onPick(query)}
              className="flex min-h-10 w-full items-center rounded-md px-2.5 py-2 text-left text-body-sm text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
            >
              {query}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function fetchPaletteGroups(
  query: string,
  locale: PublicLocale,
): Promise<PaletteGroup[]> {
  const params = new URLSearchParams({ q: query, locale });
  const response = await fetch(`/api/public/search/palette?${params}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`palette read answered ${response.status}`);
  const body = (await response.json()) as { groups?: PaletteGroup[] };
  return body.groups ?? [];
}

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    // A private window, blocked site data, or a thumbnail capture: recents are
    // a convenience and their absence is not a failure.
    return [];
  }
}

function rememberRecent(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  try {
    const next = [
      trimmed,
      ...readRecent().filter((entry) => entry !== trimmed),
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Same reason as above.
  }
}

function clearRecent() {
  try {
    window.localStorage.removeItem(RECENT_STORAGE_KEY);
  } catch {
    // Same reason as above.
  }
}
