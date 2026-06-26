import { beforeEach, describe, expect, it } from "vitest";

import {
  enqueueOfflineMutation,
  listQueuedMutations,
  offlineDb,
} from "./queue";

describe("offline queue", () => {
  beforeEach(async () => {
    await offlineDb?.mutations.clear();
  });

  it("stores queued mutations with idempotency keys", async () => {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload: { body: "Помідори чері" },
      idempotencyKey: "entry-1",
    });

    const queued = await listQueuedMutations();

    expect(mutation.status).toBe("queued");
    expect(mutation.idempotencyKey).toBe("entry-1");
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toEqual({ body: "Помідори чері" });
  });
});
