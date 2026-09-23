import type { ReactNode } from "react";

import type { InterfaceLocale } from "@/lib/interface-localization";

export type AuthFrameScreen =
  | "sign-in"
  | "sign-up"
  | "signed-in"
  | "help"
  | "reset-password";

/**
 * The one layout every authentication screen uses (`OVE-504`, criterion 1).
 *
 * Before it, sign-in and sign-up were a shadowed card on a grey band that ran
 * the height of the viewport, the help screen was a wide article with its own
 * eyebrow and a 30 px title, and the reset screen was a narrower card pinned to
 * the left with a bare "OverGarden" link above it: three screens of the same
 * flow, three shapes. Now each is one column in the middle of the reading
 * area — heading, one sentence, what the reader came to do, and the ways out
 * underneath — so going from one to the next changes the words and nothing
 * else.
 *
 * It stays inside the site's shell (DESIGN.md §3.2): the ordinary bottom
 * navigation hides only inside full-height composition, and a reader who
 * signs in by mistake can still leave by it.
 */
export function AuthFrame({
  locale,
  screen,
  title,
  description,
  children,
  footer,
}: {
  locale: InterfaceLocale;
  screen: AuthFrameScreen;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      lang={locale}
      data-auth-frame={screen}
      className="mx-auto grid w-full max-w-md min-w-0 content-start gap-6 px-4 pt-8 pb-16 sm:px-0 sm:pt-14"
    >
      <header className="grid gap-2">
        <h1 className="text-h1 break-words text-text-heading">{title}</h1>
        {description ? (
          <p className="text-body-sm text-text-secondary">{description}</p>
        ) : null}
      </header>
      {children}
      {footer ? (
        <footer
          data-auth-frame-footer="true"
          className="grid gap-3 border-t border-border pt-5 text-body-sm"
        >
          {footer}
        </footer>
      ) : null}
    </main>
  );
}
