"use client";

import { X } from "lucide-react";

import type {
  JournalMentionSelection,
  JournalMentionSuggestion,
} from "@/lib/garden/journal-mentions";
import { isJournalMentionTargetKind } from "@/lib/garden/journal-mentions";

export type MentionTypeaheadStatus = "idle" | "loading" | "ready" | "failed";

export interface ActiveMentionToken {
  start: number;
  end: number;
  query: string;
}

export function resolveActiveMentionToken(
  body: string,
  cursorPosition: number,
): ActiveMentionToken | null {
  const cursor = Math.max(0, Math.min(cursorPosition, body.length));
  let start = cursor;

  while (start > 0 && !/\s/u.test(body[start - 1] ?? "")) {
    start -= 1;
  }

  const token = body.slice(start, cursor);
  if (!token.startsWith("@") || token.slice(1).includes("@")) return null;

  const query = token.slice(1);
  if (query.length > 80 || /[^\p{L}\p{N}_-]/u.test(query)) return null;

  return { start, end: cursor, query };
}

export function applyMentionSuggestion(
  body: string,
  activeToken: ActiveMentionToken,
  suggestion: JournalMentionSuggestion,
) {
  const insertText = `${suggestion.insertText} `;
  const nextBody = `${body.slice(0, activeToken.start)}${insertText}${body.slice(
    activeToken.end,
  )}`;

  return {
    body: nextBody,
    cursorPosition: activeToken.start + insertText.length,
  };
}

export function parseJournalMentionSuggestions(
  value: unknown,
): JournalMentionSuggestion[] {
  if (!value || typeof value !== "object") return [];

  const suggestions = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  return suggestions.flatMap((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") return [];

    const candidate = suggestion as Partial<JournalMentionSuggestion>;
    if (
      !isJournalMentionTargetKind(candidate.kind) ||
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.insertText !== "string" ||
      !candidate.insertText.startsWith("@") ||
      typeof candidate.detail !== "string" ||
      typeof candidate.disambiguationLabel !== "string"
    ) {
      return [];
    }

    return [
      {
        kind: candidate.kind,
        id: candidate.id,
        label: candidate.label,
        insertText: candidate.insertText as `@${string}`,
        detail: candidate.detail,
        disambiguationLabel: candidate.disambiguationLabel,
        catalogKind: candidate.catalogKind ?? null,
      },
    ];
  });
}

export function mentionSelectionKey(selection: JournalMentionSelection) {
  return `${selection.kind}:${selection.id}`;
}

export function toMentionSelection(
  suggestion: JournalMentionSuggestion,
): JournalMentionSelection {
  return {
    kind: suggestion.kind,
    id: suggestion.id,
    label: suggestion.label,
  };
}

export function JournalMentionTypeaheadPanel({
  status,
  suggestions,
  selections,
  onSelect,
  onRemove,
}: {
  status: MentionTypeaheadStatus;
  suggestions: JournalMentionSuggestion[];
  selections: JournalMentionSelection[];
  onSelect: (suggestion: JournalMentionSuggestion) => void;
  onRemove: (selection: JournalMentionSelection) => void;
}) {
  return (
    <div className="grid gap-2">
      {status === "loading" ? (
        <p className="text-xs text-muted-foreground">Searching mentions...</p>
      ) : null}
      {status === "failed" ? (
        <p className="text-xs text-destructive">
          Mention suggestions unavailable.
        </p>
      ) : null}
      {suggestions.length > 0 ? (
        <ul className="grid gap-2">
          {suggestions.map((suggestion) => (
            <li key={mentionSelectionKey(suggestion)}>
              <button
                type="button"
                onClick={() => onSelect(suggestion)}
                className="flex w-full items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {suggestion.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.detail} · {suggestion.disambiguationLabel}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                  {mentionKindLabel(suggestion.kind)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selections.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Linked mentions</span>
          {selections.map((selection) => (
            <span
              key={mentionSelectionKey(selection)}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border px-2 py-1 text-foreground"
            >
              <span className="truncate">{selection.label}</span>
              <button
                type="button"
                onClick={() => onRemove(selection)}
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${selection.label}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function mentionKindLabel(kind: JournalMentionSuggestion["kind"]) {
  switch (kind) {
    case "own_object":
      return "Yours";
    case "public_object":
      return "Public";
    case "public_handle":
      return "Handle";
    case "catalog_item":
      return "Catalog";
  }
}
