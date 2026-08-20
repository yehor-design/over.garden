"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useSignOut } from "@/components/auth/sign-out-provider";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resolveLegacyOwnerVaultBinding } from "@/lib/legacy-device-work/ove322-retirement-bridge";
import { createOve322LegacyDeviceRetirementPort } from "@/lib/legacy-device-work/ove322-retirement-adapter";
import {
  createLegacyDeviceRetirementController,
  type LegacyDeviceRetirementController,
  type LegacyRetirementIdentity,
  type LegacyRetirementSnapshot,
} from "@/lib/retirement/legacy-device-retirement";
import { getLegacyDeviceRetirementCopy } from "@/lib/retirement/legacy-device-retirement-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";

type ControllerFactory = (input: {
  ownerUserId?: string;
  sessionGeneration?: string;
  documentMutationGeneration?: string;
}) => Promise<LegacyDeviceRetirementController | null>;

interface LegacyDeviceRetirementBannerProps {
  locale: InterfaceLocale;
  ownerUserId?: string;
  sessionGeneration?: string;
  documentMutationGeneration?: string;
  /** Synthetic fixture/test seam; production always uses the exact bridge. */
  controllerFactory?: ControllerFactory;
}

export function LegacyDeviceRetirementBanner(
  props: LegacyDeviceRetirementBannerProps,
) {
  const identityKey = [
    props.ownerUserId ?? "owner-unavailable",
    props.sessionGeneration ?? "session-unavailable",
    props.documentMutationGeneration ?? "document-unavailable",
  ].join(":");
  return <LegacyDeviceRetirementBannerInstance key={identityKey} {...props} />;
}

