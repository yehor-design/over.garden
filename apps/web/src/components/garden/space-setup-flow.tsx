"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon as CheckCircle } from "@/components/icons/CheckCircle";

import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Illustration } from "@/components/ui/illustration";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { RadioCard } from "@/components/ui/radio-card";
import {
  ProgressiveActions as StepActions,
  ProgressiveStep,
} from "@/components/garden/progressive-steps";
import { Select } from "@/components/ui/select";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import {
  getLocalizedCoarseRegionLabel,
  getLocalizedCoarseRegionOptions,
} from "@/lib/garden/regions";
import {
  spaceSetupReturnHref,
  validateSpaceSetup,
  type CreatedSpace,
  type SpaceLocationVisibility,
  type SpaceSetupResponse,
} from "@/lib/garden/space-setup";
import { resolveIllustration } from "@/lib/illustrations";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getSpaceSetupCopy } from "@/lib/space-setup-copy";

type Step = "name" | "region" | "review";
const STEPS: readonly Step[] = ["name", "region", "review"];

export interface SpaceSetupValues {
  displayName: string;
  locationVisibility: SpaceLocationVisibility;
  coarseRegionCode: string;
}

type Outcome =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "created"; space: CreatedSpace; replayed: boolean }
  | { kind: "duplicate"; existing: CreatedSpace }
  | { kind: "failed" }
  | { kind: "uncertain" }
  | { kind: "conflict" }
  | { kind: "signed-out" };

/**
 * Create a space the way Airbnb asks Where / When / Who (`OVE-484`): one
 * question open at a time, every answered one folded into a line that says
 * what was chosen and can be reopened, and Back that keeps what was typed.
 *
 * Two modes, one flow:
 *
 * - **`create`** — the standalone page. "Create space" writes one empty space
 *   and says *Created*, never *Saved an entry*. The request id is made once
 *   per mount and reused by every retry, so a double press or a retry after a
 *   lost response yields one space.
 * - **`propose`** — inside a composer. Nothing is written: the answers go back
 *   to the editor, whose atomic Publish creates the space and the entry
 *   together (INFORMATION_ARCHITECTURE.md, transaction table). The text the
 *   gardener was writing never leaves memory.
 */
