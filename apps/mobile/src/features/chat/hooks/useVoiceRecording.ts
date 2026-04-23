import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useCallback, useRef, useState } from "react";
import { logger } from "@/lib/logger";

const log = logger.scope("voice-recording");

type RecordingStatus = "idle" | "recording" | "transcribing" | "error";

interface UseVoiceRecordingReturn {
  status: RecordingStatus;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => Promise<void>;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<string>("");
  const resolveRef = useRef<((text: string | null) => void) | null>(null);
  const listenersRef = useRef<(() => void)[]>([]);

  const cleanup = useCallback(() => {
    for (const remove of listenersRef.current) {
      remove();
    }
    listenersRef.current = [];
    resolveRef.current = null;
    transcriptRef.current = "";
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      transcriptRef.current = "";

      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError("Speech recognition is not available on this device");
        setStatus("error");
        return;
      }

      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setError("Speech recognition permission is required");
        setStatus("error");
        return;
      }

      // Listen for results — accumulate the latest transcript
      const resultSub = ExpoSpeechRecognitionModule.addListener(
        "result",
        (event) => {
          const best = event.results[0]?.transcript;
          if (best) {
            transcriptRef.current = best;
          }
          if (event.isFinal && resolveRef.current) {
            resolveRef.current(transcriptRef.current || null);
            cleanup();
            setStatus("idle");
          }
        },
      );

      const errorSub = ExpoSpeechRecognitionModule.addListener(
        "error",
        (event) => {
          // "no-speech" is not a real error — just means the user didn't say anything
          if (event.error === "no-speech") {
            if (resolveRef.current) {
              resolveRef.current(null);
            }
            cleanup();
            setStatus("idle");
            return;
          }
          setError(event.message || "Speech recognition failed");
          if (resolveRef.current) {
            resolveRef.current(null);
          }
          cleanup();
          setStatus("error");
        },
      );

      // If recognition ends without a final result (e.g. silence timeout)
      const endSub = ExpoSpeechRecognitionModule.addListener("end", () => {
        if (resolveRef.current) {
          resolveRef.current(transcriptRef.current || null);
          cleanup();
          setStatus("idle");
        }
      });

      listenersRef.current = [
        () => resultSub.remove(),
        () => errorSub.remove(),
        () => endSub.remove(),
      ];

      const useOnDevice =
        ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();

      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        requiresOnDeviceRecognition: useOnDevice,
        addsPunctuation: true,
      });

      setStatus("recording");
    } catch (err) {
      log.error("Failed to start speech recognition", err);
      setError("Failed to start speech recognition");
      setStatus("error");
    }
  }, [cleanup]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (status !== "recording") {
      return null;
    }

    setStatus("transcribing");

    return new Promise<string | null>((resolve) => {
      // Some Android engines go silent (e.g. backgrounded mid-recognition)
      // and never fire result/error/end — without this timeout the UI
      // would stay stuck on "Transcribing…" with no way out.
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        log.warn("Speech recognition did not finalize, falling back");
        cleanup();
        setStatus("idle");
        resolve(transcriptRef.current || null);
      }, 5000);
      resolveRef.current = (value) => {
        if (timedOut) return;
        clearTimeout(timeoutId);
        resolve(value);
      };
      ExpoSpeechRecognitionModule.stop();
    });
  }, [status, cleanup]);

  const cancelRecording = useCallback(async () => {
    ExpoSpeechRecognitionModule.abort();
    cleanup();
    setStatus("idle");
    setError(null);
  }, [cleanup]);

  return {
    status,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
