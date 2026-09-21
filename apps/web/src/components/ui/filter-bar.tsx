"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@/components/icons/SlidersHorizontal";

import { Button } from "@/components/ui/button";
import { Chip, FilterChip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Link } from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The faceted filter bar every large catalogue on the web ships, and none of
 * the four this was drawn from puts an Apply button on desktop (DESIGN.md §5.1,
 * ADR-0031 D6).
 *
 * ## The URL vocabulary
 *
 * **One query parameter per facet, named for the facet, repeated for
 * multi-select, plus `sort` and `page`. Absent means unset.** No packed or
 * encoded composite parameter, ever: a filter that works but is absent from the
 * URL passes every interaction test and fails the moment a reader shares the
 * link, which is the actual job of a directory page. `OVE-451` reuses this
 * contract for the organism catalogue, so it is written here once.
 *
 * ## The three things that make it work without JavaScript
 *
 * 1. Every control lives inside one `<form method="get">` with a **real
 *    submit**. That is the mechanism; on-change is the enhancement layered
 *    over it. A crawler and a scripts-off reader get a working search page.
 *    The submit is the caller's search button — always present, at every
 *    width, and submitting the form submits the facets with it — plus the
 *    sheet's own Apply below `lg`. There is deliberately no `<noscript>`
 *    button and no submit that appears and then vanishes on hydration: the
 *    first risks a hydration mismatch inside an element the browser parses as
 *    text, and the second flashes a control at every reader on every load.
 * 2. After hydration a change to a facet or to the sort navigates through the
 *    router rather than submitting the form. That keeps the document — which
 *    is what lets the result count's live region announce the new number, since
 *    a region that arrives with a fresh document announces nothing. A caller
 *    with query-dependent Proxy rewrites opts into document navigation so the
 *    server resolves the correct route tree. Chip removals remain client links.
 * 3. The search field is **not** part of that: it submits on `Enter`. Pushing
 *    on every keystroke would announce a count per letter, and a live region
 *    that re-announces on every letter is worse than no count at all.
 *
 * Below `lg` the whole bar collapses into one button labelled with the active
 * count, opening a `Sheet` with Apply and Clear — the one place Apply earns its
 * keep, because a sheet hides the results it is filtering.
 */

