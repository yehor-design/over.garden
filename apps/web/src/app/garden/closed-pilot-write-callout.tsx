import Link from "next/link";
import { Lock, MailWarning } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";

export function ClosedPilotWriteCallout({
  context = "garden",
  locale = "uk",
}: {
  context?: "garden" | "follow-up";
  locale?: InterfaceLocale;
}) {
  const copy = getGardenWorkspaceCopy(locale).writeGate;
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4"
      data-testid="closed-pilot-write-callout"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Lock className="size-4" />
        {copy.title}
      </p>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {context === "follow-up"
          ? copy.followUpDescription
          : copy.gardenDescription}{" "}
        {copy.publicReading}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={localizedPath(locale, "/")}
          className={buttonVariants({ variant: "outline" })}
        >
          {copy.explore}
        </Link>
        <Link
          href={localizedPath(locale, "/privacy")}
          className={buttonVariants({ variant: "outline" })}
        >
          {copy.privacy}
        </Link>
      </div>
      <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
        <MailWarning className="size-3.5 shrink-0" />
        {copy.invited}{" "}
        <Link
          href="/auth/help"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.signInHelp}
        </Link>
        .
      </p>
    </section>
  );
}
