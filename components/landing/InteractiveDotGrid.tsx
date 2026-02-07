"use client";

import { useRef, useEffect, useCallback } from "react";

type Shape = "circle" | "triangle" | "square" | "diamond";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  shape: Shape;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  baseOpacity: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  size: number;
}

interface ThemeColors {
  dot: string;
  dotR: number;
  dotG: number;
  dotB: number;
  accent: string;
  accentR: number;
  accentG: number;
  accentB: number;
  bg: string;
}

function parseColor(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const dot = style.getPropertyValue("--text-tertiary").trim() || "#94a3b8";
  const accent = style.getPropertyValue("--accent-primary").trim() || "#FF8C00";
  const bg = style.getPropertyValue("--background").trim() || "#f8fafc";
  const [dotR, dotG, dotB] = parseColor(dot);
  const [accentR, accentG, accentB] = parseColor(accent);
  return { dot, dotR, dotG, dotB, accent, accentR, accentG, accentB, bg };
}

const SHAPES: Shape[] = ["circle", "triangle", "square", "diamond"];
const MOUSE_RADIUS = 150;
const CONNECT_RADIUS = 120;
const TRAIL_MAX_AGE = 30;
const TRAIL_SPAWN_INTERVAL = 2;

function createParticle(w: number, h: number): Particle {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const baseSize = 2 + Math.random() * 4;
  const baseOpacity = 0.15 + Math.random() * 0.35;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: baseSize,
    baseSize,
    shape,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
    opacity: baseOpacity,
    baseOpacity,
  };
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  size: number,
  rotation: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.866, size * 0.5);
      ctx.lineTo(-size * 0.866, size * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case "square":
      ctx.fillRect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.7, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      break;
  }

  ctx.restore();
}

export default function InteractiveDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const trailRef = useRef<TrailPoint[]>([]);
  const frameCountRef = useRef(0);
  const colorsRef = useRef<ThemeColors>(null!);
  const sizeRef = useRef({ w: 0, h: 0 });

  const initParticles = useCallback((w: number, h: number) => {
    const count = Math.min(80, Math.floor((w * h) / 12000));
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push(createParticle(w, h));
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    colorsRef.current = readThemeColors();

    // Resize handler
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };

      if (particlesRef.current.length === 0) {
        initParticles(w, h);
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    // Mouse handlers
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };
    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    // Theme change observer
    const themeObserver = new MutationObserver(() => {
      colorsRef.current = readThemeColors();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Animation loop
    const animate = () => {
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      const particles = particlesRef.current;
      const mouse = mouseRef.current;
      const trail = trailRef.current;
      const colors = colorsRef.current;
      frameCountRef.current++;

      ctx.clearRect(0, 0, w, h);

      // Update & draw trail
      if (mouse.active && frameCountRef.current % TRAIL_SPAWN_INTERVAL === 0) {
        trail.push({
          x: mouse.x,
          y: mouse.y,
          age: 0,
          size: 3 + Math.random() * 5,
        });
      }
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].age++;
        if (trail[i].age > TRAIL_MAX_AGE) {
          trail.splice(i, 1);
          continue;
        }
        const t = trail[i];
        const life = 1 - t.age / TRAIL_MAX_AGE;
        ctx.globalAlpha = life * 0.15;
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.size * life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Update particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // Wrap around edges
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        // Mouse interaction
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < MOUSE_RADIUS) {
            const factor = 1 - dist / MOUSE_RADIUS;

            // Repulsion
            const repelStrength = factor * 0.8;
            p.x += (dx / dist) * repelStrength;
            p.y += (dy / dist) * repelStrength;

            // Highlight: lerp to accent color + size boost
            p.opacity = p.baseOpacity + factor * (1 - p.baseOpacity);
            p.size = p.baseSize + factor * 3;
          } else {
            p.opacity += (p.baseOpacity - p.opacity) * 0.05;
            p.size += (p.baseSize - p.size) * 0.05;
          }
        } else {
          p.opacity += (p.baseOpacity - p.opacity) * 0.05;
          p.size += (p.baseSize - p.size) * 0.05;
        }
      }

      // Draw connection lines near mouse
      if (mouse.active) {
        for (let i = 0; i < particles.length; i++) {
          const a = particles[i];
          const dxA = a.x - mouse.x;
          const dyA = a.y - mouse.y;
          const distA = Math.sqrt(dxA * dxA + dyA * dyA);
          if (distA > MOUSE_RADIUS) continue;

          for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j];
            const dxB = b.x - mouse.x;
            const dyB = b.y - mouse.y;
            const distB = Math.sqrt(dxB * dxB + dyB * dyB);
            if (distB > MOUSE_RADIUS) continue;

            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > CONNECT_RADIUS) continue;

            const lineOpacity =
              (1 - dist / CONNECT_RADIUS) *
              (1 - distA / MOUSE_RADIUS) *
              0.3;
            ctx.strokeStyle = `rgba(${colors.accentR}, ${colors.accentG}, ${colors.accentB}, ${lineOpacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        const isNearMouse =
          mouse.active &&
          Math.hypot(p.x - mouse.x, p.y - mouse.y) < MOUSE_RADIUS;

        if (isNearMouse) {
          const factor =
            1 -
            Math.hypot(p.x - mouse.x, p.y - mouse.y) / MOUSE_RADIUS;
          const r = Math.round(
            colors.dotR + (colors.accentR - colors.dotR) * factor
          );
          const g = Math.round(
            colors.dotG + (colors.accentG - colors.dotG) * factor
          );
          const b = Math.round(
            colors.dotB + (colors.accentB - colors.dotB) * factor
          );
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
        } else {
          ctx.fillStyle = `rgba(${colors.dotR}, ${colors.dotG}, ${colors.dotB}, ${p.opacity})`;
        }

        drawShape(ctx, p.shape, p.x, p.y, p.size, p.rotation);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "auto" }}
    />
  );
}
