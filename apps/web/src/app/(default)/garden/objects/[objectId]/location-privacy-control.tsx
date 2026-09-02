"use client";

import { useState } from "react";

import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import type { LocationVisibility } from "@/db/schema";
import { getLocalizedCoarseRegionOptions } from "@/lib/garden/regions";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";

interface LocationPrivacyControlProps {
  locale: InterfaceLocale;
  objectId: string;
  currentLocationVisibility: LocationVisibility | string;
  currentCoarseRegionCode: string | null;
  action: (formData: FormData) => Promise<unknown>;
}

export function LocationPrivacyControl({
  locale,
  objectId,
  currentLocationVisibility,
  currentCoarseRegionCode,
  action,
}: LocationPrivacyControlProps) {
  const copy = getOwnerObjectCopy(locale).privacy;
  const regionOptions = getLocalizedCoarseRegionOptions(locale);
  const [locationVisibility, setLocationVisibility] =
    useState<LocationVisibility>(
      currentLocationVisibility === "region" ? "region" : "hidden",
    );
  const [coarseRegionCode, setCoarseRegionCode] = useState(
    currentCoarseRegionCode ?? "",
  );

  function updateLocationVisibility(value: string) {
    setLocationVisibility(value === "region" ? "region" : "hidden");
    if (value !== "region") setCoarseRegionCode("");
  }

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
      <OwnerScopedActionForm
        action={action}
        className="grid min-w-0 gap-3 sm:grid-cols-3"
      >
        <input type="hidden" name="objectId" value={objectId} />
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
          {copy.location}
          <select
            name="locationVisibility"
            value={locationVisibility}
            onChange={(event) => updateLocationVisibility(event.target.value)}
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="hidden">{copy.hidden}</option>
            <option value="region">{copy.region}</option>
          </select>
          <span className="text-xs leading-5 font-normal text-muted-foreground">
            {locationVisibility === "region"
              ? copy.regionHelp
              : copy.hiddenHelp}
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
          {copy.coarseRegion}
          <select
            name="coarseRegionCode"
            required={locationVisibility === "region"}
            disabled={locationVisibility === "hidden"}
            value={coarseRegionCode}
            onChange={(event) => setCoarseRegionCode(event.target.value)}
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            <option value="">{copy.chooseRegion}</option>
            {regionOptions.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className={buttonVariants({ className: "self-start sm:mt-6" })}
        >
          {copy.save}
        </button>
      </OwnerScopedActionForm>
    </section>
  );
}
