import type { ReactNode } from "react";

import { Callout, type CalloutTone } from "@/components/ui/callout";

/**
 * One answer an invitation link can get, as a heading and its sentence
 * (`OVE-495`, criterion 9). Used on both sides of the handoff: the client
 * says what the link is before it reaches the server, the page says what the
 * record is after.
 */
export function InvitationStatePanel({
  state,
  tone,
  title,
  body,
  action,
}: {
  state: string;
  tone: CalloutTone;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section data-invitation-state={state} className="grid gap-3">
      <Callout tone={tone}>
        <h2 className="text-body font-medium text-text-heading">{title}</h2>
        <p className="mt-1">{body}</p>
      </Callout>
      {action ? <div className="flex flex-wrap gap-3">{action}</div> : null}
    </section>
  );
}
