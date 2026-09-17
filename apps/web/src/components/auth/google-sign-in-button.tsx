import { Button } from "@/components/ui/button";

/**
 * "Continue with Google", built to Google's own branding rules.
 *
 * What it replaces was a bordered button with the words alone. Google's
 * identity guidelines require the **mark** on any button that starts a Google
 * sign-in, and every product that ships one — Intercom, Cal.com, Uxcel,
 * Mixpanel, Relevance AI — shows it. The rules this implements:
 *
 * - **The mark is present**, in its four colours, at 18 px on a 40 px button.
 * - **Clear space** of at least the mark's own height on its left, and between
 *   the mark and the wording.
 * - **Permitted wording only.** "Continue with Google" and "Sign in with
 *   Google" are both allowed; the provider's name is never translated or
 *   abbreviated, which is why the copy carries a `{provider}` slot rather than
 *   a translated word.
 * - **Minimum size.** The button is `md` (40 px), above Google's 40 px floor,
 *   and the mark never scales below 18 px.
 * - The mark is `aria-hidden`: the button's name is its text, and a reader
 *   hearing "Google" twice learns nothing the second time.
 *
 * It renders a real `<button type="submit">` inside the form that starts the
 * handshake, so it works before hydration like every other control here
 * (ADR-0024 D3).
 */
export function GoogleSignInButton({
  label,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "children"> & {
  /** Already formatted with the provider's untranslated name. */
  label: string;
}) {
  return (
    <Button
      type="submit"
      variant="secondary"
      disabled={disabled}
      data-google-sign-in-button="true"
      // `Button`'s own `[&_svg]:size-4` is a descendant rule and outranks a
      // class on the mark itself, which silently shrank it to 16 px — below
      // Google's floor, and invisible to every test that read class names
      // instead of the rendered box. Set on the same element, at the same
      // specificity, so `cn` can win it.
      className="gap-3 [&_svg]:size-4.5"
      {...props}
    >
      <GoogleMark />
      <span>{label}</span>
    </Button>
  );
}

/**
 * Google's "G", in the four colours their guidelines specify. Inline rather
 * than an `<img>`: it inherits nothing and needs no request on the one screen
 * where a slow asset costs a sign-in.
 */
function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 18 18"
      className="shrink-0"
      data-google-mark="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