function LegacyDeviceRetirementBannerInstance({
  locale,
  ownerUserId,
  sessionGeneration,
  documentMutationGeneration,
  controllerFactory,
}: LegacyDeviceRetirementBannerProps) {
  const copy = getLegacyDeviceRetirementCopy(locale);
  const signOut = useSignOut();
  const controllerRef = useRef<LegacyDeviceRetirementController | null>(null);
  const [snapshot, setSnapshot] = useState<LegacyRetirementSnapshot | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);
  const factory = useMemo<ControllerFactory>(
    () =>
      controllerFactory ??
      (async (context) => {
        if (
          !context.ownerUserId ||
          !context.sessionGeneration ||
          !context.documentMutationGeneration
        ) {
          return null;
        }
        const binding = await resolveLegacyOwnerVaultBinding(
          context.sessionGeneration,
        );
        if (!binding) return null;
        const identity: LegacyRetirementIdentity = {
          ownerUserId: context.ownerUserId,
          ownerVaultBinding: binding,
          sessionGeneration: context.sessionGeneration,
          documentMutationGeneration: context.documentMutationGeneration,
        };
        return createLegacyDeviceRetirementController({
          identity,
          port: createOve322LegacyDeviceRetirementPort(),
        });
      }),
    [controllerFactory],
  );

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void factory({
      ownerUserId,
      sessionGeneration,
      documentMutationGeneration,
    }).then(async (controller) => {
      if (disposed || !controller) return;
      controllerRef.current = controller;
      const update = () => {
        if (!disposed) setSnapshot({ ...controller.getSnapshot() });
      };
      unsubscribe = controller.subscribe(update);
      update();
      await controller.inspect();
      update();
    });
    return () => {
      disposed = true;
      unsubscribe?.();
      controllerRef.current?.cancel();
      controllerRef.current = null;
    };
  }, [documentMutationGeneration, factory, ownerUserId, sessionGeneration]);

  if (!snapshot?.visible || dismissed) return null;

  const controller = controllerRef.current;
  const busy = ["transferring", "verifying", "deleting"].includes(
    snapshot.state,
  );
  const retryable = [
    "failed_retryable",
    "conflict_blocked",
    "deletion_blocked",
    "session_changed",
  ].includes(snapshot.state);
  const discardOpen = snapshot.state === "discard_confirmation";
  const status = visibleStateCopy(snapshot, copy.states);

  return (
    <>
      <section
        role="region"
        aria-label={copy.ariaLabel}
        data-legacy-device-retirement={snapshot.state}
        data-retirement-window-ends="OVE-323-production"
        className="border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-50"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold">{copy.title}</h2>
            <p className="mt-1 text-sm leading-6">{copy.reason}</p>
            <p className="text-sm leading-6">
              {copy.counts({
                drafts: snapshot.counts.drafts,
                mutations:
                  snapshot.counts.mutations +
                  snapshot.counts.syncedReceipts +
                  snapshot.counts.photoUploads,
                mediaIntents: snapshot.counts.mediaIntents,
              })}
            </p>
            <p className="text-sm leading-6" data-retirement-window-copy="true">
              {copy.windowEnds}
            </p>
            <p
              role="status"
              aria-live="polite"
              className="mt-1 text-sm font-medium"
            >
              {status}
              {busy && snapshot.progress.total > 0
                ? ` ${copy.progress(
                    snapshot.progress.verified,
                    snapshot.progress.total,
                  )}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {snapshot.state === "offered" ? (
              <Button
                type="button"
                className="min-h-11"
                data-retirement-transfer="true"
                onClick={() => void controller?.transfer()}
              >
                {copy.actions.transfer}
              </Button>
            ) : null}
            {retryable ? (
              <Button
                type="button"
                className="min-h-11"
                data-retirement-retry="true"
                onClick={() => void controller?.retry()}
              >
                {copy.actions.retry}
              </Button>
            ) : null}
            {busy ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                data-retirement-cancel="true"
                onClick={() => controller?.cancel()}
              >
                {copy.actions.cancel}
              </Button>
            ) : null}
            {snapshot.state === "divergent_copy" ? (
              <>
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => void controller?.resolveDivergence("device")}
                >
                  {copy.actions.keepDevice}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void controller?.resolveDivergence("server")}
                >
                  {copy.actions.keepServer}
                </Button>
              </>
            ) : null}
            {mayDiscard(snapshot.state) ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                data-retirement-discard="true"
                onClick={() => controller?.requestDiscard()}
              >
                {copy.actions.discard}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              data-retirement-sign-out="true"
              onClick={signOut.requestSignOut}
            >
              {copy.actions.signOut}
            </Button>
            {!busy && snapshot.state !== "discard_confirmation" ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => setDismissed(true)}
              >
                {copy.actions.dismiss}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => {
          if (!open) controller?.cancelDiscard();
        }}
      >
        <AlertDialogContent data-retirement-discard-dialog="true">
          <AlertDialogTitle>{copy.discard.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {snapshot.discardConfirmationStep === 2
              ? copy.discard.secondDescription
              : copy.discard.firstDescription}
            {` ${copy.counts({
              drafts: snapshot.counts.drafts,
              mutations:
                snapshot.counts.mutations +
                snapshot.counts.syncedReceipts +
                snapshot.counts.photoUploads,
              mediaIntents: snapshot.counts.mediaIntents,
            })}`}
          </AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              autoFocus
              onClick={() => controller?.cancelDiscard()}
            >
              {copy.discard.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void controller?.confirmDiscard()}
            >
              {snapshot.discardConfirmationStep === 2
                ? copy.discard.secondAction
                : copy.discard.firstAction}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function mayDiscard(state: LegacyRetirementSnapshot["state"]) {
  return [
    "offered",
    "failed_retryable",
    "conflict_blocked",
    "bounded_inventory",
    "deletion_blocked",
    "divergent_copy",
  ].includes(state);
}

function visibleStateCopy(
  snapshot: LegacyRetirementSnapshot,
  states: ReturnType<typeof getLegacyDeviceRetirementCopy>["states"],
) {
  if (snapshot.state === "discard_confirmation") {
    return states.offered;
  }
  if (
    snapshot.state === "checking" ||
    snapshot.state === "absent" ||
    snapshot.state === "detected"
  ) {
    return states.offered;
  }
  return states[snapshot.state];
}
