import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callbacks: null as null | {
    onError?: () => void;
    onStateChange?: (
      state: "idle" | "listening" | "cancelled" | "error",
    ) => void;
    onTranscript: (transcript: string) => void;
  },
  start: vi.fn(() => true),
  cancel: vi.fn(),
  dispose: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => {
    const buttonProps = { ...props };
    delete (buttonProps as { variant?: unknown }).variant;
    delete (buttonProps as { size?: unknown }).size;
    return <button {...buttonProps} />;
  },
}));

vi.mock("@/lib/garden/voice-to-text", () => ({
  resolveSpeechRecognitionConstructor: () => class TestRecognition {},
  createJournalVoiceInputSession: (
    callbacks: NonNullable<typeof mocks.callbacks>,
  ) => {
    mocks.callbacks = callbacks;
    return {
      start: mocks.start,
      cancel: mocks.cancel,
      dispose: mocks.dispose,
      stop: mocks.stop,
    };
  },
}));

import { JournalVoiceInputControl } from "./journal-voice-input-control";

describe("JournalVoiceInputControl freeze contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks = null;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("navigator", { language: "bg-BG" });
    vi.stubGlobal("window", {
      setTimeout(callback: () => void) {
        callback();
        return 1;
      },
      clearTimeout: vi.fn(),
    });
  });

  it("disposes active recognition and ignores a late transcript when disabled", async () => {
    const onTranscript = vi.fn();
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <JournalVoiceInputControl locale="bg" onTranscript={onTranscript} />,
      );
    });
    const startButton = renderer!.root.findByType("button");
    await act(async () => {
      startButton.props.onClick();
    });
    expect(mocks.start).toHaveBeenCalledOnce();
    const staleCallbacks = mocks.callbacks;

    await act(async () => {
      renderer!.update(
        <JournalVoiceInputControl
          locale="bg"
          onTranscript={onTranscript}
          disabled
        />,
      );
    });

    expect(mocks.dispose).toHaveBeenCalledOnce();
    const disabledButton = renderer!.root.findByType("button");
    expect(disabledButton.props.disabled).toBe(true);
    await act(async () => {
      staleCallbacks?.onTranscript("late frozen transcript");
      disabledButton.props.onClick();
    });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledOnce();
  });
});
