import Link from "next/link";
import { Lock, MailWarning } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

export function ClosedPilotWriteCallout({
  context = "garden",
}: {
  context?: "garden" | "follow-up";
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4"
      data-testid="closed-pilot-write-callout"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Lock className="size-4" />
        Writing is invite-only right now
      </p>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {context === "follow-up"
          ? "OverGarden is in a small closed pilot. Open your personal invitation link to add more plant notes."
          : "OverGarden is in a small closed pilot. Open your personal invitation link to start writing in your garden."}
        You can still read everything that is public while you wait.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Explore what&apos;s public
        </Link>
        <Link
          href="/privacy"
          className={buttonVariants({ variant: "outline" })}
        >
          How your privacy is handled
        </Link>
      </div>
      <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
        <MailWarning className="size-3.5 shrink-0" />
        If you were invited, use the link from your message. Expired or
        incomplete links need a fresh invite from whoever invited you. If you
        already have an account but forgot your password, see{" "}
        <Link
          href="/auth/help"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          sign-in help
        </Link>
        .
      </p>
    </section>
  );
}
