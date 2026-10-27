'use client';

import React, { useEffect, useState } from 'react';
import { Swords } from 'lucide-react';
import { Initiative } from '@/lib/types';

interface TurnAlertProps {
  initiative?: Initiative | null;
  myTokenId?: string;
  myName?: string;
}

const ALERT_MS = 4000;

// Avviso "tocca a te" per il giocatore: banner in alto e vibrazione del telefono quando inizia il suo turno
// (anche se è di nuovo lui al round dopo). Si chiude da solo o con un tocco.
export default function TurnAlert({ initiative, myTokenId, myName }: TurnAlertProps) {
  const [visible, setVisible] = useState(false);
  const myTurn = Boolean(myTokenId) && initiative?.activeTokenId === myTokenId;
  const turnKey = myTurn ? `${initiative?.round}` : null; // cambia a ogni nuovo turno mio

  useEffect(() => {
    if (!turnKey) return setVisible(false);
    setVisible(true);
    navigator.vibrate?.([200, 100, 200]); // non c'è su iPhone: lì resta solo il banner
    const timer = setTimeout(() => setVisible(false), ALERT_MS);
    return () => clearTimeout(timer);
  }, [turnKey]);

  if (!visible) return null;
  return (
    <button
      type="button"
      role="status"
      aria-live="assertive"
      onClick={() => setVisible(false)}
      className="fixed top-20 inset-x-0 mx-auto w-fit max-w-[calc(100vw-2rem)] z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-400 text-slate-950 border-2 border-amber-200 shadow-2xl shadow-amber-500/40 animate-bounce"
    >
      <Swords size={24} />
      <span className="text-left">
        <span className="block text-base font-extrabold rpg-font">Tocca a te{myName ? `, ${myName}` : ''}!</span>
        <span className="block text-xs font-semibold opacity-80">Round {initiative?.round}: è il tuo turno</span>
      </span>
    </button>
  );
}
