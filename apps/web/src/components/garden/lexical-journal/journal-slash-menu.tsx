"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
} from "lexical";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  $journalBlockCommandIdOf,
  $replaceJournalBlockWithDelimiter,
  $selectedJournalTopLevelBlock,
  $turnJournalBlockInto,
  JOURNAL_BLOCK_COMMANDS,
  type JournalBlockCommandId,
} from "./journal-block-commands";
import type { JournalBlockCommandCopy } from "@/components/garden/structured-journal-composer";
import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";
import { cn } from "@/lib/utils";

/** A query longer than this is prose, not a command. */
const MAX_QUERY_LENGTH = 24;

interface SlashState {
  /** Offset of the `/` inside the caret's text node. */
  slashOffset: number;
  query: string;
}

export interface JournalSlashMenuProps {
  containerRef: RefObject<HTMLDivElement | null>;
  copy: JournalBlockCommandCopy;
  disabled: boolean;
  onChooseImage(file: File): Promise<void>;
}

/**
 * Notion's `/` menu, as a WAI-ARIA listbox the editor owns: the caret never
 * leaves the text, the editor advertises the active option through
 * `aria-activedescendant`, and every key the menu uses is taken at critical
 * priority so the editor's own handlers do not also act on it.
 */
export function JournalSlashMenu({
  containerRef,
  copy,
  disabled,
  onChooseImage,
}: JournalSlashMenuProps) {
  const [editor] = useLexicalComposerContext();
  const listboxId = useId();
  const [state, setState] = useState<SlashState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef<SlashState | null>(null);
  const activeIndexRef = useRef(0);

  const openState = disabled ? null : state;

  const options = useMemo(() => {
    if (!openState) return [];
    const query = openState.query.trim().toLocaleLowerCase();
    if (!query) return JOURNAL_BLOCK_COMMANDS;
    return JOURNAL_BLOCK_COMMANDS.filter((command) => {
      const label = copy.commands[command.id].toLocaleLowerCase();
      return (
        label.includes(query) ||
        command.aliases.some((alias) => alias.startsWith(query))
      );
    });
  }, [copy.commands, openState]);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
    stateRef.current = openState;
    activeIndexRef.current = activeIndex;
  }, [activeIndex, openState, options]);

  const close = useCallback(() => {
    setState(null);
    setActiveIndex(0);
    setPosition(null);
  }, []);

  // The open state is derived from the text before the caret rather than from
  // keystrokes, so backspacing over the slash, or retyping it, is handled by
  // the same rule that opened the menu.
  // While the composer is disabled there is nothing to subscribe to, and the
  // derived `openState` below keeps the menu closed without a state write.
  useEffect(() => {
    if (disabled) return;
    const read = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          close();
          return;
        }
        const node = selection.anchor.getNode();
        const block = $selectedJournalTopLevelBlock();
        if (!$isTextNode(node) || !block) {
          close();
          return;
        }
        if ($journalBlockCommandIdOf(block) === "code") {
          close();
          return;
        }
        const offset = selection.anchor.offset;
        const before = node.getTextContent().slice(0, offset);
        const slashOffset = before.lastIndexOf("/");
        if (slashOffset < 0) {
          close();
          return;
        }
        const preceding = slashOffset === 0 ? "" : before[slashOffset - 1];
        // A slash inside a word is a slash, not a command.
        if (preceding && !/\s/.test(preceding)) {
          close();
          return;
        }
        const query = before.slice(slashOffset + 1);
        if (query.length > MAX_QUERY_LENGTH || /\s/.test(query)) {
          close();
          return;
        }
        setState((current) =>
          current &&
          current.slashOffset === slashOffset &&
          current.query === query
            ? current
            : { slashOffset, query },
        );
        setActiveIndex(0);
      });
    };
    read();
    return editor.registerUpdateListener(read);
  }, [close, disabled, editor]);

  // The menu follows the caret, measured from the live DOM selection.
  useEffect(() => {
    if (!openState) return;
    const container = containerRef.current;
    const domSelection = window.getSelection();
    if (!container || !domSelection || domSelection.rangeCount === 0) return;
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setPosition({
      top: rect.bottom - containerRect.top + 6,
      left: Math.max(0, rect.left - containerRect.left),
    });
  }, [containerRef, openState]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || !position) return;
    menu.style.transform = `translate(${position.left}px, ${position.top}px)`;
  }, [position]);

  // `aria-activedescendant` belongs on the element that keeps the focus, which
  // is the editor itself. Lexical does not manage this attribute.
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const option = openState ? options[activeIndex] : undefined;
    if (option) {
      root.setAttribute("aria-activedescendant", `${listboxId}-${option.id}`);
      root.setAttribute("aria-controls", listboxId);
      root.setAttribute("aria-expanded", "true");
    } else {
      root.removeAttribute("aria-activedescendant");
      root.removeAttribute("aria-controls");
      root.removeAttribute("aria-expanded");
    }
  }, [activeIndex, editor, listboxId, openState, options]);

  const select = useCallback(
    (commandId: JournalBlockCommandId) => {
      const current = stateRef.current;
      if (!current) return;
      editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const node = selection.anchor.getNode();
          if ($isTextNode(node)) {
            node.spliceText(
              current.slashOffset,
              selection.anchor.offset - current.slashOffset,
              "",
              true,
            );
          }
          if (commandId === "delimiter") {
            $replaceJournalBlockWithDelimiter();
          } else if (commandId !== "image" && commandId !== "paragraph") {
            $turnJournalBlockInto(commandId);
          }
        },
        { discrete: true },
      );
      close();
      if (commandId === "image") fileInputRef.current?.click();
      else editor.focus();
    },
    [close, editor],
  );

  useEffect(() => {
    if (!openState) return;
    const move = (delta: 1 | -1) => {
      const count = optionsRef.current.length;
      if (count === 0) return false;
      setActiveIndex((index) => (index + delta + count) % count);
      return true;
    };
    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (!move(1)) return false;
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (!move(-1)) return false;
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          close();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const option = optionsRef.current[activeIndexRef.current];
          if (!option) return false;
          event?.preventDefault();
          select(option.id);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const option = optionsRef.current[activeIndexRef.current];
          if (!option) return false;
          event.preventDefault();
          select(option.id);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [close, editor, openState, select]);

  if (!openState) {
    return (
      <input
        ref={fileInputRef}
        type="file"
        accept={COMPOSER_PHOTO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        aria-label={copy.commands.image}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void onChooseImage(file);
        }}
      />
    );
  }

  return (
    <>
      <div
        ref={menuRef}
        id={listboxId}
        role="listbox"
        aria-label={copy.add}
        data-journal-slash-menu="true"
        hidden={position === null}
        className="pointer-events-auto absolute top-0 left-0 z-20 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      >
        {options.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">
            {copy.noResults}
          </p>
        ) : (
          options.map((command, index) => (
            <div
              key={command.id}
              id={`${listboxId}-${command.id}`}
              role="option"
              aria-selected={index === activeIndex}
              data-journal-slash-option={command.id}
              className={cn(
                "flex min-h-10 cursor-default items-center rounded-sm px-2.5 py-2 text-sm",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                // Keep the caret where it is; the command needs that selection.
                event.preventDefault();
                select(command.id);
              }}
            >
              {copy.commands[command.id]}
            </div>
          ))
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={COMPOSER_PHOTO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        aria-label={copy.commands.image}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void onChooseImage(file);
        }}
      />
    </>
  );
}
