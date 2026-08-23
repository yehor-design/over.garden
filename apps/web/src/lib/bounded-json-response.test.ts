import { describe, expect, it, vi } from "vitest";

import {
  BoundedJsonResponseError,
  readBoundedJsonResponse,
} from "./bounded-json-response";

describe("readBoundedJsonResponse", () => {
  it("parses a response inside the exact byte budget", async () => {
    await expect(
      readBoundedJsonResponse(Response.json({ status: "ok" }), 64),
    ).resolves.toEqual({ status: "ok" });
  });

  it("rejects a declared oversized response before consuming its body", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: { "content-length": "65" },
    });
    await expect(readBoundedJsonResponse(response, 64)).rejects.toEqual(
      new BoundedJsonResponseError("too_large"),
    );
  });

  it("cancels a streamed response as soon as the accumulated bytes exceed the budget", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"'));
          controller.enqueue(new Uint8Array(128));
        },
        cancel,
      }),
    );
    await expect(readBoundedJsonResponse(response, 32)).rejects.toEqual(
      new BoundedJsonResponseError("too_large"),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects invalid UTF-8 or JSON without coercion", async () => {
    await expect(
      readBoundedJsonResponse(
        new Response(new Uint8Array([0xff, 0xfe, 0xfd])),
        16,
      ),
    ).rejects.toEqual(new BoundedJsonResponseError("invalid"));
  });
});
