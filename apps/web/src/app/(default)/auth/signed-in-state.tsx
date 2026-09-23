import { SignOutControl } from "@/components/auth/sign-out-control";
import { buttonVariants } from "@/components/ui/button";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { AuthFrame } from "./auth-frame";

/**
 * The sign-in and sign-up screens, opened by somebody already signed in
 * (`OVE-504`, criterion 5).
 *
 * Both screens used to redirect such a reader to `next` without a word. That
 * made the browser's Back button a trap — Back from the page a sign-in opened
 * landed on the sign-in screen, which sent the reader forward again — and it
 * left a reader who wanted another account nowhere to say so. Now it is a
 * state of its own: where they can go on to, and how to leave this account
 * first. An email-verification link lands here too, signed in, and says the
 * address is confirmed.
 */
export function SignedInState({
  locale,
  next,
  hasNext,
  verified,
}: {
  locale: InterfaceLocale;
  next: string;
  hasNext: boolean;
  verified: boolean;
}) {
  const copy = getAuthScreenCopy(locale).signedIn;

  return (
    <AuthFrame
      locale={locale}
      screen="signed-in"
      title={verified ? copy.verifiedTitle : copy.title}
      description={verified ? copy.verifiedDescription : copy.description}
      footer={
        <div className="grid gap-3">
          <p className="text-text-secondary">{copy.switchAccount}</p>
          <SignOutControl presentation="profile" />
        </div>
      }
    >
      {/* A document navigation, not `next/link`: `next` can be the route
          that resumes a held action, and a router fetch of a redirecting
          route handler is not a page. */}
      <a
        href={next}
        data-auth-continue={verified ? "verified" : "signed-in"}
        className={buttonVariants({ className: "justify-self-start" })}
      >
        {hasNext ? copy.continue : copy.toGarden}
      </a>
    </AuthFrame>
  );
}
