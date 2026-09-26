"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Input } from "@/components/ui/input";
import { DocumentLink } from "@/components/ui/link";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import {
  REPORT_EXPLANATION_MAX,
  REPORT_REASONS,
  type ReportFormField,
} from "@/lib/moderation/report-contract";
import type { ReportCopy } from "@/lib/moderation/report-copy";

import type { ReportFormState } from "./actions";

type Action = (
  previous: ReportFormState,
  formData: FormData,
) => Promise<ReportFormState>;

const INITIAL: ReportFormState = {
  status: "idle",
  errors: [],
  values: { reason: "", explanation: "", name: "", email: "" },
};

/**
 * The report form (ADR-0038 D5), in Threads' report sheet's order: the
 * reasons as rows first, then what is wrong, who is asking and where to
 * answer, and the good-faith statement. A plain form post: it works before
 * and without JavaScript, and a refusal returns what was typed.
 */
export function ReportForm({
  copy,
  address,
  backHref,
  submit,
}: {
  copy: ReportCopy["form"];
  address: string;
  backHref: string;
  submit: Action;
}) {
  const [state, formAction] = useActionState(submit, INITIAL);
  const firstErrorRef = useRef<HTMLDivElement>(null);
  const receivedRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.status === "received") receivedRef.current?.focus();
    else if (state.status !== "idle") {
      firstErrorRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")
        ?.focus();
    }
  }, [state]);

  if (state.status === "received") {
    return (
      <section
        data-report-received="true"
        aria-labelledby="report-received-title"
        className="grid gap-3"
      >
        <h2
          id="report-received-title"
          ref={receivedRef}
          tabIndex={-1}
          className="text-h2 text-text-heading outline-none"
        >
          {copy.receivedTitle}
        </h2>
        <p className="text-body text-text-secondary">{copy.receivedBody}</p>
        <DocumentLink
          href={backHref}
          className="justify-self-start text-body-sm"
        >
          {copy.back}
        </DocumentLink>
      </section>
    );
  }

  const error = (field: ReportFormField) =>
    state.errors.includes(field) ? copy.errors[field] : undefined;
  const message =
    state.status === "not_found"
      ? copy.notFound
      : state.status === "rate_limited"
        ? copy.rateLimited
        : state.status === "failed"
          ? copy.failed
          : null;

  return (
    <div ref={firstErrorRef}>
      <form action={formAction} data-report-form="true" className="grid gap-6">
        <HiddenField name="address" value={address} />
        {message ? (
          <Callout
            tone="danger"
            live="assertive"
            data-report-message={state.status}
          >
            {message}
          </Callout>
        ) : null}

        <RadioGroup
          legend={copy.reasonsLabel}
          aria-invalid={error("reason") ? true : undefined}
          className="gap-0"
        >
          <div className="grid divide-y divide-border border-y border-border">
            {REPORT_REASONS.map((reason) => (
              <Radio
                key={reason}
                name="reason"
                value={reason}
                required
                defaultChecked={state.values.reason === reason}
                label={copy.reasons[reason]}
                className="min-h-12 items-center py-3"
              />
            ))}
          </div>
          {error("reason") ? (
            <p role="alert" className="pt-2 text-body-sm text-danger-text">
              {error("reason")}
            </p>
          ) : null}
        </RadioGroup>

        <Field
          label={copy.explanation}
          description={copy.explanationHint}
          error={error("explanation")}
          required
        >
          <Textarea
            name="explanation"
            required
            minLength={10}
            maxLength={REPORT_EXPLANATION_MAX}
            rows={5}
            defaultValue={state.values.explanation}
          />
        </Field>

        <Field label={copy.name} error={error("name")} required>
          <Input
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            defaultValue={state.values.name}
          />
        </Field>

        <Field
          label={copy.email}
          description={copy.emailHint}
          error={error("email")}
          required
        >
          <Input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            defaultValue={state.values.email}
          />
        </Field>

        <div className="grid gap-2">
          <Checkbox
            name="goodFaith"
            required
            aria-invalid={error("goodFaith") ? true : undefined}
            label={copy.goodFaith}
          />
          {error("goodFaith") ? (
            <p role="alert" className="text-body-sm text-danger-text">
              {error("goodFaith")}
            </p>
          ) : null}
        </div>

        <SubmitButton label={copy.submit} pendingLabel={copy.submitting} />
      </form>
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
