"use client";

import { useActionState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

import {
  readStoredGoogleAnalyticsConsent,
  subscribeToGoogleAnalyticsConsent,
  writeStoredGoogleAnalyticsConsent,
  type GoogleAnalyticsConsent,
} from "@/app/google-analytics";
import { OwnerUserIdField } from "@/components/auth/owner-scope";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { HiddenField } from "@/components/ui/hidden-field";
import { Switch } from "@/components/ui/switch";
import type { LegalAcceptanceCopy } from "@/lib/legal/legal-acceptance-copy";
import {
  readStoredMetaMarketingConsent,
  subscribeToMetaMarketingConsent,
  writeStoredMetaMarketingConsent,
} from "@/lib/meta-marketing/client";
import type { MetaMarketingConsent } from "@/lib/meta-marketing/events";

import type { LegalAcceptanceFormState } from "./actions";

type Action = (
  previous: LegalAcceptanceFormState,
  formData: FormData,
) => Promise<LegalAcceptanceFormState>;

const IDLE: LegalAcceptanceFormState = { status: "idle" };

/**
 * The acceptance screen's controls (ADR-0038 D2 and D4): the two cookie
 * switches, «Прийняти» and «Не приймаю».
 *
 * The switches are the reader's own stored choices — the same two the guest
 * notice and the privacy page write — and take effect as they are moved.
 * Both start off. Accepting with one never moved records it as off: the
 * reader was shown the choice and left it there, so the notice does not ask
 * the same question again. Accepting the terms never switches either on.
 */
export function LegalAcceptanceForms({
  copy,
  next,
  declineDeletesAccount,
  accept,
  decline,
}: {
  copy: LegalAcceptanceCopy["screen"];
  next: string;
  declineDeletesAccount: boolean;
  accept: Action;
  decline: Action;
}) {
  const [acceptState, acceptAction] = useActionState(accept, IDLE);
  const [declineState, declineAction] = useActionState(decline, IDLE);
  const analytics = useSyncExternalStore(
    subscribeToGoogleAnalyticsConsent,
    readStoredGoogleAnalyticsConsent,
    undecidedAnalytics,
  );
  const marketing = useSyncExternalStore(
    subscribeToMetaMarketingConsent,
    readStoredMetaMarketingConsent,
    undecidedMarketing,
  );
  const failed =
    acceptState.status === "failed" || declineState.status === "failed";

  return (
    <div className="grid gap-6">
      {failed ? (
        <Callout tone="danger" live="assertive" data-legal-acceptance-failed>
          {copy.failed}
        </Callout>
      ) : null}

      <form
        action={acceptAction}
        data-legal-acceptance-form="accept"
        onSubmit={() => {
          if (analytics === "undecided") {
            writeStoredGoogleAnalyticsConsent("declined");
          }
          if (marketing === "undecided") {
            writeStoredMetaMarketingConsent("declined");
          }
        }}
        className="grid gap-6"
      >
        <HiddenField name="next" value={next} />
        <OwnerUserIdField />
        <fieldset
          // The page asks both cookie questions here, so the notice does not
          // ask them over it (`globals.css`).
          data-cookie-choices-in-page=""
          aria-describedby="legal-acceptance-cookies-lead"
          className="grid gap-4 rounded-lg border border-border p-4"
        >
          <legend className="px-1 text-h4 text-text-heading">
            {copy.cookiesTitle}
          </legend>
          <p
            id="legal-acceptance-cookies-lead"
            className="text-body-sm text-text-secondary"
          >
            {copy.cookiesLead}
          </p>
          <Switch
            label={copy.analyticsLabel}
            description={copy.analyticsDescription}
            data-cookie-choice="analytics"
            checked={analytics === "accepted"}
            onChange={(event) =>
              writeStoredGoogleAnalyticsConsent(
                event.target.checked ? "accepted" : "declined",
              )
            }
          />
          <Switch
            label={copy.marketingLabel}
            description={copy.marketingDescription}
            data-cookie-choice="marketing"
            checked={marketing === "accepted"}
            onChange={(event) =>
              writeStoredMetaMarketingConsent(
                event.target.checked ? "accepted" : "declined",
              )
            }
          />
        </fieldset>
        <SubmitButton label={copy.accept} pendingLabel={copy.accepting} />
      </form>

      <form
        action={declineAction}
        data-legal-acceptance-form="decline"
        className="grid gap-2"
      >
        <HiddenField name="next" value={next} />
        <OwnerUserIdField />
        <p
          id="legal-acceptance-decline-note"
          className="text-body-sm text-text-secondary"
        >
          {declineDeletesAccount
            ? copy.declineNewAccountNote
            : copy.declineNote}
        </p>
        <DeclineButton label={copy.decline} />
      </form>
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

function DeclineButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="lg"
      aria-describedby="legal-acceptance-decline-note"
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {label}
    </Button>
  );
}

function undecidedAnalytics(): GoogleAnalyticsConsent {
  return "undecided";
}

function undecidedMarketing(): MetaMarketingConsent {
  return "undecided";
}
