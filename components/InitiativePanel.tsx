'use client';

import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Swords, ChevronsRight, Flag, RefreshCw, Play, X } from 'lucide-react';
import { RoomState, UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface InitiativePanelProps {
  room: RoomState;
  role: UserRole;
  socket: Socket | null;
  myTokenId?: string;
}

// Combattimento a iniziativa: il Master assegna i valori, avvia, passa il turno e lo termina.
// Solo i movimenti della pedina di turno sono animati e registrati (regola applicata dal server).
export default function InitiativePanel({ room, role, socket, myTokenId }: InitiativePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const initiative = room.initiative ?? null;
  const isMaster = role === 'MASTER';
  const tokenName = (tokenId: string) => room.tokens.find((t) => t.id === tokenId)?.name ?? '?';

  // Riallinea i campi ai valori del server quando cambia l'ordine (non a ogni cambio di turno)
  const entriesKey = JSON.stringify(initiative?.entries ?? []);
  useEffect(() => {
    setValues(Object.fromEntries((initiative?.entries ?? []).map((e) => [e.tokenId, String(e.value)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesKey]);

  // I giocatori vedono il pannello solo durante il combattimento
  if (!isMaster && !initiative) return null;

  // Ordine mostrato: prima le pedine in combattimento (già ordinate dal server), poi le altre (solo Master)
  const inFight = initiative?.entries.map((e) => e.tokenId) ?? [];
  const rows = isMaster
    ? [...inFight, ...room.tokens.map((t) => t.id).filter((id) => !inFight.includes(id))]
    : inFight;

  const submitInitiative = () => {
    if (!socket) return;
    setError('');
    const entries = room.tokens
      .filter((t) => values[t.id]?.trim() && Number.isFinite(Number(values[t.id])))
      .map((t) => ({ tokenId: t.id, value: Number(values[t.id]) }));
    socket.emit('set-initiative', { entries }, (res: { success: boolean; error?: string }) => {
      if (!res?.success) setError(res?.error || "Impossibile aggiornare l'iniziativa.");
    });
  };

  const endFight = () => {
    if (socket && confirm('Terminare il combattimento? I movimenti torneranno liberi e non registrati.')) {
      socket.emit('end-initiative');
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`relative bg-slate-900/90 shadow-lg backdrop-blur-md gap-2 hover:bg-slate-800 ${
            initiative ? 'border-amber-500/70 text-amber-300 hover:text-amber-200' : 'border-slate-700 text-slate-200 hover:text-white'
          }`}
        >
          <Swords className="w-4 h-4 text-amber-400" />
          <span className={`${initiative ? '' : 'hidden sm:inline'} font-medium text-xs`}>
            {initiative ? `Round ${initiative.round} · ${tokenName(initiative.activeTokenId)}` : 'Iniziativa'}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-1.5rem)] sm:w-80 p-0 bg-slate-950/95 border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl rounded-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Swords className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-100 leading-none">Iniziativa</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {initiative ? `Combattimento in corso · Round ${initiative.round}` : 'Nessun combattimento in corso'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Elenco pedine */}
        <div className="max-h-72 overflow-y-auto p-2 space-y-1.5">
          {rows.length === 0 && (
            <p className="text-center py-6 text-slate-500 text-xs">Nessuna pedina sulla mappa.</p>
          )}
          {rows.map((tokenId) => {
            const token = room.tokens.find((t) => t.id === tokenId);
            if (!token) return null;
            const isActive = initiative?.activeTokenId === tokenId;
            const entry = initiative?.entries.find((e) => e.tokenId === tokenId);
            return (
              <div
                key={tokenId}
                className={`p-2 rounded-lg border flex items-center gap-2.5 text-xs ${
                  isActive ? 'bg-amber-500/15 border-amber-500/60' : 'bg-slate-900/60 border-slate-800/80'
                } ${isMaster && initiative && !entry ? 'opacity-60' : ''}`}
              >
                <div className="token-badge shrink-0" style={{ backgroundColor: token.color }}>
                  {token.name[0]?.toUpperCase()}
                </div>
                <span className={`flex-1 min-w-0 truncate font-semibold ${isActive ? 'text-amber-200' : 'text-slate-200'}`}>
                  {token.name}
                </span>
                {isActive && <Badge variant="master">Di turno</Badge>}
                {tokenId === myTokenId && <Badge variant="player">Tu</Badge>}
                {isMaster ? (
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={values[tokenId] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [tokenId]: e.target.value }))}
                    placeholder="—"
                    aria-label={`Iniziativa di ${token.name}`}
                    className="h-7 w-14 px-1.5 text-center text-xs bg-slate-900/80 border-slate-700"
                  />
                ) : (
                  <span className="font-mono text-slate-400 w-8 text-right">{entry?.value}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Comandi del Master */}
        {isMaster && (
          <div className="p-2.5 border-t border-slate-800/60 bg-slate-900/40 space-y-2">
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            {initiative ? (
              <div className="grid grid-cols-3 gap-1.5">
                <Button size="sm" variant="secondary" onClick={submitInitiative} className="text-[11px] gap-1 px-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Aggiorna
                </Button>
                <Button size="sm" variant="rpgGold" onClick={() => socket?.emit('next-turn')} className="text-[11px] gap-1 px-2">
                  <ChevronsRight className="w-3.5 h-3.5" /> Prossimo
                </Button>
                <Button size="sm" variant="secondary" onClick={endFight} className="text-[11px] gap-1 px-2 hover:text-red-300">
                  <Flag className="w-3.5 h-3.5" /> Termina
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="rpgGold" onClick={submitInitiative} className="w-full text-xs gap-1.5">
                <Play className="w-3.5 h-3.5" /> Inizia combattimento
              </Button>
            )}
            <p className="text-[10px] text-slate-500 leading-snug">
              Solo i movimenti della pedina di turno sono visibili a tutti e registrati. Le pedine senza valore restano
              fuori dal combattimento.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
