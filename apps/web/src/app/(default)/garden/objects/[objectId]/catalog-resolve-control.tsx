"use client";

import { useState } from "react";

import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import {
  CatalogPicker,
  type CatalogPickOutcome,
  type CatalogSearchMiss,
} from "@/components/garden/catalog-picker";
import { buttonVariants } from "@/components/ui/button";
import type { PlantObjectKind, VarietyState } from "@/db/schema";
import {
  catalogItemIdForSelection,
  catalogLabelForSelection,
  type CatalogPickerSelection,
} from "@/lib/garden/catalog-typeahead-contract";
import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";

import { materializeCatalogNodeAction } from "../../catalog-full-catalogue-actions";
import { recordCatalogPickEventAction } from "../../catalog-pick-event-actions";
import { recordCatalogSearchMissAction } from "../../catalog-search-miss-actions";

interface CatalogResolveControlProps {
  locale: InterfaceLocale;
  objectId: string;
  objectKind: PlantObjectKind;
  currentVarietyText: string | null;
  currentVarietyState: VarietyState;
  action: (formData: FormData) => Promise<unknown>;
}

/**
 * The object page's half of the one picker (ADR-0026 D5, D7): the same three
 * outcomes as the composer. A species or a form attaches the identity; the
 * own name replaces the label; leaving the field empty keeps the object as it
 * is, so "continue without identity" is the absence of a submit.
 */
export function CatalogResolveControl({
  locale,
  objectId,
  objectKind,
  currentVarietyText,
  currentVarietyState,
  action,
}: CatalogResolveControlProps) {
  const copy = getOwnerObjectCopy(locale).catalog;
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const [selection, setSelection] = useState<CatalogPickerSelection | null>(
    null,
  );

  function reportSearchMiss(miss: CatalogSearchMiss) {
    void recordCatalogSearchMissAction({
      query: miss.query,
      locale,
      objectKind,
    }).catch(() => undefined);
  }

  function reportPickOutcome(outcome: CatalogPickOutcome) {
    void recordCatalogPickEventAction({
      outcome: outcome.outcome,
      queryLength: outcome.queryLength,
      msToPick: outcome.msToPick,
      locale,
      objectKind,
      catalogItemId: outcome.catalogItemId,
    }).catch(() => undefined);
  }

  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">
          {formatGardenWorkspaceTemplate(copy.current, {
            value: currentVarietyText ?? copy.noName,
            state: localizedVarietyStateLabel(
              currentVarietyState,
              workspaceCopy,
            ),
          })}
        </p>
      </div>

      <OwnerScopedActionForm action={action} className="grid min-w-0 gap-3">
        <input type="hidden" name="objectId" value={objectId} />
        <input
          type="hidden"
          name="catalogItemId"
          value={catalogItemIdForSelection(selection) ?? ""}
        />
        <input
          type="hidden"
          name="catalogLabel"
          value={catalogLabelForSelection(selection) ?? ""}
        />

        <CatalogPicker
          locale={locale}
          objectKind={objectKind}
          copy={workspaceCopy.composer.catalogPicker}
          label={copy.matchLabel}
          placeholder={copy.placeholder}
          clearLabel={copy.clearAria}
          selection={selection}
          onSelectionChange={setSelection}
          onSearchMiss={reportSearchMiss}
          onPickOutcome={reportPickOutcome}
          materializeFromCatalogue={materializeCatalogNodeAction}
        />

        {selection ? null : (
          <p className="text-xs text-muted-foreground">{copy.noMatch}</p>
        )}

        <button
          type="submit"
          disabled={!selection}
          className={buttonVariants({
            className: "self-start",
          })}
        >
          {copy.save}
        </button>
      </OwnerScopedActionForm>
    </section>
  );
}

function localizedVarietyStateLabel(
  value: VarietyState,
  copy: GardenWorkspaceCopy,
) {
  if (value === "selected") return copy.composer.varietyStates.selected;
  if (value === "free_text") return copy.composer.varietyStates.freeText;
  return copy.composer.varietyStates.unknown;
}
