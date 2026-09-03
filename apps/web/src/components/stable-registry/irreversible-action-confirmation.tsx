import { IRREVERSIBLE_ACTION_CONFIRM_FIELD } from "@/lib/stable-registry/irreversible-action";

/**
 * The confirm step before an irreversible Release Center action (ADR-0022,
 * D5): the owner reads the affected counts and ticks the box; the Server
 * Action refuses the request without it.
 */
export function IrreversibleActionConfirmation({ text }: { text: string }) {
  return (
    <label className="mt-4 flex items-start gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        name={IRREVERSIBLE_ACTION_CONFIRM_FIELD}
        required
        className="mt-1"
        data-irreversible-action-confirm="true"
      />
      <span>{text}</span>
    </label>
  );
}
