import Link from "next/link";
import type { ReactNode } from "react";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  journalMarkRank,
  type JournalDocumentBlock,
  type JournalDocumentV1,
  type JournalInlineMark,
  type JournalListBlock,
  type JournalListItem,
  type JournalTextSpan,
} from "@/lib/garden/journal-document";
import { cn } from "@/lib/utils";

export interface JournalDocumentImageViewModel {
  mediaAssetId: string;
  src: string;
  alt: string;
  caption: string | null;
  width?: number;
  height?: number;
  focalX?: number | null;
  focalY?: number | null;
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
      // The page's one `h1` is the entry title, so the document's largest
      // heading is an `h2` that is merely typeset larger. `data-level` keeps
      // the document's own level addressable; levels 2 and 3 render exactly the
      // tags and classes they always have.
      if (block.level === 1) {
        return (
          <h2
            data-block-id={block.id}
            data-block-type="heading"
            data-level={1}
            className="text-2xl font-semibold tracking-tight"
          >
            <RichText spans={block.spans} />
          </h2>
        );
      }
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
    case "list": {
      const items = block.items.map((item, index) => (
        <ListItemView
          key={`${block.id}-${index}`}
          item={item}
          listStyle={block.style}
        />
      ));
      if (block.style === "ordered") {
        return (
          <ol
            data-block-id={block.id}
            data-block-type="list"
            data-list-style="ordered"
            className="list-decimal space-y-1 pl-5"
          >
            {items}
          </ol>
        );
      }
      if (block.style === "todo") {
        return (
          <ul
            data-block-id={block.id}
            data-block-type="list"
            data-list-style="todo"
            className="grid list-none gap-1 pl-0"
          >
            {items}
          </ul>
        );
      }
      return (
        <ul
          data-block-id={block.id}
          data-block-type="list"
          data-list-style="unordered"
          className="list-disc space-y-1 pl-5"
        >
          {items}
        </ul>
      );
    }
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
            <footer className="mt-2 text-sm text-muted-foreground not-italic">
              <RichText spans={block.attributionSpans} />
            </footer>
          ) : null}
        </blockquote>
      );
    case "callout":
      // `role="note"` rather than `aside`: several callouts in one entry would
      // otherwise each become a complementary landmark in a screen reader's
      // landmark list, which is noise, not structure.
      return (
        <div
          data-block-id={block.id}
          data-block-type="callout"
          data-icon={block.icon}
          role="note"
          className="flex gap-3 rounded-md border border-border bg-muted/40 p-3"
        >
          <span aria-hidden="true" className="shrink-0 select-none">
            {block.icon}
          </span>
          <p className="min-w-0">
            <RichText spans={block.spans} />
          </p>
        </div>
      );
    case "code":
      return (
        <pre
          data-block-id={block.id}
          data-block-type="code"
          data-language={block.language}
          className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-sm leading-6 whitespace-pre-wrap"
        >
          <code className={`language-${block.language}`}>{block.text}</code>
        </pre>
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
          <SubjectAwareMediaImage
            src={image.src}
            alt={image.alt}
            width={image.width ?? 1200}
            height={image.height ?? 900}
            presentationMode="contain"
            focalX={image.focalX}
            focalY={image.focalY}
            intrinsicWidth={image.width ?? null}
            intrinsicHeight={image.height ?? null}
            className="h-auto w-full rounded-md"
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

function ListItemView({
  item,
  listStyle,
}: {
  item: JournalListItem;
  listStyle: JournalListBlock["style"];
}) {
  const nested =
    item.items && item.items.length > 0 ? (
      <ul
        className={
          listStyle === "todo"
            ? "mt-1 grid list-none gap-1 pl-6"
            : "mt-1 list-disc space-y-1 pl-5"
        }
      >
        {item.items.map((child, index) => (
          <ListItemView key={index} item={child} listStyle={listStyle} />
        ))}
      </ul>
    ) : null;

  if (listStyle === "todo") {
    const checked = item.checked ?? false;
    return (
      <li data-checked={checked ? "true" : "false"}>
        {/* The label gives the disabled checkbox its accessible name, so the
            state is announced with the text it belongs to and no script runs. */}
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={checked}
            disabled
            readOnly
            className="mt-1.5 size-4 shrink-0 accent-primary"
          />
          <span
            className={
              checked ? "min-w-0 text-muted-foreground line-through" : "min-w-0"
            }
          >
            <RichText spans={item.spans} />
          </span>
        </label>
        {nested}
      </li>
    );
  }

  return (
    <li>
      <RichText spans={item.spans} />
      {nested}
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
  // Innermost first: code -> bold -> italic -> underline -> strikethrough ->
  // link, the one order the contract also normalizes to.
  const ordered = [...marks].sort(
    (a, b) => journalMarkRank(a.type) - journalMarkRank(b.type),
  );
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
    case "underline":
      return <u>{node}</u>;
    case "strikethrough":
      return <s>{node}</s>;
    case "code":
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono">{node}</code>
      );
    case "link":
      return isExternalHref(mark.href) ? (
        <a href={mark.href} rel="nofollow noopener noreferrer" target="_blank">
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
