"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon as CheckCircle } from "@/components/icons/CheckCircle";

import { materializeCatalogNodeAction } from "@/app/(default)/garden/catalog-full-catalogue-actions";
import { CatalogPicker } from "@/components/garden/catalog-picker";
import { OwnedDestinationPicker } from "@/components/garden/owned-destination-picker";
import {
  ProgressiveActions,
  ProgressiveStep,
} from "@/components/garden/progressive-steps";
import { SpaceSetupFlow } from "@/components/garden/space-setup-flow";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Link } from "@/components/ui/link";
import { RadioCard } from "@/components/ui/radio-card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PlantObjectKind } from "@/db/schema";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import { objectKindAfterPickerSelection } from "@/lib/garden/catalog-object-kind";
import {
  catalogItemIdForSelection,
  catalogLabelForSelection,
  type CatalogPickerSelection,
} from "@/lib/garden/catalog-typeahead-contract";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import {
  gardenObjectWritePath,
  validateObjectSetup,
  type CreatedObject,
  type ObjectSetupResponse,
} from "@/lib/garden/object-setup";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getObjectSetupCopy } from "@/lib/object-setup-copy";

type Step = "kind" | "name" | "space" | "review";
const STEPS: readonly Step[] = ["kind", "name", "space", "review"];

export interface OwnedMatch {
  id: string;
  displayName: string;
  spaceName: string;
}

type Outcome =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "created"; object: CreatedObject; replayed: boolean }
  | { kind: "duplicate"; existing: CreatedObject }
  | { kind: "failed" }
  | { kind: "uncertain" }
  | { kind: "conflict" }
  | { kind: "signed-out" };

/**
 * Add a plant or an animal in four short questions (`OVE-485`): what it is,
 * what it is called — the name field *is* the catalogue search, and a pick
 * links the shared organism while an own name is kept as it is — which space
 * it lives in, and a review. Answered questions fold into one line and reopen
 * with "Change"; nothing typed or picked is lost by moving between them, or by
 * creating a space on the way (the space flow opens in a sheet over this one).
 *
 * Launched from the catalogue, the organism is already chosen, and the
 * gardener's own objects of that organism come first: writing about the
 * tomato they have must not start a second one (criterion 4).
 *
 * "Add" writes one object and says so. It publishes nothing: the first entry
 * is its own publication, from the object's page.
 */
