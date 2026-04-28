import { Audio } from "expo-av";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const meepAsset = require("../../../../assets/sounds/meep.mp3");

let audioModeConfigured = false;

export async function playMeepSound(): Promise<void> {
  if (!audioModeConfigured) {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
    });
    audioModeConfigured = true;
  }
  const { sound } = await Audio.Sound.createAsync(meepAsset, {
    shouldPlay: true,
  });
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) {
      sound.unloadAsync();
    }
  });
}
