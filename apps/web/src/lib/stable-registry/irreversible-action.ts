/** The form field an irreversible Release Center action must carry (ADR-0022, D5). */
export const IRREVERSIBLE_ACTION_CONFIRM_FIELD = "confirmIrreversible";

export function isIrreversibleActionConfirmed(formData: FormData) {
  return formData.get(IRREVERSIBLE_ACTION_CONFIRM_FIELD) === "on";
}
