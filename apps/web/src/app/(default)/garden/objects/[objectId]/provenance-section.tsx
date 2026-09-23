import Link from "next/link";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatGardenWorkspaceDate } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
  type OwnerObjectCopy,
} from "@/lib/owner-object-copy";
import type {
  LineagePlantObjectOption,
  LineageProvenanceEdgeReadback,
  ObjectProvenancePanel,
} from "@/server/lineage-repository";

import {
  createLineageInvitationAction,
  createProvenanceEdgeAction,
} from "./actions";
import { ProvenanceSourceObjectForm } from "./provenance-source-object-form";

/**
 * Where the object came from (`OVE-491`: its own page, apart from reading and
 * writing). Three ways to record a source — one of the gardener's own objects
 * of the same kind, a private reference, an invited source — and the records,
 * each with its consent and visibility in words.
 */
export function ProvenanceSection({
  objectId,
  subjectName,
  objectKind,
  provenancePanel,
  writeEnabled,
  lineageReadbackPath,
  locale,
}: {
  objectId: string;
  subjectName: string;
  objectKind: string;
  provenancePanel: ObjectProvenancePanel;
  writeEnabled: boolean;
  lineageReadbackPath: string | null;
  locale: InterfaceLocale;
}) {
  const provenanceCopy = getOwnerObjectCopy(locale).provenance;

  // What is recorded comes first; the three ways to add a source follow
  // under their own heading, apart from reading (`OVE-491`).
  return (
    <>
      <section
        id="passport-provenance"
        aria-labelledby="passport-provenance-heading"
        className="grid min-w-0 gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="passport-provenance-heading"
            className="text-h3 text-text-heading"
          >
            {provenanceCopy.recordsTitle}
          </h2>
          <p className="text-body-sm text-text-muted">
            {provenanceCopy.description}
          </p>
        </div>
        <ProvenanceRecords
          edges={provenancePanel.edges}
          lineageReadbackPath={lineageReadbackPath}
          locale={locale}
        />
      </section>

      {writeEnabled ? (
        <section
          id="passport-provenance-add"
          aria-labelledby="passport-provenance-add-heading"
          className="grid min-w-0 gap-4 border-t border-border pt-5"
        >
          <h2
            id="passport-provenance-add-heading"
            className="text-h3 text-text-heading"
          >
            {provenanceCopy.addTitle}
          </h2>
          <ProvenanceForms
            objectId={objectId}
            subjectName={subjectName}
            objectKind={objectKind}
            options={provenancePanel.sourceObjectOptions}
            locale={locale}
          />
        </section>
      ) : null}
    </>
  );
}

function ProvenanceForms({
  objectId,
  subjectName,
  objectKind,
  options,
  locale,
}: {
  objectId: string;
  subjectName: string;
  objectKind: string;
  options: readonly LineagePlantObjectOption[];
  locale: InterfaceLocale;
}) {
  const provenanceCopy = getOwnerObjectCopy(locale).provenance;
  return (
    // One column: three short forms read in order, each with room for its
    // own words, rather than three squeezed side by side.
    <div className="grid max-w-2xl min-w-0 gap-4">
      {options.length > 0 ? (
        <ProvenanceSourceObjectForm
          locale={locale}
          objectId={objectId}
          subjectName={subjectName}
          objectKind={objectKind}
          clientMutationId={crypto.randomUUID()}
          options={options.map((option) => ({
            id: option.id,
            displayName: option.displayName,
            label: lineageObjectOptionLabel(option, provenanceCopy),
          }))}
          action={createProvenanceEdgeAction}
        />
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-body-sm text-text-muted">
          {objectKind === "animal"
            ? provenanceCopy.noSourceAnimals
            : provenanceCopy.noSourcePlants}
        </p>
      )}

      <OwnerScopedProgressiveForm
        action={createProvenanceEdgeAction}
        className="grid min-w-0 gap-3 rounded-md border border-border p-3"
      >
        <HiddenField name="objectId" value={objectId} />
        <HiddenField name="sourceKind" value="source_reference" />
        <HiddenField name="clientMutationId" value={crypto.randomUUID()} />
        <Field label={provenanceCopy.sourceType} required className="min-w-0">
          <Select name="sourceReferenceKind" defaultValue="person">
            <option value="person">{provenanceCopy.sourceTypes.person}</option>
            <option value="seed_packet">
              {provenanceCopy.sourceTypes.seedPacket}
            </option>
            <option value="nursery">
              {provenanceCopy.sourceTypes.nursery}
            </option>
            <option value="catalog_variety">
              {provenanceCopy.sourceTypes.catalogVariety}
            </option>
            <option value="other">{provenanceCopy.sourceTypes.other}</option>
          </Select>
        </Field>
        <Field
          label={provenanceCopy.privateSourceLabel}
          required
          className="min-w-0"
        >
          <Input
            name="sourceReferenceLabel"
            maxLength={120}
            placeholder={provenanceCopy.privateSourcePlaceholder}
          />
        </Field>
        <p className="text-caption leading-5 text-text-muted">
          {provenanceCopy.contactFree}
        </p>
        <button
          type="submit"
          className={buttonVariants({ className: "justify-self-start" })}
        >
          {provenanceCopy.recordPrivateSource}
        </button>
      </OwnerScopedProgressiveForm>

      <OwnerScopedProgressiveForm
        action={createLineageInvitationAction}
        className="grid min-w-0 gap-3 rounded-md border border-border p-3"
      >
        <HiddenField name="objectId" value={objectId} />
        <HiddenField name="clientMutationId" value={crypto.randomUUID()} />
        <Field
          label={provenanceCopy.invitedSourceLabel}
          required
          className="min-w-0"
        >
          <Input
            name="pendingSourceLabel"
            maxLength={120}
            placeholder={provenanceCopy.invitedSourcePlaceholder}
          />
        </Field>
        <p className="text-caption leading-5 text-text-muted">
          {provenanceCopy.invitationHelp}
        </p>
        <button
          type="submit"
          className={buttonVariants({ className: "justify-self-start" })}
        >
          {provenanceCopy.createInvite}
        </button>
      </OwnerScopedProgressiveForm>
    </div>
  );
}

