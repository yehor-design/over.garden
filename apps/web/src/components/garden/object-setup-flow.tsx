"use client";

import NextLink from "next/link";
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { recordCatalogPickEventAction } from "@/app/(default)/garden/catalog-pick-event-actions";
import { recordCatalogSearchMissAction } from "@/app/(default)/garden/catalog-search-miss-actions";
import { ChoiceRadioList } from "@/components/garden/choice-radio-list";
import {
  ObjectCultivarField,
  ObjectSpeciesField,
  type CultivarAnswer,
  type SpeciesAnswer,
} from "@/components/garden/object-species-fields";
import { OwnedPhotoField } from "@/components/garden/owned-photo-field";
import { PawPrintIcon } from "@/components/icons/PawPrint";
import { PlantIcon } from "@/components/icons/Plant";
import { PlusIcon } from "@/components/icons/Plus";
import { SquaresFourIcon } from "@/components/icons/SquaresFour";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CreationStepper } from "@/components/ui/creation-stepper";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import type { PlantObjectKind } from "@/db/schema";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import { CATALOG_SEARCH_MISS_MIN_QUERY_LENGTH } from "@/lib/garden/catalog-typeahead-contract";
import {
  validateObjectChoiceText,
  validateObjectSetup,
  type CreatedObject,
  type ObjectSetupField,
  type ObjectSetupFieldError,
  type ObjectSetupResponse,
} from "@/lib/garden/object-setup";
import type { OwnedPhotoView } from "@/lib/garden/owned-photo";
import { useOwnedPhotoUpload } from "@/lib/garden/use-owned-photo-upload";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { getObjectSetupCopy, type ObjectSetupCopy } from "@/lib/object-setup-copy";
import { getOwnedPhotoCopy } from "@/lib/owned-photo-copy";

export interface ObjectSetupSpaceOption {
  id: string;
  displayName: string;
  photo: OwnedPhotoView | null;
}

type StepId = "space" | "kind" | "photo" | "name" | "species" | "cultivar";

interface Answers {
  requestId: string;
  spaceId: string | null;
  kind: PlantObjectKind | null;
  name: string;
  species: SpeciesAnswer;
  cultivar: CultivarAnswer;
}

type Outcome =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "duplicate"; existing: CreatedObject }
  | { kind: "photo_unavailable" }
  | { kind: "space_unavailable" }
  | { kind: "identity_unavailable" }
  | { kind: "failed" }
  | { kind: "uncertain" }
  | { kind: "conflict" }
  | { kind: "signed-out" };

const DRAFT_KEY = "overgarden:object-setup";
const OBJECT_SETUP_PATH = "/garden/objects/new";

/**
 * Add a plant or an animal as a full-screen stepper (OVE-524, ADR-0035 D1,
 * DESIGN.md §5.24): «Простір» → «Рослина чи тварина?» → an optional photo with
 * the crop editor → «Вкажіть ім'я …» → «Вид» → «Сорт» / «Порода» → «Додати».
 *
 * - **The count is this run's.** The space step is skipped when the flow
 *   started inside a space; «Сорт» is skipped while the species is «Не знаю»,
 *   and the count follows as it changes.
 * - **Every step is an address** (`?step=`), pushed onto the history, so Back
 *   returns to the previous question; the answers live in the tab's session
 *   storage, so a reload keeps them. The photo is the one answer a reload
 *   loses: it is staged, and staging belongs to the page.
 * - **Nothing is guessed.** «Не знаю» is the species and the cultivar until
 *   the gardener says otherwise; the name never fills the species.
 * - **The request id is the object's id**, made once per tab, so a double
 *   press or a retry after a lost response reads back one object.
 * - **Closing asks first** when anything was answered, in the product's own
 *   dialog.
 */
