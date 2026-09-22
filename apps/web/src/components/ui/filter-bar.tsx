"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@/components/icons/SlidersHorizontal";
import { XIcon } from "@/components/icons/X";

import { Button } from "@/components/ui/button";
import { Chip, FilterChip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Link } from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The discovery bar every public listing shares (DESIGN.md §5.1, `OVE-482`).
 *
 * Three tiers, never six equally loud controls:
 *
 * 1. **Search** — the caller's field and its own submit, the widest control.
 * 2. **Modes** — the one primary split of a listing (plants and animals, say),
 *    as plain links with `aria-current`. It lives here and nowhere else, so a
 *    reader never finds the same choice twice.
 * 3. **Filters (n)** — every secondary facet behind one button that states
 *    how many are applied. The panel is a *draft*: nothing changes until
 *    "Show results"; Close (and Escape, and a tap outside) discards the draft
 *    and leaves the committed view exactly as it was. "Clear filters" removes
 *    the secondary facets only, and keeps the query, the mode and the sort.
 *
 * Sort stays its own control and applies on change.
 *
 * ## The URL vocabulary
 *
 * **One query parameter per facet, named for the facet, repeated for
 * multi-select, plus `sort` and `page`. Absent means unset.** No packed or
 * encoded composite parameter: a filter absent from the URL fails the moment a
 * reader shares the link.
 *
 * ## Why it works without JavaScript
 *
 * The panel is a native `popover`, opened by `popovertarget` — the browser
 * opens and closes it with no bundle, and it stays where it is in the DOM, so
 * its controls belong to a real `<form method="get">`. Two forms, siblings:
 *
 * - the **bar** form carries the search field, the sort, the mode and the
 *   *committed* facet values as hidden fields, so searching never drops a
 *   filter;
 * - the **panel** form carries the draft facets plus the committed query,
 *   mode and sort, so applying never drops a search.
 *
 * Hydrated, every change goes through the router (or a document navigation for
 * a listing whose query view is a `/q` twin, ADR-0032), which keeps the count's
 * live region in the document so the new number is announced.
 */

export interface FilterBarOption {
  value: string;
  label: string;
  /** How many results this option would leave. Omitted when unknown. */
  count?: number;
  /** That number in the reader's own language; the bar formats nothing. */
  countLabel?: string;
}

export interface FilterBarFacet {
  /** The URL parameter name. This *is* the facet's name (see above). */
  key: string;
  label: string;
  /** Selected values. Empty means unset, and the parameter is absent. */
  value: readonly string[];
  options: readonly FilterBarOption[];
  /** A facet whose parameter may repeat. Single-select is the default. */
  multiple?: boolean;
  /** The option that means "no filter", for a single-select facet. */
  anyLabel?: string;
}

export interface FilterBarChip {
  key: string;
  label: string;
  /** Where removing this one filter leads. A real href, so it works unhydrated. */
  removeHref: string;
  removeLabel: string;
}

export interface FilterBarMode {
  label: string;
  /** The listing with this mode, the other parameters kept and `page` dropped. */
  href: string;
  current: boolean;
  /** How many results the mode holds, in the reader's language. */
  countLabel?: string;
}

export interface FilterBarLabels {
  /** Names the panel and the bar. */
  filters: string;
  /** "Фільтри (2)": the caller formats the applied count into its language. */
  openFilters: string;
  sheetDescription: string;
  /** The panel's submit: "Show results". */
  apply: string;
  /** The panel's Close. Discards the draft; never a reset. */
  close: string;
  /** Removes the secondary facets and keeps query, mode and sort. */
  clear: string;
  /** Beside the chips: removes everything, the query included. */
  clearAll: string;
  activeFilters: string;
  sort: string;
  /** Names the modes navigation. */
  modes?: string;
  /** Announced while a hydrated change is on its way. */
  pending?: string;
}

export interface FilterBarProps {
  /** The form's action: the listing's own address, with no query. */
  action: string;
  /** Let Proxy resolve a query-dependent route tree on the server. */
  documentNavigation?: boolean;
  /** The secondary facets, behind "Filters (n)". */
  facets: readonly FilterBarFacet[];
  /** The listing's primary split, as links. */
  modes?: readonly FilterBarMode[];
  sort?: {
    key: string;
    value: string;
    options: readonly FilterBarOption[];
    /** Dropped from the URL, because a default written out gives one view two addresses. */
    defaultValue?: string;
  };
  /** The active filters, above the results. */
  chips?: readonly FilterBarChip[];
  /** Where "Clear all" beside the chips leads. Absent hides it. */
  clearAllHref?: string;
  /** Where the panel's "Clear filters" leads: query, mode and sort kept. */
  clearFiltersHref?: string;
  /** The search control, which the caller owns. It submits on Enter. */
  search?: React.ReactNode;
  /** Fields both forms carry that are not facets, e.g. the mode or a letter. */
  hidden?: Readonly<Record<string, string>>;
  /**
   * Committed values the panel form must carry and the bar form already has
   * as a control — the query. Without it, applying a filter with scripts off
   * would drop the search.
   */
  carry?: Readonly<Record<string, string>>;
  labels: FilterBarLabels;
  className?: string;
}

