"use client";

import Link from "next/link";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import { startTransition, useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { localizedPath, PUBLIC_LOCALES } from "@/lib/public-localization";

/** The directory's three spellings: the only addresses `from` may name. */
const DIRECTORY_PATHS: ReadonlySet<string> = new Set(
  PUBLIC_LOCALES.map((locale) => localizedPath(locale, "/journals")),
);

/** What the directory's own request normalizer reads, and nothing else. */
const DIRECTORY_QUERY_KEYS = [
  "q",
  "kind",
  "catalog",
  "topic",
  "season",
  "region",
  "sort",
  "page",
] as const;
const MAX_VALUE_LENGTH = 256;

/**
 * The listing a reader came from, or `null` when `from` names anything else.
 *
 * Same-origin, no fragment, one of the directory's own addresses, and only the
 * parameters the directory reads, each once and bounded. The values are the
 * directory's to interpret: it normalizes every one of them again when it
 * renders, so nothing here has to understand them.
 */
export function readDirectoryReturnTarget(
  from: string | null,
  origin: string,
): string | null {
  if (!from || from.length > 1_500 || !from.startsWith("/")) return null;

  try {
    const url = new URL(from, origin);
    if (url.origin !== origin || url.hash) return null;
    if (!DIRECTORY_PATHS.has(url.pathname)) return null;

    const query = new URLSearchParams();
    for (const key of DIRECTORY_QUERY_KEYS) {
      const value = url.searchParams.get(key);
      if (!value || value.length > MAX_VALUE_LENGTH) continue;
      query.set(key, value);
    }
    const search = query.toString();
    return search ? `${url.pathname}?${search}` : url.pathname;
  } catch {
    return null;
  }
}

/**
 * "Back to the journals", to the listing the reader came from.
 *
 * A reader who opened an entry from a filtered directory arrives with
 * `?from=/journals?topic=…`, and this link takes them back to that view rather
 * than to the unfiltered one. The entry is a static document (ADR-0032), so
 * the page cannot read the query string; the document carries the plain
 * directory — a working link for everyone, a reader without JavaScript
 * included — and the exact view replaces it after hydration.
 */
export function DirectoryReturnLink({
  href,
  label,
}: {
  /** The directory itself: what the served document links to. */
  href: string;
  label: string;
}) {
  const [target, setTarget] = useState(href);

  useEffect(() => {
    const returnTarget = readDirectoryReturnTarget(
      new URLSearchParams(window.location.search).get("from"),
      window.location.origin,
    );
    if (!returnTarget) return;
    // A transition: the page around this link may still be hydrating
    // (ADR-0032 D2).
    startTransition(() => setTarget(returnTarget));
  }, []);

  return (
    <Link
      href={target}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <ArrowLeft aria-hidden="true" />
      {label}
    </Link>
  );
}
