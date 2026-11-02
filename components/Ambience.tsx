'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Ambience as AmbienceState, MapEffect } from '@/lib/types';

// Luce della scena: un velo colorato sopra la mappa (multiply: scurisce senza coprire i dettagli)
const LIGHT_STYLES: Record<AmbienceState['light'], React.CSSProperties | null> = {
  day: null,
  dusk: { background: 'linear-gradient(180deg, rgba(124,58,237,0.35), rgba(249,115,22,0.35))', mixBlendMode: 'multiply' },
  night: { background: 'radial-gradient(ellipse at center, rgba(30,41,90,0.45), rgba(2,6,23,0.85))', mixBlendMode: 'multiply' },
  fire: { background: 'radial-gradient(ellipse at center, rgba(251,146,60,0.15), rgba(124,45,18,0.6))', mixBlendMode: 'multiply' },
};

// Particelle in coordinate dello schermo: pioggia (tempesta = più fitta e obliqua) e neve
const PARTICLES = { rain: 220, storm: 420, snow: 140 } as const;

// Atmosfera sopra la mappa (meteo e luce, decisi dal Master) ed effetti istantanei per tutti.
// pointer-events-none: non intralcia mai i clic sulla mappa.
export default function Ambience({ ambience, socket }: { ambience?: AmbienceState | null; socket: Socket | null }) {
  const weather = ambience?.weather ?? 'none';
  const light = ambience?.light ?? 'day';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [effect, setEffect] = useState<{ kind: MapEffect; key: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(weather in PARTICLES)) return;
    const ctx = canvas.getContext('2d')!;
    const kind = weather as keyof typeof PARTICLES;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const drops = Array.from({ length: PARTICLES[kind] }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: kind === 'snow' ? 0.5 + Math.random() * 1.2 : 9 + Math.random() * 8,
      size: kind === 'snow' ? 1.5 + Math.random() * 2.5 : 10 + Math.random() * 14,
      drift: Math.random() * Math.PI * 2,
    }));
    const slant = kind === 'storm' ? 0.35 : 0.12;
    let frame: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(186, 214, 255, 0.55)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const d of drops) {
        if (kind === 'snow') {
          d.drift += 0.02;
          d.x += Math.sin(d.drift) * 0.6;
          d.y += d.speed;
          ctx.moveTo(d.x + d.size, d.y);
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        } else {
          d.x += d.speed * slant;
          d.y += d.speed;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.size * slant, d.y - d.size);
        }
        if (d.y > canvas.height + 20) {
          d.y = -20;
          d.x = Math.random() * canvas.width;
        }
        if (d.x > canvas.width + 20) d.x = -20;
      }
      kind === 'snow' ? ctx.fill() : ctx.stroke();
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [weather]);

  useEffect(() => {
    if (!socket) return;
    const onEffect = ({ kind }: { kind: MapEffect }) => {
      setEffect({ kind, key: Date.now() });
      navigator.vibrate?.(kind === 'lightning' ? 80 : kind === 'shake' ? [150, 50, 150, 50, 150] : 400);
      if (kind !== 'lightning') {
        // la mappa trema (non i pannelli, che restano usabili)
        const map = document.querySelector('.canvas-wrapper');
        map?.classList.remove('fx-shake');
        void (map as HTMLElement | null)?.offsetWidth; // riavvia l'animazione se arriva un'altra scossa
        map?.classList.add('fx-shake');
      }
    };
    socket.on('map-effect', onEffect);
    return () => {
      socket.off('map-effect', onEffect);
    };
  }, [socket]);

  useEffect(() => {
    if (!effect) return;
    const timer = setTimeout(() => {
      setEffect(null);
      document.querySelector('.canvas-wrapper')?.classList.remove('fx-shake');
    }, 900);
    return () => clearTimeout(timer);
  }, [effect]);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden" aria-hidden="true">
      {LIGHT_STYLES[light] && (
        <div className={`absolute inset-0 transition-opacity ${light === 'fire' ? 'fx-flicker' : ''}`} style={LIGHT_STYLES[light]!} />
      )}
      {weather === 'storm' && <div className="absolute inset-0 bg-slate-900/30" />}
      {weather === 'mist' && (
        <>
          <div className="fx-mist absolute -inset-1/4 bg-[radial-gradient(ellipse_at_30%_40%,rgba(226,232,240,0.55),transparent_60%)]" />
          <div className="fx-mist fx-mist-slow absolute -inset-1/4 bg-[radial-gradient(ellipse_at_70%_65%,rgba(203,213,225,0.5),transparent_55%)]" />
        </>
      )}
      {weather in PARTICLES && <canvas ref={canvasRef} className="absolute inset-0" />}
      {effect?.kind === 'lightning' && <div key={effect.key} className="fx-lightning absolute inset-0 bg-white" />}
      {effect?.kind === 'explosion' && (
        <div
          key={effect.key}
          className="fx-boom absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(254,240,138,0.95),rgba(249,115,22,0.7)_35%,rgba(127,29,29,0.3)_70%,transparent)]"
        />
      )}
    </div>
  );
}
