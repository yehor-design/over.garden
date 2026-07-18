"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  createJournalVoiceInputSession,
  resolveSpeechRecognitionConstructor,
  type JournalSpeechRecognitionConstructor,
  type JournalVoiceInputSession,
  type JournalVoiceInputState,
} from "@/lib/garden/voice-to-text";

interface JournalVoiceInputControlProps {
  locale: InterfaceLocale;
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
}

type VoiceInputSupport = "checking" | "supported" | "unsupported";

export function JournalVoiceInputControl({
  locale,
  onTranscript,
  disabled = false,
}: JournalVoiceInputControlProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const [support, setSupport] = useState<VoiceInputSupport>("checking");
  const [voiceState, setVoiceState] = useState<JournalVoiceInputState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const recognitionConstructorRef =
    useRef<JournalSpeechRecognitionConstructor | null>(null);
  const sessionRef = useRef<JournalVoiceInputSession | null>(null);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const constructor = resolveSpeechRecognitionConstructor(window);
      recognitionConstructorRef.current = constructor;
      setSupport(constructor ? "supported" : "unsupported");
    }, 0);

    return () => {
      window.clearTimeout(timer);
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    disabledRef.current = disabled;
    if (!disabled) return;
    // dispose() removes result/error/end callbacks before aborting, so a
    // browser-delivered late result cannot mutate a frozen composer.
    sessionRef.current?.dispose();
    sessionRef.current = null;
    const resetTimer = window.setTimeout(() => {
      setVoiceState("idle");
      setMessage(null);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [disabled]);

  function startDictation() {
    if (disabledRef.current) return;
    const Constructor = recognitionConstructorRef.current;
    if (!Constructor) {
      setSupport("unsupported");
      setVoiceState("idle");
      setMessage(null);
      return;
    }

    const recognition = new Constructor();
    let session: JournalVoiceInputSession | null = null;
    session = createJournalVoiceInputSession({
      recognition,
      lang: typeof navigator === "undefined" ? undefined : navigator.language,
      onError: () => {
        if (disabledRef.current || sessionRef.current !== session) return;
        setMessage(copy.composer.voice.error);
      },
      onStateChange: (state) => {
        if (disabledRef.current || sessionRef.current !== session) return;
        setVoiceState(state);
        setMessage(messageForVoiceState(state, copy));
      },
      onTranscript: (transcript) => {
        if (disabledRef.current || sessionRef.current !== session) return;
        onTranscript(transcript);
        setMessage(copy.composer.voice.added);
      },
    });

    sessionRef.current = session;
    if (!session.start()) {
      sessionRef.current = null;
    }
  }

  function cancelDictation() {
    sessionRef.current?.cancel();
    sessionRef.current = null;
  }

  if (support === "checking") return null;

  if (support === "unsupported") {
    return (
      <span className="text-xs leading-5 font-normal text-muted-foreground">
        {copy.composer.voice.unsupported}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {voiceState === "listening" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-7"
          disabled={disabled}
          onClick={cancelDictation}
        >
          <MicOff className="size-4" />
          {copy.composer.voice.cancelAction}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-7"
          disabled={disabled}
          onClick={startDictation}
        >
          <Mic className="size-4" />
          {copy.composer.voice.dictateAction}
        </Button>
      )}
      {message ? (
        <span
          aria-live="polite"
          className={
            voiceState === "error"
              ? "text-xs leading-5 text-destructive"
              : "text-xs leading-5 text-muted-foreground"
          }
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}

function messageForVoiceState(
  state: JournalVoiceInputState,
  copy: GardenWorkspaceCopy,
) {
  switch (state) {
    case "listening":
      return copy.composer.voice.listening;
    case "cancelled":
      return copy.composer.voice.cancelled;
    case "error":
      return copy.composer.voice.error;
    default:
      return null;
  }
}
