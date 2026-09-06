import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";

import {
  renameCatalogCardAction,
  setCatalogCardIndexableAction,
} from "./catalog-owner-card-actions";

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
}: {
  locale: InterfaceLocale;
  catalogItemId: string;
  canonicalName: string;
  indexableOverride: boolean | null;
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
          <input type="hidden" name="catalogItemId" value={catalogItemId} />
          <input type="hidden" name="locale" value={locale} />
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{copy.newName}</span>
            <input
              name="displayName"
              defaultValue={canonicalName}
              required
              maxLength={120}
              className="rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{copy.reason}</span>
            <input
              name="reason"
              maxLength={240}
              className="rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <p className="text-xs text-muted-foreground">{copy.renameHint}</p>
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "sm", className: "justify-self-start" })}
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
                <input type="hidden" name="catalogItemId" value={catalogItemId} />
                <input type="hidden" name="indexable" value={value} />
                <button
                  type="submit"
                  data-owner-card-indexable={value || "clear"}
                  aria-pressed={
                    value === ""
                      ? indexableOverride === null
                      : indexableOverride === (value === "true")
                  }
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {label}
                </button>
              </OwnerScopedProgressiveForm>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
