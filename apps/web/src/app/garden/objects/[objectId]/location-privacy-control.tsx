"use client";

import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { LocationVisibility } from "@/db/schema";
import { locationVisibilityHelpText } from "@/lib/garden/pilot-ux-copy";
import { COARSE_REGION_OPTIONS } from "@/lib/garden/regions";

interface LocationPrivacyControlProps {
  objectId: string;
  currentLocationVisibility: LocationVisibility | string;
  currentCoarseRegionCode: string | null;
  action: (formData: FormData) => void | Promise<void>;
}

export function LocationPrivacyControl({
  objectId,
  currentLocationVisibility,
  currentCoarseRegionCode,
  action,
}: LocationPrivacyControlProps) {
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
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold text-foreground">
        Location privacy
      </h2>
      <form action={action} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="objectId" value={objectId} />
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Location
          <select
            name="locationVisibility"
            value={locationVisibility}
            onChange={(event) => updateLocationVisibility(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="hidden">Hidden</option>
            <option value="region">Region</option>
          </select>
          <span className="text-xs leading-5 font-normal text-muted-foreground">
            {locationVisibilityHelpText(locationVisibility)}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Coarse region
          <select
            name="coarseRegionCode"
            required={locationVisibility === "region"}
            disabled={locationVisibility === "hidden"}
            value={coarseRegionCode}
            onChange={(event) => setCoarseRegionCode(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            <option value="">Choose region</option>
            {COARSE_REGION_OPTIONS.map((region) => (
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
          Save
        </button>
      </form>
    </section>
  );
}
