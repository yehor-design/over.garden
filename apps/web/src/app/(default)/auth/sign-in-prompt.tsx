import Link from "next/link";
import { LogIn } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

/**
 * What a signed-out reader sees on a page that needs an account.
 *
 * Not a form. Until OVE-378 fourteen pages each embedded `GardenAuthPanel` with
 * their own chrome, which is how Google sign-in ended up on two of them and ten
 * forgot to say where to return. A page states what it is and offers one way in;
 * the screen that actually signs somebody in lives at one address.
 *
 * ADR-0023 already required the access decision to be a returned state rendered
 * before the shell. This is that state, drawn once.
 */
export function SignInPrompt({
  locale,
  next,
  title,
  description,
}: {
  locale: InterfaceLocale;
  /** The page the reader is on, so signing in brings them back to it. */
  next: string;
  title?: string;
  description?: string;
}) {
  const copy = getTrustSurfaceCopy(locale).authPanel;
  const returnTo = normalizeInternalReturnPath(next, "/garden");

  return (
    <section
      lang={locale}
      data-sign-in-prompt="true"
      className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-5"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">
          {title ?? copy.signInScreenTitle}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {description ?? copy.prompts.directGarden}
        </p>
      </div>
      <Link
        href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`}
        className={buttonVariants({ className: "w-fit" })}
      >
        <LogIn aria-hidden="true" />
        {copy.signIn}
      </Link>
    </section>
  );
}
