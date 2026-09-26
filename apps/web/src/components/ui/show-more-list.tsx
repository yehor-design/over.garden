"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  SHOW_MORE_AUTO_PORTIONS,
  type ShowMoreCopy,
  type ShowMoreLoader,
  type ShowMoreNext,
} from "@/lib/show-more";
import { cn } from "@/lib/utils";

type ListTag = "ol" | "ul" | "div";

/**
 * A list read in portions, with «Показати ще» at its end (DESIGN.md §5.26).
 *
 * The first portion is the page's own server-rendered children. The link is a
 * plain `<a>` to the next portion's address, so without JavaScript it is a
 * page like any other and a crawler follows it. With JavaScript:
 *
 * - When the link comes within a screen of the viewport, the list's Server
 *   Function renders the next portion and it is appended in place, in the
 *   same list element; the link moves on to the portion after that.
 * - After `SHOW_MORE_AUTO_PORTIONS` portions in a row the link waits for a
 *   press, so the footer below the list stays reachable. A press loads the
 *   next portion and lets the following ones load by themselves again.
 * - Loading by scrolling never moves focus. A press moves focus to the first
 *   new item, and every appended portion is announced once, politely.
 * - While a portion loads the link stays where it is (focus on it is kept)
 *   and shows the busy indicator in its place.
 * - A failed fetch says so and leaves the link a link: pressing it now
 *   navigates to the next portion's address.
 */
export function ShowMoreList({
  as: Tag = "ol",
  className,
  children,
  next: initialNext,
  load,
  copy,
  label,
  ...props
}: {
  as?: ListTag;
  className?: string;
  /** The first portion's items, rendered by the page. */
  children: React.ReactNode;
  next: ShowMoreNext | null;
  load: ShowMoreLoader;
  copy: ShowMoreCopy;
  /** Names the list for the link's region, e.g. «Стрічка». */
  label?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">) {
  const [portions, setPortions] = useState<React.ReactNode[]>([]);
  const [next, setNext] = useState(initialNext);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  // A client navigation to another view of the same list (a space's overview
  // to its history, another filter) keeps this component: what it appended
  // and where it was going belong to the view it left.
  const origin = initialNext?.href ?? null;
  const [shownOrigin, setShownOrigin] = useState(origin);
  if (origin !== shownOrigin) {
    setShownOrigin(origin);
    setPortions([]);
    setNext(initialNext);
    setStatus("idle");
  }
  const [announcement, setAnnouncement] = useState({ text: "", key: 0 });
  const listRef = useRef<HTMLElement | null>(null);
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const autoLoaded = useRef(0);
  const focusFrom = useRef<number | null>(null);
  const inFlight = useRef(false);

  const loadNext = useCallback(
    async (pressed: boolean) => {
      if (!next || inFlight.current) return;
      inFlight.current = true;
      setStatus("loading");
      const before = listRef.current?.children.length ?? 0;
      try {
        const portion = await load(next.token);
        if (!portion) throw new Error("show_more_empty");
        focusFrom.current = pressed ? before : null;
        autoLoaded.current = pressed ? 0 : autoLoaded.current + 1;
        setPortions((current) => [...current, portion.items]);
        setNext(portion.next);
        setStatus("idle");
        setAnnouncement((current) => ({
          text: copy.added,
          key: current.key + 1,
        }));
      } catch {
        setStatus("failed");
      } finally {
        inFlight.current = false;
      }
    },
    [copy.added, load, next],
  );

  // A pressed portion hands focus to its first item, once it is in the list.
  useLayoutEffect(() => {
    const from = focusFrom.current;
    if (from === null) return;
    focusFrom.current = null;
    const first = listRef.current?.children.item(from);
    if (first instanceof HTMLElement) {
      if (!first.hasAttribute("tabindex")) first.tabIndex = -1;
      first.focus();
    }
  }, [portions]);

  // Within a screen of the viewport, the next portion loads by itself — a
  // fresh observer per link, so a link that is still in view after a short
  // portion is noticed again.
  useEffect(() => {
    const link = linkRef.current;
    if (!link || !next || status !== "idle") return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (autoLoaded.current >= SHOW_MORE_AUTO_PORTIONS) return;
        observer.disconnect();
        void loadNext(false);
      },
      { rootMargin: "0px 0px 100% 0px" },
    );
    observer.observe(link);
    return () => observer.disconnect();
  }, [loadNext, next, status]);

  const loading = status === "loading";
  return (
    <>
      <Tag
        ref={(node: HTMLElement | null) => {
          listRef.current = node;
        }}
        className={className}
        {...props}
      >
        {children}
        {portions.map((items, index) => (
          <Fragment key={index}>{items}</Fragment>
        ))}
      </Tag>
      {next ? (
        <div
          data-show-more={status}
          className="flex flex-col items-center gap-2 pt-2"
        >
          <a
            ref={linkRef}
            href={next.href}
            aria-label={label ? `${copy.more}: ${label}` : undefined}
            aria-disabled={loading || undefined}
            aria-busy={loading || undefined}
            data-show-more-link="true"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "w-full sm:w-auto",
              loading && "pointer-events-none",
            )}
            onClick={(event) => {
              // A failed fetch leaves a link: the press navigates.
              if (status === "failed") return;
              event.preventDefault();
              if (!loading) void loadNext(true);
            }}
          >
            {loading ? (
              <>
                <Spinner size="sm" />
                {copy.loading}
              </>
            ) : (
              copy.more
            )}
          </a>
          {status === "failed" ? (
            <p role="alert" className="text-body-sm text-danger-text">
              {copy.failed}
            </p>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only" data-show-more-announcement="">
        <span key={announcement.key}>{announcement.text}</span>
      </p>
    </>
  );
}
