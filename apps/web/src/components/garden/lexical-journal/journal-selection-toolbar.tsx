"use client";

import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNearestNodeOfType } from "@lexical/utils";
import { LinkNode } from "@lexical/link";
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
  type RangeSelection,
  type TextFormatType,
} from "lexical";
import {
  Bold,
  Code,
  Italic,
  Link2,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { StructuredJournalComposerLabels } from "@/components/garden/structured-journal-composer";
import { cn } from "@/lib/utils";

/**
 * Every mark the contract allows on a span except the link, which carries an
 * href and gets its own control. Exported so a test can hold the pill to the
 * contract rather than to a screenshot.
 */
export const JOURNAL_SELECTION_FORMATS: ReadonlyArray<{
  format: TextFormatType;
  label: keyof StructuredJournalComposerLabels["tools"];
  Icon: typeof Bold;
}> = [
  { format: "bold", label: "bold", Icon: Bold },
  { format: "italic", label: "italic", Icon: Italic },
  { format: "underline", label: "underline", Icon: Underline },
  { format: "strikethrough", label: "strikethrough", Icon: Strikethrough },
  { format: "code", label: "code", Icon: Code },
];

export interface JournalSelectionToolbarProps {
  containerRef: RefObject<HTMLDivElement | null>;
  labels: StructuredJournalComposerLabels;
  disabled: boolean;
}

/**
 * Notion's floating pill. It appears on a text selection, follows it, and
 * never takes the caret: the selection is what every one of its buttons acts
 * on, so a button that stole focus would act on nothing.
 */
function sameFormats(
  current: ReadonlySet<TextFormatType>,
  next: ReadonlySet<TextFormatType>,
): boolean {
  return (
    current.size === next.size &&
    [...next].every((format) => current.has(format))
  );
}

export function JournalSelectionToolbar({
  containerRef,
  labels,
  disabled,
}: JournalSelectionToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = useState(false);
  const [formats, setFormats] = useState<ReadonlySet<TextFormatType>>(
    () => new Set(),
  );
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const savedSelectionRef = useRef<RangeSelection | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const domSelection = window.getSelection();
    if (!container || !domSelection || domSelection.rangeCount === 0) return;
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const containerRect = container.getBoundingClientRect();
    const top = rect.top - containerRect.top;
    const left = rect.left - containerRect.left + rect.width / 2;
    // A fresh object on every commit is a render per keystroke for a pill that
    // is usually not even on screen.
    setPosition((current) =>
      current && current.top === top && current.left === left
        ? current
        : { top, left },
    );
  }, [containerRef]);

  const sync = useCallback(() => {
    if (disabled) {
      setVisible(false);
      return;
    }
    let measured = false;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (
        !$isRangeSelection(selection) ||
        selection.isCollapsed() ||
        selection.getTextContent().trim().length === 0
      ) {
        setVisible(false);
        setLinkOpen(false);
        return;
      }
      const next = new Set<TextFormatType>();
      for (const { format } of JOURNAL_SELECTION_FORMATS) {
        if (selection.hasFormat(format)) next.add(format);
      }
      setFormats((current) => (sameFormats(current, next) ? current : next));
      const link = $getNearestNodeOfType(selection.anchor.getNode(), LinkNode);
      setLinkValue($isLinkNode(link) ? link.getURL() : "");
      setVisible(true);
      measured = true;
    });
    if (measured) measure();
  }, [disabled, editor, measure]);

  // No initial read: the pill only has work when there is a selection, and a
  // selection always arrives through one of these two signals.
  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(sync),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          sync();
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, sync]);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || !position) return;
    // Centred over the selection and lifted clear of it. The offsets live in
    // the transform rather than in classes because an inline transform would
    // otherwise overwrite them.
    toolbar.style.transform = `translate(calc(${position.left}px - 50%), calc(${position.top}px - 100% - 8px))`;
  }, [position]);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  const rememberSelection = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      savedSelectionRef.current = $isRangeSelection(selection)
        ? selection.clone()
        : null;
    });
  }, [editor]);

  const openLinkEditor = useCallback(() => {
    rememberSelection();
    setLinkOpen(true);
  }, [rememberSelection]);

  const closeLinkEditor = useCallback(
    (restore: boolean) => {
      setLinkOpen(false);
      const saved = savedSelectionRef.current;
      savedSelectionRef.current = null;
      if (!restore) return;
      editor.update(
        () => {
          if (saved) $setSelection(saved.clone());
        },
        { discrete: true },
      );
      editor.focus();
    },
    [editor],
  );

  const applyLink = useCallback(() => {
    const saved = savedSelectionRef.current;
    editor.update(
      () => {
        if (saved) $setSelection(saved.clone());
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkValue.trim() || null);
      },
      { discrete: true },
    );
    savedSelectionRef.current = null;
    setLinkOpen(false);
    editor.focus();
  }, [editor, linkValue]);

  // The pill is summonable and dismissable from the keyboard, because taking
  // the button row away took the one control surface Tab could reach.
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            const mod = event.metaKey || event.ctrlKey;
            if (!mod) return false;
            const key = event.key.toLowerCase();
            if (key === "k") {
              event.preventDefault();
              openLinkEditor();
              return true;
            }
            if (key === "f" && event.shiftKey) {
              event.preventDefault();
              toolbarRef.current
                ?.querySelector<HTMLButtonElement>("button")
                ?.focus();
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          () => {
            if (!linkOpen) return false;
            closeLinkEditor(true);
            return true;
          },
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [closeLinkEditor, editor, linkOpen, openLinkEditor],
  );

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      data-journal-selection-toolbar="true"
      aria-label={labels.tools.toolbar}
      hidden={position === null}
      className="pointer-events-auto absolute top-0 left-0 z-30 flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {linkOpen ? (
        <div className="flex items-center gap-1">
          <input
            ref={linkInputRef}
            type="url"
            value={linkValue}
            disabled={disabled}
            aria-label={labels.tools.link}
            placeholder="https://"
            className="h-9 w-56 rounded border border-input bg-background px-2 text-sm"
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              } else if (event.key === "Escape") {
                event.preventDefault();
                closeLinkEditor(true);
              }
            }}
          />
          <button
            type="button"
            disabled={disabled}
            className="h-9 rounded px-2 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={applyLink}
          >
            {labels.tools.applyLink}
          </button>
          <button
            type="button"
            disabled={disabled}
            className="h-9 rounded px-2 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => closeLinkEditor(true)}
          >
            {labels.tools.cancelLink}
          </button>
        </div>
      ) : (
        <>
          {JOURNAL_SELECTION_FORMATS.map(({ format, label, Icon }) => (
            <button
              key={format}
              type="button"
              data-journal-format={format}
              aria-label={labels.tools[label]}
              aria-pressed={formats.has(format)}
              disabled={disabled}
              className={cn(
                "flex size-9 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground disabled:opacity-40",
                formats.has(format) && "bg-accent text-accent-foreground",
              )}
              // The pointer must not move the caret: the selection is what the
              // command acts on.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
              }
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          ))}
          <button
            type="button"
            data-journal-format="link"
            aria-label={labels.tools.link}
            aria-pressed={linkValue.length > 0}
            disabled={disabled}
            className={cn(
              "flex size-9 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground disabled:opacity-40",
              linkValue.length > 0 && "bg-accent text-accent-foreground",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={openLinkEditor}
          >
            <Link2 aria-hidden="true" className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}