function ProvenanceRecords({
  edges,
  lineageReadbackPath,
  locale,
}: {
  edges: ObjectProvenancePanel["edges"];
  lineageReadbackPath: string | null;
  locale: InterfaceLocale;
}) {
  const provenanceCopy = getOwnerObjectCopy(locale).provenance;
  return (
    <>
      {edges.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-body-sm text-text-muted">
          {provenanceCopy.empty}
        </p>
      ) : (
        <ol className="grid gap-3" data-provenance-records="true">
          {edges.map((edge) => (
            <li key={edge.id} className="rounded-md border border-border p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-h4 text-text-heading">
                  {lineageEdgeTitle(edge, provenanceCopy)}
                </h3>
                <time className="text-caption text-text-muted">
                  {formatGardenWorkspaceDate(locale, edge.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-caption text-text-muted">
                {lineageConsentLabel(edge, provenanceCopy)} ·{" "}
                {lineageVisibilityLabel(edge, provenanceCopy)}
              </p>
              {edge.pendingIdentity ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  <span className="text-caption text-text-muted">
                    {formatOwnerObjectTemplate(provenanceCopy.inviteState, {
                      state: lineagePendingInviteStateLabel(
                        edge.pendingIdentity.inviteState,
                        provenanceCopy,
                      ),
                    })}
                  </span>
                  {edge.pendingIdentity.inviteState === "pending" ? (
                    <Link
                      href={edge.pendingIdentity.invitePath}
                      className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
                    >
                      {provenanceCopy.openPrivateInvite}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {lineageReadbackPath ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="text-caption text-text-muted">
            {provenanceCopy.readbackAvailable}
          </span>
          <Link
            href={lineageReadbackPath}
            className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
          >
            {provenanceCopy.openReadback}
          </Link>
        </div>
      ) : null}
    </>
  );
}

function lineageObjectOptionLabel(
  option: LineagePlantObjectOption,
  copy: OwnerObjectCopy["provenance"],
) {
  const kind =
    option.objectKind === "animal" ? copy.kinds.animal : copy.kinds.plant;
  const variety = option.varietyText ?? copy.edge.unknownIdentity;
  return `${option.displayName} · ${kind} · ${variety}`;
}

function lineageEdgeTitle(
  edge: LineageProvenanceEdgeReadback,
  copy: OwnerObjectCopy["provenance"],
) {
  if (edge.sourceObject) {
    return formatOwnerObjectTemplate(copy.edge.fromObject, {
      source: lineageObjectOptionLabel(edge.sourceObject, copy),
    });
  }

  if (edge.pendingIdentity) {
    return formatOwnerObjectTemplate(copy.edge.invitationPending, {
      source: edge.pendingIdentity.displayLabel,
    });
  }

  return formatOwnerObjectTemplate(copy.edge.fromReference, {
    source:
      edge.sourcePersonMention ??
      edge.sourceReferenceLabel ??
      copy.edge.privateSource,
    kind: lineageSourceReferenceKindLabel(edge.sourceReferenceKind, copy),
  });
}

function lineageSourceReferenceKindLabel(
  value: LineageProvenanceEdgeReadback["sourceReferenceKind"],
  copy: OwnerObjectCopy["provenance"],
) {
  switch (value) {
    case "person":
      return copy.sourceTypes.person;
    case "seed_packet":
      return copy.sourceTypes.seedPacket;
    case "nursery":
      return copy.sourceTypes.nursery;
    case "catalog_variety":
      return copy.sourceTypes.catalogVariety;
    case "other":
    default:
      return copy.sourceTypes.source;
  }
}

function lineageConsentLabel(
  edge: LineageProvenanceEdgeReadback,
  copy: OwnerObjectCopy["provenance"],
) {
  if (edge.pendingIdentity?.inviteState === "pending") {
    return copy.consent.pendingInvited;
  }

  switch (edge.consentState) {
    case "confirmed":
      return copy.consent.confirmed;
    case "declined":
      return copy.consent.declined;
    case "anonymized":
      return copy.consent.anonymized;
    case "proposed":
    default:
      return copy.consent.proposed;
  }
}

function lineageVisibilityLabel(
  edge: LineageProvenanceEdgeReadback,
  copy: OwnerObjectCopy["provenance"],
) {
  if (edge.pendingIdentity?.inviteState === "pending") {
    return copy.visibility.pendingInvited;
  }

  switch (edge.consentState) {
    case "confirmed":
      return copy.visibility.confirmed;
    case "declined":
      return copy.visibility.declined;
    case "anonymized":
      return copy.visibility.anonymized;
    case "proposed":
    default:
      return copy.visibility.proposed;
  }
}

function lineagePendingInviteStateLabel(
  value: NonNullable<
    LineageProvenanceEdgeReadback["pendingIdentity"]
  >["inviteState"],
  copy: OwnerObjectCopy["provenance"],
) {
  switch (value) {
    case "claimed":
      return copy.inviteStates.claimed;
    case "declined":
      return copy.inviteStates.declined;
    case "anonymized":
      return copy.inviteStates.anonymized;
    case "pending":
    default:
      return copy.inviteStates.pending;
  }
}
