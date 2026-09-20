"use client";

import { useState } from "react";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import type { LocationVisibility } from "@/db/schema";
import { getLocalizedCoarseRegionOptions } from "@/lib/garden/regions";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

interface LocationPrivacyControlProps {
  locale: InterfaceLocale;
  objectId: string;
  currentLocationVisibility: LocationVisibility | string;
  currentCoarseRegionCode: string | null;
  action: (previousState: unknown, formData: FormData) => Promise<unknown>;
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
      <h2 className="text-h3 text-text-heading">{copy.title}</h2>
      <OwnerScopedProgressiveForm
        action={action}
        className="grid min-w-0 gap-3 sm:grid-cols-3"
      >
        <HiddenField name="objectId" value={objectId} />
        <Field
          label={copy.location}
          description={
            locationVisibility === "region" ? copy.regionHelp : copy.hiddenHelp
          }
          className="min-w-0"
        >
          <Select
            name="locationVisibility"
            value={locationVisibility}
            onChange={(event) => updateLocationVisibility(event.target.value)}
          >
            <option value="hidden">{copy.hidden}</option>
            <option value="region">{copy.region}</option>
          </Select>
        </Field>
        <Field
          label={copy.coarseRegion}
          required={locationVisibility === "region"}
          className="min-w-0"
        >
          <Select
            name="coarseRegionCode"
            disabled={locationVisibility === "hidden"}
            value={coarseRegionCode}
            onChange={(event) => setCoarseRegionCode(event.target.value)}
          >
            <option value="">{copy.chooseRegion}</option>
            {regionOptions.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </Select>
        </Field>
        <button
          type="submit"
          className={buttonVariants({ className: "self-start sm:mt-6" })}
        >
          {copy.save}
        </button>
      </OwnerScopedProgressiveForm>
    </section>
  );
}
