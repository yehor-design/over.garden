"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AUTH_HELP_PATH,
  passwordResetSuccessPath,
} from "@/lib/auth/auth-recovery";
import { authClient } from "@/lib/auth-client";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

export function ResetPasswordForm({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).resetPassword;
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(
    () => searchParams.get("token")?.trim() ?? "",
    [searchParams],
  );
  const tokenError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string>("");
  const [isPending, setIsPending] = useState(false);

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

  async function resetPassword() {
    if (password !== confirmPassword) {
      setMessage(copy.mismatch);
      return;
    }

    setIsPending(true);
    setMessage("");

    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (error) {
        setMessage(copy.invalidDescription);
        return;
      }

      router.push(passwordResetSuccessPath());
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">{copy.newPassword}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          minLength={8}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">
          {copy.confirmPassword}
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
          }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          minLength={8}
          required
        />
      </label>

      <Button type="button" onClick={resetPassword} disabled={isPending}>
        {isPending ? copy.pending : copy.submit}
      </Button>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </section>
  );
}
