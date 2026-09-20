"use client";

import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { StructuredJournalComposerLabels } from "@/components/garden/structured-journal-composer";

import type { JournalBlockCommandId } from "./journal-block-commands";
import {
  JOURNAL_BLOCK_INPUT_RULES,
  JOURNAL_INLINE_INPUT_RULES,
} from "./journal-input-rules";
import { JOURNAL_SHORTCUTS } from "./journal-shortcuts";

/**
 * What the composer can do without a pointer, said out loud (`OVE-458`).
 *
 * The input rules were the product's best-kept secret: `## ` makes a heading,
 * `[x] ` makes a ticked to-do, `~~` strikes a run through — and nothing on the
 * screen said so, so the only reader who found them was the one who already
 * knew Markdown. mymind's shortcut sheet is the model: one disclosure, beside
 * the canvas, listing every rule and every key.
 *
 * **Every row is generated from the module that implements it.** A sheet
 * written by hand is a sheet that goes stale on the first rule anybody adds,
 * and a wrong shortcut sheet is worse than none: it teaches a key that does
 * nothing. `journal-shortcut-sheet.test.ts` asserts the coverage both ways.
 */
export interface JournalShortcutRow {
  /** What the reader types, already formatted for display. */
  keys: string;
  label: string;
}

/**
 * Lexical's `TextFormatType` is wider than the four delimiters this composer
 * writes, so the map is partial on purpose: a format that grows a rule and no
 * label falls back to its own name rather than failing to compile somewhere
 * unrelated, and the sheet's test is what catches it.
 */
const INLINE_LABEL: Partial<
  Record<
    (typeof JOURNAL_INLINE_INPUT_RULES)[number]["format"],
    keyof StructuredJournalComposerLabels["tools"]
  >
> = {
  bold: "bold",
  italic: "italic",
  strikethrough: "strikethrough",
  code: "code",
};

const SHORTCUT_LABEL: Record<
  string,
  | { kind: "tool"; key: keyof StructuredJournalComposerLabels["tools"] }
  | { kind: "block"; key: JournalBlockCommandId }
> = {
  s: { kind: "tool", key: "strikethrough" },
  e: { kind: "tool", key: "code" },
  "1": { kind: "block", key: "heading1" },
  "2": { kind: "block", key: "heading2" },
  "3": { kind: "block", key: "heading3" },
  "0": { kind: "block", key: "paragraph" },
};

/** The block rules, one row per block — `- `, `* ` and `+ ` are one rule. */
export function journalBlockRuleRows(
  labels: StructuredJournalComposerLabels,
): JournalShortcutRow[] {
  const byCommand = new Map<JournalBlockCommandId, string[]>();
  for (const rule of JOURNAL_BLOCK_INPUT_RULES) {
    const triggers = byCommand.get(rule.commandId) ?? [];
    triggers.push(rule.trigger.trimEnd() || rule.trigger);
    byCommand.set(rule.commandId, triggers);
  }
  return [...byCommand].map(([commandId, triggers]) => ({
    keys: triggers.join(" · "),
    label: labels.blocks.commands[commandId],
  }));
}

export function journalInlineRuleRows(
  labels: StructuredJournalComposerLabels,
): JournalShortcutRow[] {
  return JOURNAL_INLINE_INPUT_RULES.map((rule) => {
    const key = INLINE_LABEL[rule.format];
    return {
      keys: `${rule.delimiter}…${rule.delimiter}`,
      label: key ? labels.tools[key] : rule.format,
    };
  });
}

/**
 * The modifier as this reader's own keyboard spells it. Rendered on the client
 * only, so `navigator` is there; a server render says `Ctrl`, which is what a
 * reader on a PC sees and what a reader on a Mac sees for one frame.
 */
export function journalModifierLabel(platform: string): string {
  return /mac|iphone|ipad/iu.test(platform) ? "⌘" : "Ctrl";
}

export function journalShortcutRows(
  labels: StructuredJournalComposerLabels,
  modifier: string,
): JournalShortcutRow[] {
  const rows: JournalShortcutRow[] = [
    { keys: `${modifier} + B`, label: labels.tools.bold },
    { keys: `${modifier} + I`, label: labels.tools.italic },
    { keys: `${modifier} + U`, label: labels.tools.underline },
  ];
  for (const shortcut of JOURNAL_SHORTCUTS) {
    const named = SHORTCUT_LABEL[shortcut.key];
    if (!named) continue;
    rows.push({
      keys: `${modifier}${shortcut.shift ? " + Shift" : ""} + ${shortcut.key.toUpperCase()}`,
      label:
        named.kind === "tool"
          ? labels.tools[named.key]
          : labels.blocks.commands[named.key],
    });
  }
  rows.push(
    { keys: "/", label: labels.shortcuts.slashMenu },
    { keys: `${modifier} + Shift + M`, label: labels.shortcuts.blockMenu },
    { keys: "↑ ↓", label: labels.shortcuts.moveBlock },
  );
  return rows;
}

function RuleList({
  heading,
  rows,
}: {
  heading: string;
  rows: readonly JournalShortcutRow[];
}) {
  return (
    <section className="grid gap-1">
      <h3 className="text-overline text-text-muted">{heading}</h3>
      <dl className="grid gap-0.5">
        {rows.map((row) => (
          <div key={`${row.keys}-${row.label}`} className="flex gap-3">
            <dt className="shrink-0 font-mono text-caption text-text-secondary">
              {row.keys}
            </dt>
            <dd className="min-w-0 flex-1 text-right text-caption text-text">
              {row.label}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function JournalShortcutSheet({
  labels,
  modifier = journalModifierLabel(
    typeof navigator === "undefined" ? "" : navigator.platform,
  ),
}: {
  labels: StructuredJournalComposerLabels;
  modifier?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-journal-shortcut-sheet-trigger="true"
          >
            <Keyboard aria-hidden="true" className="size-4" />
            {labels.shortcuts.open}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="grid w-80 gap-3"
        data-journal-shortcut-sheet="true"
      >
        <PopoverTitle>{labels.shortcuts.title}</PopoverTitle>
        {/* The scroller is in the tab order and has a name of its own: a
            region a pointer can scroll and a keyboard cannot reach is
            `scrollable-region-focusable`, which axe calls serious and which
            the list here is long enough to trip. */}
        <div
          tabIndex={0}
          role="group"
          aria-label={labels.shortcuts.title}
          className="grid max-h-80 gap-3 overflow-y-auto rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <RuleList
            heading={labels.shortcuts.inputRules}
            rows={journalBlockRuleRows(labels)}
          />
          <RuleList
            heading={labels.shortcuts.inline}
            rows={journalInlineRuleRows(labels)}
          />
          <RuleList
            heading={labels.shortcuts.keys}
            rows={journalShortcutRows(labels, modifier)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
