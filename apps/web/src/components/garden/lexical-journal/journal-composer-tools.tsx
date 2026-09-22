"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
  type ElementNode,
  type TextFormatType,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";

import { CaretDownIcon } from "@/components/icons/CaretDown";
import { ImageIcon } from "@/components/icons/Image";
import { ListBulletsIcon } from "@/components/icons/ListBullets";
import { PlusIcon } from "@/components/icons/Plus";
import { TextBIcon } from "@/components/icons/TextB";
import { TextItalicIcon } from "@/components/icons/TextItalic";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import type { StructuredJournalComposerLabels } from "@/components/garden/structured-journal-composer";
import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";

import {
  $journalBlockCommandIdOf,
  $replaceJournalBlockWithDelimiter,
  $selectedJournalTopLevelBlock,
  $turnJournalBlockInto,
  JOURNAL_BLOCK_COMMANDS,
  type JournalBlockCommandId,
} from "./journal-block-commands";
import { JOURNAL_BLOCK_COMMAND_ICONS } from "./journal-block-command-icons";
import {
  $setJournalBlockId,
  createJournalBlockId,
} from "./journal-lexical-nodes";
import { JournalShortcutSheet } from "./journal-shortcut-sheet";

/** The marks a gardener reaches without selecting first (`OVE-487`). */
const BASIC_FORMATS: ReadonlyArray<{
  format: TextFormatType;
  label: "bold" | "italic";
  Icon: typeof TextBIcon;
}> = [
  { format: "bold", label: "bold", Icon: TextBIcon },
  { format: "italic", label: "italic", Icon: TextItalicIcon },
];

export interface JournalComposerToolsProps {
  labels: StructuredJournalComposerLabels;
  disabled: boolean;
  onChooseImages(files: readonly File[]): void;
}

/**
 * The composer's ordinary controls, under the text (`OVE-487`, ADR-0028 D3 as
 * amended 2026-09-21): Add photo, the two marks a note most often wants, a
 * bulleted list, and every other block behind one plain button. The slash
 * menu, the gutter and the shortcuts stay; they are no longer the only way in.
 *
 * Every control keeps the caret. A pointer press is cancelled before the
 * editor can lose its selection, and a keyboard press acts on the selection
 * Lexical still holds and puts the caret back where it was — the one thing a
 * formatting button must never do is act on nothing.
 */
