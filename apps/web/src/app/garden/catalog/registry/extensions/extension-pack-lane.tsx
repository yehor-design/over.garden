"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getStableRegistryExtensionPackCopy,
  type StableRegistryExtensionPackCopy,
} from "@/lib/operator-curation-copy";
import {
  EXTENSION_PACK_DECISION_ACTIONS,
  type ExtensionPackCenterReadModel,
} from "@/lib/stable-registry/extension-pack-actions";

import type { ExtensionPackActionState } from "../extension-actions";

type ExtensionPackAction = (
  formData: FormData,
) => Promise<ExtensionPackActionState>;

export function StableRegistryExtensionPackLane({
  locale,
  model,
  decideAction,
  approveAction,
  activateAction,
  abandonAction,
}: {
  locale: InterfaceLocale;
  model: ExtensionPackCenterReadModel;
  decideAction: ExtensionPackAction;
  approveAction: ExtensionPackAction;
  activateAction: ExtensionPackAction;
  abandonAction: ExtensionPackAction;
}) {
  const copy = getStableRegistryExtensionPackCopy(locale);
  const pack = model.selectedPack;

  return (
    <section
      className="flex min-w-0 flex-col gap-6"
      aria-labelledby="extension-pack-summary-heading"
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2
          id="extension-pack-summary-heading"
          className="text-xl font-semibold text-foreground"
        >
          {copy.packSummary}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.packSummaryDescription}
        </p>

        {pack ? (
          <>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label={copy.sourceFamily} value={pack.sourceSlug} />
              <Metric
                label={copy.packKindLabel}
                value={copy.packKinds[pack.packKind]}
              />
              <Metric
                label={copy.packState}
                value={copy.packStates[pack.state]}
              />
              <Metric label={copy.totalRows} value={String(pack.rowCount)} />
              <Metric
                label={copy.cleanRows}
                value={String(pack.cleanRowCount)}
              />
              <Metric
                label={copy.productEligibleRows}
                value={String(pack.productEligibleRowCount)}
              />
            </dl>
            <p
              className="mt-3 text-sm text-muted-foreground"
              data-exception-row-count={pack.exceptionRowCount}
            >
              {copy.exceptionRows}: {pack.exceptionRowCount}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{copy.noPacks}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          {copy.exceptionGroupsTitle}
        </h2>
        {model.exceptionGroups.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {copy.noExceptionGroups}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {model.exceptionGroups.map((group) => (
              <li
                key={group.rowClass}
                className="rounded-lg border border-border p-4"
                data-row-class={group.rowClass}
              >
                <h3 className="text-base font-medium text-foreground">
                  {copy.rowClasses[group.rowClass]}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {copy.totalRows}: {group.rowCount} · {copy.parentBound}:{" "}
                  {group.parentBoundCount}
                </p>
                {pack && model.writesEnabled ? (
                  <DecisionForm
                    copy={copy}
                    action={decideAction}
                    packId={pack.id}
                    rowClass={group.rowClass}
                    expectedVersion={group.expectedVersion}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          {copy.userNamesTitle}
        </h2>
        {model.userNameGroups.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {copy.noUserNames}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 text-sm text-foreground">
            {model.userNameGroups.map((group) => (
              <li key={group.state} data-user-name-state={group.state}>
                {copy.userNameStates[group.state]}: {group.nameCount}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pack && model.writesEnabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <DocumentMutationActionForm action={approveAction}>
            <input type="hidden" name="packId" value={pack.id} />
            <input
              type="hidden"
              name="expectedVersion"
              value={String(pack.version)}
            />
            <SubmitButton label={copy.approvePreview} />
          </DocumentMutationActionForm>

          {pack.previewDigest ? (
            <DocumentMutationActionForm action={activateAction}>
              <input type="hidden" name="packId" value={pack.id} />
              <input
                type="hidden"
                name="previewDigest"
                value={pack.previewDigest}
              />
              <SubmitButton label={copy.activatePack} />
            </DocumentMutationActionForm>
          ) : null}

          {/* Wait-safe: both controls stay enabled while a pack is parsing. */}
          <DocumentMutationActionForm action={abandonAction}>
            <input type="hidden" name="packId" value={pack.id} />
            <SubmitButton label={copy.cancelPackImport} alwaysEnabled />
          </DocumentMutationActionForm>
          <Link
            href="/garden"
            className={buttonVariants({ variant: "outline" })}
          >
            {copy.returnToActiveCatalog}
          </Link>
        </div>
      ) : (
        <Link href="/garden" className={buttonVariants({ variant: "outline" })}>
          {copy.returnToActiveCatalog}
        </Link>
      )}

      <p className="text-sm text-muted-foreground">
        {copy.activationConfirmation}
      </p>
    </section>
  );
}

function DecisionForm({
  copy,
  action,
  packId,
  rowClass,
  expectedVersion,
}: {
  copy: StableRegistryExtensionPackCopy;
  action: ExtensionPackAction;
  packId: string;
  rowClass: string;
  expectedVersion: number;
}) {
  const [decision, setDecision] = useState<string>(
    EXTENSION_PACK_DECISION_ACTIONS[0],
  );
  const decisionId = `extension-decision-${rowClass}`;
  const parentId = `extension-parent-${rowClass}`;

  return (
    <DocumentMutationActionForm action={action}>
      <input type="hidden" name="packId" value={packId} />
      <input type="hidden" name="rowClass" value={rowClass} />
      <input
        type="hidden"
        name="expectedVersion"
        value={String(expectedVersion)}
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
            {EXTENSION_PACK_DECISION_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {copy.decisionLabels[value]}
              </option>
            ))}
          </select>
        </div>

        {decision === "bind_parent" ? (
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={parentId} className="text-sm text-muted-foreground">
              {copy.parentCatalogItemId}
            </label>
            <input
              id={parentId}
              name="parentCatalogItemId"
              className="min-h-11 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
          </div>
        ) : null}

        <SubmitButton label={copy.saveDecision} />
      </div>
    </DocumentMutationActionForm>
  );
}

function SubmitButton({
  label,
  alwaysEnabled = false,
}: {
  label: string;
  alwaysEnabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={alwaysEnabled ? false : pending}
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
