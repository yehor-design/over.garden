"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { TransportBoundary } from "@/components/transport-boundary";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Link } from "@/components/ui/link";
import { PasswordInput } from "@/components/ui/password-input";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import { AUTH_HELP_PATH } from "@/lib/auth/auth-recovery";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { cn } from "@/lib/utils";
import type { AuthFormState } from "../auth-actions";

/**
 * The new password, twice. `formAction` goes straight into the form: wrapping
 * it in a client closure — to add a refresh, to fire a callback, for anything —
 * swaps the form's real endpoint for React's `javascript:` placeholder, and the
 * control then does nothing until hydration. That defect shipped once already
 * (OVE-377).
 *
 * Both passwords are kept above the transport boundary (`OVE-504`): two
 * passwords that differ, or a request that never came back, leave what was
 * typed in place, so a reader fixes one field instead of retyping — or
 * remembering — both.
 */
export function ResetPasswordForm({
  locale = "uk",
  token,
  reset,
}: {
  locale?: InterfaceLocale;
  token: string;
  reset: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  return (
    <TransportBoundary
      render={(failures) => (
        <ResetForm
          locale={locale}
          token={token}
          reset={reset}
          password={password}
          onPasswordChange={setPassword}
          confirmation={confirmation}
          onConfirmationChange={setConfirmation}
          transportFailed={failures > 0}
        />
      )}
    />
  );
}

function ResetForm({
  locale,
  token,
  reset,
  password,
  onPasswordChange,
  confirmation,
  onConfirmationChange,
  transportFailed,
}: {
  locale: InterfaceLocale;
  token: string;
  reset: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  password: string;
  onPasswordChange: (value: string) => void;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  transportFailed: boolean;
}) {
  const copy = getTrustSurfaceCopy(locale).resetPassword;
  // The show/hide labels belong to the same vocabulary as the sign-in screen's:
  // one wording for one control, wherever a password is typed.
  const authPanelCopy = getTrustSurfaceCopy(locale).authPanel;
  const screen = getAuthScreenCopy(locale);
  const [state, formAction] = useActionState(reset, {
    status: "idle" as const,
    message: null,
  });
  const lostRequest = transportFailed && state.status === "idle";
  const expired = state.status === "expired";
  const message = lostRequest ? screen.transportFailed : state.message;

  return (
    <form
      action={formAction}
      // A password manager's generated password may never have fired
      // `input`; submitting is when both fields are certainly readable.
      onSubmit={(event) => {
        const fields = event.currentTarget.elements;
        const first = fields.namedItem("password");
        const second = fields.namedItem("confirmPassword");
        if (first instanceof HTMLInputElement) onPasswordChange(first.value);
        if (second instanceof HTMLInputElement)
          onConfirmationChange(second.value);
      }}
      className="grid gap-4"
    >
      <HiddenField name="token" value={token} />

      {/* A refusal is a form-level error above the fields, not a line under
          the submit that a reader has already scrolled past (DESIGN.md §5.3). */}
      {message ? (
        <Callout
          id="reset-message"
          tone="danger"
          live="assertive"
          data-auth-message={
            lostRequest ? "transport" : expired ? "expired" : "error"
          }
        >
          <p>{message}</p>
          {expired ? (
            <p>
              <Link href={`${AUTH_HELP_PATH}#password-reset`}>
                {screen.reset.requestNew}
              </Link>
            </p>
          ) : null}
        </Callout>
      ) : null}

      <Field label={copy.newPassword} id="reset-new-password" required>
        <PasswordInput
          name="password"
          id="reset-new-password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          showLabel={authPanelCopy.showPassword}
          hideLabel={authPanelCopy.hidePassword}
          aria-describedby={message ? "reset-message" : undefined}
        />
      </Field>

      <Field label={copy.confirmPassword} id="reset-confirm-password" required>
        <PasswordInput
          name="confirmPassword"
          id="reset-confirm-password"
          required
          autoComplete="new-password"
          minLength={8}
          value={confirmation}
          onChange={(event) => onConfirmationChange(event.target.value)}
          showLabel={authPanelCopy.showPassword}
          hideLabel={authPanelCopy.hidePassword}
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={message ? "reset-message" : undefined}
        />
      </Field>

      <ResetSubmit
        label={copy.submit}
        pendingLabel={screen.pending.resetPassword}
      />
    </form>
  );
}

function ResetSubmit({
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
