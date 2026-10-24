'use client';

import React, { useState } from 'react';
import {
  Shield,
  Heart,
  Plus,
  Minus,
  Navigation,
  LocateFixed,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  User,
  Camera,
  Upload,
  Trash2,
} from 'lucide-react';
import { resizeImageFile } from '@/lib/utils';
import { Token } from '@/lib/types';
import { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface PlayerToolbarProps {
  playerToken?: Token;
  roomName: string;
  roomId: string;
  gridSize: number;
  gridScale?: number;
  socket: Socket | null;
  onCenterOnToken?: () => void;
}

export default function PlayerToolbar({
  playerToken,
  roomName,
  roomId,
  gridSize,
  gridScale = 1,
  socket,
  onCenterOnToken,
}: PlayerToolbarProps) {
  const [activeTab, setActiveTab] = useState<'CARD' | 'DPAD'>('CARD');

  // Spostamento a step con il D-Pad tattico (1 quadrato alla volta con animazione di scorrimento)
  const handleMoveStep = (dx: number, dy: number) => {
    if (!playerToken || !socket) return;

    const startX = playerToken.x;
    const startY = playerToken.y;
    const targetX = startX + dx * gridSize;
    const targetY = startY + dy * gridSize;

    // Registrazione ed invio dell'animazione di scorrimento del movimento
    socket.emit('move-token-end', {
      roomId,
      tokenId: playerToken.id,
      startX,
      startY,
      endX: targetX,
      endY: targetY,
    });
  };


  // Modifica rapida degli HP (+1, -1, +5, -5)
  const handleModifyHp = (delta: number) => {
    if (!playerToken || !socket) return;
    const currentHp = playerToken.hp ?? 20;
    const maxHp = playerToken.maxHp ?? 20;
    const newHp = Math.max(0, Math.min(maxHp, currentHp + delta));

    socket.emit('update-token-hp', {
      roomId,
      tokenId: playerToken.id,
      hp: newHp,
      maxHp,
    });
  };

  // Caricamento Immagine Avatar del Player
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !playerToken || !socket) return;
    try {
      const dataUrl = await resizeImageFile(file, 350);
      socket.emit('update-token-avatar', {
        roomId,
        tokenId: playerToken.id,
        avatarUrl: dataUrl,
      });
    } catch (err) {
      console.error('Error uploading player avatar:', err);
    }
  };

  const handleRemoveAvatar = () => {
    if (!playerToken || !socket) return;
    socket.emit('update-token-avatar', {
      roomId,
      tokenId: playerToken.id,
      avatarUrl: null,
    });
  };

  const hpPercent =
    playerToken?.hp !== undefined && playerToken?.maxHp
      ? Math.min(100, Math.max(0, (playerToken.hp / playerToken.maxHp) * 100))
      : 100;

  const hpColorClass =
    hpPercent > 50 ? 'bg-emerald-500' : hpPercent > 20 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-1.5rem)] max-w-md">
      <div className="bg-slate-950/90 border border-blue-500/40 shadow-2xl backdrop-blur-xl rounded-2xl p-2.5 space-y-2 text-slate-100">
        
        {/* Tab Header Mobile: [ Scheda Personaggio | D-Pad Tattico ] + Pulsante Centra Vista */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('CARD')}
              className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'CARD'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User size={14} />
              <span>Personaggio</span>
            </button>

            <button
              onClick={() => setActiveTab('DPAD')}
              className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'DPAD'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gamepad2 size={14} />
              <span>D-Pad Passo</span>
            </button>
          </div>

          {/* Pulsante "Centra sul Mio Token" */}
          {playerToken && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCenterOnToken}
              className="h-7 px-2 text-[11px] font-bold border-blue-500/30 text-blue-300 hover:bg-blue-500/10 gap-1 rounded-xl"
              title="Centra vista sul tuo personaggio"
            >
              <LocateFixed size={14} className="text-blue-400" />
              <span className="hidden xs:inline">Centra</span>
            </Button>
          )}
        </div>

        {/* CONTENUTO TAB 1: SCHEDA PERSONAGGIO ED HP RAPIDI */}
        {activeTab === 'CARD' && (
          <div className="space-y-2">
            {playerToken ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Avatar dell'immagine o iniziali */}
                    <div className="relative group shrink-0">
                      {playerToken.avatarUrl ? (
                        <img
                          src={playerToken.avatarUrl}
                          alt={playerToken.name}
                          className="w-8 h-8 rounded-lg object-contain bg-slate-900/80 border border-amber-400/50 shadow-sm"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border border-white/40 shadow-sm"
                          style={{ backgroundColor: playerToken.color }}
                        >
                          {playerToken.name[0]?.toUpperCase()}
                        </div>
                      )}

                      {/* Input File nascosto per cambio avatar rapido */}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                        id="player-toolbar-avatar-input"
                      />
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-100 truncate">
                        {playerToken.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                        1 quadretto = {gridScale}m
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label
                      htmlFor="player-toolbar-avatar-input"
                      className="px-2 py-1 text-[11px] font-semibold bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg cursor-pointer flex items-center gap-1 shadow-sm transition-all"
                      title="Carica un'immagine per la tua pedina"
                    >
                      <Camera size={12} />
                      <span>{playerToken.avatarUrl ? 'Foto' : '+ Foto'}</span>
                    </label>

                    {playerToken.avatarUrl && (
                      <button
                        onClick={handleRemoveAvatar}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                        title="Rimuovi immagine pedina"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    <Badge variant="player" className="text-[10px] px-2 py-0.5 ml-1">
                      <Shield size={11} className="inline mr-1" /> PG
                    </Badge>
                  </div>
                </div>

                {/* Barra HP & Modificatori Rapidi */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-bold text-red-400">
                      <Heart size={13} className="fill-red-500 text-red-500" />
                      {playerToken.hp ?? 20} / {playerToken.maxHp ?? 20} HP
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {Math.round(hpPercent)}%
                    </span>
                  </div>
                  <Progress value={hpPercent} indicatorClassName={hpColorClass} />
                </div>

                {/* Pulsanti Rapidi Modifica HP (-5, -1, +1, +5) */}
                <div className="flex items-center justify-between gap-1 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">HP Rapidi:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleModifyHp(-5)}
                      className="px-2 py-0.5 text-[11px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40 rounded-md hover:bg-red-500/30"
                    >
                      -5
                    </button>
                    <button
                      onClick={() => handleModifyHp(-1)}
                      className="px-2 py-0.5 text-[11px] font-mono font-bold bg-red-500/15 text-red-300 border border-red-500/30 rounded-md hover:bg-red-500/30"
                    >
                      -1
                    </button>
                    <button
                      onClick={() => handleModifyHp(1)}
                      className="px-2 py-0.5 text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-md hover:bg-emerald-500/30"
                    >
                      +1
                    </button>
                    <button
                      onClick={() => handleModifyHp(5)}
                      className="px-2 py-0.5 text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md hover:bg-emerald-500/30"
                    >
                      +5
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-2 text-xs text-slate-400">
                Sei connesso alla stanza <span className="font-bold text-amber-300">{roomName}</span> come spettatore.
              </div>
            )}
          </div>
        )}

        {/* CONTENUTO TAB 2: D-PAD TATTICO (PASSO DA 1 QUADRATTO) */}
        {activeTab === 'DPAD' && (
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl p-2">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-200 block">Movimento a Passo</span>
              <p className="text-[10px] text-slate-400">
                1 passo = {gridScale}m ({gridSize}px)
              </p>
            </div>

            {/* Tastiera D-Pad 4 Direzioni */}
            {playerToken ? (
              <div className="grid grid-cols-3 gap-1 w-28 h-28 shrink-0">
                <div />
                <button
                  onClick={() => handleMoveStep(0, -1)}
                  className="bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center active:scale-95 transition-all border border-blue-400/40 shadow-sm"
                  title="Muovi in alto (1m)"
                >
                  <ChevronUp size={22} />
                </button>
                <div />

                <button
                  onClick={() => handleMoveStep(-1, 0)}
                  className="bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center active:scale-95 transition-all border border-blue-400/40 shadow-sm"
                  title="Muovi a sinistra (1m)"
                >
                  <ChevronLeft size={22} />
                </button>

                <button
                  onClick={onCenterOnToken}
                  className="bg-slate-800 text-amber-400 hover:bg-slate-700 rounded-lg flex items-center justify-center border border-amber-500/30 shadow-sm"
                  title="Centra vista"
                >
                  <LocateFixed size={16} />
                </button>

                <button
                  onClick={() => handleMoveStep(1, 0)}
                  className="bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center active:scale-95 transition-all border border-blue-400/40 shadow-sm"
                  title="Muovi a destra (1m)"
                >
                  <ChevronRight size={22} />
                </button>

                <div />
                <button
                  onClick={() => handleMoveStep(0, 1)}
                  className="bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center active:scale-95 transition-all border border-blue-400/40 shadow-sm"
                  title="Muovi in basso (1m)"
                >
                  <ChevronDown size={22} />
                </button>
                <div />
              </div>
            ) : (
              <span className="text-xs text-slate-500">Nessun token controllato</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
