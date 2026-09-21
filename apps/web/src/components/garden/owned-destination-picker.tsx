"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useOptionalOwnerScope } from "@/components/auth/owner-scope";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import { Button } from "@/components/ui/button";
import {
  ComboboxRoot,
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
  ComboboxClear,
} from "@/components/ui/combobox";
import {
  DESTINATION_COPY,
  DESTINATION_QUERY_LIMIT,
  destinationKey,
  destinationDetail,
  type DestinationFilter,
  type OwnedDestination,
  type OwnedDestinationPage,
} from "@/lib/garden/owned-destinations";
import type { InterfaceLocale } from "@/lib/interface-localization";

export function OwnedDestinationPicker({
  locale,
  selection,
  onSelect,
  kind = "all",
  disabled = false,
}: {
  locale: InterfaceLocale;
  selection: OwnedDestination | null;
  onSelect: (value: OwnedDestination) => void;
  kind?: DestinationFilter;
  disabled?: boolean;
}) {
  const copy = DESTINATION_COPY[locale];
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const scope = useOptionalOwnerScope();
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{
    query: string;
    cursor: string | null;
    page: OwnedDestinationPage;
  } | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "ready" | "error">(
    "idle",
  );
  const currentPage =
    result?.query === query && result.cursor === cursor ? result.page : null;
  const recent = currentPage?.recent ?? [];
  const recentKeys = new Set(recent.map(destinationKey));
  const rows = [
    ...recent,
    ...(currentPage?.items ?? []).filter(
      (item) => !recentKeys.has(destinationKey(item)),
    ),
  ];
  const visible = !disabled && open && status === "ready" && rows.length > 0;
  const activeId =
    visible && rows[active]
      ? `${id}-${destinationKey(rows[active])}`
      : undefined;

  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController();
    const delay = setTimeout(async () => {
      setStatus("pending");
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const params = new URLSearchParams({ q: query, kind });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/garden/destinations?${params}`, {
          signal: controller.signal,
          headers: scopeRef.current?.headers() ?? ownerScopeHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          await scopeRef.current?.handleResponse(response);
          throw new Error("Destination search unavailable");
        }
        const page: OwnedDestinationPage = await response.json();
        if (!controller.signal.aborted) {
          setResult({ query, cursor, page });
          setStatus("ready");
          setActive(-1);
        }
      } catch {
        // A timeout is an error; cleanup below suppresses obsolete responses.
        if (!disposed) setStatus("error");
      } finally {
        clearTimeout(timeout);
      }
    }, 180);
    let disposed = false;
    return () => {
      disposed = true;
      clearTimeout(delay);
      controller.abort();
    };
  }, [query, cursor, kind, attempt, open, disabled]);

  function choose(value: OwnedDestination) {
    if (disabled) return;
    onSelect(value);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  }
  function search(value: string) {
    setQuery(value);
    setCursor(null);
    setActive(-1);
    setOpen(true);
    setStatus("pending");
  }
  return (
    <div
      data-owned-destination-picker={kind}
      className="grid min-w-0 content-start gap-2 self-start"
    >
      <label htmlFor={id} className="text-body-sm font-medium text-text">
        {kind === "space" ? copy.spaces : copy.label}
      </label>
      {selection ? (
        <p
          data-destination-selection={destinationKey(selection)}
          className="text-body-sm break-words text-text"
        >
          <span className="text-text-muted">{copy.selected}: </span>
          {selection.displayName}
          <span className="block text-caption text-text-muted">
            {destinationDetail(selection, locale)}
          </span>
        </p>
      ) : null}
      <ComboboxRoot>
        <ComboboxInput
          ref={input}
          id={id}
          value={query}
          maxLength={DESTINATION_QUERY_LIMIT}
          disabled={disabled}
          placeholder={kind === "space" ? copy.spaces : copy.placeholder}
          aria-expanded={visible}
          aria-controls={`${id}-list`}
          aria-activedescendant={activeId}
          aria-describedby={`${id}-status`}
          onChange={(event) => search(event.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={(event) => {
            if (
              !event.currentTarget
                .closest("[data-owned-destination-picker]")
                ?.contains(event.relatedTarget)
            ) {
              setOpen(false);
              setActive(-1);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (rows.length)
                setActive((previous) =>
                  previous < 0
                    ? event.key === "ArrowDown"
                      ? 0
                      : rows.length - 1
                    : (previous +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        rows.length) %
                      rows.length,
                );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (activeId && rows[active]) choose(rows[active]);
            }
          }}
        />
        {query ? (
          <ComboboxClear
            label={copy.clear}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              search("");
              input.current?.focus();
            }}
          />
        ) : null}
      </ComboboxRoot>
      <p
        id={`${id}-status`}
        role="status"
        className="text-caption text-text-muted"
      >
        {open && status === "pending"
          ? copy.loading
          : open && status === "error"
            ? copy.error
            : open && status === "ready" && !rows.length
              ? copy.empty
              : ""}
      </p>
      {open && status === "error" ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {copy.retry}
        </Button>
      ) : null}
      <ComboboxList
        id={`${id}-list`}
        aria-label={copy.browse}
        hidden={!visible}
      >
        {rows.map((row, index) => (
          <ComboboxOption
            key={destinationKey(row)}
            id={`${id}-${destinationKey(row)}`}
            active={index === active}
            selected={
              !!selection && destinationKey(row) === destinationKey(selection)
            }
            className="min-h-11 break-words"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(row)}
          >
            <span className="block font-medium">{row.displayName}</span>
            <span className="block text-caption text-text-muted">
              {destinationDetail(row, locale)}
            </span>
            {index < recent.length ? (
              <span className="block text-caption text-text-muted">
                {copy.recent}
              </span>
            ) : null}
          </ComboboxOption>
        ))}
      </ComboboxList>
      {visible && currentPage?.nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setCursor(currentPage.nextCursor);
            setActive(-1);
            setStatus("pending");
            input.current?.focus();
          }}
        >
          {copy.more}
        </Button>
      ) : null}
      {open && cursor ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setCursor(null);
            setActive(-1);
            input.current?.focus();
          }}
        >
          {copy.browse}
        </Button>
      ) : null}
    </div>
  );
}
