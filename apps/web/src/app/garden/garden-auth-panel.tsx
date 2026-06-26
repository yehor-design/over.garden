"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const defaultEmail = "gardener@over.garden";
const defaultPassword = "overgarden-local-gardener";

interface GardenAuthPanelProps {
  catalogName?: string | null;
}

export function GardenAuthPanel({ catalogName }: GardenAuthPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string>("");
  const [isPending, setIsPending] = useState(false);

  async function authenticate(kind: "sign-up" | "sign-in") {
    setIsPending(true);
    setMessage("");

    const response = await fetch(`/api/auth/${kind}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: defaultEmail,
        password: defaultPassword,
        name: "Local Gardener",
      }),
    });

    setIsPending(false);

    if (!response.ok) {
      setMessage(await response.text());
      return;
    }

    router.refresh();
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Garden workspace
        </h2>
        <p className="text-sm text-muted-foreground">
          {catalogName
            ? `Use the local gardener account to start a private journal entry for ${catalogName}.`
            : "Use the local gardener account to start a journal."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => authenticate("sign-up")} disabled={isPending}>
          Create local account
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => authenticate("sign-in")}
          disabled={isPending}
        >
          Sign in
        </Button>
      </div>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </section>
  );
}