export function ObjectSetupFlow({
  locale,
  requestId: pageRequestId,
  spaces,
  initialSpaceId,
  skipSpace,
  returnTo,
  spaceSetupHref,
}: {
  locale: InterfaceLocale;
  /** The page's id for this intent; the tab keeps its own once it has one. */
  requestId: string;
  spaces: readonly ObjectSetupSpaceOption[];
  /** A space chosen before the flow: from inside a space, or just created. */
  initialSpaceId: string | null;
  /** Started from inside a space: its step is not asked. */
  skipSpace: boolean;
  /** A workspace path the new object's id is handed back to. */
  returnTo: string | null;
  /** The space stepper, returning here with the new space chosen. */
  spaceSetupHref: string;
}) {
  const copy = getObjectSetupCopy(locale);
  const photoCopy = getOwnedPhotoCopy(locale);
  const upload = useOwnedPhotoUpload();

  const draftRaw = useSyncExternalStore(subscribeNever, readDraftRaw, () => null);
  const search = useSyncExternalStore(subscribeLocation, readSearch, () => "");
  const [edits, setEdits] = useState<Answers | null>(null);
  const answers =
    edits ??
    initialAnswers({
      draft: parseDraft(draftRaw),
      pageRequestId,
      spaces,
      initialSpaceId,
      skipSpace,
    });

  const [errors, setErrors] = useState<
    Partial<Record<ObjectSetupField, ObjectSetupFieldError>>
  >({});
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  // The species search of this attempt, for the pick measurement (OVE-398).
  const speciesSearch = useRef<{ startedAt: number | null; query: string }>({
    startedAt: null,
    query: "",
  });

  const steps = visibleSteps(skipSpace, answers.species);
  const requested = new URLSearchParams(search).get("step") as StepId | null;
  const step: StepId =
    requested && steps.includes(requested) && reachable(requested, answers)
      ? requested
      : steps[0]!;
  const stepIndex = steps.indexOf(step);
  const lastStep = stepIndex === steps.length - 1;
  const kind = answers.kind ?? "plant";

  const update = useCallback(
    (change: Partial<Omit<Answers, "requestId">>) => {
      setEdits((current) => {
        const base = current ?? answers;
        const next: Answers = { ...base, ...change };
        // A new kind is a new question about the species; a new species a
        // new question about the cultivar.
        if (change.kind && change.kind !== base.kind) {
          next.species = { kind: "unknown" };
          next.cultivar = { kind: "unknown" };
        } else if (change.species && !sameSpecies(change.species, base.species)) {
          next.cultivar = { kind: "unknown" };
        }
        writeDraft(next);
        return next;
      });
      setOutcome((current) =>
        current.kind === "pending" ? current : { kind: "idle" },
      );
    },
    [answers],
  );

  const leave = useCallback(() => {
    clearDraft();
    window.location.assign(returnTo ?? "/garden");
  }, [returnTo]);

  function requestClose() {
    const answered =
      answers.kind !== null ||
      answers.name.trim() !== "" ||
      answers.species.kind !== "unknown" ||
      upload.status !== "empty";
    if (answered) setConfirmClose(true);
    else leave();
  }

  function next() {
    setErrors({});
    const following = steps[stepIndex + 1];
    if (following) pushStep(following);
  }

  function advance() {
    if (outcome.kind === "pending") return;
    switch (step) {
      case "space":
        if (!answers.spaceId) {
          setErrors({ space: "space_required" });
          return;
        }
        next();
        return;
      case "kind":
        if (answers.kind) next();
        return;
      case "photo":
        if (!editingPhoto && upload.status !== "failed") next();
        return;
      case "name": {
        const found = validateObjectSetup({
          displayName: answers.name,
          spaceId: answers.spaceId,
        });
        if (found.name) {
          setErrors({ name: found.name });
          nameRef.current?.focus();
          return;
        }
        next();
        return;
      }
      case "species":
        if (answers.species.kind === "own") {
          const text = validateObjectChoiceText(answers.species.text);
          if (!text.ok) {
            setErrors({ species: text.error });
            return;
          }
        }
        if (lastStep) void create();
        else next();
        return;
      case "cultivar":
        if (answers.cultivar.kind === "own" || answers.cultivar.kind === "new") {
          const text = validateObjectChoiceText(
            answers.cultivar.kind === "own"
              ? answers.cultivar.text
              : answers.cultivar.name,
          );
          if (!text.ok) {
            setErrors({ cultivar: text.error });
            return;
          }
        }
        void create();
    }
  }

  async function create(allowDuplicateName = allowDuplicate) {
    if (outcome.kind === "pending" || !answers.kind || !answers.spaceId) return;
    setOutcome({ kind: "pending" });
    reportSpeciesOutcome();
    let photo = null;
    if (upload.status !== "empty") {
      try {
        photo = await upload.payload();
      } catch {
        setOutcome({ kind: "failed" });
        return;
      }
    }
    let response: Response;
    try {
      response = await fetch("/api/garden/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ownerScopeHeaders() },
        body: JSON.stringify({
          requestId: answers.requestId,
          objectKind: answers.kind,
          displayName: answers.name,
          spaceId: answers.spaceId,
          species: speciesBody(answers.species),
          cultivar: cultivarBody(answers.species, answers.cultivar),
          allowDuplicateName,
          photo,
        }),
      });
    } catch {
      upload.release();
      setOutcome({ kind: "uncertain" });
      return;
    }
    if (response.status === 401 || response.status === 403) {
      upload.release();
      setOutcome({ kind: "signed-out" });
      return;
    }
    let body: ObjectSetupResponse | null = null;
    try {
      body = (await response.json()) as ObjectSetupResponse;
    } catch {
      body = null;
    }
    if (body?.status === "created") {
      upload.committed();
      clearDraft();
      window.location.assign(createdHref(returnTo, body.object.id));
      return;
    }
    upload.release();
    switch (body?.status) {
      case "duplicate_name":
        setOutcome({ kind: "duplicate", existing: body.existing });
        return;
      case "photo_unavailable":
        upload.clear();
        setOutcome({ kind: "photo_unavailable" });
        return;
      case "space_unavailable":
        setOutcome({ kind: "space_unavailable" });
        return;
      case "identity_unavailable":
        setOutcome({ kind: "identity_unavailable" });
        return;
      case "invalid": {
        setErrors(body.errors);
        setOutcome({ kind: "idle" });
        const first = (["space", "name", "species", "cultivar"] as const).find(
          (field) => body.errors[field],
        );
        if (first && steps.includes(first)) pushStep(first);
        return;
      }
      case "conflict":
        setOutcome({ kind: "conflict" });
        return;
      default:
        setOutcome({ kind: response.status === 503 ? "uncertain" : "failed" });
    }
  }

  /** How naming the organism ended, once per attempt (OVE-398, ADR-0026 D12). */
  function reportSpeciesOutcome() {
    const { startedAt, query } = speciesSearch.current;
    if (startedAt === null || !answers.kind) return;
    const typed = query.trim();
    const species = answers.species;
    void recordCatalogPickEventAction({
      outcome:
        species.kind === "catalog"
          ? "picked_species"
          : species.kind === "own"
            ? "own_label"
            : "abandoned",
      queryLength: typed.length,
      msToPick: Math.max(0, Math.round(performance.now() - startedAt)),
      locale,
      objectKind: answers.kind,
      catalogItemId: species.kind === "catalog" ? species.row.id : null,
    }).catch(() => undefined);
    const missed = species.kind === "own" ? species.text.trim() : typed;
    if (
      species.kind !== "catalog" &&
      missed.length >= CATALOG_SEARCH_MISS_MIN_QUERY_LENGTH
    ) {
      void recordCatalogSearchMissAction({
        query: missed,
        locale,
        objectKind: answers.kind,
      }).catch(() => undefined);
    }
    speciesSearch.current = { startedAt: null, query: "" };
  }

  const pending = outcome.kind === "pending";

  const question: Record<StepId, string> = {
    space: copy.space.question,
    kind: copy.kind.question,
    photo: copy.photo.question[kind],
    name: copy.name.question[kind],
    species: copy.species.question,
    cultivar: copy.cultivar.question[kind],
  };

  const failure = failureText(outcome, copy, photoCopy.unavailable);
  const status = (
    <>
      {outcome.kind === "duplicate" ? (
        <Callout
          tone="warning"
          title={copy.duplicate.title(
            outcome.existing.displayName,
            outcome.existing.space.displayName,
          )}
          data-object-setup-duplicate="true"
        >
          <p>{copy.duplicate.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={createdHref(returnTo, outcome.existing.id)}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {copy.duplicate.openExisting}
            </Link>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-object-setup-create-anyway="true"
              onClick={() => {
                setAllowDuplicate(true);
                void create(true);
              }}
            >
              {copy.duplicate.createAnyway}
            </Button>
          </div>
        </Callout>
      ) : null}
      {failure ? (
        <Callout
          tone="danger"
          live="assertive"
          data-object-setup-outcome={outcome.kind}
        >
          <p>{failure}</p>
        </Callout>
      ) : null}
      {outcome.kind === "signed-out" ? (
        <Callout
          tone="danger"
          live="assertive"
          data-object-setup-outcome="signed-out"
          actions={
            <Link
              href={buildSignInHref({ returnTo: OBJECT_SETUP_PATH })}
              className={buttonVariants({ size: "sm" })}
            >
              {copy.result.signIn}
            </Link>
          }
        >
          <p>{copy.result.signedOut}</p>
        </Callout>
      ) : null}
    </>
  );

  let body: ReactNode;
  switch (step) {
    case "space":
      body = (
        <div className="grid min-w-0 gap-4" data-object-setup-step="space">
          <ChoiceRadioList
            name="space"
            legend={copy.space.listLabel}
            value={answers.spaceId}
            onChange={(spaceId) => {
              setErrors({});
              update({ spaceId });
            }}
            onPick={(spaceId) => {
              update({ spaceId });
              next();
            }}
            options={spaces.map((space) => ({
              value: space.id,
              title: space.displayName,
              media: space.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- the stored WebP's smallest variant (ADR-0022 D2)
                <img
                  src={space.photo.src}
                  srcSet={space.photo.srcSet ?? undefined}
                  sizes="36px"
                  alt=""
                  data-object-setup-space-photo="true"
                  className="size-9 object-cover"
                />
              ) : (
                <SquaresFourIcon size={16} />
              ),
              data: { "data-object-setup-space": space.id },
            }))}
          />
          {errors.space ? (
            <p className="text-caption text-danger-text" role="alert">
              {copy.space.required}
            </p>
          ) : null}
          <NextLink
            href={spaceSetupHref}
            data-object-setup-add-space="true"
            className={buttonVariants({ variant: "secondary", className: "w-fit" })}
          >
            <PlusIcon size={16} />
            {copy.space.addSpace}
          </NextLink>
        </div>
      );
      break;
    case "kind":
      body = (
        <div data-object-setup-step="kind">
          <ChoiceRadioList
            name="kind"
            legend={copy.kind.question}
            value={answers.kind}
            onChange={(value) => update({ kind: value as PlantObjectKind })}
            onPick={(value) => {
              update({ kind: value as PlantObjectKind });
              next();
            }}
            options={[
              {
                value: "plant",
                title: copy.kind.plant,
                media: <PlantIcon size={16} />,
                data: { "data-object-setup-kind": "plant" },
              },
              {
                value: "animal",
                title: copy.kind.animal,
                media: <PawPrintIcon size={16} />,
                data: { "data-object-setup-kind": "animal" },
              },
            ]}
          />
        </div>
      );
      break;
    case "photo":
      body = (
        <div data-object-setup-step="photo">
          <OwnedPhotoField
            upload={upload}
            copy={photoCopy}
            alt={copy.photo.alt(answers.name.trim() || question.photo)}
            disabled={pending}
            onEditingChange={setEditingPhoto}
          />
        </div>
      );
      break;
    case "name":
      body = (
        <div data-object-setup-step="name">
          <Field
            label={copy.name.label}
            error={
              errors.name === "name_required"
                ? copy.name.required
                : errors.name === "name_too_long"
                  ? copy.name.tooLong
                  : undefined
            }
          >
            <Input
              ref={nameRef}
              name="displayName"
              value={answers.name}
              autoComplete="off"
              enterKeyHint="next"
              placeholder={copy.name.placeholder[kind]}
              maxLength={200}
              data-object-setup-name="true"
              data-creation-answer="true"
              onChange={(event) => {
                setErrors({});
                setAllowDuplicate(false);
                update({ name: event.currentTarget.value });
              }}
            />
          </Field>
        </div>
      );
      break;
    case "species":
      body = (
        <div data-object-setup-step="species">
          <ObjectSpeciesField
            locale={locale}
            objectKind={kind}
            copy={copy.species}
            answer={answers.species}
            onAnswer={(species) => {
              setErrors({});
              update({ species });
            }}
            onQueryChange={(query) => {
              if (speciesSearch.current.startedAt === null && query.trim()) {
                speciesSearch.current.startedAt = performance.now();
              }
              speciesSearch.current.query = query;
            }}
            error={
              errors.species === "text_too_long"
                ? copy.species.tooLong
                : errors.species
                  ? copy.species.ownRequired
                  : undefined
            }
          />
        </div>
      );
      break;
    case "cultivar":
      body =
        answers.species.kind === "unknown" ? null : (
          <div data-object-setup-step="cultivar">
            <ObjectCultivarField
              objectKind={kind}
              species={answers.species}
              copy={copy.cultivar}
              ownLabel={copy.cultivar.ownLabel[kind]}
              answer={answers.cultivar}
              onAnswer={(cultivar) => {
                setErrors({});
                update({ cultivar });
              }}
              error={
                errors.cultivar === "text_too_long"
                  ? copy.cultivar.tooLong
                  : errors.cultivar
                    ? copy.cultivar.ownRequired
                    : undefined
              }
            />
          </div>
        );
  }

  return (
    <>
      <CreationStepper
        label={copy.title}
        step={stepIndex + 1}
        total={steps.length}
        progressLabel={copy.stepOf(stepIndex + 1, steps.length)}
        question={question[step]}
        closeLabel={copy.close}
        onClose={requestClose}
        backLabel={copy.previous}
        onBack={stepIndex > 0 ? () => window.history.back() : undefined}
        primaryLabel={lastStep ? (pending ? copy.adding : copy.add) : copy.next}
        primaryPending={pending}
        primaryDisabled={
          (step === "kind" && !answers.kind) ||
          (step === "photo" && (editingPhoto || upload.status === "failed"))
        }
        secondary={
          step === "photo" && upload.status === "empty"
            ? {
                label: copy.photo.skip,
                onClick: next,
                disabled: editingPhoto,
              }
            : undefined
        }
        onSubmit={(event) => {
          event.preventDefault();
          advance();
        }}
        status={status}
      >
        {body}
      </CreationStepper>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent data-object-setup-discard="true">
          <AlertDialogTitle>{copy.discard.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.discard.body}</AlertDialogDescription>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialogClose
              render={
                <Button type="button" variant="secondary">
                  {copy.discard.keep}
                </Button>
              }
            />
            <Button
              type="button"
              variant="danger"
              data-object-setup-leave="true"
              onClick={() => {
                setConfirmClose(false);
                leave();
              }}
            >
              {copy.discard.leave}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The steps this run shows, in order (DESIGN.md §5.24). */
export function visibleSteps(
  skipSpace: boolean,
  species: SpeciesAnswer,
): StepId[] {
  return [
    ...(skipSpace ? [] : (["space"] as const)),
    "kind",
    "photo",
    "name",
    "species",
    ...(species.kind === "unknown" ? [] : (["cultivar"] as const)),
  ];
}

/** A step is reached only with the answers before it. */
function reachable(step: StepId, answers: Answers): boolean {
  if (step === "space") return true;
  if (!answers.spaceId) return false;
  if (step === "kind") return true;
  if (!answers.kind) return false;
  if (step === "photo" || step === "name") return true;
  if (!answers.name.trim()) return false;
  if (step === "species") return true;
  return answers.species.kind !== "unknown";
}

function sameSpecies(left: SpeciesAnswer, right: SpeciesAnswer) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "catalog" && right.kind === "catalog") {
    return left.row.id === right.row.id;
  }
  return true;
}

