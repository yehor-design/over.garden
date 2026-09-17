import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import { formatOperatorDate } from "@/lib/operator-copy";
import type {
  OwnerActionEntry,
  OwnerCardNameOption,
} from "@/server/owner-action-audit";

import {
  mergeCatalogCardAction,
  pinCatalogCardNameAction,
  renameCatalogCardAction,
  revertCatalogCardEditAction,
  setCatalogCardIndexableAction,
} from "./catalog-owner-card-actions";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { HiddenField } from "@/components/ui/hidden-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * The example address in the merge field, built rather than typed.
 *
 * A placeholder is the one path literal that looks harmless: nobody navigates
 * to it. But it is the shape the owner is being asked to paste, and the day
 * `/species/` moves it becomes instructions for an address that no longer
 * exists.
 */
const MERGE_TARGET_PLACEHOLDER = publicCatalogEvidencePath({
  catalogKind: "species",
  publicSlug: "solanum-lycopersicum",
});

/**
 * The owner's edit controls on a public organism card (ADR-0026 D10). The
 * page renders this only for the owner's own session; every visitor, signed
 * in or not, sees the card without it. Each control is a Server Action form,
 * so it works before hydration like every other owner control.
 */
export function CatalogOwnerCardControls({
  locale,
  catalogItemId,
  canonicalName,
  indexableOverride,
  names,
  audit,
}: {
  locale: InterfaceLocale;
  catalogItemId: string;
  canonicalName: string;
  indexableOverride: boolean | null;
  names: readonly OwnerCardNameOption[];
  audit: readonly OwnerActionEntry[];
}) {
  const copy = getOperatorCatalogCopy(locale).card;

  return (
    <details
      data-owner-card-controls="true"
      className="rounded-lg border border-dashed border-border p-4"
    >
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
        {copy.ownerTools}
      </summary>
      <div className="mt-3 grid gap-4">
        <OwnerScopedProgressiveForm
          action={renameCatalogCardAction}
          className="grid gap-2"
          data-owner-card-rename="true"
        >
          <HiddenField name="catalogItemId" value={catalogItemId} />
          <HiddenField name="locale" value={locale} />
          <Field label={copy.newName} required>
            <Input
              name="displayName"
              defaultValue={canonicalName}
              maxLength={120}
            />
          </Field>
          <Field label={copy.reason} id="owner-card-rename-reason">
            <Input name="reason" maxLength={240} />
          </Field>
          <p className="text-xs text-muted-foreground">{copy.renameHint}</p>
          <button
            type="submit"
            className={buttonVariants({ variant: "secondary", size: "sm", className: "justify-self-start" })}
          >
            {copy.rename}
          </button>
        </OwnerScopedProgressiveForm>

        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">{copy.indexable}</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["true", copy.indexableOn],
                ["false", copy.indexableOff],
                ["", copy.indexableClear],
              ] as const
            ).map(([value, label]) => (
              <OwnerScopedProgressiveForm
                key={label}
                action={setCatalogCardIndexableAction}
              >
                <HiddenField name="catalogItemId" value={catalogItemId} />
                <HiddenField name="indexable" value={value} />
                <button
                  type="submit"
                  data-owner-card-indexable={value || "clear"}
                  aria-pressed={
                    value === ""
                      ? indexableOverride === null
                      : indexableOverride === (value === "true")
                  }
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {label}
                </button>
              </OwnerScopedProgressiveForm>
            ))}
          </div>
        </div>

        {names.length > 0 ? (
          <OwnerScopedProgressiveForm
            action={pinCatalogCardNameAction}
            className="grid gap-2"
            data-owner-card-pin="true"
          >
            <HiddenField name="catalogItemId" value={catalogItemId} />
            <Field label={copy.pinName}>
              <Select
                name="nameId"
                defaultValue={names.find((name) => name.isPrimary)?.nameId ?? ""}
              >
                {names.map((name) => (
                  <option key={name.nameId} value={name.nameId}>
                    {name.displayName} · {name.locale} · {name.nameType}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={copy.reason} id="owner-card-pin-reason">
              <Input name="reason" maxLength={240} />
            </Field>
            <p className="text-xs text-muted-foreground">{copy.pinNameHint}</p>
            <button
              type="submit"
              className={buttonVariants({ variant: "secondary", size: "sm", className: "justify-self-start" })}
            >
              {copy.save}
            </button>
          </OwnerScopedProgressiveForm>
        ) : null}

        <OwnerScopedProgressiveForm
          action={mergeCatalogCardAction}
          className="grid gap-2"
          data-owner-card-merge="true"
        >
          <HiddenField name="catalogItemId" value={catalogItemId} />
          <Field label={copy.mergeTarget} required>
            <Input
              name="targetAddress"
              maxLength={240}
              placeholder={MERGE_TARGET_PLACEHOLDER}
            />
          </Field>
          <Field label={copy.reason} id="owner-card-merge-reason">
            <Input name="reason" maxLength={240} />
          </Field>
          <p className="text-xs text-muted-foreground">{copy.mergeHint}</p>
          <Checkbox
            name="confirmMerge"
            value="yes"
            label={copy.mergeConfirm}
            className="items-center"
          />
          <button
            type="submit"
            className={buttonVariants({ variant: "secondary", size: "sm", className: "justify-self-start" })}
          >
            {copy.merge}
          </button>
        </OwnerScopedProgressiveForm>

        <div className="grid gap-2" data-owner-card-audit="true">
          <p className="text-sm text-muted-foreground">{copy.audit}</p>
          {audit.length === 0 ? (
            <p className="text-xs text-muted-foreground">{copy.auditEmpty}</p>
          ) : (
            <ul className="grid gap-2">
              {audit.map((entry) => (
                <li
                  key={entry.actionId}
                  className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                >
                  <span>{entry.actionType}</span>
                  <span>{formatOperatorDate(locale, entry.performedAt)}</span>
                  {entry.reason ? <span>{entry.reason}</span> : null}
                  {entry.reverted ? (
                    <span>{copy.reverted}</span>
                  ) : (
                    <OwnerScopedProgressiveForm
                      action={revertCatalogCardEditAction}
                    >
                      <HiddenField name="catalogItemId" value={catalogItemId} />
                      <HiddenField name="actionId" value={entry.actionId} />
                      <button
                        type="submit"
                        data-owner-card-undo={entry.actionId}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        {copy.undo}
                      </button>
                    </OwnerScopedProgressiveForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
