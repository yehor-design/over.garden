import { describe, expect, it, vi } from "vitest";

import { InlineMediaIntentController } from "./inline-media-intent-controller";

describe("OVE-243 inline media reservations", () => {
  it("atomically caps parallel reservations at ten", () => {
    const controller = new InlineMediaIntentController();
    const winners = Array.from({ length: 10 }, () =>
      controller.reserve({ size: 1 }, {}),
    );
    expect(() => controller.reserve({ size: 1 }, {})).toThrow("up to 10");
    expect(controller.snapshot()).toEqual({
      reservedCount: 10,
      committedCount: 0,
      objectUrlCount: 0,
    });
    for (const winner of winners) controller.release(winner);
    expect(controller.snapshot()).toEqual({
      reservedCount: 0,
      committedCount: 0,
      objectUrlCount: 0,
    });
  });

  it("revokes every committed object URL exactly once", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const controller = new InlineMediaIntentController();
    const first = controller.reserve({ size: 10 }, {});
    const second = controller.reserve({ size: 10 }, {});
    controller.commit(first, "block-first", "blob:first");
    controller.commit(second, "block-second", "blob:second");
    controller.destroy();
    controller.destroy();
    expect(revoke.mock.calls).toEqual([["blob:first"], ["blob:second"]]);
  });

  it("keeps committed selections reserved until React state catches up", () => {
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const controller = new InlineMediaIntentController();
    const committed = Array.from({ length: 10 }, (_, index) => {
      const reservation = controller.reserve({ size: 1 }, {});
      controller.commit(reservation, `block-${index}`, `blob:${index}`);
      return reservation;
    });
    expect(committed).toHaveLength(10);
    expect(() => controller.reserve({ size: 1 }, {})).toThrow("up to 10");
  });

  it("reconciles a committed selection without double-counting aliases", () => {
    const controller = new InlineMediaIntentController();
    const reservation = controller.reserve({ size: 10 }, {});
    controller.commit(reservation, "block-first", "blob:first");
    const intent = { id: "intent-first", size: 10 } as never;
    const next = controller.reserve(
      { size: 10 },
      { "block-first": intent, "media-first": intent },
    );
    expect(controller.snapshot()).toEqual({
      reservedCount: 1,
      committedCount: 0,
      objectUrlCount: 1,
    });
    controller.release(next);
    controller.destroy();
  });
});
