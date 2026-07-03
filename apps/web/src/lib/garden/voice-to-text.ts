export const VOICE_INPUT_UNSUPPORTED_MESSAGE =
  "Voice input is unavailable here. Typing still works.";

export type JournalVoiceInputState =
  | "idle"
  | "listening"
  | "cancelled"
  | "error";

export interface JournalSpeechRecognitionAlternative {
  transcript: string;
}

export interface JournalSpeechRecognitionResult {
  isFinal?: boolean;
  item?: (index: number) => JournalSpeechRecognitionAlternative | undefined;
  [index: number]: JournalSpeechRecognitionAlternative | undefined;
}

export interface JournalSpeechRecognitionResultList {
  length: number;
  item?: (index: number) => JournalSpeechRecognitionResult | undefined;
  [index: number]: JournalSpeechRecognitionResult | undefined;
}

export interface JournalSpeechRecognitionEvent {
  resultIndex?: number;
  results: JournalSpeechRecognitionResultList;
}

export interface JournalSpeechRecognitionErrorEvent {
  error?: string;
}

export interface JournalSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: JournalSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: JournalSpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
}

export type JournalSpeechRecognitionConstructor =
  new () => JournalSpeechRecognition;

export interface JournalVoiceInputSession {
  cancel: () => void;
  dispose: () => void;
  start: () => boolean;
  stop: () => void;
}

export function resolveSpeechRecognitionConstructor(
  browserWindow: unknown,
): JournalSpeechRecognitionConstructor | null {
  if (!browserWindow || typeof browserWindow !== "object") return null;

  const source = browserWindow as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  const constructor =
    source.SpeechRecognition ?? source.webkitSpeechRecognition ?? null;

  return typeof constructor === "function"
    ? (constructor as JournalSpeechRecognitionConstructor)
    : null;
}

export function appendVoiceTranscriptToBody(
  currentBody: string,
  transcript: string,
  maxLength = 2000,
): string {
  const normalized = normalizeVoiceTranscript(transcript);
  if (!normalized) return currentBody;

  const current = currentBody.trimEnd();
  const next = current ? `${current}\n${normalized}` : normalized;
  return next.length > maxLength ? next.slice(0, maxLength) : next;
}

export function extractFinalVoiceTranscript(
  event: JournalSpeechRecognitionEvent,
): string {
  const parts: string[] = [];
  const startIndex = event.resultIndex ?? 0;

  for (let index = startIndex; index < event.results.length; index += 1) {
    const result = getResult(event.results, index);
    if (!result || result.isFinal === false) continue;

    const alternative = getAlternative(result, 0);
    if (alternative?.transcript) {
      parts.push(alternative.transcript);
    }
  }

  return normalizeVoiceTranscript(parts.join(" "));
}

export function createJournalVoiceInputSession({
  recognition,
  lang,
  onError,
  onStateChange,
  onTranscript,
}: {
  recognition: JournalSpeechRecognition;
  lang?: string;
  onError?: () => void;
  onStateChange?: (state: JournalVoiceInputState) => void;
  onTranscript: (transcript: string) => void;
}): JournalVoiceInputSession {
  let cancelled = false;
  let cancellationReported = false;
  let failed = false;

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = lang ?? "";

  recognition.onresult = (event) => {
    const transcript = extractFinalVoiceTranscript(event);
    if (transcript) onTranscript(transcript);
  };

  recognition.onerror = (event) => {
    if (cancelled || event.error === "aborted") return;
    failed = true;
    onStateChange?.("error");
    onError?.();
  };

  recognition.onend = () => {
    if (cancelled) {
      reportCancellation();
      return;
    }

    if (!failed) {
      onStateChange?.("idle");
    }
  };

  return {
    cancel() {
      cancelled = true;
      recognition.abort();
      reportCancellation();
    },
    dispose() {
      cancelled = true;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;

      try {
        recognition.abort();
      } catch {
        // Some browsers throw when aborting an already-ended recognition.
      }
    },
    start() {
      cancelled = false;
      cancellationReported = false;
      failed = false;
      onStateChange?.("listening");

      try {
        recognition.start();
        return true;
      } catch {
        failed = true;
        onStateChange?.("error");
        onError?.();
        return false;
      }
    },
    stop() {
      recognition.stop();
    },
  };

  function reportCancellation() {
    if (cancellationReported) return;

    cancellationReported = true;
    onStateChange?.("cancelled");
  }
}

function normalizeVoiceTranscript(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getResult(results: JournalSpeechRecognitionResultList, index: number) {
  return results[index] ?? results.item?.(index);
}

function getAlternative(result: JournalSpeechRecognitionResult, index: number) {
  return result[index] ?? result.item?.(index);
}
