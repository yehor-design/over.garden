// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareControl } from "./share-control";

const labels = {
  share: "Поділитися",
  copied: "Посилання скопійовано.",
  failed: "Не вдалося скопіювати. Ось посилання:",
  address: "Посилання на запис",
};
const URL_ = "https://over.garden/@olena/post/7";

function stubNavigator(input: {
  share?: (data: ShareData) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}) {
  vi.stubGlobal("navigator", {
    ...navigator,
    share: input.share,
    clipboard: { writeText: input.writeText ?? vi.fn() },
  });
}

describe("ShareControl (OVE-493)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens the device's own sheet with the canonical address", async () => {
    const share = vi.fn(async () => undefined);
    stubNavigator({ share });
    render(<ShareControl url={URL_} title="Томат" labels={labels} />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитися" }));
    expect(share).toHaveBeenCalledWith({ title: "Томат", url: URL_ });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says nothing when the reader closes the sheet", async () => {
    const writeText = vi.fn(async () => undefined);
    stubNavigator({
      share: vi.fn(async () => {
        throw new DOMException("closed", "AbortError");
      }),
      writeText,
    });
    render(<ShareControl url={URL_} title="Томат" labels={labels} />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитися" }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("copies the link where there is no sheet, and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    stubNavigator({ writeText });
    render(<ShareControl url={URL_} title="Томат" labels={labels} />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитися" }));
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(await screen.findByText(labels.copied)).toBeTruthy();
  });

  it("shows the address to copy by hand when copying fails", async () => {
    stubNavigator({
      writeText: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    render(<ShareControl url={URL_} title="Томат" labels={labels} />);
    await userEvent.click(screen.getByRole("button", { name: "Поділитися" }));
    expect(await screen.findByText(labels.failed)).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: labels.address,
        }) as HTMLInputElement
      ).value,
    ).toBe(URL_);
  });
});
