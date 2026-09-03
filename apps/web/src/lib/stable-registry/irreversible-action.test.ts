import { describe, expect, it } from "vitest";

import {
  IRREVERSIBLE_ACTION_CONFIRM_FIELD,
  isIrreversibleActionConfirmed,
} from "./irreversible-action";

describe("irreversible action confirmation", () => {
  it("accepts only the ticked checkbox value", () => {
    const ticked = new FormData();
    ticked.set(IRREVERSIBLE_ACTION_CONFIRM_FIELD, "on");
    const typed = new FormData();
    typed.set(IRREVERSIBLE_ACTION_CONFIRM_FIELD, "yes");

    expect(isIrreversibleActionConfirmed(ticked)).toBe(true);
    expect(isIrreversibleActionConfirmed(typed)).toBe(false);
    expect(isIrreversibleActionConfirmed(new FormData())).toBe(false);
  });
});
