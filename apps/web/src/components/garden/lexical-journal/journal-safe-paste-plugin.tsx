"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createLinkNode } from "@lexical/link";
import {
  $createLineBreakNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  DROP_COMMAND,
  PASTE_COMMAND,
  type LexicalNode,
} from "lexical";
import { useEffect } from "react";

import { normalizeSafeHref } from "@/lib/garden/journal-document";

export interface JournalSafePastePluginProps {
  disabled: boolean;
  onChooseImage(file: File): Promise<void>;
  onRejectedExternalContent(): void;
}

const LOCAL_IMAGE_MIME = /^image\/(?:jpeg|png|webp|heic)$/i;

/**
 * Own clipboard/drop admission before rich-text handlers can inspect HTML.
 * Only local image Files enter media admission; everything else is plain text.
 */
export function JournalSafePastePlugin({
  disabled,
  onChooseImage,
  onRejectedExternalContent,
}: JournalSafePastePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (disabled) return true;
        if (!("clipboardData" in event)) {
          event.preventDefault();
          return true;
        }
        const clipboard = event.clipboardData;
        if (!clipboard) return true;
        event.preventDefault();

        const image = [...clipboard.files].find((file) =>
          LOCAL_IMAGE_MIME.test(file.type),
        );
        if (image) {
          void onChooseImage(image);
          return true;
        }

        const html = clipboard.getData("text/html");
        const plain = clipboard.getData("text/plain");
        const parsed = html ? extractClosedPasteRuns(html) : null;
        if (parsed?.runs.length) {
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertNodes($pasteRunsToLexicalNodes(parsed.runs));
            }
          });
        } else if (plain) {
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertRawText(plain);
          });
        }
        if (parsed?.rejected) onRejectedExternalContent();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterDrop = editor.registerCommand(
      DROP_COMMAND,
      (event) => {
        event.preventDefault();
        if (disabled) return true;
        const transfer = event.dataTransfer;
        if (!transfer) return true;

        const image = [...transfer.files].find((file) =>
          LOCAL_IMAGE_MIME.test(file.type),
        );
        if (image) {
          void onChooseImage(image);
          return true;
        }

        const plain = transfer.getData("text/plain");
        const hasExternalPayload = Boolean(
          transfer.getData("text/uri-list") || transfer.getData("text/html"),
        );
        if (hasExternalPayload) {
          onRejectedExternalContent();
          return true;
        }
        if (plain) {
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertRawText(plain);
          });
        }
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    return () => {
      unregisterDrop();
      unregisterPaste();
    };
  }, [disabled, editor, onChooseImage, onRejectedExternalContent]);

  return null;
}

export interface ClosedPasteRun {
  text: string;
  bold?: true;
  italic?: true;
  href?: string;
}

/** DOMParser creates an inert document. The traversal emits only text plus the
 * canonical bold/italic/safe-link grammar; no URL is dereferenced. */
export function extractClosedPasteRuns(html: string): {
  runs: ClosedPasteRun[];
  rejected: boolean;
} {
  if (!html || typeof DOMParser === "undefined") {
    return { runs: [], rejected: Boolean(html) };
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const runs: ClosedPasteRun[] = [];
  let rejected = false;
  const forbidden = new Set([
    "script",
    "style",
    "svg",
    "img",
    "picture",
    "source",
    "video",
    "audio",
    "object",
    "embed",
    "iframe",
    "link",
    "meta",
    "template",
  ]);
  const blocks = new Set([
    "p",
    "div",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
  ]);
  const allowed = new Set([
    "a",
    "b",
    "br",
    "div",
    "em",
    "i",
    "li",
    "ol",
    "p",
    "span",
    "strong",
    "ul",
  ]);

  const push = (run: ClosedPasteRun) => {
    if (!run.text) return;
    const previous = runs.at(-1);
    if (
      previous &&
      previous.bold === run.bold &&
      previous.italic === run.italic &&
      previous.href === run.href
    ) {
      previous.text += run.text;
    } else {
      runs.push(run);
    }
  };

  const visit = (
    node: Node,
    marks: Omit<ClosedPasteRun, "text"> = {},
  ): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      push({ text: node.textContent ?? "", ...marks });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (forbidden.has(tag)) {
      rejected = true;
      return;
    }
    if (tag === "br") {
      push({ text: "\n", ...marks });
      return;
    }

    const nextMarks = { ...marks };
    if (tag === "b" || tag === "strong") nextMarks.bold = true;
    if (tag === "i" || tag === "em") nextMarks.italic = true;
    if (tag === "a") {
      try {
        nextMarks.href = normalizeSafeHref(node.getAttribute("href") ?? "");
      } catch {
        rejected = true;
        delete nextMarks.href;
      }
    }
    if (!allowed.has(tag)) rejected = true;
    for (const attribute of [...node.attributes]) {
      if (tag === "a" && attribute.name.toLowerCase() === "href") continue;
      rejected = true;
    }
    for (const child of [...node.childNodes]) visit(child, nextMarks);
    if (blocks.has(tag)) push({ text: "\n" });
  };

  for (const child of [...parsed.body.childNodes]) visit(child);
  if (runs[0]) runs[0].text = runs[0].text.replace(/^\n+/, "");
  if (runs.at(-1)) runs.at(-1)!.text = runs.at(-1)!.text.replace(/\n+$/, "");
  return { runs: runs.filter(({ text }) => text.length > 0), rejected };
}

function $pasteRunsToLexicalNodes(
  runs: readonly ClosedPasteRun[],
): LexicalNode[] {
  const result: LexicalNode[] = [];
  for (const run of runs) {
    const children: LexicalNode[] = run.text
      .split("\n")
      .flatMap((text, index): LexicalNode[] => {
        const nodes: LexicalNode[] = [];
        if (index > 0) nodes.push($createLineBreakNode());
        if (text) {
          const textNode = $createTextNode(text);
          if (run.bold) textNode.toggleFormat("bold");
          if (run.italic) textNode.toggleFormat("italic");
          nodes.push(textNode);
        }
        return nodes;
      });
    if (run.href) {
      const link = $createLinkNode(run.href);
      link.append(...children);
      result.push(link);
    } else {
      result.push(...children);
    }
  }
  return result;
}
