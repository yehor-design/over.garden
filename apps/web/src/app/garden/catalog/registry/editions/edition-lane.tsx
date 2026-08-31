"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getStableRegistryEditionCopy,
  type StableRegistryEditionCopy,
} from "@/lib/operator-curation-copy";
import {
  EDITION_DECISION_ACTIONS,
  type EditionCenterReadModel,
  type EditionDiffGroupSummary,
} from "@/lib/stable-registry/edition-actions";

import type { EditionActionState } from "../edition-actions";

type EditionAction = (formData: FormData) => Promise<EditionActionState>;

const RELATION_DECISIONS = new Set([
  "same_concept",
  "record_equivalence",
  "create_successor",
  "record_split",
]);

export function StableRegistryEditionLane({
  locale,
  model,
  prepareAction,
  decideAction,
  approveAction,
  pointerAction,
}: {
  locale: InterfaceLocale;
  model: EditionCenterReadModel;
  prepareAction: EditionAction;
  decideAction: EditionAction;
  approveAction: EditionAction;
  pointerAction: EditionAction;
}) {
  const copy = getStableRegistryEditionCopy(locale);
  const edition = model.edition;

  return (
    <section
      className="flex min-w-0 flex-col gap-6"
      aria-labelledby="edition-summary-heading"
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2
          id="edition-summary-heading"
          className="text-xl font-semibold text-foreground"
        >
          {copy.editionSummary}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.editionSummaryDescription}
        </p>
        {edition ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric
              label={copy.editionState}
              value={copy.editionStates[edition.state]}
            />
            <Metric
              label={copy.unchangedRecords}
              value={String(edition.unchangedCount)}
            />
            <Metric
              label={copy.reviewableGroups}
              value={String(edition.reviewableCount)}
            />
            <Metric
              label={copy.blockingGroups}
              value={String(edition.blockingCount)}
            />
            <Metric
              label={copy.affectedObjects}
              value={String(edition.totalAffectedObjectCount)}
            />
            <Metric
              label={copy.activeRelease}
              value={model.activeReleaseId ? model.activeReleaseId : "—"}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{copy.noEdition}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          {copy.prepareEdition}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.prepareEditionDescription}
        </p>
        {model.availableCaptures.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {copy.noCaptureAvailable}
          </p>
        ) : (
          <DocumentMutationActionForm action={prepareAction}>
            <div className="mt-3 flex flex-col gap-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="edition-capture"
              >
                {copy.prepareEditionCapture}
              </label>
              <select
                id="edition-capture"
                name="captureId"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                disabled={!model.writesEnabled}
              >
                {model.availableCaptures.map((capture) => (
                  <option key={capture.captureId} value={capture.captureId}>
                    {capture.observedEndedAt}
                  </option>
                ))}
              </select>
              <SubmitButton label={copy.prepareEditionSubmit} />
            </div>
          </DocumentMutationActionForm>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          {copy.diffGroupsTitle}
        </h2>
        {model.diffGroups.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {copy.noDiffGroups}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {model.diffGroups.map((group) => (
              <li
                key={group.id}
                className="rounded-lg border border-border p-4"
                data-diff-class={group.diffClass}
                data-group-state={group.state}
              >
                <h3 className="text-base font-medium text-foreground">
                  {copy.diffClasses[group.diffClass]}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {copy.groupStates[group.state]} · {group.memberCount} ·{" "}
                  {copy.affectedObjects}: {group.affectedObjectCount}
                </p>
                {edition && model.writesEnabled ? (
                  <DecisionForm
                    copy={copy}
                    action={decideAction}
                    releaseId={edition.id}
                    group={group}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          {copy.activationHistoryTitle}
        </h2>
        {model.activationHistory.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {copy.noActivationHistory}
          </p>
        ) : (
          <ol className="mt-3 grid gap-2 text-sm text-foreground">
            {model.activationHistory.map((receipt) => (
              <li
                key={receipt.sequenceNumber}
                data-transition={receipt.transition}
                data-receipt-state={receipt.state}
              >
                #{receipt.sequenceNumber} ·{" "}
                {copy.transitions[receipt.transition]} ·{" "}
                {copy.receiptStates[receipt.state]} · {copy.affectedObjects}:{" "}
                {receipt.affectedObjectCount}
              </li>
            ))}
          </ol>
        )}
      </div>

      {edition && model.writesEnabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <DocumentMutationActionForm action={approveAction}>
            <input type="hidden" name="releaseId" value={edition.id} />
            <input
              type="hidden"
              name="expectedVersion"
              value={String(edition.version)}
            />
            <SubmitButton label={copy.approvePreview} />
          </DocumentMutationActionForm>

          {edition.previewDigest ? (
            <>
              <PointerForm
                action={pointerAction}
                releaseId={edition.id}
                previewDigest={edition.previewDigest}
                transition="activate"
                label={copy.activateEdition}
              />
              <PointerForm
                action={pointerAction}
                releaseId={edition.id}
                previewDigest={edition.previewDigest}
                transition="rollback"
                label={copy.rollbackEdition}
              />
              <PointerForm
                action={pointerAction}
                releaseId={edition.id}
                previewDigest={edition.previewDigest}
                transition="forward"
                label={copy.forwardEdition}
              />
            </>
          ) : null}

          {/* Wait-safe: both stay enabled while a diff job is still running. */}
          <button
            type="button"
            data-edition-cancel="true"
            className={buttonVariants({ variant: "outline" })}
          >
            {copy.cancelEdition}
          </button>
          <Link
            href="/garden/catalog/registry"
            className={buttonVariants({ variant: "outline" })}
          >
            {copy.keepCurrentRelease}
          </Link>
        </div>
      ) : (
        <Link
          href="/garden/catalog/registry"
          className={buttonVariants({ variant: "outline" })}
        >
          {copy.keepCurrentRelease}
        </Link>
      )}

      <p className="text-sm text-muted-foreground">
        {copy.activationConfirmation}
      </p>
    </section>
  );
}

function PointerForm({
  action,
  releaseId,
  previewDigest,
  transition,
  label,
}: {
  action: EditionAction;
  releaseId: string;
  previewDigest: string;
  transition: "activate" | "rollback" | "forward";
  label: string;
}) {
  return (
    <DocumentMutationActionForm action={action}>
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="previewDigest" value={previewDigest} />
      <input type="hidden" name="transition" value={transition} />
      <SubmitButton label={label} />
    </DocumentMutationActionForm>
  );
}

function DecisionForm({
  copy,
  action,
  releaseId,
  group,
}: {
  copy: StableRegistryEditionCopy;
  action: EditionAction;
  releaseId: string;
  group: EditionDiffGroupSummary;
}) {
  const [decision, setDecision] = useState<string>(EDITION_DECISION_ACTIONS[0]);
  const decisionId = `edition-decision-${group.id}`;
  const fromId = `edition-from-${group.id}`;
  const toId = `edition-to-${group.id}`;

  return (
    <DocumentMutationActionForm action={action}>
      <input type="hidden" name="releaseId" value={releaseId} />
      <input type="hidden" name="groupId" value={group.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={String(group.expectedVersion)}
      />
      {/* The impact the owner is deciding against; a changed count is stale. */}
      <input
        type="hidden"
        name="expectedAffectedObjectCount"
        value={String(group.affectedObjectCount)}
      />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={decisionId} className="text-sm text-muted-foreground">
            {copy.decision}
          </label>
          <select
            id={decisionId}
            name="action"
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            {EDITION_DECISION_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {copy.decisionLabels[value]}
              </option>
            ))}
          </select>
        </div>

        {RELATION_DECISIONS.has(decision) ? (
          <>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={fromId} className="text-sm text-muted-foreground">
                {copy.fromCatalogItemId}
              </label>
              <input
                id={fromId}
                name="fromCatalogItemId"
                className="min-h-11 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={toId} className="text-sm text-muted-foreground">
                {copy.toCatalogItemId}
              </label>
              <input
                id={toId}
                name="toCatalogItemId"
                className="min-h-11 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </div>
          </>
        ) : null}

        <SubmitButton label={copy.saveDecision} />
      </div>
    </DocumentMutationActionForm>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonVariants({ variant: "outline" })}
    >
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-base font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
