import { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme.tsx";

const PETAL_COUNT = 25;

// Pixel-art petal shapes on a 7x8 grid
const PETAL_SHAPES = [
  "M2,0 H4 V1 H5 V2 H6 V4 H5 V5 H4 V6 H3 V7 H2 V6 H1 V5 H0 V3 H1 V1 H2 Z",
  "M2,0 H4 V1 H5 V2 H6 V4 H5 V5 H4 V6 H2 V5 H1 V4 H0 V2 H1 V1 H2 Z",
  "M1,0 H3 V1 H4 V3 H3 V4 H2 V5 H1 V4 H0 V2 H1 Z",
];

const COLORS = ["#ffb7c5", "#ffc1cc", "#ffa6b8", "#ffd1dc", "#ff9eb5", "#ffcad4"];

interface Petal {
  el: HTMLDivElement;
  x: number;
  y: number;
  speed: number;
  swaySpeed: number;
  swayAmp: number;
  swayOffset: number;
  rotation: number;
  rotSpeed: number;
  opacity: number;
}

function makePetalData(): Omit<Petal, "el"> {
  return {
    x: Math.random() * window.innerWidth,
    y: -(Math.random() * 200 + 20),
    speed: 0.4 + Math.random() * 0.8,
    swaySpeed: 0.5 + Math.random() * 1.5,
    swayAmp: 30 + Math.random() * 60,
    swayOffset: Math.random() * Math.PI * 2,
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 3,
    opacity: 0.6 + Math.random() * 0.4,
  };
}

function resetPetal(p: Petal, gust: { active: boolean; direction: number }) {
  p.x = Math.random() * window.innerWidth;
  p.y = -(Math.random() * 60 + 10);
  p.speed = 0.4 + Math.random() * 0.8;
  p.swayOffset = Math.random() * Math.PI * 2;
  p.rotation = Math.random() * 360;
  if (gust.active) {
    p.x = gust.direction > 0
      ? -(Math.random() * 100)
      : window.innerWidth + Math.random() * 100;
  }
}

export default function FallingPetals() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (theme !== "sakura" || !containerRef.current) return;

    const container = containerRef.current;
    const petals: Petal[] = [];
    const gust = { active: false, strength: 0, direction: 1 };

    for (let i = 0; i < PETAL_COUNT; i++) {
      const data = makePetalData();
      data.y = Math.random() * window.innerHeight * 1.2 - 100;

      const el = document.createElement("div");
      el.style.position = "fixed";
      el.style.pointerEvents = "none";
      el.style.zIndex = "9999";
      el.style.imageRendering = "pixelated";

      const shape = PETAL_SHAPES[Math.floor(Math.random() * PETAL_SHAPES.length)];
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const size = 14 + Math.random() * 14;
      el.innerHTML = `<svg viewBox="0 0 7 8" width="${size}" height="${size}" style="shape-rendering:crispEdges"><path d="${shape}" fill="${color}"/></svg>`;

      container.appendChild(el);
      petals.push({ ...data, el });
    }

    // Gust system with smooth easing
    let gustTimeout: ReturnType<typeof setTimeout>;
    let gustStart = 0;
    let gustDuration = 0;
    let gustPeak = 0;
    const scheduleGust = () => {
      gustTimeout = setTimeout(() => {
        gust.active = true;
        gustPeak = 2.5 + Math.random() * 4;
        gust.direction = Math.random() > 0.5 ? 1 : -1;
        gustStart = performance.now();
        gustDuration = 3000 + Math.random() * 3000;
      }, 5000 + Math.random() * 10000);
    };
    scheduleGust();

    // Smooth envelope: ramp up in first 20%, sustain, ramp down in last 30%
    const gustEnvelope = (now: number): number => {
      if (!gust.active) return 0;
      const elapsed = now - gustStart;
      const t = elapsed / gustDuration;
      if (t >= 1) {
        gust.active = false;
        gust.strength = 0;
        scheduleGust();
        return 0;
      }
      const rampUp = 0.4;
      const rampDown = 0.5;
      if (t < rampUp) {
        const p = t / rampUp;
        return gustPeak * (p * p);                                  // quadratic ease in
      }
      if (t > 1 - rampDown) {
        const p = (1 - t) / rampDown;
        return gustPeak * (p * p);                                  // quadratic ease out
      }
      return gustPeak;                                              // sustain
    };

    let lastTime = performance.now();
    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 16, 3);
      lastTime = now;
      const t = now / 1000;

      const currentGust = gustEnvelope(now);
      const gustFactor = currentGust / (gustPeak || 1); // 0-1 normalized

      for (const p of petals) {
        p.y += p.speed * (1 + gustFactor * 0.6) * dt;

        const sway = Math.sin(t * p.swaySpeed + p.swayOffset) * p.swayAmp * 0.02 * dt;
        const gustPush = currentGust * gust.direction * dt;
        p.x += sway + gustPush;

        p.rotation += p.rotSpeed * (1 + gustFactor * 2.5) * dt;

        if (p.y > window.innerHeight + 30 || p.x < -60 || p.x > window.innerWidth + 60) {
          resetPetal(p, gust);
        }

        p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`;
        p.el.style.opacity = String(p.opacity);
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(gustTimeout);
      petals.forEach((p) => p.el.remove());
    };
  }, [theme]);

  if (theme !== "sakura") return null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden="true"
    />
  );
}
