"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { OwnerUserIdField } from "@/components/auth/owner-scope";
import { OwnedPhotoField } from "@/components/garden/owned-photo-field";
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
import { HiddenField } from "@/components/ui/hidden-field";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import type { CreateSpaceFormState } from "@/app/(default)/garden/spaces/new/actions";
import { ownerScopeHeaders } from "@/lib/auth/session-signal";
import { gardenSpacePath } from "@/lib/garden/space-page";
import {
  spaceSetupReturnHref,
  validateSpaceSetup,
  type CreatedSpace,
  type SpaceSetupResponse,
} from "@/lib/garden/space-setup";
import { useOwnedPhotoUpload } from "@/lib/garden/use-owned-photo-upload";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { getOwnedPhotoCopy } from "@/lib/owned-photo-copy";
import { getSpaceSetupCopy } from "@/lib/space-setup-copy";

type Step = 1 | 2;
const TOTAL = 2;
const DRAFT_KEY = "overgarden:space-setup";

type Outcome =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "duplicate"; existing: CreatedSpace }
  | { kind: "photo_unavailable" }
  | { kind: "failed" }
  | { kind: "uncertain" }
  | { kind: "conflict" }
  | { kind: "signed-out" };

/**
 * Create a space as a full-screen stepper (ADR-0035 D1, ADR-0036 D1,
 * DESIGN.md §5.24): «Як називається простір?», then an optional photo with
 * the crop editor, then «Створити». The region is not asked: a new space's
 * region is hidden, and its settings can change that.
 *
 * - **Every step is an address.** The photo step is `?step=photo`, pushed
 *   onto the history, so the browser's and the phone's Back return to the
 *   name; the name survives a reload in the tab's session storage.
 * - **Without JavaScript** the first step's form posts to
 *   `createSpaceFormAction`, and the name alone creates the space.
 * - **The request id is the space's id**, made once per tab, so a double
 *   press or a retry after a lost response reads back one space.
 * - **Nothing is created for the gardener**: closing with anything typed or
 *   chosen asks first, in the product's own dialog.
 */