export function ObjectSetupFlow({
  locale,
  initialSelection = null,
  initialObjectKind = "plant",
  initialSpace = null,
  matches = [],
  returnTo = null,
}: {
  locale: InterfaceLocale;
  /** The organism a catalogue launch names. */
  initialSelection?: FirstEntryCatalogSelection | null;
  initialObjectKind?: PlantObjectKind;
  /** A space handed back by space setup, already chosen. */
  initialSpace?: { id: string; displayName: string } | null;
  /** The gardener's own objects of the launched organism. */
  matches?: readonly OwnedMatch[];
  returnTo?: string | null;
}) {
  const copy = getObjectSetupCopy(locale);
  const pickerCopy = getGardenWorkspaceCopy(locale).composer;
  const launchedWithOrganism = Boolean(initialSelection);
  const [showFlow, setShowFlow] = useState(matches.length === 0);
  const [objectKind, setObjectKind] =
    useState<PlantObjectKind>(initialObjectKind);
  const [name, setName] = useState(initialSelection?.displayName ?? "");
  const [selection, setSelection] = useState<CatalogPickerSelection | null>(
    initialSelection ? { kind: "item", row: initialSelection } : null,
  );
  const [space, setSpace] = useState<{
    id: string;
    displayName: string;
  } | null>(initialSpace);
  const [step, setStep] = useState<Step>(
    launchedWithOrganism ? (initialSpace ? "review" : "space") : "kind",
  );
  const [reached, setReached] = useState<Set<Step>>(
    () =>
      new Set<Step>(
        launchedWithOrganism
          ? initialSpace
            ? ["kind", "name", "space", "review"]
            : ["kind", "name", "space"]
          : ["kind"],
      ),
  );
  const [errors, setErrors] = useState<ReturnType<typeof validateObjectSetup>>(
    {},
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [spaceSheetOpen, setSpaceSheetOpen] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const headingRefs = useRef<Record<Step, HTMLHeadingElement | null>>({
    kind: null,
    name: null,
    space: null,
    review: null,
  });
  const resultRef = useRef<HTMLDivElement | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    if (step === "name") {
      document
        .querySelector<HTMLInputElement>("[data-object-setup-name] input")
        ?.focus();
    } else {
      headingRefs.current[step]?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (outcome.kind !== "idle" && outcome.kind !== "pending") {
      resultRef.current?.focus();
    }
  }, [outcome.kind]);

  const open = (next: Step) => {
    moved.current = true;
    setReached((current) => new Set([...current, next]));
    setStep(next);
  };

  const check = (fields: Array<"name" | "space">) => {
    const all = validateObjectSetup({ displayName: name, spaceId: space?.id });
    const found = Object.fromEntries(
      fields.filter((field) => all[field]).map((field) => [field, all[field]]),
    );
    setErrors(found);
    if (found.name) {
      open("name");
      return false;
    }
    if (found.space) {
      open("space");
      return false;
    }
    return true;
  };

  const updateSelection = (next: CatalogPickerSelection | null) => {
    setSelection(next);
    if (next?.kind === "item") {
      // The picker is the name field, so a pick names the object; editing the
      // name afterwards returns it to the gardener's own words.
      setName(next.row.displayName);
      setObjectKind((current) =>
        objectKindAfterPickerSelection(current, next.row.kind),
      );
    }
    if (outcome.kind !== "pending") setOutcome({ kind: "idle" });
  };

  const submit = async (allowDuplicateName = false) => {
    if (!check(["name", "space"]) || !space) return;
    if (outcome.kind === "pending") return;
    setNotice(null);
    setOutcome({ kind: "pending" });
    let response: Response;
    try {
      response = await fetch("/api/garden/objects", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", ...ownerScopeHeaders() },
        body: JSON.stringify({
          requestId,
          objectKind,
          displayName: name,
          spaceId: space.id,
          catalogItemId: catalogItemIdForSelection(selection),
          catalogLabel: catalogLabelForSelection(selection),
          allowDuplicateName,
        }),
      });
    } catch {
      setOutcome({ kind: "uncertain" });
      return;
    }
    if (response.status === 401 || response.status === 403) {
      setOutcome({ kind: "signed-out" });
      return;
    }
    let body: ObjectSetupResponse | null = null;
    try {
      body = (await response.json()) as ObjectSetupResponse;
    } catch {
      body = null;
    }
    if (!body) {
      setOutcome({ kind: response.status >= 500 ? "uncertain" : "failed" });
      return;
    }
    switch (body.status) {
      case "created":
        setOutcome({
          kind: "created",
          object: body.object,
          replayed: body.replayed,
        });
        if (returnTo) {
          const url = new URL(returnTo, window.location.origin);
          url.searchParams.set("object", body.object.id);
          window.location.assign(`${url.pathname}${url.search}${url.hash}`);
        }
        return;
      case "duplicate_name":
        setOutcome({ kind: "duplicate", existing: body.existing });
        return;
      case "space_unavailable":
        setOutcome({ kind: "idle" });
        setSpace(null);
        setNotice(copy.result.spaceUnavailable);
        open("space");
        return;
      case "identity_unavailable":
        setOutcome({ kind: "idle" });
        setSelection(null);
        setNotice(copy.result.identityUnavailable);
        open("name");
        return;
      case "invalid":
        setOutcome({ kind: "idle" });
        check(["name", "space"]);
        return;
      case "conflict":
        setOutcome({ kind: "conflict" });
        return;
      default:
        setOutcome({ kind: "uncertain" });
    }
  };

  if (outcome.kind === "created") {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        data-object-setup-result="created"
        data-object-id={outcome.object.id}
        className="grid gap-4 rounded-lg border border-border p-5 outline-none"
      >
        <p className="flex items-start gap-2 text-h3 text-text-heading">
          <CheckCircle
            aria-hidden="true"
            className="mt-1 size-5 shrink-0 text-success-text"
          />
          {copy.result.created(
            outcome.object.displayName,
            outcome.object.space.displayName,
          )}
        </p>
        <p className="text-body-sm text-text-muted">
          {outcome.replayed ? copy.result.replayed : copy.result.createdBody}
        </p>
        {returnTo ? null : (
          <div className="flex flex-wrap gap-2">
            <Link
              href={gardenObjectWritePath(outcome.object.id)}
              className={buttonVariants({})}
              data-object-setup-write="true"
            >
              {copy.result.write}
            </Link>
            <Link
              href="/garden#inventory"
              className={buttonVariants({ variant: "secondary" })}
            >
              {copy.result.toGarden}
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (!showFlow) {
    return (
      <section
        data-object-setup-matches="true"
        aria-labelledby="object-setup-matches-title"
        className="grid gap-3 rounded-lg border border-border p-4 sm:p-5"
      >
        <h2
          id="object-setup-matches-title"
          className="text-h3 text-text-heading"
        >
          {copy.matches.title(initialSelection?.displayName ?? name)}
        </h2>
        <p className="text-body-sm text-text-muted">{copy.matches.body}</p>
        <ul className="grid gap-2">
          {matches.map((match) => (
            <li
              key={match.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="min-w-0 text-body-sm">
                <span className="font-medium text-text">
                  {match.displayName}
                </span>{" "}
                <span className="text-text-muted">
                  {copy.matches.inSpace(match.spaceName)}
                </span>
              </span>
              <Link
                href={gardenObjectWritePath(match.id)}
                className={buttonVariants({ size: "sm" })}
                aria-label={`${copy.matches.write}: ${match.displayName}, ${copy.matches.inSpace(match.spaceName)}`}
              >
                {copy.matches.write}
              </Link>
            </li>
          ))}
        </ul>
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              moved.current = true;
              setShowFlow(true);
            }}
            data-object-setup-add-another="true"
          >
            {copy.matches.addAnother}
          </Button>
        </div>
      </section>
    );
  }

  const pending = outcome.kind === "pending";
  const identitySummary =
    selection?.kind === "item"
      ? copy.name.organism(selection.row.displayName)
      : selection?.kind === "own_name"
        ? copy.name.ownLabel(selection.name)
        : copy.name.noMatch;

  return (
    <form
      noValidate
      data-object-setup-flow="true"
      data-object-setup-step={step}
      onSubmit={(event) => {
        event.preventDefault();
        if (step === "kind") open("name");
        else if (step === "name") {
          if (check(["name"])) open("space");
        } else if (step === "space") {
          if (check(["name", "space"])) open("review");
        } else void submit(false);
      }}
      className="grid gap-3"
    >
      <p className="text-body-sm text-text-muted">{copy.intro}</p>
      {notice ? (
        <Callout tone="warning" live="polite" data-object-setup-notice="true">
          <p>{notice}</p>
        </Callout>
      ) : null}

      <ol className="grid list-none gap-3">
        <ProgressiveStep
          slot="object-setup"
          step="kind"
          position={copy.stepOf(1, STEPS.length)}
          active={step === "kind"}
          reached={reached.has("kind")}
          question={copy.kind.question}
          summary={copy.kind.summary[objectKind]}
          changeLabel={copy.change}
          onChange={() => open("kind")}
          headingRef={(node) => {
            headingRefs.current.kind = node;
          }}
        >
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">{copy.kind.question}</legend>
            <RadioCard
              name="objectKind"
              value="plant"
              checked={objectKind === "plant"}
              onChange={() => setObjectKind("plant")}
              title={copy.kind.plant}
              description={copy.kind.plantDescription}
            />
            <RadioCard
              name="objectKind"
              value="animal"
              checked={objectKind === "animal"}
              onChange={() => setObjectKind("animal")}
              title={copy.kind.animal}
              description={copy.kind.animalDescription}
            />
          </fieldset>
          <ProgressiveActions>
            <Button type="submit">{copy.next}</Button>
          </ProgressiveActions>
        </ProgressiveStep>

        <ProgressiveStep
          slot="object-setup"
          step="name"
          position={copy.stepOf(2, STEPS.length)}
          active={step === "name"}
          reached={reached.has("name")}
          question={copy.name.question[objectKind]}
          summary={name ? `${name} · ${identitySummary}` : null}
          changeLabel={copy.change}
          onChange={() => open("name")}
          headingRef={(node) => {
            headingRefs.current.name = node;
          }}
        >
          <p className="text-body-sm text-text-muted">
            {copy.name.hint[objectKind]}
          </p>
          <div data-object-setup-name="true" className="grid gap-2">
            <CatalogPicker
              locale={locale}
              objectKind={objectKind}
              copy={pickerCopy.catalogPicker}
              label={copy.name.label}
              placeholder={copy.name.placeholder[objectKind]}
              clearLabel={pickerCopy.fields.clearCatalogMatch}
              inputName="displayName"
              required
              query={name}
              onQueryChange={(value) => {
                setName(value);
                if (errors.name) setErrors({});
              }}
              selection={selection}
              onSelectionChange={updateSelection}
              materializeFromCatalogue={materializeCatalogNodeAction}
            />
            {errors.name ? (
              <p
                role="alert"
                data-object-setup-error="name"
                className="text-body-sm text-danger-text"
              >
                {errors.name === "name_too_long"
                  ? copy.name.tooLong
                  : copy.name.required}
              </p>
            ) : null}
            <p className="text-caption text-text-muted">
              {selection?.kind === "item"
                ? copy.name.sharedOrganismNote
                : copy.name.noMatch}
            </p>
            {selection ? (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateSelection(null)}
                  data-object-setup-keep-without-match="true"
                >
                  {copy.name.keepWithoutMatch}
                </Button>
              </div>
            ) : null}
          </div>
          <ProgressiveActions>
            <Button type="button" variant="ghost" onClick={() => open("kind")}>
              {copy.previous}
            </Button>
            <Button type="submit">{copy.next}</Button>
          </ProgressiveActions>
        </ProgressiveStep>

        <ProgressiveStep
          slot="object-setup"
          step="space"
          position={copy.stepOf(3, STEPS.length)}
          active={step === "space"}
          reached={reached.has("space")}
          question={copy.space.question}
          summary={space?.displayName ?? null}
          changeLabel={copy.change}
          onChange={() => open("space")}
          headingRef={(node) => {
            headingRefs.current.space = node;
          }}
        >
          <p className="text-body-sm text-text-muted">{copy.space.hint}</p>
          <OwnedDestinationPicker
            locale={locale}
            kind="space"
            selection={
              space
                ? {
                    kind: "space",
                    id: space.id,
                    displayName: space.displayName,
                  }
                : null
            }
            onSelect={(destination) => {
              if (destination.kind !== "space") return;
              setSpace({
                id: destination.id,
                displayName: destination.displayName,
              });
              setErrors({});
            }}
          />
          {errors.space ? (
            <p
              role="alert"
              data-object-setup-error="space"
              className="text-body-sm text-danger-text"
            >
              {copy.space.required}
            </p>
          ) : null}
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSpaceSheetOpen(true)}
              data-object-setup-new-space="true"
            >
              {copy.space.create}
            </Button>
          </div>
          <Sheet open={spaceSheetOpen} onOpenChange={setSpaceSheetOpen}>
            <SheetContent
              side="bottom"
              closeLabel={copy.space.close}
              className="max-h-svh overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>{copy.space.sheetTitle}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">
                <SpaceSetupFlow
                  locale={locale}
                  mode="create"
                  onCancel={() => setSpaceSheetOpen(false)}
                  onCreated={(created) => {
                    setSpace({
                      id: created.id,
                      displayName: created.displayName,
                    });
                    setErrors({});
                    setNotice(copy.space.created(created.displayName));
                    setSpaceSheetOpen(false);
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
          <ProgressiveActions>
            <Button type="button" variant="ghost" onClick={() => open("name")}>
              {copy.previous}
            </Button>
            <Button type="submit">{copy.next}</Button>
          </ProgressiveActions>
        </ProgressiveStep>

        <ProgressiveStep
          slot="object-setup"
          step="review"
          position={copy.stepOf(4, STEPS.length)}
          active={step === "review"}
          reached={reached.has("review")}
          question={copy.review.question}
          summary={null}
          changeLabel={copy.change}
          onChange={() => open("review")}
          headingRef={(node) => {
            headingRefs.current.review = node;
          }}
        >
          <dl
            data-object-setup-review="true"
            className="grid gap-2 rounded-md border border-border p-4 text-body-sm"
          >
            <dt className="text-text-muted">
              {copy.review.willCreate[objectKind]}
            </dt>
            <dd className="font-medium text-text-heading">{name}</dd>
            <dt className="text-text-muted">{copy.review.identity}</dt>
            <dd>
              {selection?.kind === "item"
                ? selection.row.displayName
                : copy.review.notIdentified}
            </dd>
            <dt className="text-text-muted">{copy.review.space}</dt>
            <dd>{space?.displayName}</dd>
          </dl>
          <p className="text-body-sm text-text-muted">
            {copy.review.publishesNothing}
          </p>

          <OutcomeNotice
            outcome={outcome}
            copy={copy}
            resultRef={resultRef}
            onRetry={() => void submit(false)}
            onCreateAnyway={() => void submit(true)}
          />

          <ProgressiveActions>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => open("space")}
            >
              {copy.previous}
            </Button>
            <Button
              type="submit"
              loading={pending}
              data-object-setup-submit="true"
            >
              {pending ? copy.review.creating : copy.review.create}
            </Button>
          </ProgressiveActions>
        </ProgressiveStep>
      </ol>
    </form>
  );
}

