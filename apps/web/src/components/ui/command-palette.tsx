"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
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
 * One palette over five kinds of thing (DESIGN.md §5.2, ADR-0031 D7).
 *
 * **It is an enhancement, never the only way in.** `/journals` and the
 * catalogue stay full, crawlable, no-JavaScript search pages and the rail keeps
 * plain links to both, because everything public is indexable (ADR-0022 D3) and
 * a palette that replaced them would take 114,669 pages out of the index.
 *
 * Four details that are the whole job:
 *
 * - **`/` must not steal a keystroke.** It opens the palette only when focus is
 *   outside a text field — and the composer is a `contenteditable`, not an
 *   `<input>`, so "text field" has to mean all three or the editor becomes
 *   untypable the moment a gardener writes a date.
 * - **The live region announces a settled query, not a keystroke.** A count
 *   that re-announces on every letter is worse than no count at all, so the
 *   region is written after the debounce, from the result the reader can see.
 * - **The list is a `listbox` driven by `aria-activedescendant`.** Focus stays
 *   in the field the whole time; the arrow keys move a pointer, not focus, which
 *   is what lets a screen reader read the active option while the reader keeps
 *   typing.
 * - **Arrow keys cross group boundaries.** A flat index over the groups in
 *   order, because a reader pressing Down at the end of "Journals" means the
 *   next result, not nothing.
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

interface PaletteGroup {
  key: PaletteGroupKey;
  results: CommandPaletteResult[];
}

type PaletteState = "idle" | "ready" | "empty" | "unavailable";

export interface CommandPaletteProps {
  locale: PublicLocale;
  /**
   * The palette's own actions: the rail's destinations, as commands.
   *
   * A function is read when a query settles, not when this renders. The shell
   * passes one: its actions depend on who is reading, which a static document
   * learns after it is served, and a provider this high must not render again
   * for that (ADR-0032 D10). Keep the function's identity stable.
   */
  actions:
    | readonly CommandPaletteResult[]
    | (() => readonly CommandPaletteResult[]);
  /**
   * `field` is the rail's shape — a search field that opens the palette, the
   * way X and Substack draw it. `icon` is the narrow bar's, where a field
   * would take the width the brand needs.
   */
  presentation?: "field" | "icon";
  /** Overridable so a test can drive the palette without a network. */
  search?: (query: string, locale: PublicLocale) => Promise<PaletteGroup[]>;
}

/**
 * One dialog, however many triggers. The shell draws a search field in the
 * rail and an icon in the narrow bar, and mounting the component twice gave
 * the document two dialogs, two comboboxes and two `⌘K` listeners — so `⌘K`
 * opened both. A screen reader saw two.
 */
const CommandPaletteContext = createContext<{ open: () => void } | null>(null);

export function CommandPaletteTrigger({
  presentation = "field",
  label,
  className,
}: {
  presentation?: "field" | "icon";
  /** The control's accessible name; the palette's own copy by default. */
  label: string;
  className?: string;
}) {
  const palette = useContext(CommandPaletteContext);

  return (
    <button
      type="button"
      data-command-palette-trigger={presentation}
      aria-label={label}
      onClick={() => palette?.open()}
      className={cn(
        "flex items-center transition-colors duration-instant ease-out outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        presentation === "field" &&
          "min-h-10 w-full gap-2 rounded-md border border-border-control bg-surface px-3 text-body-sm text-text-muted hover:bg-surface-hover",
        presentation === "icon" &&
          "size-12 shrink-0 justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      <Search aria-hidden="true" className="size-5 shrink-0" />
      {presentation === "field" ? (
        <>
          <span className="min-w-0 truncate text-left">{label}</span>
          <kbd
            aria-hidden="true"
            className="ml-auto hidden shrink-0 rounded-sm border border-border px-1.5 text-caption text-text-muted lg:inline-block"
          >
            ⌘K
          </kbd>
        </>
      ) : null}
    </button>
  );
}

/**
 * The convenience composition: the dialog with one trigger of its own. A shell
 * that needs more than one trigger renders `CommandPaletteProvider` around the
 * tree and `CommandPaletteTrigger` wherever the triggers belong.
 */
export function CommandPalette(props: CommandPaletteProps) {
  const copy = getInterfaceCopy(props.locale).palette;
  return (
    <CommandPaletteProvider {...props}>
      <CommandPaletteTrigger
        presentation={props.presentation}
        label={copy.open}
      />
    </CommandPaletteProvider>
  );
}

export function CommandPaletteProvider({
  children,
  locale,
  actions,
  search = fetchPaletteGroups,
}: CommandPaletteProps & { children?: React.ReactNode }) {
  const copy = getInterfaceCopy(locale).palette;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const [groups, setGroups] = useState<PaletteGroup[]>([]);
  const [state, setState] = useState<PaletteState>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
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

  const openPalette = useCallback(() => {
    // Whatever had focus, not whatever opened it. `base-ui` restores focus to
    // its own `DialogTrigger`, and this palette has three entry points — a
    // button, `⌘K`, and `/` — two of which are not a trigger at all, so it
    // remembers the element itself (criterion: `Esc` returns focus to whatever
    // had it).
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Recents are read here rather than in an effect: opening is an event, and
    // an effect that writes state on every `open` is a render nobody asked for.
    setRecent(readRecent());
    setOpen(true);
  }, []);

  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    if (next) return;
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    // After `base-ui` has finished its own focus handling for the close.
    requestAnimationFrame(() => target?.focus());
  }, []);

  // `/` is the one entry point that can take a keystroke away from somebody
  // who is writing, so it asks what has focus before it does anything.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPaletteShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlash =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target);
      if (!isPaletteShortcut && !isSlash) return;
      event.preventDefault();
      openPalette();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPalette]);

  const commit = useCallback(
    (result: CommandPaletteResult | undefined) => {
      if (!result) return;
      rememberRecent(settledQuery);
      changeOpen(false);
      router.push(result.href);
    },
    [changeOpen, router, settledQuery],
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

  const paletteContext = useMemo(() => ({ open: openPalette }), [openPalette]);

  return (
    <CommandPaletteContext.Provider value={paletteContext}>
      <Dialog open={open} onOpenChange={changeOpen}>
        {children}

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
              {query.trim().length < 2 && recent.length > 0 ? (
                <RecentSearches
                  label={copy.recent}
                  clearLabel={copy.clearRecent}
                  queries={recent}
                  onPick={setQuery}
                  onClear={() => {
                    clearRecent();
                    setRecent([]);
                  }}
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
                      state === "unavailable"
                        ? copy.unavailable
                        : copy.emptyTitle
                    }
                    description={
                      state === "unavailable"
                        ? undefined
                        : copy.emptyDescription
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
    </CommandPaletteContext.Provider>
  );
}

function RecentSearches({
  label,
  clearLabel,
  queries,
  onPick,
  onClear,
}: {
  label: string;
  clearLabel: string;
  queries: readonly string[];
  onPick: (query: string) => void;
  onClear: () => void;
}) {
  return (
    <div data-command-palette-recent="true" className="flex flex-col gap-1 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-overline text-text-muted uppercase">{label}</p>
        <button
          type="button"
          onClick={onClear}
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

/**
 * "A text field" has to mean an input, a textarea **and** a `contenteditable`.
 * The composer is the third one (ADR-0028), so a rule that checked only the
 * first two would make the editor swallow every `/` a gardener typed — which is
 * how a date, a fraction and a `/` command all stop working at once.
 */
export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest('[contenteditable="true"]') !== null;
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
