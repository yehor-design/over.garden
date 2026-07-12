import Link from "next/link";
import { ArrowLeft, LockKeyhole, RotateCcw } from "lucide-react";

import { GardenAuthPanel } from "@/app/garden/garden-auth-panel";
import { buttonVariants } from "@/components/ui/button";
import type {
  AuthIntentAction,
  AuthIntentDraft,
} from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";

type AuthIntentSurfaceState = "ready" | "invalid" | "expired";

interface AuthIntentSurfaceProps {
  locale: InterfaceLocale;
  intent: AuthIntentDraft | null;
  token: string | null;
  state: AuthIntentSurfaceState;
  facebookSignInEnabled: boolean;
  googleSignInEnabled: boolean;
  initialMessage?: string | null;
}

export function AuthIntentSurface({
  locale,
  intent,
  token,
  state,
  facebookSignInEnabled,
  googleSignInEnabled,
  initialMessage = null,
}: AuthIntentSurfaceProps) {
  const cancelHref = intent?.returnTo ?? "/";

  return (
    <main
      lang={locale}
      data-auth-intent-surface={state}
      className="flex min-h-dvh w-full items-end bg-muted/35 px-0 pt-6 sm:items-center sm:justify-center sm:px-6 sm:py-10"
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="auth-intent-title"
        data-auth-intent-desktop="dialog"
        data-auth-intent-mobile="sheet"
        className="w-full border-t border-border bg-background px-5 py-6 shadow-lg sm:max-w-xl sm:rounded-lg sm:border sm:p-6"
      >
        {state === "ready" && intent && token ? (
          <div className="grid gap-5">
            <div className="grid gap-3 border-b border-border pb-5">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <LockKeyhole className="size-4" aria-hidden="true" />
              </span>
              <div className="grid gap-1.5">
                <h1
                  id="auth-intent-title"
                  className="text-xl font-semibold text-foreground"
                >
                  {intentTitle(intent.action)}
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Public reading stays open. Sign in only to continue this
                  action, then OverGarden returns you to the same control.
                </p>
              </div>
            </div>

            <GardenAuthPanel
              embedded
              autoFocusEmail
              prefillDevelopmentDefaults={false}
              title="Continue with your OverGarden account"
              prompt="Use an existing account or create one. No comment, draft, private object data, or location is carried through sign-in."
              postAuthPath={`/auth/intent/resume?intent=${encodeURIComponent(token)}`}
              initialMessage={initialMessage}
              facebookSignInEnabled={facebookSignInEnabled}
              googleSignInEnabled={googleSignInEnabled}
            />

            <Link
              href={cancelHref}
              className={buttonVariants({
                variant: "ghost",
                className: "justify-start",
              })}
            >
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Cancel and keep reading
            </Link>
          </div>
        ) : (
          <div className="grid gap-5">
            <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <RotateCcw className="size-4" aria-hidden="true" />
            </span>
            <div className="grid gap-1.5">
              <h1
                id="auth-intent-title"
                className="text-xl font-semibold text-foreground"
              >
                {state === "expired"
                  ? "This sign-in request expired"
                  : "This sign-in request is unavailable"}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Nothing was changed. Return to the public page and invoke the
                action again when you are ready.
              </p>
            </div>
            <Link
              href={cancelHref}
              className={buttonVariants({ className: "w-fit" })}
            >
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Return to public reading
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function intentTitle(action: AuthIntentAction) {
  return {
    comment: "Sign in to comment",
    bookmark: "Sign in to bookmark",
    follow: "Sign in to follow updates",
    report: "Sign in to report this profile",
    block: "Sign in to block this profile",
    claim: "Sign in to review this claim",
    create_object: "Sign in to add a living object",
    create_entry: "Sign in to add an update",
    save: "Sign in to save this update",
    publish: "Sign in to publish this entry",
  }[action];
}
