"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  OwnerUserIdField,
  useOptionalOwnerScope,
} from "@/components/auth/owner-scope";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getLocalizedCoarseRegionOptions } from "@/lib/garden/regions";
import { SPACE_NAME_MAX_LENGTH } from "@/lib/garden/space-setup";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getSpacePageCopy } from "@/lib/space-page-copy";

import type { SpaceSettingsActionState } from "./actions";

export interface SpaceSettingsFormProps {
  locale: InterfaceLocale;
  space: {
    id: string;
    displayName: string;
    locationVisibility: "hidden" | "region";
    coarseRegionCode: string | null;
  };
  action: (
    previousState: SpaceSettingsActionState,
    formData: FormData,
  ) => Promise<SpaceSettingsActionState>;
}

/**
 * The space's name and whether its region shows (`OVE-490`). A refused save
 * keeps what was typed — the inputs are uncontrolled only in the name, whose
 * value the form keeps, and the region pair follows the visibility choice.
 */
export function SpaceSettingsForm({
  locale,
  space,
  action,
}: SpaceSettingsFormProps) {
  const copy = getSpacePageCopy(locale).settings;
  const ownerScope = useOptionalOwnerScope();
  const handledRef = useRef<SpaceSettingsActionState>(undefined);
  const [state, formAction] = useActionState(action, undefined);
  const [visibility, setVisibility] = useState(space.locationVisibility);
  const [region, setRegion] = useState(space.coarseRegionCode ?? "");
  const regionOptions = getLocalizedCoarseRegionOptions(locale);

  useEffect(() => {
    if (state === undefined || handledRef.current === state) return;
    handledRef.current = state;
    ownerScope?.handleActionResult(state);
  }, [ownerScope, state]);

  const errors =
    state && "status" in state && state.status === "invalid"
      ? state.errors
      : {};
  const message =
    state && "status" in state
      ? state.status === "saved"
        ? copy.saved
        : state.status === "missing"
          ? copy.missing
          : null
      : null;

  return (
    <form
      action={formAction}
      data-space-settings-form="true"
      className="grid min-w-0 gap-4"
    >
      <OwnerUserIdField />
      <HiddenField name="spaceId" value={space.id} />
      <Field
        label={copy.name}
        description={copy.nameHelp}
        error={errors.name ? copy.errors[errors.name] : undefined}
        required
      >
        <Input
          name="displayName"
          defaultValue={space.displayName}
          maxLength={SPACE_NAME_MAX_LENGTH}
          autoComplete="off"
          data-space-settings-name="true"
        />
      </Field>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field
          label={copy.location}
          description={
            visibility === "region" ? copy.regionHelp : copy.hiddenHelp
          }
        >
          <Select
            name="locationVisibility"
            value={visibility}
            onChange={(event) => {
              const next =
                event.target.value === "region" ? "region" : "hidden";
              setVisibility(next);
              if (next === "hidden") setRegion("");
            }}
          >
            <option value="hidden">{copy.hidden}</option>
            <option value="region">{copy.region}</option>
          </Select>
        </Field>
        <Field
          label={copy.coarseRegion}
          required={visibility === "region"}
          error={errors.region ? copy.errors[errors.region] : undefined}
        >
          <Select
            name="coarseRegionCode"
            value={region}
            disabled={visibility === "hidden"}
            onChange={(event) => setRegion(event.target.value)}
          >
            <option value="">{copy.chooseRegion}</option>
            {regionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SaveButton label={copy.save} pendingLabel={copy.saving} />
        <p
          role="status"
          data-space-settings-status={
            state && "status" in state ? state.status : undefined
          }
          className="text-body-sm text-text-muted"
        >
          {message}
        </p>
      </div>
    </form>
  );
}

function SaveButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" aria-busy={pending || undefined}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
