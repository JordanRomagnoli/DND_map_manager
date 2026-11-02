'use client';

import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Vote, Plus, X, Lock, Flag, RefreshCw } from 'lucide-react';
import { RoomState, UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface PollPanelProps {
  room: RoomState;
  role: UserRole;
  socket: Socket | null;
  myTokenId?: string;
}

const MAX_OPTIONS = 6;

// Votazione del gruppo: il Master fa una domanda, i giocatori votano dal telefono e vedono i risultati dal vivo.
// Ai giocatori il pannello si apre da solo quando parte una nuova votazione.
export default function PollPanel({ room, role, socket, myTokenId }: PollPanelProps) {
  const isMaster = role === 'MASTER';
  const poll = room.poll ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [secret, setSecret] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isMaster && poll && !poll.closed) setIsOpen(true);
  }, [isMaster, poll?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isMaster && (!poll || !myTokenId)) return null;

  const players = room.tokens.filter((t) => t.type === 'player');
  const totalVotes = poll ? poll.counts.reduce((a, b) => a + b, 0) : 0;
  const myVote = myTokenId !== undefined ? poll?.votes[myTokenId] : undefined;
  const voters = (option: number) =>
    Object.entries(poll?.votes ?? {})
      .filter(([, v]) => v === option)
      .map(([id]) => room.tokens.find((t) => t.id === id)?.name)
      .filter(Boolean);
  const needsAttention = !isMaster && poll && !poll.closed && myVote === undefined;

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    socket?.emit('start-poll', { question, options, secret }, (res: { success: boolean; error?: string }) => {
      if (!res?.success) return setError(res?.error || 'Votazione non avviata.');
      setQuestion('');
      setOptions(['', '']);
      setError('');
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative bg-slate-900/90 border-slate-700 text-slate-200 hover:text-white shadow-lg backdrop-blur-md gap-2 hover:bg-slate-800"
        >
          <Vote className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline font-medium text-xs">Votazione</span>
          {needsAttention && (
            <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
              !
            </span>
          )}
          {isMaster && poll && !poll.closed && (
            <span className="text-[10px] font-bold text-emerald-300">
              {Object.keys(poll.votes).length}/{players.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-1.5rem)] sm:w-80 p-0 bg-slate-950/95 border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl rounded-xl"
      >
        <div className="flex items-center justify-between p-3 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <Vote className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-100 leading-none">Votazione del gruppo</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {!poll ? 'Fai decidere il gruppo' : poll.closed ? 'Votazione chiusa' : poll.secret ? 'Voto segreto' : 'Voto palese'}
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

        {poll ? (
          <div className="p-3 space-y-2">
            <p className="font-semibold text-sm text-white">{poll.question}</p>
            {poll.options.map((option, i) => {
              const count = poll.counts[i];
              const share = totalVotes ? (count / totalVotes) * 100 : 0;
              const names = voters(i);
              const canVote = !isMaster && !poll.closed;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!canVote}
                  aria-pressed={myVote === i}
                  onClick={() => socket?.emit('vote', { pollId: poll.id, option: i })}
                  className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    myVote === i ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 bg-slate-900'
                  } ${canVote ? 'hover:border-emerald-500/60' : 'cursor-default'}`}
                >
                  <span className="absolute inset-y-0 left-0 bg-emerald-500/20 transition-all" style={{ width: `${share}%` }} />
                  <span className="relative flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{option}</span>
                    <span className="font-mono font-bold text-emerald-300">{count}</span>
                  </span>
                  {names.length > 0 && (isMaster || !poll.secret) && (
                    <span className="relative block mt-0.5 text-[10px] text-slate-400">{names.join(', ')}</span>
                  )}
                </button>
              );
            })}
            <p className="text-[11px] text-slate-500">
              {Object.keys(poll.votes).length} su {players.length} hanno votato
              {poll.secret && !isMaster ? ' · solo il Master vede chi ha votato cosa' : ''}
              {!isMaster && !poll.closed ? ' · puoi cambiare idea finché è aperta' : ''}
            </p>

            {isMaster && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => socket?.emit('update-poll', { secret: !poll.secret })}
                  className="h-7 px-2 text-[11px] gap-1 text-slate-300 hover:bg-slate-800"
                >
                  <Lock className="w-3.5 h-3.5" /> {poll.secret ? 'Mostra a tutti i voti' : 'Rendi segreto'}
                </Button>
                {!poll.closed && (
                  <Button
                    size="sm"
                    onClick={() => socket?.emit('update-poll', { closed: true })}
                    className="h-7 px-2 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Flag className="w-3.5 h-3.5" /> Chiudi
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => socket?.emit('update-poll', { remove: true })}
                  className="ml-auto h-7 px-2 text-[11px] gap-1 text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Nuova
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={start} className="p-3 space-y-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={150}
              placeholder="Domanda (es. Quale strada prendete?)"
              aria-label="Domanda"
              className="h-8 text-xs bg-slate-900 border-slate-700"
            />
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={option}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                  maxLength={60}
                  placeholder={`Risposta ${i + 1}`}
                  aria-label={`Risposta ${i + 1}`}
                  className="h-8 text-xs bg-slate-900 border-slate-700"
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Togli risposta ${i + 1}`}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-300 hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              {options.length < MAX_OPTIONS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOptions([...options, ''])}
                  className="h-7 px-2 text-[11px] gap-1 text-slate-300 hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" /> Risposta
                </Button>
              )}
              <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="accent-emerald-500" />
                Voto segreto
              </label>
            </div>
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <Button type="submit" className="w-full h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
              Avvia votazione
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}
