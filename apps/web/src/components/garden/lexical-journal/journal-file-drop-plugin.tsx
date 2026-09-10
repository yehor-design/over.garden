"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $getRoot, $isElementNode, type NodeKey } from "lexical";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { JournalInsertionLine } from "./journal-insertion-line";
import { classifyComposerPhotoRefusal } from "@/lib/garden/composer-photo-selection";

const LOCAL_IMAGE_MIME = /^image\/(?:jpeg|png|webp|heic|heif)$/i;

export interface JournalFileDropPluginProps {
  containerRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
}

/**
 * A photo dropped on the canvas lands where it was dropped, not at the end.
 * This listener captures the drop before Lexical's own `DROP_COMMAND` handler
 * sees it and moves the caret to the block the pointer is over, so the
 * existing media-admission path puts the block there. The only thing read from
 * the DOM is the pointer's geometry.
 */
export function JournalFileDropPlugin({
  containerRef,
  disabled,
}: JournalFileDropPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const targetKeyRef = useRef<NodeKey | null>(null);

  const locate = useCallback(
    (clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      let target: { key: NodeKey; bottom: number } | null = null;
      editor.getEditorState().read(() => {
        for (const node of $getRoot().getChildren()) {
          const element = editor.getElementByKey(node.getKey());
          if (!element) continue;
          const rect = element.getBoundingClientRect();
          target = { key: node.getKey(), bottom: rect.bottom };
          if (clientY < (rect.top + rect.bottom) / 2) {
            target = { key: node.getKey(), bottom: rect.top };
            break;
          }
        }
      });
      if (!target) {
        targetKeyRef.current = null;
        setIndicatorTop(null);
        return;
      }
      const located: { key: NodeKey; bottom: number } = target;
      targetKeyRef.current = located.key;
      setIndicatorTop(located.bottom - containerRect.top);
    },
    [containerRef, editor],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const carriesFile = (event: DragEvent) =>
      Boolean(event.dataTransfer?.types.includes("Files"));

    const onDragOver = (event: DragEvent) => {
      if (!carriesFile(event)) return;
      event.preventDefault();
      locate(event.clientY);
    };
    const onDragLeave = (event: DragEvent) => {
      if (
        event.relatedTarget &&
        container.contains(event.relatedTarget as Node)
      ) {
        return;
      }
      targetKeyRef.current = null;
      setIndicatorTop(null);
    };
    const onDrop = (event: DragEvent) => {
      const file = [...(event.dataTransfer?.files ?? [])].find((candidate) =>
        LOCAL_IMAGE_MIME.test(candidate.type),
      );
      const key = targetKeyRef.current;
      targetKeyRef.current = null;
      setIndicatorTop(null);
      if (!file) return;
      // A file that will be refused anyway must not move the caret first.
      if (classifyComposerPhotoRefusal(file)) return;
      if (!key) return;
      editor.update(
        () => {
          const node = $getNodeByKey(key);
          if ($isElementNode(node)) node.selectEnd();
        },
        { discrete: true },
      );
    };

    container.addEventListener("dragover", onDragOver);
    container.addEventListener("dragleave", onDragLeave);
    container.addEventListener("drop", onDrop, true);
    return () => {
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("dragleave", onDragLeave);
      container.removeEventListener("drop", onDrop, true);
    };
  }, [containerRef, disabled, editor, locate]);

  return <JournalInsertionLine top={indicatorTop} purpose="drop" />;
}
