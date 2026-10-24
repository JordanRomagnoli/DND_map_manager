'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { ActionLogRecord, UserRole } from '@/lib/types';
import { Socket } from 'socket.io-client';
import {
  History,
  Search,
  Trash2,
  Crown,
  User,
  HeartPulse,
  Move,
  Palette,
  Map,
  Grid,
  UserPlus,
  X,
  Clock,
  Info,
  Swords,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ActionLogPanelProps {
  roomId: string;
  role: UserRole;
  socket: Socket | null;
}

export default function ActionLogPanel({ roomId, role, socket }: ActionLogPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

  // Query reattiva su IndexedDB tramite Dexie per la stanza corrente
  const logs = useLiveQuery(
    async () => {
      if (!roomId) return [];
      const records = await db.actionLogs
        .where('roomId')
        .equals(roomId)
        .sortBy('timestamp');
      return records.reverse(); // Più recenti in alto
    },
    [roomId],
    []
  );

  // Pulisce il registro sul server e in locale
  const handleClearLogs = async () => {
    if (role !== 'MASTER') return;
    if (confirm('Sei sicuro di voler svuotare il registro delle azioni della stanza?')) {
      socket?.emit('clear-room-logs', { roomId });
      await db.clearRoomLogs(roomId);
    }
  };

  // Icone dinamiche per tipo di azione
  const getActionIcon = (type: ActionLogRecord['actionType']) => {
    switch (type) {
      case 'TOKEN_MOVE':
        return <Move className="w-3.5 h-3.5 text-blue-400" />;
      case 'HP_UPDATE':
        return <HeartPulse className="w-3.5 h-3.5 text-red-400" />;
      case 'DRAW':
        return <Palette className="w-3.5 h-3.5 text-purple-400" />;
      case 'TOKEN_REMOVE':
        return <Trash2 className="w-3.5 h-3.5 text-amber-400" />;
      case 'MAP_CHANGE':
        return <Map className="w-3.5 h-3.5 text-cyan-400" />;
      case 'GRID_UPDATE':
        return <Grid className="w-3.5 h-3.5 text-indigo-400" />;
      case 'CLEAR_CANVAS':
        return <Trash2 className="w-3.5 h-3.5 text-rose-400" />;
      case 'USER_JOIN':
        return <UserPlus className="w-3.5 h-3.5 text-emerald-400" />;
      case 'TURN':
        return <Swords className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // Formattazione dell'orario
  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Filtraggio dei log
  const filteredLogs = (logs || []).filter((log) => {
    const matchesSearch =
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'HP') return log.actionType === 'HP_UPDATE';
    if (selectedFilter === 'MOVE') return log.actionType === 'TOKEN_MOVE';
    if (selectedFilter === 'MAP') return log.actionType === 'MAP_CHANGE' || log.actionType === 'GRID_UPDATE';
    if (selectedFilter === 'USERS') return log.actionType === 'USER_JOIN';
    if (selectedFilter === 'TURN') return log.actionType === 'TURN';
    return true;
  });

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative bg-slate-900/90 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white shadow-lg backdrop-blur-md gap-2"
        >
          <History className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline font-medium text-xs">Registro Azioni</span>
          {logs && logs.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30"
            >
              {logs.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-1.5rem)] sm:w-96 p-0 bg-slate-950/95 border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl rounded-xl z-50"
      >

        {/* Header del Registro */}
        <div className="flex items-center justify-between p-3 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <History className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-100 leading-none">Registro Azioni</h4>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-slate-500" /> Storage Locale (TTL 24h)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {role === 'MASTER' && logs && logs.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleClearLogs}
                      className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-900 border-slate-800 text-xs">
                    Svuota registro per tutti
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Cerca & Filtri */}
        <div className="p-2.5 border-b border-slate-800/60 bg-slate-900/30 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <Input
              placeholder="Cerca azione o personaggio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 text-xs bg-slate-900/80 border-slate-800 focus:border-amber-500/50 text-slate-200 placeholder:text-slate-500"
            />
          </div>

          {/* Pillole dei Filtri */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { id: 'ALL', label: 'Tutti' },
              { id: 'HP', label: 'HP' },
              { id: 'MOVE', label: 'Movimenti' },
              { id: 'TURN', label: 'Turni' },
              { id: 'MAP', label: 'Mappa' },
              { id: 'USERS', label: 'Utenti' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFilter(f.id)}
                className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-all whitespace-nowrap ${
                  selectedFilter === f.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista Log delle Azioni */}
        <div className="max-h-72 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
              <Info className="w-5 h-5 opacity-40" />
              <span>Nessuna azione registrata.</span>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-start gap-2.5 text-xs"
              >
                <div className="p-1.5 rounded-md bg-slate-800/80 border border-slate-700/50 shrink-0 mt-0.5">
                  {getActionIcon(log.actionType)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-semibold text-slate-200 truncate flex items-center gap-1">
                      {log.actorRole === 'MASTER' ? (
                        <Crown className="w-3 h-3 text-amber-400 shrink-0 inline" />
                      ) : (
                        <User className="w-3 h-3 text-blue-400 shrink-0 inline" />
                      )}
                      {log.actorName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {formatTime(log.timestamp)}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-snug break-words">
                    {log.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Informativo */}
        <div className="p-2 border-t border-slate-800/60 bg-slate-900/40 text-[10px] text-slate-500 flex items-center justify-between px-3">
          <span>Salvato su DB IndexedDB del device</span>
          <span className="text-slate-400">Scadenza: 24h</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
