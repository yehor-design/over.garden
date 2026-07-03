"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  invalidPasswordResetTokenMessage,
  passwordResetSuccessPath,
  PILOT_AUTH_HELP_PATH,
} from "@/lib/auth/pilot-auth-recovery";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm() {
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
          This sign-in link is not active
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {invalidPasswordResetTokenMessage()}
        </p>
        <Link
          href={PILOT_AUTH_HELP_PATH}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign-in help
        </Link>
      </section>
    );
  }

  async function resetPassword() {
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsPending(true);
    setMessage("");

    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    setIsPending(false);

    if (error) {
      setMessage(error.message ?? invalidPasswordResetTokenMessage());
      return;
    }

    router.push(passwordResetSuccessPath());
    router.refresh();
  }

  return (
    <section className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">
          Choose a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          Set a new password for your OverGarden account, then continue to your
          existing garden.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          minLength={8}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          minLength={8}
          required
        />
      </label>

      <Button type="button" onClick={resetPassword} disabled={isPending}>
        Update password
      </Button>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </section>
  );
}
