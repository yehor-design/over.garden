import { describe, expect, it } from "vitest";

import {
  appendVoiceTranscriptToBody,
  createJournalVoiceInputSession,
  extractFinalVoiceTranscript,
  resolveSpeechRecognitionConstructor,
  VOICE_INPUT_UNSUPPORTED_MESSAGE,
  type JournalSpeechRecognition,
} from "./voice-to-text";

class FakeRecognition implements JournalSpeechRecognition {
  continuous = true;
  interimResults = true;
  lang = "";
  onend: (() => void) | null = null;
  onerror: JournalSpeechRecognition["onerror"] = null;
  onresult: JournalSpeechRecognition["onresult"] = null;
  abortCalled = false;
  startCalled = false;
  stopCalled = false;

  abort() {
    this.abortCalled = true;
  }

  start() {
    this.startCalled = true;
  }

  stop() {
    this.stopCalled = true;
  }
}

describe("voice-to-text helpers", () => {
  it("detects supported browser speech input constructors", () => {
    expect(
      resolveSpeechRecognitionConstructor({
        SpeechRecognition: FakeRecognition,
      }),
    ).toBe(FakeRecognition);
    expect(
      resolveSpeechRecognitionConstructor({
        webkitSpeechRecognition: FakeRecognition,
      }),
    ).toBe(FakeRecognition);
  });

  it("treats unsupported browsers as typed-entry fallback, not an error", () => {
    expect(resolveSpeechRecognitionConstructor({})).toBeNull();
    expect(VOICE_INPUT_UNSUPPORTED_MESSAGE).toBe(
      "Voice input is unavailable here. Typing still works.",
    );
  });

  it("captures only final transcript text from speech results", () => {
    const transcript = extractFinalVoiceTranscript({
      resultIndex: 0,
      results: {
        0: { 0: { transcript: " interim words " }, isFinal: false },
        1: { 0: { transcript: " two new leaves " }, isFinal: true },
        length: 2,
      },
    });

    expect(transcript).toBe("two new leaves");
  });

  it("can cancel a listening session without recording a failed state", () => {
    const states: string[] = [];
    const recognition = new FakeRecognition();
    const session = createJournalVoiceInputSession({
      recognition,
      onStateChange: (state) => states.push(state),
      onTranscript: () => {
        throw new Error("Cancel should not add transcript text.");
      },
    });

    expect(session.start()).toBe(true);
    session.cancel();
    recognition.onend?.();

    expect(recognition.startCalled).toBe(true);
    expect(recognition.abortCalled).toBe(true);
    expect(states).toEqual(["listening", "cancelled"]);
  });

  it("keeps transcribed body text editable before save", () => {
    const transcribed = appendVoiceTranscriptToBody(
      "Repotted in the morning.",
      "soil stayed moist",
    );
    const editedBeforeSave = `${transcribed} after shade moved over the pot.`;

    expect(transcribed).toBe("Repotted in the morning.\nsoil stayed moist");
    expect(editedBeforeSave).toBe(
      "Repotted in the morning.\nsoil stayed moist after shade moved over the pot.",
    );
  });
});
