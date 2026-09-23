"use client";

import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getInterfaceCopy } from "@/lib/interface-localization";
import type { PublicLocale } from "@/lib/public-localization";
import { useOnDemandComponent } from "@/lib/use-on-demand-component";
import { cn } from "@/lib/utils";

import type {
  CommandPaletteDialog,
  PaletteActions,
  PaletteSearch,
} from "./command-palette-dialog";

export type { CommandPaletteResult } from "./command-palette-dialog";

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
 *
 * The last three live in `command-palette-dialog.tsx`, which arrives on the
 * first press (`OVE-468`): every page drew the palette's triggers and none of
 * them needed its dialog before a reader asked for it. What has to be here
 * before a press — the triggers, `⌘K` and `/`, and whether the palette is open
 * — stays in this module.
 */
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
  actions: PaletteActions;
  /**
   * `field` is the rail's shape — a search field that opens the palette, the
   * way X and Substack draw it. `icon` is the narrow bar's, where a field
   * would take the width the brand needs.
   */
  presentation?: "field" | "icon";
  /** Overridable so a test can drive the palette without a network. */
  search?: PaletteSearch;
  /**
   * Overridable so a test can hold the dialog's download open, and press
   * before it lands. Keep the function's identity stable.
   */
  loadDialog?: () => Promise<typeof CommandPaletteDialog>;
}

/**
 * One dialog, however many triggers. The shell draws a search field in the
 * rail and an icon in the narrow bar, and mounting the component twice gave
 * the document two dialogs, two comboboxes and two `⌘K` listeners — so `⌘K`
 * opened both. A screen reader saw two.
 *
 * Its value never changes after the first render: it sits above the page, and
 * a context above the page that changes is what ADR-0032 D10 forbids.
 */
const CommandPaletteContext = createContext<{
  open: () => void;
  preload: () => void;
} | null>(null);

export function CommandPaletteTrigger({
  presentation = "field",
  label,
  className,
  fallbackHref,
}: {
  fallbackHref?: string;
  presentation?: "field" | "icon";
  /** The control's accessible name; the palette's own copy by default. */
  label: string;
  className?: string;
}) {
  const palette = useContext(CommandPaletteContext);
  const Control = fallbackHref ? "a" : "button";

  return (
    <Control
      href={fallbackHref}
      type={fallbackHref ? undefined : "button"}
      data-command-palette-trigger={presentation}
      aria-label={label}
      onPointerEnter={palette?.preload}
      onFocus={palette?.preload}
      onClick={(event) => {
        if (
          !palette ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        palette.open();
      }}
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
    </Control>
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

const loadPaletteDialog = () =>
  import("./command-palette-dialog").then(
    (module) => module.CommandPaletteDialog,
  );

export function CommandPaletteProvider({
  children,
  locale,
  actions,
  search,
  loadDialog = loadPaletteDialog,
}: CommandPaletteProps & { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // What the reader types between asking for the palette and its field
  // existing. On a phone connection that is the first word of the query.
  const [typedAhead, setTypedAhead] = useState("");
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const {
    Component: PaletteDialog,
    request: requestDialog,
    preload,
  } = useOnDemandComponent(loadDialog);

  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    if (next) return;
    setTypedAhead("");
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    // After `base-ui` has finished its own focus handling for the close.
    requestAnimationFrame(() => target?.focus());
  }, []);

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
    setOpen(true);
    void requestDialog().then((ready) => {
      // A dialog whose code could not be fetched must not leave the page
      // typing into a palette that never came.
      if (!ready) changeOpen(false);
    });
  }, [changeOpen, requestDialog]);

  // `/` is the one entry point that can take a keystroke away from somebody
  // who is writing, so it asks what has focus before it does anything.
  useEffect(() => {
    const waiting = open && PaletteDialog === null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (waiting && keepTypedAhead(event)) return;
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
      if (!open) openPalette();
    };
    // Asked for, and the dialog's code still on its way: the keys the reader
    // types are the query, kept until the field exists to hold them.
    const keepTypedAhead = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        changeOpen(false);
        return true;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        setTypedAhead((text) => text.slice(0, -1));
        return true;
      }
      // `/` again is the shortcut pressed twice because the first seemed to do
      // nothing, not the first letter of a search.
      if (event.key === "/") {
        event.preventDefault();
        return true;
      }
      if (
        event.key.length !== 1 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing
      )
        return false;
      event.preventDefault();
      setTypedAhead((text) => text + event.key);
      return true;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [PaletteDialog, changeOpen, open, openPalette]);

  const paletteContext = useMemo(
    () => ({ open: openPalette, preload }),
    [openPalette, preload],
  );

  return (
    <CommandPaletteContext.Provider value={paletteContext}>
      {children}
      {PaletteDialog ? (
        <PaletteDialog
          open={open}
          onOpenChange={changeOpen}
          locale={locale}
          actions={actions}
          search={search}
          initialQuery={typedAhead}
        />
      ) : null}
    </CommandPaletteContext.Provider>
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
