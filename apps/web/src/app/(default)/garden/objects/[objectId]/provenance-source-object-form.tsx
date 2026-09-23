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
import { Select } from "@/components/ui/select";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
} from "@/lib/owner-object-copy";

export type ProvenanceSourceActionState =
  | undefined
  | { mutationScope: string }
  | { status: "recorded" }
  | { status: "refused"; reason: "cross_kind" };

export interface ProvenanceSourceOption {
  id: string;
  label: string;
  displayName: string;
}

/**
 * "This object came from that one of mine" (`OVE-491`, OG-UX-045). Nothing is
 * chosen until the gardener chooses — the list opens on "Choose…", never on
 * whichever object happened to be first — and the button names both objects
 * before it records anything. The list holds only objects of the same kind;
 * the server refuses any other, and the form says why.
 */
export function ProvenanceSourceObjectForm({
  locale,
  objectId,
  subjectName,
  objectKind,
  options,
  clientMutationId,
  action,
}: {
  locale: InterfaceLocale;
  objectId: string;
  subjectName: string;
  objectKind: string;
  options: readonly ProvenanceSourceOption[];
  /** A fresh id from each server render, so a re-render after success is a new intent. */
  clientMutationId: string;
  action: (
    previousState: ProvenanceSourceActionState,
    formData: FormData,
  ) => Promise<ProvenanceSourceActionState>;
}) {
  const copy = getOwnerObjectCopy(locale).provenance;
  const ownerScope = useOptionalOwnerScope();
  const handledRef = useRef<ProvenanceSourceActionState>(undefined);
  const [state, formAction] = useActionState(action, undefined);
  // A choice belongs to the answer it was made after. React resets the form
  // once the server answers, so a choice made before that answer is gone from
  // the list — and must be gone from the button too, or it would name one
  // object while the list names none.
  const [choice, setChoice] = useState<{
    id: string;
    after: ProvenanceSourceActionState;
  }>({ id: "", after: undefined });
  const chosenSinceAnswer = choice.after === state;
  const sourceId = chosenSinceAnswer ? choice.id : "";
  const source = options.find((option) => option.id === sourceId) ?? null;

  useEffect(() => {
    if (state === undefined || handledRef.current === state) return;
    handledRef.current = state;
    ownerScope?.handleActionResult(state);
  }, [ownerScope, state]);

  // The answer shows until the next choice.
  const answer =
    state && "status" in state && !chosenSinceAnswer ? state.status : null;
  const refused = answer === "refused";
  const recorded = answer === "recorded";

  return (
    <form
      action={formAction}
      data-provenance-source-form="own_object"
      className="grid min-w-0 gap-3 rounded-md border border-border p-3"
    >
      <OwnerUserIdField />
      <HiddenField name="objectId" value={objectId} />
      <HiddenField name="sourceKind" value="own_object" />
      <HiddenField name="clientMutationId" value={clientMutationId} />
      <Field
        label={copy.sourceObject}
        description={
          objectKind === "animal" ? copy.sameKindAnimals : copy.sameKindPlants
        }
        error={refused ? copy.crossKind : undefined}
        required
        className="min-w-0"
      >
        <Select
          name="sourcePlantObjectId"
          value={sourceId}
          required
          data-provenance-source-select="true"
          onChange={(event) =>
            setChoice({ id: event.target.value, after: state })
          }
        >
          <option value="">{copy.chooseSource}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton
        disabled={!source}
        label={
          source
            ? formatOwnerObjectTemplate(copy.confirmObjectSource, {
                subject: subjectName,
                source: source.displayName,
              })
            : copy.recordObjectSource
        }
      />
      <p
        role="status"
        data-provenance-source-status={
          recorded ? "recorded" : refused ? "refused" : undefined
        }
        className="text-body-sm text-text-muted"
      >
        {recorded ? copy.recorded : null}
      </p>
    </form>
  );
}

function SubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-provenance-source-submit="true"
      className="justify-self-start"
    >
      {label}
    </Button>
  );
}
