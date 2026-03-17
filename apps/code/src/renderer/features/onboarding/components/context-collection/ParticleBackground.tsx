import {
  type ISourceOptions,
  MoveDirection,
  OutMode,
} from "@tsparticles/engine";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { useEffect, useMemo, useState } from "react";

const particleOptions: ISourceOptions = {
  fullScreen: false,
  fpsLimit: 60,
  particles: {
    number: {
      value: 60,
      density: {
        enable: true,
      },
    },
    color: {
      value: "#8a8a8a",
    },
    links: {
      enable: true,
      distance: 150,
      color: "#999999",
      opacity: 0.25,
      width: 1,
    },
    move: {
      enable: true,
      speed: 0.8,
      direction: MoveDirection.none,
      outModes: {
        default: OutMode.bounce,
      },
    },
    size: {
      value: { min: 1.5, max: 3.5 },
    },
    opacity: {
      value: 0.35,
    },
  },
  interactivity: {
    events: {
      onHover: { enable: false },
      onClick: { enable: false },
    },
  },
  detectRetina: true,
};

export function ParticleBackground() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  const options = useMemo(() => particleOptions, []);

  if (!ready) return null;

  return (
    <Particles
      id="context-collection-particles"
      options={options}
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}