function FilterBar({
  action,
  documentNavigation = false,
  facets,
  modes = [],
  sort,
  chips = [],
  clearAllHref,
  clearFiltersHref,
  search,
  hidden = {},
  carry = {},
  labels,
  className,
}: FilterBarProps) {
  const router = useRouter();
  const barFormRef = useRef<HTMLFormElement | null>(null);
  const panelFormRef = useRef<HTMLFormElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);
  const id = useId();
  const panelId = `${id}-filters`;
  const panelFormId = `${id}-filters-form`;
  const titleId = `${id}-filters-title`;
  const appliedCount = facets.filter((facet) => facet.value.length > 0).length;
  const busy = pending || navigating;

  const navigate = (params: URLSearchParams) => {
    params.delete("page");
    if (sort && params.get(sort.key) === sort.defaultValue) {
      params.delete(sort.key);
    }
    const query = params.toString();
    const target = query ? `${action}?${query}` : action;
    // A query twin changes the route tree. The client may otherwise reuse
    // the static document without asking Proxy which tree serves this query.
    if (documentNavigation) {
      setNavigating(true);
      window.location.assign(target);
      return;
    }
    startTransition(() => router.push(target));
  };

  const paramsFrom = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value !== "string" || value === "") continue;
      params.append(key, value);
    }
    return params;
  };

  /**
   * Close without applying: put every draft control back to the committed
   * value, so the next open shows what the results actually reflect.
   */
  const discardDraft = () => {
    const form = panelFormRef.current;
    if (!form) return;
    for (const element of Array.from(form.elements)) {
      if (element instanceof HTMLSelectElement) {
        for (const option of Array.from(element.options)) {
          option.selected = option.defaultSelected;
        }
      } else if (
        element instanceof HTMLInputElement &&
        element.type === "checkbox"
      ) {
        element.checked = element.defaultChecked;
      }
    }
  };

  return (
    <div
      data-slot="filter-bar"
      data-filter-bar-active={appliedCount}
      data-filter-bar-pending={busy ? "true" : undefined}
      aria-busy={busy || undefined}
      className={cn("grid gap-3", className)}
    >
      <form
        ref={barFormRef}
        method="get"
        action={action}
        data-filter-bar-form="true"
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(paramsFrom(event.currentTarget));
        }}
      >
        {Object.entries(hidden).map(([key, value]) =>
          value ? <HiddenField key={key} name={key} value={value} /> : null,
        )}
        {facets.flatMap((facet) =>
          facet.value.map((value) => (
            <HiddenField
              key={`${facet.key}=${value}`}
              name={facet.key}
              value={value}
            />
          )),
        )}

        {search ? <div className="min-w-0">{search}</div> : null}

        {modes.length > 0 ? (
          <nav
            aria-label={labels.modes ?? labels.filters}
            data-filter-bar-modes="true"
          >
            {/* Wraps rather than scrolls: a long Bulgarian label must never
                hide the next mode behind a scrollbar. */}
            <ul className="flex list-none flex-wrap gap-2">
              {modes.map((mode) => (
                <li key={mode.href}>
                  <ModeLink mode={mode} document={documentNavigation} />
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {facets.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              popoverTarget={panelId}
              aria-haspopup="dialog"
              data-filter-bar-open="true"
            >
              <SlidersHorizontal aria-hidden="true" />
              {labels.openFilters}
            </Button>
          ) : null}

          {/* Sort is its own control and never inside the filters. It carries
              `aria-label`: a bar has no room for a label above it. */}
          {sort ? (
            <div className="ml-auto w-full min-w-0 sm:w-56">
              <Select
                name={sort.key}
                id={`${id}-sort`}
                aria-label={labels.sort}
                defaultValue={sort.value}
                data-filter-bar-sort="true"
                onChange={(event) => {
                  const form = event.currentTarget.form;
                  if (form) navigate(paramsFrom(form));
                }}
              >
                {sort.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        {facets.length > 0 ? (
          <div
            ref={panelRef}
            id={panelId}
            popover="auto"
            role="dialog"
            aria-labelledby={titleId}
            data-slot="filter-panel"
            onToggle={(event) => {
              if ((event as unknown as ToggleEvent).newState === "closed") {
                discardDraft();
              }
            }}
            className={cn(
              "fixed inset-x-0 top-auto bottom-0 m-0 max-h-svh w-full max-w-none flex-col gap-0 border-0 border-t border-border bg-surface p-0 text-body-sm text-text shadow-overlay open:flex",
              "lg:inset-x-auto lg:top-0 lg:right-0 lg:bottom-0 lg:h-dvh lg:max-h-none lg:max-w-sm lg:border-t-0 lg:border-l",
              "backdrop:bg-surface-inverse/30",
            )}
          >
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="grid gap-1">
                <h2 id={titleId} className="text-h3 text-text-heading">
                  {labels.filters}
                </h2>
                <p className="text-body-sm text-text-muted">
                  {labels.sheetDescription}
                </p>
              </div>
              <button
                type="button"
                popoverTarget={panelId}
                popoverTargetAction="hide"
                aria-label={labels.close}
                data-filter-bar-close="true"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <XIcon aria-hidden="true" className="size-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 pb-4">
              {facets.map((facet) => (
                <FacetControl
                  key={facet.key}
                  facet={facet}
                  idPrefix={`${id}-panel`}
                  form={panelFormId}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-4">
              {clearFiltersHref ? (
                <Link
                  href={clearFiltersHref}
                  variant="quiet"
                  data-filter-bar-clear="true"
                  className="mr-auto inline-flex min-h-11 items-center justify-center rounded-md px-3 text-body-sm font-medium"
                >
                  {labels.clear}
                </Link>
              ) : null}
              <Button type="submit" form={panelFormId}>
                {labels.apply}
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      {facets.length > 0 ? (
        <form
          ref={panelFormRef}
          id={panelFormId}
          method="get"
          action={action}
          data-filter-bar-panel-form="true"
          hidden
          onSubmit={(event) => {
            event.preventDefault();
            panelRef.current?.hidePopover?.();
            navigate(paramsFrom(event.currentTarget));
          }}
        >
          {Object.entries({ ...hidden, ...carry }).map(([key, value]) =>
            value ? <HiddenField key={key} name={key} value={value} /> : null,
          )}
          {sort && sort.value !== sort.defaultValue ? (
            <HiddenField name={sort.key} value={sort.value} />
          ) : null}
        </form>
      ) : null}

      {busy && labels.pending ? (
        <p
          role="status"
          data-filter-bar-status="pending"
          className="text-body-sm text-text-muted"
        >
          {labels.pending}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <div
          role="group"
          aria-label={labels.activeFilters}
          className="flex flex-wrap items-center gap-2"
        >
          {/* A real `<a href>`, so a chip removes its filter unhydrated, and a
              client navigation once hydrated, which keeps the count's live
              region in the document. */}
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.removeHref}
              variant="quiet"
              aria-label={chip.removeLabel}
              className="rounded-full"
            >
              <Chip label={chip.label} />
            </Link>
          ))}
          {chips.length > 1 && clearAllHref ? (
            <Link
              href={clearAllHref}
              className="inline-flex min-h-8 items-center rounded-md px-2 text-body-sm font-medium"
            >
              {labels.clearAll}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One mode. A listing whose query views are `/q` twins gets a plain anchor: a
 * client navigation could reuse the static document without asking Proxy
 * which route tree serves the query (ADR-0032).
 */
function ModeLink({
  mode,
  document,
}: {
  mode: FilterBarMode;
  document: boolean;
}) {
  const className = cn(
    "inline-flex min-h-11 items-center rounded-full border px-4 text-body-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    mode.current
      ? "border-action bg-action-subtle text-action-subtle-text"
      : "border-border-control text-text hover:bg-surface-hover",
  );
  const shared = {
    "aria-current": mode.current ? ("page" as const) : undefined,
    "data-filter-bar-mode": mode.current ? "current" : "other",
    className,
  };
  const content = (
    <>
      {mode.label}
      {mode.countLabel ? (
        <span className="ml-2 text-caption text-text-muted tabular-nums">
          {mode.countLabel}
        </span>
      ) : null}
    </>
  );
  return document ? (
    <a href={mode.href} {...shared}>
      {content}
    </a>
  ) : (
    <Link href={mode.href} variant="quiet" {...shared}>
      {content}
    </Link>
  );
}

function FacetControl({
  facet,
  idPrefix,
  form,
}: {
  facet: FilterBarFacet;
  idPrefix: string;
  form: string;
}) {
  const controlId = `${idPrefix}-${facet.key}`;
  if (facet.multiple) {
    return (
      <fieldset className="grid min-w-0 gap-2">
        <legend className="text-body-sm font-medium text-text">
          {facet.label}
        </legend>
        <div className="flex flex-wrap gap-2">
          {facet.options.map((option) => (
            <FilterChip
              key={option.value}
              form={form}
              name={facet.key}
              value={option.value}
              label={option.label}
              count={option.count}
              countLabel={option.countLabel}
              defaultChecked={facet.value.includes(option.value)}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <Field label={facet.label} id={controlId} className="min-w-0">
      <Select
        id={controlId}
        form={form}
        name={facet.key}
        defaultValue={facet.value[0] ?? ""}
        data-filter-bar-facet={facet.key}
      >
        <option value="">{facet.anyLabel ?? facet.label}</option>
        {facet.options.map((option) => (
          <option key={option.value} value={option.value}>
            {(option.countLabel ?? typeof option.count === "number")
              ? `${option.label} (${option.countLabel ?? option.count})`
              : option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export { FilterBar };
