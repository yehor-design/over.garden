"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { AUTH_HELP_PATH } from "@/lib/auth/auth-recovery";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPasswordAction } from "../auth-actions";

export function ResetPasswordForm({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).resetPassword;
  // The show/hide labels belong to the same vocabulary as the sign-in screen's:
  // one wording for one control, wherever a password is typed.
  const authPanelCopy = getTrustSurfaceCopy(locale).authPanel;
  const searchParams = useSearchParams();
  const token = useMemo(
    () => searchParams.get("token")?.trim() ?? "",
    [searchParams],
  );
  const tokenError = searchParams.get("error");
  // `formAction` goes straight into the form. Wrapping it in a client closure —
  // to add a refresh, to fire a callback, for anything — swaps the form's real
  // endpoint for React's `javascript:` placeholder, and the control then does
  // nothing until hydration. That defect shipped once already (OVE-377).
  const [state, formAction] = useActionState(resetPasswordAction, {
    status: "idle" as const,
    message: null,
  });

  if (tokenError || !token) {
    return (
      <section className="flex max-w-xl flex-col gap-3 rounded-lg border border-border p-4">
        <h1 className="text-lg font-semibold text-foreground">
          {copy.invalidTitle}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.invalidDescription}
        </p>
        <Link
          href={AUTH_HELP_PATH}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.helpLink}
        </Link>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-4"
    >
      <HiddenField name="token" value={token} />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>

      {/* A refusal is a form-level error above the fields, not a line under
          the submit that a reader has already scrolled past (DESIGN.md §5.3). */}
      {state.message ? (
        <Callout tone="danger" live="assertive" data-auth-message="error">
          {state.message}
        </Callout>
      ) : null}

      <Field label={copy.newPassword} id="reset-new-password" required>
        <PasswordInput
          name="password"
          id="reset-new-password"
          required
          autoComplete="new-password"
          minLength={8}
          showLabel={authPanelCopy.showPassword}
          hideLabel={authPanelCopy.hidePassword}
        />
      </Field>

      <Field label={copy.confirmPassword} id="reset-confirm-password" required>
        <PasswordInput
          name="confirmPassword"
          id="reset-confirm-password"
          required
          autoComplete="new-password"
          minLength={8}
          showLabel={authPanelCopy.showPassword}
          hideLabel={authPanelCopy.hidePassword}
        />
      </Field>

      <ResetSubmit label={copy.submit} />
    </form>
  );
}

function ResetSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {label}
    </Button>
  );
}