function OutcomeNotice({
  outcome,
  copy,
  resultRef,
  onRetry,
  onCreateAnyway,
}: {
  outcome: Outcome;
  copy: ReturnType<typeof getObjectSetupCopy>;
  resultRef: React.RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  onCreateAnyway: () => void;
}) {
  if (outcome.kind === "idle" || outcome.kind === "pending") return null;
  if (outcome.kind === "created") return null;
  if (outcome.kind === "duplicate") {
    return (
      <div ref={resultRef} tabIndex={-1} className="outline-none">
        <Callout
          tone="warning"
          live="polite"
          title={copy.duplicate.title(
            outcome.existing.displayName,
            outcome.existing.space.displayName,
          )}
          data-object-setup-outcome="duplicate"
          actions={
            <>
              <Link
                href={gardenObjectWritePath(outcome.existing.id)}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {copy.duplicate.openExisting}
              </Link>
              <Button type="button" size="sm" onClick={onCreateAnyway}>
                {copy.duplicate.createAnyway}
              </Button>
            </>
          }
        >
          <p>{copy.duplicate.body}</p>
        </Callout>
      </div>
    );
  }
  const message =
    outcome.kind === "uncertain"
      ? copy.result.uncertain
      : outcome.kind === "conflict"
        ? copy.result.conflict
        : outcome.kind === "signed-out"
          ? copy.result.signedOut
          : copy.result.failed;
  return (
    <div ref={resultRef} tabIndex={-1} className="outline-none">
      <Callout
        tone="danger"
        live="assertive"
        data-object-setup-outcome={outcome.kind}
        actions={
          outcome.kind === "uncertain" || outcome.kind === "failed" ? (
            <Button type="button" size="sm" onClick={onRetry}>
              {copy.result.retry}
            </Button>
          ) : outcome.kind === "signed-out" ? (
            <Link
              href={buildSignInHref({ returnTo: "/garden/objects/new" })}
              className={buttonVariants({ size: "sm" })}
            >
              {copy.result.signIn}
            </Link>
          ) : null
        }
      >
        <p>{message}</p>
      </Callout>
    </div>
  );
}