export function SpaceSetupFlow({
  locale,
  mode,
  initial,
  returnTo = null,
  onCreated,
  onPropose,
  onCancel,
}: {
  locale: InterfaceLocale;
  mode: "create" | "propose";
  initial?: Partial<SpaceSetupValues>;
  /** A workspace path the created space's id is handed back to. */
  returnTo?: string | null;
  onCreated?: (space: CreatedSpace) => void;
  onPropose?: (values: SpaceSetupValues) => void;
  onCancel?: () => void;
}) {
  const copy = getSpaceSetupCopy(locale);
  const [values, setValues] = useState<SpaceSetupValues>({
    displayName: initial?.displayName ?? "",
    locationVisibility: initial?.locationVisibility ?? "hidden",
    coarseRegionCode: initial?.coarseRegionCode ?? "",
  });
  const [step, setStep] = useState<Step>("name");
  const [reached, setReached] = useState<Set<Step>>(() => new Set(["name"]));
  const [errors, setErrors] = useState<ReturnType<typeof validateSpaceSetup>>(
    {},
  );
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [requestId] = useState(() => crypto.randomUUID());
  const headingRefs = useRef<Record<Step, HTMLHeadingElement | null>>({
    name: null,
    region: null,
    review: null,
  });
  const nameRef = useRef<HTMLInputElement | null>(null);
  const regionRef = useRef<HTMLSelectElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const moved = useRef(false);
  const id = "space-setup";

  // Focus follows the open question, but never on first paint: the page's
  // own heading is where a reader lands.
  useEffect(() => {
    if (!moved.current) return;
    if (step === "name") nameRef.current?.focus();
    else headingRefs.current[step]?.focus();
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

  const update = <K extends keyof SpaceSetupValues>(
    key: K,
    value: SpaceSetupValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (outcome.kind === "duplicate" || outcome.kind === "failed") {
      setOutcome({ kind: "idle" });
    }
  };

  const check = (fields: Array<"name" | "region">) => {
    const all = validateSpaceSetup(values);
    const found = Object.fromEntries(
      fields.filter((field) => all[field]).map((field) => [field, all[field]]),
    );
    setErrors(found);
    if (found.name) {
      moved.current = true;
      setStep("name");
      requestAnimationFrame(() => nameRef.current?.focus());
      return false;
    }
    if (found.region) {
      moved.current = true;
      setStep("region");
      requestAnimationFrame(() => regionRef.current?.focus());
      return false;
    }
    return true;
  };

  const submit = async (allowDuplicateName = false) => {
    if (!check(["name", "region"])) return;
    if (mode === "propose") {
      onPropose?.(values);
      return;
    }
    if (outcome.kind === "pending") return;
    setOutcome({ kind: "pending" });
    let response: Response;
    try {
      response = await fetch("/api/garden/spaces", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", ...ownerScopeHeaders() },
        body: JSON.stringify({
          requestId,
          displayName: values.displayName,
          locationVisibility: values.locationVisibility,
          coarseRegionCode:
            values.locationVisibility === "region"
              ? values.coarseRegionCode
              : null,
          allowDuplicateName,
        }),
      });
    } catch {
      // No answer at all: the space may or may not exist. The same request id
      // retried reads back the truth, so the reader is told exactly that.
      setOutcome({ kind: "uncertain" });
      return;
    }
    if (response.status === 401 || response.status === 403) {
      setOutcome({ kind: "signed-out" });
      return;
    }
    let body: SpaceSetupResponse | null = null;
    try {
      body = (await response.json()) as SpaceSetupResponse;
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
          space: body.space,
          replayed: body.replayed,
        });
        onCreated?.(body.space);
        if (returnTo) {
          window.location.assign(spaceSetupReturnHref(returnTo, body.space.id));
        }
        return;
      case "duplicate_name":
        setOutcome({ kind: "duplicate", existing: body.existing });
        return;
      case "invalid":
        setOutcome({ kind: "idle" });
        check(["name", "region"]);
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
        data-space-setup-result="created"
        data-space-id={outcome.space.id}
        className="grid gap-4 rounded-lg border border-border p-5 outline-none"
      >
        <p className="flex items-start gap-2 text-h3 text-text-heading">
          <CheckCircle
            aria-hidden="true"
            className="mt-1 size-5 shrink-0 text-success-text"
          />
          {copy.result.created(outcome.space.displayName)}
        </p>
        <p className="text-body-sm text-text-muted">
          {outcome.replayed ? copy.result.replayed : copy.result.createdBody}
        </p>
        {returnTo ? null : (
          <div>
            <Link
              href="/garden#spaces"
              className={buttonVariants({ variant: "secondary" })}
            >
              {copy.result.toGarden}
            </Link>
          </div>
        )}
      </div>
    );
  }

  const regionLabel =
    values.locationVisibility === "region" && values.coarseRegionCode
      ? getLocalizedCoarseRegionLabel(locale, values.coarseRegionCode)
      : null;
  const pending = outcome.kind === "pending";

  return (
    <form
      noValidate
      data-space-setup-flow={mode}
      data-space-setup-step={step}
      onSubmit={(event) => {
        event.preventDefault();
        if (step === "name") {
          if (check(["name"])) open("region");
        } else if (step === "region") {
          if (check(["name", "region"])) open("review");
        } else {
          void submit(false);
        }
      }}
      className="grid gap-3"
    >
      <div className="flex items-start gap-4">
        <p className="min-w-0 flex-1 text-body-sm text-text-muted">
          {copy.intro}
        </p>
        {/* Supporting art, never a splash step (OVE-484 criterion 6). */}
        <span className="hidden sm:block" aria-hidden="true">
          <Illustration
            asset={resolveIllustration("space-setup")}
            size="card"
          />
        </span>
      </div>

      <ol className="grid list-none gap-3">
        <ProgressiveStep
          slot="space-setup"
          step="name"
          position={copy.stepOf(1, STEPS.length)}
          active={step === "name"}
          reached={reached.has("name")}
          changeLabel={copy.change}
          question={copy.name.question}
          summary={values.displayName || null}
          onChange={() => open("name")}
          headingRef={(node) => {
            headingRefs.current.name = node;
          }}
        >
          <Field
            id={`${id}-name`}
            label={copy.name.label}
            description={copy.name.hint}
            error={
              errors.name === "name_required"
                ? copy.name.required
                : errors.name === "name_too_long"
                  ? copy.name.tooLong
                  : undefined
            }
            required
          >
            <Input
              ref={nameRef}
              name="displayName"
              autoComplete="off"
              maxLength={200}
              value={values.displayName}
              placeholder={copy.name.placeholder}
              onChange={(event) => update("displayName", event.target.value)}
            />
          </Field>
          <StepActions>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                {copy.previous}
              </Button>
            ) : null}
            <Button type="submit">{copy.next}</Button>
          </StepActions>
        </ProgressiveStep>

        <ProgressiveStep
          slot="space-setup"
          step="region"
          position={copy.stepOf(2, STEPS.length)}
          active={step === "region"}
          reached={reached.has("region")}
          changeLabel={copy.change}
          question={copy.region.question}
          optional={copy.optional}
          summary={
            reached.has("review")
              ? (regionLabel ?? copy.region.summaryHidden)
              : null
          }
          onChange={() => open("region")}
          headingRef={(node) => {
            headingRefs.current.region = node;
          }}
        >
          <p className="text-body-sm text-text-muted">{copy.region.hint}</p>
          <fieldset className="grid gap-2">
            <legend className="sr-only">{copy.region.question}</legend>
            <RadioCard
              name="locationVisibility"
              value="hidden"
              checked={values.locationVisibility === "hidden"}
              onChange={() => {
                update("locationVisibility", "hidden");
                setErrors({});
              }}
              title={copy.region.hidden}
              description={copy.region.hiddenDescription}
            />
            <RadioCard
              name="locationVisibility"
              value="region"
              checked={values.locationVisibility === "region"}
              onChange={() => update("locationVisibility", "region")}
              title={copy.region.shown}
              description={copy.region.shownDescription}
            />
          </fieldset>
          {values.locationVisibility === "region" ? (
            <Field
              id={`${id}-region`}
              label={copy.region.select}
              required
              error={
                errors.region === "region_required"
                  ? copy.region.required
                  : errors.region === "region_invalid"
                    ? copy.region.invalid
                    : undefined
              }
            >
              <Select
                ref={regionRef}
                name="coarseRegionCode"
                value={values.coarseRegionCode}
                onChange={(event) =>
                  update("coarseRegionCode", event.target.value)
                }
              >
                <option value="">{copy.region.choose}</option>
                {getLocalizedCoarseRegionOptions(locale).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <StepActions>
            <Button type="button" variant="ghost" onClick={() => open("name")}>
              {copy.previous}
            </Button>
            {values.locationVisibility === "hidden" ? null : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  update("locationVisibility", "hidden");
                  setErrors({});
                  open("review");
                }}
              >
                {copy.region.skip}
              </Button>
            )}
            <Button type="submit">{copy.next}</Button>
          </StepActions>
        </ProgressiveStep>

        <ProgressiveStep
          slot="space-setup"
          step="review"
          position={copy.stepOf(3, STEPS.length)}
          active={step === "review"}
          reached={reached.has("review")}
          changeLabel={copy.change}
          question={copy.review.question}
          summary={null}
          onChange={() => open("review")}
          headingRef={(node) => {
            headingRefs.current.review = node;
          }}
        >
          <dl
            data-space-setup-review="true"
            className="grid gap-2 rounded-md border border-border p-4 text-body-sm"
          >
            <dt className="text-text-muted">{copy.review.willCreate}</dt>
            <dd className="font-medium text-text-heading">
              {values.displayName}
            </dd>
            <dt className="text-text-muted">{copy.region.question}</dt>
            <dd>{regionLabel ?? copy.region.summaryHidden}</dd>
          </dl>
          <p className="text-body-sm text-text-muted">
            {copy.review.visibility}
          </p>
          <p className="text-body-sm text-text-muted">
            {mode === "propose"
              ? copy.review.proposeNote
              : copy.review.notAnEntry}
          </p>

          <OutcomeNotice
            outcome={outcome}
            copy={copy}
            resultRef={resultRef}
            onRetry={() => void submit(false)}
            onCreateAnyway={() => void submit(true)}
          />

          <StepActions>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => open("region")}
            >
              {copy.previous}
            </Button>
            <Button
              type="submit"
              loading={pending}
              data-space-setup-submit="true"
            >
              {mode === "propose"
                ? copy.review.useInEntry
                : pending
                  ? copy.review.creating
                  : copy.review.create}
            </Button>
          </StepActions>
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
  copy: ReturnType<typeof getSpaceSetupCopy>;
  resultRef: React.RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  onCreateAnyway: () => void;
}) {
  if (outcome.kind === "idle" || outcome.kind === "pending") return null;
  if (outcome.kind === "duplicate") {
    return (
      <div ref={resultRef} tabIndex={-1} className="outline-none">
        <Callout
          tone="warning"
          live="polite"
          title={copy.duplicate.title(outcome.existing.displayName)}
          data-space-setup-outcome="duplicate"
          actions={
            <>
              <Link
                href="/garden#spaces"
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
        data-space-setup-outcome={outcome.kind}
        actions={
          outcome.kind === "uncertain" || outcome.kind === "failed" ? (
            <Button type="button" size="sm" onClick={onRetry}>
              {copy.result.retry}
            </Button>
          ) : outcome.kind === "signed-out" ? (
            <Link
              href={buildSignInHref({ returnTo: "/garden/spaces/new" })}
              className={buttonVariants({ size: "sm" })}
            >
              {copy.result.retry}
            </Link>
          ) : null
        }
      >
        <p>{message}</p>
      </Callout>
    </div>
  );
}