export function JournalComposerTools({
  labels,
  disabled,
  onChooseImages,
}: JournalComposerToolsProps) {
  const [editor] = useLexicalComposerContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chosenRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [formats, setFormats] = useState<ReadonlySet<TextFormatType>>(
    () => new Set(),
  );
  const [bulletList, setBulletList] = useState(false);

  const sync = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const next = new Set<TextFormatType>();
      for (const { format } of BASIC_FORMATS) {
        if (selection.hasFormat(format)) next.add(format);
      }
      setFormats((current) =>
        current.size === next.size && [...next].every((f) => current.has(f))
          ? current
          : next,
      );
      const block = $selectedJournalTopLevelBlock();
      setBulletList(
        block ? $journalBlockCommandIdOf(block) === "bulletList" : false,
      );
    });
  }, [editor]);

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(sync),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            sync();
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, sync],
  );

  const returnCaret = useCallback(() => {
    window.requestAnimationFrame(() => editor.focus());
  }, [editor]);

  function toggleFormat(format: TextFormatType) {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    returnCaret();
  }

  function toggleBulletList() {
    editor.update(
      () => {
        const block = $selectedJournalTopLevelBlock() ?? $lastBlock();
        if (!block) return;
        $turnJournalBlockInto(
          $journalBlockCommandIdOf(block) === "bulletList"
            ? "paragraph"
            : "bulletList",
          block,
        );
      },
      { discrete: true },
    );
    returnCaret();
  }

  function insertBlock(commandId: JournalBlockCommandId) {
    if (commandId === "image") {
      fileInputRef.current?.click();
      return;
    }
    editor.update(
      () => {
        const current = $selectedJournalTopLevelBlock() ?? $lastBlock();
        // An empty line becomes the block; anything else keeps its text and
        // gets the new block under it — the gutter's "add below" rule.
        const target =
          current && $isParagraphNode(current) && current.isEmpty()
            ? current
            : $appendParagraphAfter(current);
        if (commandId === "delimiter") {
          $replaceJournalBlockWithDelimiter(target);
        } else if (commandId === "paragraph") {
          target.selectStart();
        } else {
          target.selectStart();
          $turnJournalBlockInto(commandId, target);
        }
      },
      { discrete: true },
    );
  }

  const keepCaret = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div
      role="group"
      aria-label={labels.composerTools.label}
      data-journal-composer-tools="true"
      className="journal-composer-column mx-auto flex w-full flex-wrap items-center gap-1 border-t border-border pt-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        data-journal-tool="photo"
        onMouseDown={keepCaret}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImageIcon aria-hidden="true" className="size-4" />
        {labels.composerTools.addPhoto}
      </Button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      {BASIC_FORMATS.map(({ format, label, Icon }) => (
        <IconButton
          key={format}
          size="sm"
          label={labels.tools[label]}
          title={labels.tools[label]}
          aria-pressed={formats.has(format)}
          disabled={disabled}
          data-journal-tool={format}
          className="aria-pressed:bg-action-subtle aria-pressed:text-action-subtle-text"
          onMouseDown={keepCaret}
          onClick={() => toggleFormat(format)}
        >
          <Icon aria-hidden="true" />
        </IconButton>
      ))}
      <IconButton
        size="sm"
        label={labels.blocks.commands.bulletList}
        title={labels.blocks.commands.bulletList}
        aria-pressed={bulletList}
        disabled={disabled}
        data-journal-tool="bulletList"
        className="aria-pressed:bg-action-subtle aria-pressed:text-action-subtle-text"
        onMouseDown={keepCaret}
        onClick={toggleBulletList}
      >
        <ListBulletsIcon aria-hidden="true" />
      </IconButton>
      <Menu
        open={menuOpen}
        onOpenChange={(open) => {
          if (open) chosenRef.current = false;
          setMenuOpen(open);
        }}
        modal={false}
      >
        <MenuTrigger
          disabled={disabled}
          data-journal-tool="blocks"
          render={
            <Button type="button" variant="ghost" size="sm">
              <PlusIcon aria-hidden="true" className="size-4" />
              {labels.composerTools.blocks}
              <CaretDownIcon aria-hidden="true" className="size-4" />
            </Button>
          }
        />
        <MenuContent
          align="start"
          aria-label={labels.blocks.add}
          className="max-h-80 overflow-y-auto"
          // A chosen block owns the caret, so the trigger must not take focus
          // back from it; a dismissed menu returns focus as usual.
          finalFocus={() => !chosenRef.current}
        >
          {JOURNAL_BLOCK_COMMANDS.map((command) => {
            const Icon = JOURNAL_BLOCK_COMMAND_ICONS[command.id];
            return (
              <MenuItem
                key={command.id}
                data-journal-tool-block={command.id}
                onClick={() => {
                  chosenRef.current = command.id !== "image";
                  insertBlock(command.id);
                  if (command.id !== "image") returnCaret();
                }}
              >
                <Icon aria-hidden="true" className="size-4" />
                {labels.blocks.commands[command.id]}
              </MenuItem>
            );
          })}
        </MenuContent>
      </Menu>
      {/* Keys to learn are for a keyboard: a phone gets the row's buttons,
          and the input rules still work as it types. */}
      <div className="ml-auto hidden sm:block">
        <JournalShortcutSheet labels={labels} />
      </div>
      <FileDrop
        ref={fileInputRef}
        accept={COMPOSER_PHOTO_ACCEPT}
        multiple
        disabled={disabled}
        label={labels.composerTools.addPhoto}
        data-journal-tool-input="photo"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length > 0) onChooseImages(files);
        }}
      />
    </div>
  );
}

function $lastBlock(): ElementNode | null {
  const last = $getRoot().getLastChild();
  return $isElementNode(last) ? last : null;
}

function $appendParagraphAfter(block: ElementNode | null): ElementNode {
  const paragraph = $setJournalBlockId(
    $createParagraphNode(),
    createJournalBlockId(),
  );
  if (block) block.insertAfter(paragraph);
  else $getRoot().append(paragraph);
  return paragraph;
}
