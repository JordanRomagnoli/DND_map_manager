'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { MessageCircle, Send, VolumeX, Volume2, X } from 'lucide-react';
import { RoomState, UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface WhisperPanelProps {
  room: RoomState;
  role: UserRole;
  socket: Socket | null;
  myTokenId?: string;
}

// Sussurri: messaggi privati tra ogni giocatore e il Master. Il Master sceglie con chi parlare
// e può silenziare uno o più giocatori (non scrivono più, ma leggono ancora le sue risposte).
export default function WhisperPanel({ room, role, socket, myTokenId }: WhisperPanelProps) {
  const isMaster = role === 'MASTER';
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [chosenId, setChosenId] = useState<string>();
  const endRef = useRef<HTMLDivElement | null>(null);

  const whispers = room.whispers ?? [];
  const muted = room.mutedTokenIds ?? [];
  const players = room.tokens.filter((t) => t.type === 'player');
  const threadId = isMaster ? (chosenId && players.some((p) => p.id === chosenId) ? chosenId : players[0]?.id) : myTokenId;
  const thread = whispers.filter((w) => w.tokenId === threadId);
  const threadMuted = Boolean(threadId && muted.includes(threadId));
  const fromOther = isMaster ? 'PLAYER' : 'MASTER';

  // Non letti: messaggi dell'altra parte arrivati dopo l'ultima apertura del pannello (conteggio, non orari:
  // gli orologi dei dispositivi possono non coincidere con quello del server)
  const otherCount = whispers.filter((w) => w.from === fromOther).length;
  const [seenCount, setSeenCount] = useState(otherCount);
  useEffect(() => {
    if (isOpen) setSeenCount(otherCount);
  }, [isOpen, otherCount]);
  const unread = Math.max(0, otherCount - seenCount);

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ block: 'end' });
  }, [isOpen, thread.length, threadId]);

  if (!isMaster && !myTokenId) return null;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !text.trim() || !threadId) return;
    socket.emit('whisper', { text, toTokenId: threadId }, (res: { success: boolean; error?: string }) => {
      if (res?.success) {
        setText('');
        setError('');
      } else setError(res?.error || 'Messaggio non inviato.');
    });
  };

  const setMuted = (tokenIds: string[], value: boolean) =>
    tokenIds.forEach((tokenId) => socket?.emit('set-player-muted', { tokenId, muted: value }));

  // il giocatore aspetta una risposta se l'ultimo messaggio della sua conversazione è suo
  const awaitingReply = (tokenId: string) => whispers.filter((w) => w.tokenId === tokenId).at(-1)?.from === 'PLAYER';

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative bg-slate-900/90 border-slate-700 text-slate-200 hover:text-white shadow-lg backdrop-blur-md gap-2 hover:bg-slate-800"
        >
          <MessageCircle className="w-4 h-4 text-violet-400" />
          <span className="hidden sm:inline font-medium text-xs">{isMaster ? 'Sussurri' : 'Sussurra al Master'}</span>
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-1.5rem)] sm:w-80 p-0 bg-slate-950/95 border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl rounded-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <MessageCircle className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-100 leading-none">Sussurri</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isMaster ? 'Messaggi privati con ogni giocatore' : 'Solo il Master legge i tuoi messaggi'}
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

        {/* Master: con chi parlare, chi è silenziato */}
        {isMaster && (
          <div className="p-2 border-b border-slate-800/80 space-y-2">
            {players.length === 0 ? (
              <p className="text-center py-3 text-slate-500 text-xs">Nessun giocatore nella stanza.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={p.id === threadId}
                      onClick={() => setChosenId(p.id)}
                      className={`relative flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                        p.id === threadId
                          ? 'bg-violet-500/25 border-violet-500/70 text-violet-100'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {muted.includes(p.id) && <VolumeX className="w-3 h-3 text-red-400" aria-label="silenziato" />}
                      {p.name}
                      {awaitingReply(p.id) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" title="Aspetta una risposta" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {threadId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMuted([threadId], !threadMuted)}
                      className={`h-7 px-2 text-[11px] gap-1 ${threadMuted ? 'text-emerald-300' : 'text-red-300'} hover:bg-slate-800`}
                    >
                      {threadMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      {threadMuted ? 'Riattiva' : 'Silenzia'} {players.find((p) => p.id === threadId)?.name}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      muted.length > 0 ? setMuted([...muted], false) : setMuted(players.map((p) => p.id), true)
                    }
                    className="ml-auto h-7 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    {muted.length > 0 ? 'Riattiva tutti' : 'Silenzia tutti'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Conversazione */}
        <div className="max-h-64 min-h-[96px] overflow-y-auto p-3 space-y-2">
          {thread.length === 0 && (
            <p className="text-center py-4 text-slate-500 text-xs">
              {isMaster ? 'Nessun messaggio con questo giocatore.' : 'Scrivi al Master: azioni segrete, domande, idee.'}
            </p>
          )}
          {thread.map((w) => {
            const mine = (w.from === 'MASTER') === isMaster;
            return (
              <div key={w.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-2.5 py-1.5 rounded-xl text-xs leading-snug break-words ${
                    mine ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 rounded-bl-sm'
                  }`}
                >
                  {!mine && <span className="block text-[10px] font-bold opacity-70">{w.name}</span>}
                  {w.text}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Scrivi */}
        <form onSubmit={send} className="p-2 border-t border-slate-800/80 space-y-1">
          <div className="flex items-center gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              disabled={!threadId || (!isMaster && threadMuted)}
              placeholder={!isMaster && threadMuted ? 'Il Master ti ha silenziato' : 'Scrivi un sussurro…'}
              aria-label="Messaggio"
              className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white outline-none focus:border-violet-400 disabled:opacity-50"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!text.trim() || !threadId || (!isMaster && threadMuted)}
              className="h-8 w-8 p-0 bg-violet-600 hover:bg-violet-500 text-white border-violet-400/40"
              aria-label="Invia"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
        </form>
      </PopoverContent>
    </Popover>
  );
}