export function SpaceSetupFlow({
  locale,
  requestId: initialRequestId,
  returnTo = null,
  formAction,
}: {
  locale: InterfaceLocale;
  /** The page's id for this intent; the tab keeps its own once it has one. */
  requestId: string;
  /** A workspace path the created space's id is handed back to. */
  returnTo?: string | null;
  formAction: (
    previousState: unknown,
    formData: FormData,
  ) => Promise<CreateSpaceFormState>;
}) {
  const copy = getSpaceSetupCopy(locale);
  const photoCopy = getOwnedPhotoCopy(locale);
  const upload = useOwnedPhotoUpload();
  const [serverState, noScriptAction] = useActionState(formAction, undefined);
  // The tab's draft — the name and the intent's id — and the address's step,
  // read as the external stores they are: a reload on the photo step keeps
  // both, and a retry after one keeps the same space.
  const draftRaw = useSyncExternalStore(
    subscribeNever,
    readDraftRaw,
    () => null,
  );
  const draft = parseDraft(draftRaw);
  const search = useSyncExternalStore(subscribeLocation, readSearch, () => "");
  const [typedName, setName] = useState<string | null>(null);
  const name = typedName ?? draft.name ?? "";
  const requestId = draft.requestId ?? initialRequestId;
  const step: Step =
    new URLSearchParams(search).get("step") === "photo" && name.trim() ? 2 : 1;
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validateSpaceSetup>>(
    {},
  );
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [confirmClose, setConfirmClose] = useState(false);
  // While the crop editor is open its own «Скасувати» and «Готово» decide;
  // the step's buttons wait.
  const [editingPhoto, setEditingPhoto] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const exitHref = returnTo ?? "/garden";

  // What the no-JavaScript post said, once it rendered this page again.
  const serverErrors =
    serverState && "status" in serverState && serverState.status === "invalid"
      ? serverState.errors
      : {};
  const shownErrors = { ...serverErrors, ...errors };

  useEffect(() => {
    if (step === 1 && (shownErrors.name || serverState))
      nameRef.current?.focus();
    // Only on a new message, not while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverState]);

  const leave = useCallback(() => {
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing stored, nothing to forget.
    }
    window.location.assign(exitHref);
  }, [exitHref]);

  const requestClose = () => {
    if (name.trim() || upload.status !== "empty") setConfirmClose(true);
    else leave();
  };

  function goToPhoto() {
    const found = validateSpaceSetup({
      displayName: name,
      locationVisibility: "hidden",
      coarseRegionCode: null,
    });
    setErrors(found);
    if (found.name) {
      nameRef.current?.focus();
      return;
    }
    setOutcome({ kind: "idle" });
    pushStep("photo");
  }

  async function create(
    withPhoto: boolean,
    allowDuplicateName = allowDuplicate,
  ) {
    if (outcome.kind === "pending") return;
    setOutcome({ kind: "pending" });
    let photo = null;
    if (withPhoto && upload.status !== "empty") {
      try {
        photo = await upload.payload();
      } catch {
        setOutcome({ kind: "failed" });
        return;
      }
    }
    let response: Response;
    try {
      response = await fetch("/api/garden/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ownerScopeHeaders() },
        body: JSON.stringify({
          requestId,
          displayName: name,
          locationVisibility: "hidden",
          coarseRegionCode: null,
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
    let body: SpaceSetupResponse | null = null;
    try {
      body = (await response.json()) as SpaceSetupResponse;
    } catch {
      body = null;
    }
    if (body?.status === "created") {
      upload.committed();
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing stored.
      }
      window.location.assign(
        returnTo
          ? spaceSetupReturnHref(returnTo, body.space.id)
          : gardenSpacePath(body.space.id),
      );
      return;
    }
    upload.release();
    if (body?.status === "duplicate_name") {
      setOutcome({ kind: "duplicate", existing: body.existing });
    } else if (body?.status === "photo_unavailable") {
      upload.clear();
      setOutcome({ kind: "photo_unavailable" });
    } else if (body?.status === "invalid") {
      setErrors(body.errors);
      setOutcome({ kind: "idle" });
      window.history.back();
    } else if (body?.status === "conflict") {
      setOutcome({ kind: "conflict" });
    } else if (response.status === 503) {
      setOutcome({ kind: "uncertain" });
    } else {
      setOutcome({ kind: "failed" });
    }
  }

  const pending = outcome.kind === "pending";
  const duplicate =
    outcome.kind === "duplicate"
      ? outcome.existing
      : serverState &&
          "status" in serverState &&
          serverState.status === "duplicate"
        ? serverState.existing
        : null;
  const failure =
    outcome.kind === "failed" ||
    (serverState && "status" in serverState && serverState.status === "failed")
      ? copy.result.failed
      : outcome.kind === "uncertain"
        ? copy.result.uncertain
        : outcome.kind === "conflict" ||
            (serverState &&
              "status" in serverState &&
              serverState.status === "conflict")
          ? copy.result.conflict
          : outcome.kind === "photo_unavailable"
            ? photoCopy.unavailable
            : null;

  const status = (
    <>
      {duplicate ? (
        <Callout
          tone="warning"
          title={copy.duplicate.title(duplicate.displayName)}
          data-space-setup-duplicate="true"
        >
          <p>{copy.duplicate.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={
                returnTo
                  ? spaceSetupReturnHref(returnTo, duplicate.id)
                  : gardenSpacePath(duplicate.id)
              }
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {copy.duplicate.openExisting}
            </Link>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-space-setup-create-anyway="true"
              onClick={() => {
                setAllowDuplicate(true);
                if (step === 2) void create(upload.status !== "empty", true);
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
          data-space-setup-outcome={outcome.kind}
        >
          <p>{failure}</p>
        </Callout>
      ) : null}
      {outcome.kind === "signed-out" ||
      (serverState && "mutationScope" in serverState) ? (
        <Callout
          tone="danger"
          live="assertive"
          data-space-setup-outcome="signed-out"
          actions={
            <Link
              href={buildSignInHref({ returnTo: "/garden/spaces/new" })}
              className={buttonVariants({ size: "sm" })}
            >
              {copy.result.retry}
            </Link>
          }
        >
          <p>{copy.result.signedOut}</p>
        </Callout>
      ) : null}
    </>
  );

  return (
    <>
      <CreationStepper
        label={copy.title}
        step={step}
        total={TOTAL}
        progressLabel={copy.stepOf(step, TOTAL)}
        question={step === 1 ? copy.name.question : copy.photo.question}
        closeLabel={copy.close}
        onClose={requestClose}
        backLabel={copy.previous}
        onBack={step === 2 ? () => window.history.back() : undefined}
        primaryLabel={
          step === 1
            ? copy.next
            : pending
              ? copy.photo.creating
              : copy.photo.create
        }
        primaryPending={pending}
        primaryDisabled={
          step === 2 && (editingPhoto || upload.status === "failed")
        }
        secondary={
          step === 2 && upload.status === "empty"
            ? {
                label: copy.photo.skip,
                onClick: () => void create(false),
                disabled: pending || editingPhoto,
              }
            : undefined
        }
        endpoint={noScriptAction}
        formFields={
          <>
            <OwnerUserIdField />
            <HiddenField name="requestId" value={requestId} />
            {returnTo ? <HiddenField name="returnTo" value={returnTo} /> : null}
            {allowDuplicate || duplicate ? (
              <HiddenField name="allowDuplicateName" value="1" />
            ) : null}
          </>
        }
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 1) goToPhoto();
          else if (!editingPhoto && upload.status !== "failed")
            void create(true);
        }}
        status={status}
      >
        {step === 1 ? (
          <Field
            label={copy.name.label}
            error={
              shownErrors.name === "name_required"
                ? copy.name.required
                : shownErrors.name === "name_too_long"
                  ? copy.name.tooLong
                  : undefined
            }
          >
            <Input
              ref={nameRef}
              name="displayName"
              value={name}
              autoComplete="off"
              enterKeyHint="next"
              placeholder={copy.name.placeholder}
              maxLength={200}
              data-space-setup-name="true"
              data-creation-answer="true"
              onChange={(event) => {
                const typed = event.currentTarget.value;
                setName(typed);
                // Written as it is typed, never from a render: the first
                // render after a reload has not read the tab's draft yet.
                writeDraft({ name: typed, requestId });
                setAllowDuplicate(false);
                if (outcome.kind === "duplicate") setOutcome({ kind: "idle" });
              }}
            />
          </Field>
        ) : (
          <OwnedPhotoField
            upload={upload}
            copy={photoCopy}
            alt={copy.photo.alt(name.trim())}
            disabled={pending}
            onEditingChange={setEditingPhoto}
          />
        )}
      </CreationStepper>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent data-space-setup-discard="true">
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
              data-space-setup-leave="true"
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

function writeDraft(draft: { name: string; requestId: string }) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A tab that cannot store keeps the answers in memory only.
  }
}

function parseDraft(raw: string | null): { name?: string; requestId?: string } {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as { name?: unknown; requestId?: unknown };
    return {
      ...(typeof value.name === "string" ? { name: value.name } : {}),
      ...(typeof value.requestId === "string" &&
      /^[0-9a-f-]{36}$/iu.test(value.requestId)
        ? { requestId: value.requestId }
        : {}),
    };
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

function pushStep(step: "photo") {
  const url = new URL(window.location.href);
  url.searchParams.set("step", step);
  window.history.pushState(window.history.state, "", url);
  for (const listener of locationListeners) listener();
}
