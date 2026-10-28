'use client';

import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { RotateCcw, Trash2 } from 'lucide-react';
import { MapFeatureKind, RoomState } from '@/lib/types';
import { FEATURES } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS: Record<MapFeatureKind, [string, string]> = {
  trap: ['pronta a scattare', 'già scattata'],
  trigger: ['pronto a scattare', 'già attivato'],
  chest: ['ancora chiuso', 'già aperto'],
};

interface FeatureDialogProps {
  room: RoomState;
  socket: Socket | null;
  cell: { x: number; y: number } | null; // centro del quadretto cliccato dal Master
  kind: MapFeatureKind;
  onClose: () => void;
}

// Master: nel quadretto vuoto crea una trappola, un innesco o un forziere; su uno esistente lo riarma o lo elimina
export default function FeatureDialog({ room, socket, cell, kind, onClose }: FeatureDialogProps) {
  const [newKind, setNewKind] = useState<MapFeatureKind>(kind);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cell) return;
    setNewKind(kind);
    setName('');
    setText('');
    setError('');
  }, [cell, kind]);

  const existing = cell && room.features?.find((f) => f.x === cell.x && f.y === cell.y);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cell) return;
    socket?.emit('add-feature', { kind: newKind, ...cell, name, text }, (res: { success: boolean; error?: string }) => {
      if (res?.success) onClose();
      else setError(res?.error || 'Elemento non creato.');
    });
  };

  const update = (remove: boolean) => {
    if (existing) socket?.emit('update-feature', { featureId: existing.id, remove });
    onClose();
  };

  return (
    <Dialog open={!!cell} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900/95 text-slate-100 border-amber-500/30 backdrop-blur-xl max-w-sm rounded-2xl p-6">
        {existing ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold rpg-font text-amber-200 pr-8">
                {FEATURES[existing.kind].icon} {existing.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {FEATURES[existing.kind].label} · {STATUS[existing.kind][existing.triggered ? 1 : 0]}
              </DialogDescription>
            </DialogHeader>
            {existing.text && <p className="text-sm text-slate-200 whitespace-pre-wrap">{existing.text}</p>}
            <div className="flex gap-2">
              {existing.triggered && (
                <Button onClick={() => update(false)} className="flex-1 gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950">
                  <RotateCcw className="w-4 h-4" /> Riarma
                </Button>
              )}
              <Button onClick={() => update(true)} variant="outline" className="flex-1 gap-1.5 border-red-500/40 text-red-300 hover:bg-red-950/40">
                <Trash2 className="w-4 h-4" /> Elimina
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold rpg-font text-amber-200">Nuovo elemento</DialogTitle>
              <DialogDescription className="text-xs text-slate-400">{FEATURES[newKind].hint}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(FEATURES) as MapFeatureKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={k === newKind}
                  onClick={() => setNewKind(k)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs font-semibold ${
                    k === newKind ? 'bg-amber-500/20 border-amber-400 text-amber-100' : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  <span className="text-xl">{FEATURES[k].icon}</span>
                  {FEATURES[k].label}
                </button>
              ))}
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={`Nome (es. ${newKind === 'trap' ? 'Fossa nascosta' : newKind === 'chest' ? 'Baule del capitano' : 'Sala del trono'})`}
              aria-label="Nome"
              className="bg-slate-950 border-slate-700"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder={
                newKind === 'trap'
                  ? 'Effetto (es. Tiro salvezza Destrezza CD 13, 2d6 danni)'
                  : newKind === 'chest'
                    ? 'Contenuto (es. 50 monete d\'oro e una pozione)'
                    : 'Nota per te (es. Il re si sveglia)'
              }
              aria-label="Testo"
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 resize-none"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
              Piazza {FEATURES[newKind].label.toLowerCase()}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
