"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { IrreversibleActionConfirmation } from "@/components/stable-registry/irreversible-action-confirmation";
import { buttonVariants } from "@/components/ui/button";
import { formatOperatorTemplate } from "@/lib/operator-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  REGISTRY_DECISION_ACTIONS,
  type StableRegistryReleaseCenterReadModel,
} from "@/lib/stable-registry/decision-actions";
import {
  getStableRegistryCopy,
  type StableRegistryCopy,
} from "@/lib/operator-curation-copy";
import type { StableRegistryActionResult } from "./actions";

type RegistryAction = (
  formData: FormData,
) => Promise<StableRegistryActionResult>;

export function StableRegistryReleaseCenter({
  locale,
  model,
  buildAction,
  decideAction,
  approveAction,
  activateAction,
  abandonAction,
}: {
  locale: InterfaceLocale;
  model: StableRegistryReleaseCenterReadModel;
  buildAction: RegistryAction;
  decideAction: RegistryAction;
  approveAction: RegistryAction;
  activateAction: RegistryAction;
  abandonAction: RegistryAction;
}) {
  const copy = getStableRegistryCopy(locale);
  const release = model.latestRelease;

  return (
    <section
      className="flex min-w-0 flex-col gap-6"
      aria-labelledby="registry-summary-heading"
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2
          id="registry-summary-heading"
          className="text-xl font-semibold text-foreground"
        >
          {copy.summaryTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.summaryDescription}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric
            label={copy.completedCaptures}
            value={String(model.completedCaptureCount)}
          />
          <Metric
            label={copy.releaseMembers}
            value={String(release?.memberCount ?? 0)}
          />
          <Metric
            label={copy.exceptionGroups}
            value={String(release?.openGroupCount ?? 0)}
          />
        </dl>
      </div>

      {!release ? (
        <ActionForm
          action={buildAction}
          copy={copy}
          successText={copy.buildQueued}
        >
          <button type="submit" className={buttonVariants()}>
            {copy.buildFoundation}
          </button>
        </ActionForm>
      ) : (
        <>
          <ReleaseState copy={copy} release={release} />
          {release.state === "draft" || release.state === "building" ? (
            <ActionForm
              action={abandonAction}
              copy={copy}
              successText={copy.cancelled}
            >
              <input type="hidden" name="releaseId" value={release.id} />
              <button
                type="submit"
                className={buttonVariants({ variant: "outline" })}
              >
                {copy.cancelBuild}
              </button>
            </ActionForm>
          ) : null}
          {release.state === "review_ready" ? (
            <>
              <ExceptionGroups
                copy={copy}
                releaseId={release.id}
                groups={model.exceptionGroups}
                decideAction={decideAction}
              />
              <ActionForm
                action={approveAction}
                copy={copy}
                successText={copy.previewApproved}
              >
                <input type="hidden" name="releaseId" value={release.id} />
                <button
                  type="submit"
                  className={buttonVariants()}
                  disabled={
                    release.openGroupCount > 0 || release.blockingGroupCount > 0
                  }
                >
                  {copy.approvePreview}
                </button>
              </ActionForm>
              <ActionForm
                action={abandonAction}
                copy={copy}
                successText={copy.cancelled}
              >
                <input type="hidden" name="releaseId" value={release.id} />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline" })}
                >
                  {copy.cancelBuild}
                </button>
              </ActionForm>
            </>
          ) : null}
          {release.state === "approved" && release.previewDigest ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                {copy.activationConfirmation}
              </p>
              <ActionForm
                action={activateAction}
                copy={copy}
                successText={copy.activated}
              >
                <input type="hidden" name="releaseId" value={release.id} />
                <input
                  type="hidden"
                  name="previewDigest"
                  value={release.previewDigest}
                />
                <IrreversibleActionConfirmation
                  text={formatOperatorTemplate(copy.activationAcknowledge, {
                    eligible: release.eligibleMemberCount,
                    members: release.memberCount,
                  })}
                />
                <button
                  type="submit"
                  className={buttonVariants({ className: "mt-4" })}
                >
                  {copy.activateFoundation}
                </button>
              </ActionForm>
            </div>
          ) : null}
        </>
      )}
      <Link
        href="/garden"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {copy.returnToCatalog}
      </Link>
    </section>
  );
}

function ExceptionGroups({
  copy,
  releaseId,
  groups,
  decideAction,
}: {
  copy: StableRegistryCopy;
  releaseId: string;
  groups: StableRegistryReleaseCenterReadModel["exceptionGroups"];
  decideAction: RegistryAction;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{copy.noExceptionGroups}</p>
    );
  }

  return (
    <section
      aria-labelledby="registry-exceptions-heading"
      className="rounded-xl border border-border bg-card p-5"
    >
      <h2
        id="registry-exceptions-heading"
        className="text-xl font-semibold text-foreground"
      >
        {copy.exceptionGroups}
      </h2>
      <ul className="mt-4 space-y-3" aria-live="polite">
        {groups.map((group) => (
          <li
            key={group.id}
            id={`registry-exception-${group.id}`}
            tabIndex={-1}
            className="rounded-lg border border-border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-foreground">
                {copy.reasonLabels[group.reasonClass]}
              </h3>
              <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                {copy.records}: {group.memberCount}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {copy.groupStates[group.state]}
            </p>
            {group.state === "open" ? (
              <ActionForm
                action={decideAction}
                copy={copy}
                successText={copy.decisionSaved}
                focusTargetId={`registry-exception-${group.id}`}
                className="mt-3 flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="releaseId" value={releaseId} />
                <input type="hidden" name="groupId" value={group.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={group.expectedVersion}
                />
                <label className="flex min-w-52 flex-col gap-1 text-sm font-medium text-foreground">
                  {copy.decision}
                  <select
                    name="action"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {REGISTRY_DECISION_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {copy.decisionLabels[action]}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton label={copy.saveDecision} />
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReleaseState({
  copy,
  release,
}: {
  copy: StableRegistryCopy;
  release: NonNullable<StableRegistryReleaseCenterReadModel["latestRelease"]>;
}) {
  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      aria-label={copy.releaseState}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">
          {copy.releaseState}
        </h2>
        <span className="rounded-md border border-border px-2 py-1 text-sm text-foreground">
          {copy.releaseStates[release.state]}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label={copy.releaseMembers}
          value={String(release.memberCount)}
        />
        <Metric
          label={copy.productEligible}
          value={String(release.eligibleMemberCount)}
        />
        <Metric
          label={copy.blockingGroups}
          value={String(release.blockingGroupCount)}
        />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function ActionForm({
  action,
  copy,
  successText,
  focusTargetId,
  children,
  className,
}: {
  action: RegistryAction;
  copy: StableRegistryCopy;
  successText: string;
  focusTargetId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(formData: FormData) {
    const result = await action(formData);
    if ("outcome" in result) {
      setFeedback(
        result.outcome === "accepted"
          ? successText
          : copy.outcomeLabels[result.outcome],
      );
      if (result.outcome === "accepted" && focusTargetId) {
        window.requestAnimationFrame(() => {
          document.getElementById(focusTargetId)?.focus();
        });
      }
    }
    return result;
  }

  return (
    <OwnerScopedActionForm action={submit} className={className}>
      {children}
      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-sm text-muted-foreground"
        >
          {feedback}
        </p>
      ) : null}
    </OwnerScopedActionForm>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonVariants()}>
      {pending ? "…" : label}
    </button>
  );
}
