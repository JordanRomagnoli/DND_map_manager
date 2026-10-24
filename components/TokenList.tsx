'use client';

import React, { useState } from 'react';
import { Users, Trash2, ChevronRight, ChevronLeft, Heart, Shield, Skull, Camera, Upload } from 'lucide-react';
import { Token, UserRole } from '@/lib/types';
import { Socket } from 'socket.io-client';
import { resizeImageFile } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface TokenListProps {
  tokens: Token[];
  role: UserRole;
  roomId: string;
  socket: Socket | null;
  myTokenId?: string;
}

export default function TokenList({ tokens, role, roomId, socket, myTokenId }: TokenListProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'player' | 'npc'>('all');

  const handleDeleteToken = (tokenId: string) => {
    if (!socket || role !== 'MASTER') return;
    if (confirm('Sei sicuro di voler rimuovere questo token dalla mappa?')) {
      socket.emit('remove-token', { roomId, tokenId });
    }
  };

  const handleAvatarUpload = async (tokenId: string, file: File) => {
    if (!socket || !file) return;
    try {
      const dataUrl = await resizeImageFile(file, 350);
      socket.emit('update-token-avatar', {
        roomId,
        tokenId,
        avatarUrl: dataUrl,
      });
    } catch (err) {
      console.error('Error uploading avatar:', err);
    }
  };

  const filteredTokens = tokens.filter((t) => {
    if (filter === 'player') return t.type !== 'npc';
    if (filter === 'npc') return t.type === 'npc';
    return true;
  });

  return (
    <div
      className={`sidebar-panel glass-panel border border-amber-500/30 shadow-2xl transition-all duration-300 backdrop-blur-md ${
        isOpen ? 'translate-x-0' : 'translate-x-[260px]'
      }`}
    >
      {/* Header Sidebar */}
      <div className="sidebar-header bg-slate-900/40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-amber-300 hover:text-white flex items-center gap-2 font-bold text-xs rpg-font tracking-wide transition-colors"
        >
          {isOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          <Users size={18} className="text-amber-400" />
          <span>Token in Campo ({tokens.length})</span>
        </button>
      </div>

      {isOpen && (
        <div className="flex flex-col h-full">
          {/* Tab Filtri (Tutti / Giocatori / NPC) con Button ShadCN */}
          <div className="flex items-center gap-1 p-2 bg-slate-950/60 border-b border-white/5 text-[11px]">
            <Button
              variant={filter === 'all' ? 'rpgGold' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className="flex-1 py-1 h-7 text-[11px]"
            >
              Tutti ({tokens.length})
            </Button>
            <Button
              variant={filter === 'player' ? 'rpgBlue' : 'ghost'}
              size="sm"
              onClick={() => setFilter('player')}
              className="flex-1 py-1 h-7 text-[11px] gap-1"
            >
              <Shield size={13} /> PG ({tokens.filter((t) => t.type !== 'npc').length})
            </Button>
            <Button
              variant={filter === 'npc' ? 'destructive' : 'ghost'}
              size="sm"
              onClick={() => setFilter('npc')}
              className="flex-1 py-1 h-7 text-[11px] gap-1"
            >
              <Skull size={13} /> NPC ({tokens.filter((t) => t.type === 'npc').length})
            </Button>
          </div>

          {/* Elenco Token */}
          <div className="sidebar-content max-h-[calc(100vh-180px)] overflow-y-auto p-3 space-y-2">
            {filteredTokens.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                Nessun token {filter !== 'all' ? filter.toUpperCase() : ''} sulla mappa.
              </p>
            ) : (
              filteredTokens.map((token) => {
                const isMine = token.id === myTokenId;
                const isNpc = token.type === 'npc';
                const canSeeHp = role === 'MASTER' || isMine;
                const hpPercent =
                  token.hp !== undefined && token.maxHp
                    ? Math.min(100, Math.max(0, (token.hp / token.maxHp) * 100))
                    : 100;

                const hpIndicatorClass =
                  hpPercent > 50
                    ? 'bg-emerald-500'
                    : hpPercent > 20
                    ? 'bg-amber-500'
                    : 'bg-red-500';

                const canEditAvatar = role === 'MASTER' || isMine;

                return (
                  <div key={token.id} className="token-card group hover:border-amber-500/40">
                    <div className="flex items-center gap-3 w-full min-w-0">
                      {/* Avatar foto o Iniziale */}
                      {token.avatarUrl ? (
                        <img
                          src={token.avatarUrl}
                          alt={token.name}
                          className="w-8 h-8 rounded-lg object-contain bg-slate-900/80 border border-amber-400/50 shrink-0 shadow-sm"
                        />
                      ) : (
                        <div
                          className="token-badge shrink-0"
                          style={{ backgroundColor: token.color }}
                        >
                          {token.name[0]?.toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span
                            className={`text-xs font-bold truncate ${
                              isMine ? 'text-amber-300' : 'text-slate-100'
                            }`}
                          >
                            {token.name}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            {isNpc && <Badge variant="npc">NPC</Badge>}
                            {isMine && <Badge variant="player">Tu</Badge>}
                          </div>
                        </div>

                        {/* Barra HP Visiva ShadCN Progress (Visibile solo al Master o al proprietario del token) */}
                        {canSeeHp && token.hp !== undefined && (
                          <div className="mt-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-300 mb-0.5">
                              <span className="flex items-center gap-1 text-red-400 font-semibold">
                                <Heart size={12} className="fill-red-500 text-red-500" />
                                {token.hp} / {token.maxHp || token.hp} HP
                              </span>
                              <span className="font-mono text-slate-400">{Math.round(hpPercent)}%</span>
                            </div>
                            <Progress value={hpPercent} indicatorClassName={hpIndicatorClass} />
                          </div>
                        )}
                      </div>

                      {/* Pulsanti Azione (Cambio Foto per Master/Proprietario & Elimina per Master) */}
                      <div className="flex items-center gap-1 shrink-0">
                        {canEditAvatar && (
                          <>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAvatarUpload(token.id, file);
                              }}
                              className="hidden"
                              id={`tokenlist-avatar-input-${token.id}`}
                            />
                            <label
                              htmlFor={`tokenlist-avatar-input-${token.id}`}
                              className="text-slate-400 hover:text-amber-300 transition-colors p-1 rounded hover:bg-slate-800 cursor-pointer"
                              title="Cambia immagine pedina"
                            >
                              <Camera size={15} />
                            </label>
                          </>
                        )}

                        {role === 'MASTER' && (
                          <button
                            onClick={() => handleDeleteToken(token.id)}
                            className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/10"
                            title="Rimuovi Token"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