function speciesBody(species: SpeciesAnswer) {
  if (species.kind === "catalog") {
    return { kind: "catalog", catalogItemId: species.row.id };
  }
  if (species.kind === "own") return { kind: "own", text: species.text };
  return { kind: "unknown" };
}

function cultivarBody(species: SpeciesAnswer, cultivar: CultivarAnswer) {
  if (species.kind === "unknown") return { kind: "unknown" };
  if (species.kind === "catalog") {
    if (cultivar.kind === "entry") {
      return { kind: "entry", catalogItemId: cultivar.id };
    }
    if (cultivar.kind === "new") return { kind: "new", name: cultivar.name };
    return { kind: "unknown" };
  }
  return cultivar.kind === "own"
    ? { kind: "own", text: cultivar.text }
    : { kind: "unknown" };
}

/** Where the new object lands: the caller that asked, or its own page. */
function createdHref(returnTo: string | null, objectId: string) {
  if (!returnTo) return `/garden/objects/${encodeURIComponent(objectId)}`;
  const url = new URL(returnTo, window.location.origin);
  url.searchParams.set("object", objectId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function failureText(
  outcome: Outcome,
  copy: ObjectSetupCopy,
  photoUnavailable: string,
): string | null {
  switch (outcome.kind) {
    case "failed":
      return copy.result.failed;
    case "uncertain":
      return copy.result.uncertain;
    case "conflict":
      return copy.result.conflict;
    case "photo_unavailable":
      return photoUnavailable;
    case "space_unavailable":
      return copy.result.spaceUnavailable;
    case "identity_unavailable":
      return copy.result.identityUnavailable;
    default:
      return null;
  }
}

function initialAnswers(input: {
  draft: Partial<Answers>;
  pageRequestId: string;
  spaces: readonly ObjectSetupSpaceOption[];
  initialSpaceId: string | null;
  skipSpace: boolean;
}): Answers {
  const { draft, spaces } = input;
  const known = (id: string | null | undefined) =>
    id && spaces.some((space) => space.id === id) ? id : null;
  const spaceId =
    known(input.initialSpaceId) ??
    (input.skipSpace ? null : known(draft.spaceId)) ??
    (spaces.length === 1 ? spaces[0]!.id : null);
  return {
    requestId: draft.requestId ?? input.pageRequestId,
    spaceId: input.skipSpace ? (known(input.initialSpaceId) ?? spaceId) : spaceId,
    kind: draft.kind ?? null,
    name: draft.name ?? "",
    species: draft.species ?? { kind: "unknown" },
    cultivar: draft.cultivar ?? { kind: "unknown" },
  };
}

function subscribeNever() {
  return () => undefined;
}

function readDraftRaw(): string | null {
  try {
    return window.sessionStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

function writeDraft(answers: Answers) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
  } catch {
    // A tab that cannot store keeps the answers in memory only.
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The tab's draft, trusted only as far as its shape can be checked. */
function parseDraft(raw: string | null): Partial<Answers> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const draft: Partial<Answers> = {};
    if (typeof value.requestId === "string" && UUID.test(value.requestId)) {
      draft.requestId = value.requestId;
    }
    if (typeof value.spaceId === "string" && UUID.test(value.spaceId)) {
      draft.spaceId = value.spaceId;
    }
    if (value.kind === "plant" || value.kind === "animal") draft.kind = value.kind;
    if (typeof value.name === "string") draft.name = value.name.slice(0, 200);
    const species = value.species as Record<string, unknown> | undefined;
    if (species?.kind === "own" && typeof species.text === "string") {
      draft.species = { kind: "own", text: species.text.slice(0, 200) };
    } else if (species?.kind === "catalog") {
      const row = species.row as Record<string, unknown> | undefined;
      if (
        row &&
        typeof row.id === "string" &&
        UUID.test(row.id) &&
        typeof row.displayName === "string"
      ) {
        draft.species = {
          kind: "catalog",
          row: {
            id: row.id,
            displayName: row.displayName.slice(0, 200),
            kind: "species",
            ...(typeof row.scientificName === "string"
              ? { scientificName: row.scientificName.slice(0, 200) }
              : {}),
          },
        };
      }
    }
    const cultivar = value.cultivar as Record<string, unknown> | undefined;
    if (
      cultivar?.kind === "entry" &&
      typeof cultivar.id === "string" &&
      UUID.test(cultivar.id) &&
      typeof cultivar.name === "string"
    ) {
      draft.cultivar = { kind: "entry", id: cultivar.id, name: cultivar.name.slice(0, 200) };
    } else if (cultivar?.kind === "new" && typeof cultivar.name === "string") {
      draft.cultivar = { kind: "new", name: cultivar.name.slice(0, 200) };
    } else if (cultivar?.kind === "own" && typeof cultivar.text === "string") {
      draft.cultivar = { kind: "own", text: cultivar.text.slice(0, 200) };
    }
    return draft;
  } catch {
    return {};
  }
}

const locationListeners = new Set<() => void>();

/** The step lives in the address; Back and a pushed step both reach here. */
function subscribeLocation(listener: () => void) {
  locationListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    locationListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function readSearch() {
  return window.location.search;
}

function pushStep(step: StepId) {
  const url = new URL(window.location.href);
  url.searchParams.set("step", step);
  window.history.pushState(window.history.state, "", url);
  for (const listener of locationListeners) listener();
}
