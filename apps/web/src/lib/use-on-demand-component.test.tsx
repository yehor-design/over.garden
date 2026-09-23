import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { useOnDemandComponent } from "./use-on-demand-component";

function Arrived({ label }: { label: string }) {
  return <p data-arrived="true">{label}</p>;
}

type Load = () => Promise<typeof Arrived>;

/** A download that finishes when the test says so. */
function heldDownload() {
  let arrive!: () => void;
  let fail!: () => void;
  const load = vi.fn<Load>(
    () =>
      new Promise((resolve, reject) => {
        arrive = () => resolve(Arrived);
        fail = () => reject(new Error("the chunk did not arrive"));
      }),
  );
  return { load, arrive: () => arrive(), fail: () => fail() };
}

function Control({
  load,
  onRequest,
}: {
  load: Load;
  onRequest(request: () => Promise<boolean>, preload: () => void): void;
}) {
  const { Component, request, preload } = useOnDemandComponent(load);
  onRequest(request, preload);
  return Component ? (
    <Component label="the real control" />
  ) : (
    <button data-stand-in="true">stand-in</button>
  );
}

async function mount(load: Load) {
  let request!: () => Promise<boolean>;
  let preload!: () => void;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <Control
        load={load}
        onRequest={(nextRequest, nextPreload) => {
          request = nextRequest;
          preload = nextPreload;
        }}
      />,
    );
  });
  return {
    renderer: renderer!,
    request: () => request(),
    preload: () => preload(),
  };
}

describe("a control whose code arrives on the press (OVE-468)", () => {
  it("keeps a press that lands before the code does, and draws the control once it is here", async () => {
    const download = heldDownload();
    const { renderer, request } = await mount(download.load);

    let answer: Promise<boolean> | undefined;
    await act(async () => {
      answer = request();
    });
    // Pressed, not arrived: the stand-in is still what the reader sees.
    expect(
      renderer.root.findAllByProps({ "data-stand-in": "true" }),
    ).toHaveLength(1);
    expect(
      renderer.root.findAllByProps({ "data-arrived": "true" }),
    ).toHaveLength(0);

    await act(async () => {
      download.arrive();
      await answer;
    });
    expect(await answer).toBe(true);
    expect(
      renderer.root.findByProps({ "data-arrived": "true" }).props.children,
    ).toBe("the real control");
    await act(async () => renderer.unmount());
  });

  it("leaves the stand-in when the download fails, and asks again on the next press", async () => {
    const first = heldDownload();
    const load = vi.fn<Load>();
    load.mockImplementationOnce(first.load);
    load.mockImplementationOnce(async () => Arrived);
    const { renderer, request } = await mount(load);

    let answer: Promise<boolean> | undefined;
    await act(async () => {
      answer = request();
    });
    await act(async () => {
      first.fail();
      await answer;
    });
    // Not an error thrown into the page: the control is as it was.
    expect(await answer).toBe(false);
    expect(
      renderer.root.findAllByProps({ "data-stand-in": "true" }),
    ).toHaveLength(1);

    await act(async () => {
      expect(await request()).toBe(true);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findAllByProps({ "data-arrived": "true" }),
    ).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  it("starts a download on preload without drawing anything, and swallows its failure", async () => {
    const download = heldDownload();
    const { renderer, preload } = await mount(download.load);

    await act(async () => {
      preload();
    });
    expect(download.load).toHaveBeenCalledTimes(1);
    // Warmed, not pressed: nothing opens because a pointer passed over it.
    await act(async () => {
      download.arrive();
      await Promise.resolve();
    });
    expect(
      renderer.root.findAllByProps({ "data-stand-in": "true" }),
    ).toHaveLength(1);

    const failing = heldDownload();
    const second = await mount(failing.load);
    await act(async () => {
      second.preload();
      failing.fail();
      // An unhandled rejection here fails the run: this is the assertion.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => renderer.unmount());
    await act(async () => second.renderer.unmount());
  });
});
