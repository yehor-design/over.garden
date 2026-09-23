"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { TransportBoundary } from "@/components/transport-boundary";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { cn } from "@/lib/utils";
import type { AuthFormState } from "../auth-actions";

/**
 * "Send me a link", on the help screen.
 *
 * A real form over a Server Action since `OVE-504`: it used to be a
 * `type="button"` calling the auth client, so it did nothing before
 * hydration. The address is kept above the transport boundary, so a request
 * that never came back leaves it typed, and the answer is the same sentence for
 * every address — with or without an account behind it.
 */
export function PasswordResetRequestForm({
  locale = "uk",
  request,
}: {
  locale?: InterfaceLocale;
  request: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
}) {
  const [email, setEmail] = useState("");
  return (
    <TransportBoundary
      render={(failures) => (
        <RequestForm
          locale={locale}
          request={request}
          email={email}
          onEmailChange={setEmail}
          transportFailed={failures > 0}
        />
      )}
    />
  );
}

function RequestForm({
  locale,
  request,
  email,
  onEmailChange,
  transportFailed,
}: {
  locale: InterfaceLocale;
  request: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  email: string;
  onEmailChange: (value: string) => void;
  transportFailed: boolean;
}) {
  const copy = getTrustSurfaceCopy(locale).authHelp.reset;
  const screen = getAuthScreenCopy(locale);
  const [state, formAction] = useActionState(request, {
    status: "idle" as const,
    message: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const refused = state.status === "error";
  const lostRequest = transportFailed && state.status === "idle";

  useEffect(() => {
    if (refused) inputRef.current?.focus();
  }, [refused, state]);

  return (
    <form
      action={formAction}
      id="password-reset"
      data-password-reset-request="true"
      // A filled-in address may never have fired `input` (a browser's own
      // autofill); submitting is when it is certainly readable.
      onSubmit={(event) => {
        const field = event.currentTarget.elements.namedItem("email");
        if (field instanceof HTMLInputElement) onEmailChange(field.value);
      }}
      className="grid gap-4"
    >
      {lostRequest || refused ? (
        <Callout
          id="password-reset-message"
          tone="danger"
          live="assertive"
          data-auth-message={lostRequest ? "transport" : "error"}
        >
          {lostRequest ? screen.transportFailed : state.message}
        </Callout>
      ) : null}

      {state.status === "accepted" ? (
        <Callout
          id="password-reset-message"
          tone="success"
          live="polite"
          data-auth-message="sent"
        >
          <p>{state.message}</p>
          <p>{screen.help.sentHint}</p>
        </Callout>
      ) : null}

      <Field label={copy.email} id="password-reset-email" required>
        <Input
          ref={inputRef}
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-invalid={refused || undefined}
          aria-describedby={
            refused || lostRequest ? "password-reset-message" : undefined
          }
        />
      </Field>

      <RequestSubmit
        label={copy.submit}
        pendingLabel={screen.pending.resetRequest}
      />
    </form>
  );
}

function RequestSubmit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="grid gap-2">
      <Button
        type="submit"
        loading={pending}
        className="justify-self-start"
        onClick={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        {label}
      </Button>
      <p
        role="status"
        className={cn(
          "text-body-sm text-text-secondary",
          !pending && "sr-only",
        )}
      >
        {pending ? pendingLabel : ""}
      </p>
    </div>
  );
}
