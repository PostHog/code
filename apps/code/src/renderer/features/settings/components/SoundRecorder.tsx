import { Button, Flex, Text } from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc/client";
import { clearCustomSoundCache, loadCustomSoundUrl } from "@utils/sounds";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_DURATION_S = 5;

type RecorderState = "idle" | "ready" | "recording" | "recorded";

interface SoundRecorderProps {
  onSave: () => void;
  onCancel: () => void;
}

export function SoundRecorder({ onSave, onCancel }: SoundRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Skip the permission step if microphone access was already granted
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (result.state === "granted") {
          setState((s) => (s === "idle" ? "ready" : s));
        }
      })
      .catch(() => {});
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately — we only needed it to prompt for permission
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setState("ready");
    } catch {
      toast.error("Microphone access denied", {
        description:
          "Allow PostHog Code microphone access in System Settings > Privacy & Security > Microphone",
      });
      onCancel();
    }
  }, [onCancel]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: "audio/webm" });
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
        setState("recorded");
      };

      mediaRecorder.start();
      setState("recording");
      setElapsed(0);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startTime) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_DURATION_S) {
          mediaRecorder.stop();
        }
      }, 200);
    } catch {
      toast.error("Failed to start recording");
      onCancel();
    }
  }, [onCancel]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handlePreview = useCallback(() => {
    if (!blobRef.current) return;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    const url = URL.createObjectURL(blobRef.current);
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    audio.play().catch(() => {});
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      previewAudioRef.current = null;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!blobRef.current) return;
    setSaving(true);
    try {
      const arrayBuffer = await blobRef.current.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      await trpcClient.os.saveCustomSound.mutate({
        base64Data: base64,
        mimeType: "audio/webm",
      });
      clearCustomSoundCache();
      await loadCustomSoundUrl();
      onSave();
    } catch {
      toast.error("Failed to save recording");
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  const handleDiscard = useCallback(() => {
    cleanup();
    blobRef.current = null;
    onCancel();
  }, [cleanup, onCancel]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (state === "idle") {
    return (
      <Flex align="center" gap="2" py="2">
        <Button variant="soft" size="1" onClick={requestPermission}>
          Allow microphone
        </Button>
        <Button variant="ghost" size="1" onClick={onCancel}>
          Cancel
        </Button>
      </Flex>
    );
  }

  if (state === "ready") {
    return (
      <Flex align="center" gap="2" py="2">
        <Button variant="soft" size="1" color="red" onClick={startRecording}>
          Record
        </Button>
        <Button variant="ghost" size="1" onClick={onCancel}>
          Cancel
        </Button>
      </Flex>
    );
  }

  if (state === "recording") {
    return (
      <Flex align="center" gap="2" py="2">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-9" />
        <Text size="1" color="gray">
          Recording {formatTime(elapsed)} / {formatTime(MAX_DURATION_S)}
        </Text>
        <Button variant="soft" size="1" color="red" onClick={stopRecording}>
          Stop
        </Button>
      </Flex>
    );
  }

  return (
    <Flex align="center" gap="2" py="2">
      <Text size="1" color="gray">
        Recorded {formatTime(elapsed)}
      </Text>
      <Button variant="ghost" size="1" onClick={handlePreview}>
        Play
      </Button>
      <Button variant="soft" size="1" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
      <Button variant="ghost" size="1" onClick={handleDiscard}>
        Discard
      </Button>
    </Flex>
  );
}
