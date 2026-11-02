'use client';

import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { MapFeature } from '@/lib/types';
import { FEATURES } from '@/lib/utils';

const ALERT_MS = 6000;
const STYLES = {
  trap: 'bg-red-600 border-red-300 shadow-red-500/40 text-white',
  chest: 'bg-amber-400 border-amber-200 shadow-amber-500/40 text-slate-950',
  trigger: 'bg-violet-600 border-violet-300 shadow-violet-500/40 text-white',
  door: 'bg-slate-700 border-slate-400 text-white', // le porte non scattano: qui solo per completezza del tipo
};

// Avviso quando scatta una trappola, si apre un forziere o (solo per il Master) si attiva un innesco.
// Il server lo manda solo a chi può vederlo; si chiude da solo o con un tocco.
export default function FeatureAlert({ socket }: { socket: Socket | null }) {
  const [alert, setAlert] = useState<{ feature: MapFeature; tokenName: string; at: number } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onTriggered = (data: { feature: MapFeature; tokenName: string }) => {
      setAlert({ ...data, at: Date.now() });
      if (data.feature.kind === 'trap') navigator.vibrate?.([300, 100, 300]);
    };
    socket.on('feature-triggered', onTriggered);
    return () => {
      socket.off('feature-triggered', onTriggered);
    };
  }, [socket]);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), ALERT_MS);
    return () => clearTimeout(timer);
  }, [alert]);

  if (!alert) return null;
  const { feature, tokenName } = alert;
  const title =
    feature.kind === 'trap'
      ? `Trappola! ${feature.name}`
      : feature.kind === 'chest'
        ? `${tokenName} apre: ${feature.name}`
        : `Innesco: ${feature.name}`;
  return (
    <button
      type="button"
      role="status"
      aria-live="assertive"
      onClick={() => setAlert(null)}
      className={`fixed top-20 inset-x-0 mx-auto w-fit max-w-[calc(100vw-2rem)] z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl border-2 shadow-2xl ${STYLES[feature.kind]}`}
    >
      <span className="text-3xl">{FEATURES[feature.kind].done}</span>
      <span className="text-left">
        <span className="block text-base font-extrabold rpg-font">{title}</span>
        <span className="block text-xs font-semibold opacity-90 whitespace-pre-wrap">
          {feature.kind === 'trap' && `${tokenName} l'ha fatta scattare. `}
          {feature.kind === 'trigger' && `Attivato da ${tokenName}. `}
          {feature.text}
        </span>
      </span>
    </button>
  );
}