export interface FilterBarOption {
  value: string;
  label: string;
  /** How many results this option would leave. Omitted when unknown. */
  count?: number;
  /**
   * That number in the reader's own language — `65 832`, not `65832`.
   *
   * The bar formats nothing (DESIGN.md §4.2.5): a component that formatted a
   * number would need the reader's locale, and then every consumer would have
   * to agree about where that comes from. It matters at catalogue scale, where
   * a six-figure count with no grouping is unreadable.
   */
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

export interface FilterBarLabels {
  /** Names the whole bar. */
  filters: string;
  /** "Фільтри (3)" — the caller formats the number into its own language. */
  openFilters: string;
  sheetDescription: string;
  apply: string;
  clear: string;
  clearAll: string;
  activeFilters: string;
  sort: string;
}

export interface FilterBarProps {
  /** The form's action: the listing's own address, with no query. */
  action: string;
  /** Let Proxy resolve a query-dependent route tree on the server. */
  documentNavigation?: boolean;
  facets: readonly FilterBarFacet[];
  sort?: {
    key: string;
    value: string;
    options: readonly FilterBarOption[];
    /**
     * The order this listing is in when nobody has chosen one. It is dropped
     * from the URL, because absent means unset and a default written out gives
     * one view two addresses.
     *
     * The caller computes it from the *current* request, which matters when a
     * listing's default depends on another parameter — the journals directory
     * orders a search by relevance and a browse by recency. A reader who types
     * a query without submitting it and then changes the sort gets an explicit
     * `sort=recent`, which is a real view rather than a wrong one.
     */
    defaultValue?: string;
  };
  /** The active filters, above the results. */
  chips?: readonly FilterBarChip[];
  /** Where "Clear all" leads. Absent hides it. */
  clearAllHref?: string;
  /** The search control, which the caller owns — see rule 3 above. */
  search?: React.ReactNode;
  /** Fields the form must carry that are not facets, e.g. `q`. */
  hidden?: Readonly<Record<string, string>>;
  labels: FilterBarLabels;
  className?: string;
}

function FilterBar({
  action,
  documentNavigation = false,
  facets,
  sort,
  chips = [],
  clearAllHref,
  search,
  hidden = {},
  labels,
  className,
}: FilterBarProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const id = useId();
  const activeCount = chips.length;

  /**
   * A facet changed, and the page is hydrated: navigate.
   *
   * Read off the form rather than from the event, so one handler serves every
   * control and the values it sends are exactly the ones the form would have
   * submitted. `page` is dropped, because the first page of a new filter is
   * the only page that exists yet.
   */
  const applyFromForm = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value !== "string" || value === "") continue;
      if (sort && key === sort.key && value === sort.defaultValue) continue;
      params.append(key, value);
    }
    params.delete("page");
    const query = params.toString();
    const target = query ? `${action}?${query}` : action;
    // A query twin changes the route tree. The client may otherwise reuse
    // the static document without asking Proxy which tree serves this query.
    if (documentNavigation) window.location.assign(target);
    else router.push(target);
  };

  return (
    <div
      data-slot="filter-bar"
      data-filter-bar-active={activeCount}
      className={cn("grid gap-3", className)}
    >
      <form
        ref={formRef}
        method="get"
        action={action}
        data-filter-bar-form="true"
        className="grid gap-3"
      >
        {Object.entries(hidden).map(([key, value]) =>
          value ? <HiddenField key={key} name={key} value={value} /> : null,
        )}

        {search ? <div className="min-w-0">{search}</div> : null}

        {/* Above `lg` the facets are inline and apply on change.
            Two columns rather than three: at 704 px three gave each select
            about 213 px, and "Усі публічні регіони" and "Усі ідентичності"
            both truncated — the Cyrillic budget of DESIGN.md §2.6 is that a
            label survives +40 % without truncating, and these did not. */}
        <div className="hidden gap-3 lg:grid lg:grid-cols-2 lg:items-end">
          {facets.map((facet) => (
            <FacetControl
              key={facet.key}
              facet={facet}
              idPrefix={id}
              onChange={() => {
                if (formRef.current) applyFromForm(formRef.current);
              }}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Below `lg` one button, and the facets move into the sheet. */}
          <div className="min-w-0 flex-1 lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    data-filter-bar-open="true"
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    {labels.openFilters}
                  </Button>
                }
              />
              <SheetContent side="bottom" closeLabel={labels.clear}>
                <SheetHeader>
                  <SheetTitle>{labels.filters}</SheetTitle>
                  <SheetDescription>{labels.sheetDescription}</SheetDescription>
                </SheetHeader>
                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
                  {facets.map((facet) => (
                    <FacetControl
                      key={facet.key}
                      facet={facet}
                      idPrefix={`${id}-sheet`}
                    />
                  ))}
                </div>
                <SheetFooter>
                  {clearAllHref ? (
                    <Link
                      href={clearAllHref}
                      variant="quiet"
                      className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-body-sm font-medium"
                    >
                      {labels.clear}
                    </Link>
                  ) : null}
                  {/* The one Apply the system keeps: a sheet hides the
                      results, so a reader needs to say when they are done. */}
                  <Button type="submit">{labels.apply}</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>

          {/* Sort is its own control on its own right-aligned row, and never
              inside the filter sheet (DESIGN.md §5.1). It carries `aria-label`
              rather than a `Field`: it is a control in a bar with no room for
              a label above it, which is the one case `Field`'s own contract
              sends elsewhere. */}
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
                  if (form) applyFromForm(form);
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
      </form>

      {chips.length > 0 ? (
        <div
          role="group"
          aria-label={labels.activeFilters}
          className="flex flex-wrap items-center gap-2"
        >
          {/* A real `<a href>`, so a chip removes its filter with the bundle
              absent and a reader can open the narrowed view in a new tab —
              and a *client* navigation once hydrated, which is what lets the
              count's live region announce the new number. A plain anchor
              replaces the document, and a live region that arrives with a
              fresh document announces nothing: measured, and it is why this
              is `Link` rather than `<a>`. */}
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

function FacetControl({
  facet,
  idPrefix,
  onChange,
}: {
  facet: FilterBarFacet;
  idPrefix: string;
  onChange?: () => void;
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
              name={facet.key}
              value={option.value}
              label={option.label}
              count={option.count}
              countLabel={option.countLabel}
              defaultChecked={facet.value.includes(option.value)}
              onChange={onChange}
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
        name={facet.key}
        defaultValue={facet.value[0] ?? ""}
        data-filter-bar-facet={facet.key}
        onChange={onChange}
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
