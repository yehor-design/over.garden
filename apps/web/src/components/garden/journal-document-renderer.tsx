import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import type {
  JournalDocumentBlock,
  JournalDocumentV1,
  JournalInlineMark,
  JournalListItem,
  JournalTextSpan,
} from "@/lib/garden/journal-document";
import { cn } from "@/lib/utils";

export interface JournalDocumentImageViewModel {
  mediaAssetId: string;
  src: string;
  alt: string;
  caption: string | null;
  width?: number;
  height?: number;
}

export interface JournalDocumentRendererCopy {
  unavailableTitle: string;
  unavailableBody: string;
}

export function JournalDocumentRenderer({
  document,
  imagesByMediaId,
  unavailable = false,
  copy,
  className,
}: {
  document: JournalDocumentV1 | null;
  imagesByMediaId?: ReadonlyMap<string, JournalDocumentImageViewModel>;
  unavailable?: boolean;
  copy: JournalDocumentRendererCopy;
  className?: string;
}) {
  if (unavailable || !document) {
    return (
      <section
        data-journal-document="unavailable"
        className={cn("grid gap-2 font-sans", className)}
        aria-live="polite"
      >
        <h2 className="text-lg font-medium text-foreground">
          {copy.unavailableTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.unavailableBody}</p>
      </section>
    );
  }

  return (
    <div
      data-journal-document="v1"
      data-schema-version={document.schemaVersion}
      className={cn("grid gap-4 font-sans text-foreground", className)}
    >
      {document.blocks.map((block, index) => (
        <JournalDocumentBlockView
          key={block.id}
          block={block}
          image={
            block.type === "image"
              ? imagesByMediaId?.get(block.mediaAssetId)
              : undefined
          }
          imagePosition={
            block.type === "image"
              ? countImagesBefore(document.blocks, index) + 1
              : undefined
          }
        />
      ))}
    </div>
  );
}

function JournalDocumentBlockView({
  block,
  image,
  imagePosition,
}: {
  block: JournalDocumentBlock;
  image?: JournalDocumentImageViewModel;
  imagePosition?: number;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <p data-block-id={block.id} data-block-type="paragraph">
          <RichText spans={block.spans} />
        </p>
      );
    case "heading":
      if (block.level === 2) {
        return (
          <h2
            data-block-id={block.id}
            data-block-type="heading"
            data-level={2}
            className="text-xl font-medium tracking-tight"
          >
            <RichText spans={block.spans} />
          </h2>
        );
      }
      return (
        <h3
          data-block-id={block.id}
          data-block-type="heading"
          data-level={3}
          className="text-lg font-medium tracking-tight"
        >
          <RichText spans={block.spans} />
        </h3>
      );
    case "list":
      return block.style === "ordered" ? (
        <ol
          data-block-id={block.id}
          data-block-type="list"
          data-list-style="ordered"
          className="list-decimal space-y-1 pl-5"
        >
          {block.items.map((item, index) => (
            <ListItemView key={`${block.id}-${index}`} item={item} />
          ))}
        </ol>
      ) : (
        <ul
          data-block-id={block.id}
          data-block-type="list"
          data-list-style="unordered"
          className="list-disc space-y-1 pl-5"
        >
          {block.items.map((item, index) => (
            <ListItemView key={`${block.id}-${index}`} item={item} />
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          data-block-id={block.id}
          data-block-type="quote"
          className="border-l-2 border-border pl-4 italic"
        >
          <p>
            <RichText spans={block.spans} />
          </p>
          {block.attributionSpans && block.attributionSpans.length > 0 ? (
            <footer className="mt-2 text-sm not-italic text-muted-foreground">
              <RichText spans={block.attributionSpans} />
            </footer>
          ) : null}
        </blockquote>
      );
    case "delimiter":
      return (
        <hr
          data-block-id={block.id}
          data-block-type="delimiter"
          className="border-border"
        />
      );
    case "image": {
      if (!image?.src) {
        return (
          <figure
            data-block-id={block.id}
            data-block-type="image"
            data-media-missing="true"
            className="grid gap-2"
          />
        );
      }
      return (
        <figure
          data-block-id={block.id}
          data-block-type="image"
          data-media-asset-id={block.mediaAssetId}
          data-image-position={imagePosition}
          className="grid gap-2"
        >
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width ?? 1200}
            height={image.height ?? 900}
            className="h-auto w-full rounded-md object-cover"
          />
          {image.caption ? (
            <figcaption className="text-sm text-muted-foreground">
              {image.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}

function ListItemView({ item }: { item: JournalListItem }) {
  return (
    <li>
      <RichText spans={item.spans} />
      {item.items && item.items.length > 0 ? (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {item.items.map((nested, index) => (
            <ListItemView key={index} item={nested} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RichText({ spans }: { spans: readonly JournalTextSpan[] }) {
  return (
    <>
      {spans.map((span, index) => (
        <SpanView key={`${index}-${span.text.slice(0, 12)}`} span={span} />
      ))}
    </>
  );
}

function SpanView({ span }: { span: JournalTextSpan }) {
  const lines = span.text.split("\n");
  let node: ReactNode = lines.map((line, index) => (
    <span key={index}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));

  const marks = span.marks ?? [];
  // Innermost first for nesting: bold -> italic -> link.
  const ordered = [...marks].sort((a, b) => markNestRank(a) - markNestRank(b));
  for (const mark of ordered) {
    node = wrapMark(node, mark);
  }
  return <>{node}</>;
}

function wrapMark(node: ReactNode, mark: JournalInlineMark): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong>{node}</strong>;
    case "italic":
      return <em>{node}</em>;
    case "link":
      return isExternalHref(mark.href) ? (
        <a
          href={mark.href}
          rel="nofollow noopener noreferrer"
          target="_blank"
        >
          {node}
        </a>
      ) : (
        <Link href={mark.href}>{node}</Link>
      );
    default: {
      const _exhaustive: never = mark;
      void _exhaustive;
      return node;
    }
  }
}

function markNestRank(mark: JournalInlineMark): number {
  switch (mark.type) {
    case "bold":
      return 0;
    case "italic":
      return 1;
    case "link":
      return 2;
    default: {
      const _exhaustive: never = mark;
      void _exhaustive;
      return 9;
    }
  }
}

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function countImagesBefore(
  blocks: readonly JournalDocumentBlock[],
  index: number,
): number {
  let count = 0;
  for (let i = 0; i < index; i += 1) {
    if (blocks[i]?.type === "image") count += 1;
  }
  return count;
}
