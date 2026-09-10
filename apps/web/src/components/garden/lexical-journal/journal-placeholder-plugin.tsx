"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
} from "lexical";
import { useEffect } from "react";

const ATTRIBUTE = "data-journal-placeholder";

export interface JournalPlaceholderPluginProps {
  /** Shown on the focused empty paragraph. */
  placeholder: string;
  /** Shown on the first block while the document is still empty. */
  firstPlaceholder: string;
  disabled: boolean;
}

/**
 * Notion's placeholder: on the empty block the caret is in, and on the very
 * first block while the entry is still blank. The text is written to an
 * attribute and drawn by CSS, so it is never a node and can never be typed
 * over, selected, or serialized.
 */
export function JournalPlaceholderPlugin({
  placeholder,
  firstPlaceholder,
  disabled,
}: JournalPlaceholderPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const apply = () => {
      const root = editor.getRootElement();
      if (!root) return;
      for (const element of root.querySelectorAll(`[${ATTRIBUTE}]`)) {
        element.removeAttribute(ATTRIBUTE);
      }
      if (disabled) return;

      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren();
        const first = children[0];
        const documentIsBlank =
          children.length === 1 &&
          $isParagraphNode(first) &&
          first.getTextContentSize() === 0;
        if (documentIsBlank && first) {
          editor
            .getElementByKey(first.getKey())
            ?.setAttribute(ATTRIBUTE, firstPlaceholder);
          return;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
        const top = selection.anchor.getNode().getTopLevelElement();
        // Only a paragraph gets it: a heading, a list item or a quote already
        // says what it is by how it looks.
        if (!$isParagraphNode(top) || top.getTextContentSize() > 0) return;
        editor
          .getElementByKey(top.getKey())
          ?.setAttribute(ATTRIBUTE, placeholder);
      });
    };

    apply();
    // The attribute is re-applied after every commit, so a reconciliation that
    // replaces the element cannot leave a stale placeholder behind.
    return editor.registerUpdateListener(apply);
  }, [disabled, editor, firstPlaceholder, placeholder]);

  return null;
}
