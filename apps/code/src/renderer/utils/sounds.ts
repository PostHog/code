import type { CompletionSound } from "@features/settings/stores/settingsStore";
import bubblesUrl from "@renderer/assets/sounds/bubbles.mp3";
import daniloUrl from "@renderer/assets/sounds/danilo.mp3";
import dropUrl from "@renderer/assets/sounds/drop.mp3";
import guitarUrl from "@renderer/assets/sounds/guitar.mp3";
import knockUrl from "@renderer/assets/sounds/knock.mp3";
import meepUrl from "@renderer/assets/sounds/meep.mp3";
import reviUrl from "@renderer/assets/sounds/revi.mp3";
import ringUrl from "@renderer/assets/sounds/ring.mp3";
import shootUrl from "@renderer/assets/sounds/shoot.mp3";
import slideUrl from "@renderer/assets/sounds/slide.mp3";
import switchUrl from "@renderer/assets/sounds/switch.mp3";
import { trpcClient } from "@renderer/trpc/client";

const SOUND_URLS: Record<
  Exclude<CompletionSound, "none" | "custom">,
  string
> = {
  guitar: guitarUrl,
  danilo: daniloUrl,
  revi: reviUrl,
  meep: meepUrl,
  bubbles: bubblesUrl,
  drop: dropUrl,
  knock: knockUrl,
  ring: ringUrl,
  shoot: shootUrl,
  slide: slideUrl,
  switch: switchUrl,
};

let currentAudio: HTMLAudioElement | null = null;
let customSoundDataUrl: string | null = null;
let customSoundLoading = false;

export async function loadCustomSoundUrl(): Promise<string | null> {
  customSoundLoading = true;
  try {
    customSoundDataUrl = await trpcClient.os.getCustomSoundDataUrl.query();
    return customSoundDataUrl;
  } finally {
    customSoundLoading = false;
  }
}

export function clearCustomSoundCache(): void {
  customSoundDataUrl = null;
}

export function playCompletionSound(sound: CompletionSound, volume = 80): void {
  if (sound === "none") return;

  let url: string | null;
  if (sound === "custom") {
    url = customSoundDataUrl;
    if (!url && !customSoundLoading) {
      loadCustomSoundUrl().then((loaded) => {
        if (loaded) playCompletionSound("custom", volume);
      });
      return;
    }
    if (!url) return;
  } else {
    url = SOUND_URLS[sound];
  }
  if (!url) return;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(100, volume)) / 100;
  currentAudio = audio;
  audio.play().catch(() => {
    // Audio play can fail if user hasn't interacted with the page yet
  });
  audio.addEventListener("ended", () => {
    if (currentAudio === audio) {
      currentAudio = null;
    }
  });
}
