import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RemainingDocumentMutationTransportBoundary,
  isRemainingDocumentMutationForm,
  setDocumentMutationGenerationField,
} from "./remaining-document-mutation-recovery";

const GENERATION_FIELD = "__overgardenDocumentGeneration";

class FakeInput {
  isConnected = false;
  name = "";
  type = "text";
  value = "";

  constructor(input: Partial<FakeInput> = {}) {
    Object.assign(this, input);
  }
}

class FakeButton {}

class FakeFormElements {
  constructor(readonly items: Array<FakeInput | FakeButton> = []) {}

  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }

  namedItem(name: string) {
    return (
      this.items.find(
        (item) => item instanceof FakeInput && item.name === name,
      ) ?? null
    );
  }
}

class FakeForm {
  readonly attributes = new Map<string, string>();
  readonly elements = new FakeFormElements();
  readonly requestSubmit = vi.fn();
  action: string;
  method = "post";

  constructor(action: string) {
    this.action = action;
  }

  append(input: FakeInput) {
    input.isConnected = true;
    this.elements.items.push(input);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
}

describe("remaining document mutation form bridge", () => {
  let submitListener: ((event: SubmitEvent) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("HTMLFormElement", FakeForm);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("HTMLButtonElement", FakeButton);
    vi.stubGlobal("window", {
      location: new URL("https://over.garden/garden"),
    });
    vi.stubGlobal("document", {
      addEventListener: (
        type: string,
        listener: (event: SubmitEvent) => void,
      ) => {
        if (type === "submit") submitListener = listener;
      },
      removeEventListener: vi.fn(),
      createElement: (tag: string) => {
        if (tag !== "input") throw new Error(`Unexpected element: ${tag}`);
        return new FakeInput();
      },
    });
  });

  it("recognizes only exact same-origin mutation routes or React Server Actions", () => {
    const routeForm = new FakeForm(
      "https://over.garden/api/engagement/comments/report",
    );
    expect(
      isRemainingDocumentMutationForm(routeForm as unknown as HTMLFormElement),
    ).toBe(true);

    const serverActionForm = new FakeForm("https://over.garden/garden");
    serverActionForm.elements.items.push(
      new FakeInput({ name: "$ACTION_ID_opaque" }),
    );
    expect(
      isRemainingDocumentMutationForm(
        serverActionForm as unknown as HTMLFormElement,
      ),
    ).toBe(true);

    for (const form of [
      Object.assign(
        new FakeForm("https://over.garden/api/engagement/comments"),
        {
          method: "get",
        },
      ),
      new FakeForm("https://attacker.example/api/engagement/comments"),
      new FakeForm("https://over.garden/api/engagement/comments/extra"),
    ]) {
      expect(
        isRemainingDocumentMutationForm(form as unknown as HTMLFormElement),
      ).toBe(false);
    }

    const managed = new FakeForm("https://over.garden/api/engagement/comments");
    managed.attributes.set("data-document-mutation-managed", "true");
    expect(
      isRemainingDocumentMutationForm(managed as unknown as HTMLFormElement),
    ).toBe(false);
  });

  it("inserts and then reuses one opaque generation field", () => {
    const form = new FakeForm("https://over.garden/api/engagement/comments");

    setDocumentMutationGenerationField(
      form as unknown as HTMLFormElement,
      "generation-a",
    );
    setDocumentMutationGenerationField(
      form as unknown as HTMLFormElement,
      "generation-b",
    );

    expect(form.elements.items).toHaveLength(1);
    expect(form.elements.namedItem(GENERATION_FIELD)).toMatchObject({
      name: GENERATION_FIELD,
      type: "hidden",
      value: "generation-b",
      isConnected: true,
    });
  });

  it("preflights once, preserves the submitter, and releases the matched form", async () => {
    const handleTransportResult = vi.fn();
    const confirmOwnerContinuity = vi.fn(async () => "MATCH" as const);
    const form = new FakeForm("https://over.garden/api/engagement/comments");
    const submitter = new FakeButton();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <RemainingDocumentMutationTransportBoundary
          transport="generation-a"
          handleTransportResult={handleTransportResult}
          confirmOwnerContinuity={confirmOwnerContinuity}
        />,
      );
    });

    const firstPreventDefault = vi.fn();
    await act(async () => {
      submitListener?.({
        target: form,
        submitter,
        preventDefault: firstPreventDefault,
      } as unknown as SubmitEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(firstPreventDefault).toHaveBeenCalledOnce();
    expect(confirmOwnerContinuity).toHaveBeenCalledOnce();
    expect(form.requestSubmit).toHaveBeenCalledWith(submitter);
    expect(form.elements.namedItem(GENERATION_FIELD)).toMatchObject({
      value: "generation-a",
    });

    const releasedPreventDefault = vi.fn();
    submitListener?.({
      target: form,
      submitter,
      preventDefault: releasedPreventDefault,
    } as unknown as SubmitEvent);
    expect(releasedPreventDefault).not.toHaveBeenCalled();
    expect(handleTransportResult).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it("keeps rejected or transport-less forms on screen for shared recovery", async () => {
    const handleTransportResult = vi.fn();
    const confirmOwnerContinuity = vi.fn(
      async () => "DOCUMENT_OWNER_CHANGED" as const,
    );
    const form = new FakeForm("https://over.garden/api/engagement/follows");
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <RemainingDocumentMutationTransportBoundary
          transport="generation-a"
          handleTransportResult={handleTransportResult}
          confirmOwnerContinuity={confirmOwnerContinuity}
        />,
      );
    });

    await act(async () => {
      submitListener?.({
        target: form,
        submitter: null,
        preventDefault: vi.fn(),
      } as unknown as SubmitEvent);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(handleTransportResult).toHaveBeenCalledWith(
      "DOCUMENT_OWNER_CHANGED",
    );
    expect(form.requestSubmit).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
        <RemainingDocumentMutationTransportBoundary
          transport={null}
          handleTransportResult={handleTransportResult}
          confirmOwnerContinuity={confirmOwnerContinuity}
        />,
      );
    });
    const noTransportForm = new FakeForm(
      "https://over.garden/api/notifications/preferences",
    );
    submitListener?.({
      target: noTransportForm,
      submitter: null,
      preventDefault: vi.fn(),
    } as unknown as SubmitEvent);
    expect(handleTransportResult).toHaveBeenLastCalledWith(
      "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
    );
    expect(confirmOwnerContinuity).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
  });
});
