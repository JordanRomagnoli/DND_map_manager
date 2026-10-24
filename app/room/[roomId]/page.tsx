'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RoomState, UserRole, Token, ActionLogRecord } from '@/lib/types';
import MapCanvas from '@/components/MapCanvas';
import MasterToolbar from '@/components/MasterToolbar';
import PlayerToolbar from '@/components/PlayerToolbar';
import TokenList from '@/components/TokenList';
import ActionLogPanel from '@/components/ActionLogPanel';
import { db } from '@/lib/db';
import { Shield, KeyRound, ArrowLeft, AlertCircle, Crown, Copy, Check, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function GameRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = (params.roomId as string)?.toLowerCase();

  // Ruolo e Credenziali
  const [role, setRole] = useState<UserRole>('PLAYER');
  const [password, setPassword] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [playerColor, setPlayerColor] = useState<string>('#3b82f6');

  // Socket & Room State
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null); // la connessione attiva, da chiudere prima di aprirne un'altra
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myTokenId, setMyTokenId] = useState<string | undefined>(undefined);

  // Error / Password prompt state
  const [authError, setAuthError] = useState<string | null>(null);
  const [promptPassword, setPromptPassword] = useState<boolean>(false);
  const [inputPassword, setInputPassword] = useState<string>('');

  // Stato per attivare il centraggio telecamera sul proprio Token
  const [centerTokenTrigger, setCenterTokenTrigger] = useState<number>(0);

  // UI state per copia codice stanza
  const [copiedCode, setCopiedCode] = useState<boolean>(false);


  // Toolbar State per il Master
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'brush' | 'eraser' | 'shape'>('select');
  const [activeShape, setActiveShape] = useState<'rectangle' | 'circle'>('rectangle');
  const [brushColor, setBrushColor] = useState<string>('#000000');
  const [brushWidth, setBrushWidth] = useState<number>(5);

  useEffect(() => {
    if (!roomId) return;

    // Pulizia periodica automatica dei log di azione scaduti col TTL
    db.purgeExpiredLogs();

    // Recupera parametri da URL o SessionStorage
    const urlRole = (searchParams.get('role') as UserRole) || sessionStorage.getItem(`dnd_role_${roomId}`) || 'PLAYER';
    const urlPassword = searchParams.get('password') || sessionStorage.getItem(`dnd_password_${roomId}`) || '';
    const urlName = searchParams.get('name') || sessionStorage.getItem(`dnd_name_${roomId}`) || 'Giocatore';
    const urlColor = searchParams.get('color') || sessionStorage.getItem(`dnd_color_${roomId}`) || '#3b82f6';

    setRole(urlRole);
    setPassword(urlPassword);
    setPlayerName(urlName);
    setPlayerColor(urlColor);

    if (!urlPassword && urlRole !== 'MASTER') {
      setPromptPassword(true);
      return;
    }

    connectSocket(urlRole, urlPassword, urlName, urlColor);

    // Uscendo dalla pagina (o cambiando stanza) chiude la connessione: altrimenti resta nella stanza
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const connectSocket = (
    currentRole: UserRole,
    currentPassword: string,
    name: string,
    color: string
  ) => {
    setAuthError(null);
    setPromptPassword(false);

    socketRef.current?.disconnect(); // es. nuovo tentativo dopo una password errata
    const newSocket = io();
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log(`⚡ Connesso al server WebSocket: ${newSocket.id}`);

      if (currentRole === 'MASTER') {
        newSocket.emit(
          'create-room',
          {
            roomId,
            roomName: `Stanza ${roomId}`,
            password: currentPassword,
            // localStorage: il Master resta tale anche aprendo nuove schede
            masterKey: localStorage.getItem(`dnd_masterkey_${roomId}`),
          },
          (res: any) => {
            if (res?.success) {
              localStorage.setItem(`dnd_masterkey_${roomId}`, res.masterKey);
              setRoom(res.room);
              if (res.room?.logs) {
                db.saveLogsBulk(res.room.logs);
              }
            } else {
              setAuthError(res?.error || 'Errore nella creazione della stanza.');
            }
          }
        );
      } else {
        newSocket.emit(
          'join-room',
          {
            roomId,
            password: currentPassword,
            playerKey: localStorage.getItem(`dnd_playerkey_${roomId}`),
            playerName: name,
            playerColor: color,
          },
          (res: any) => {
            if (res?.success) {
              localStorage.setItem(`dnd_playerkey_${roomId}`, res.playerKey);
              setRoom(res.room);
              setMyTokenId(res.assignedTokenId);
              if (res.room?.logs) {
                db.saveLogsBulk(res.room.logs);
              }
            } else {
              setAuthError(res?.error || 'Accesso negato.');
              if (res?.error?.includes('Password')) {
                setPromptPassword(true);
              }
            }
          }
        );
      }
    });

    // EVENT LISTENERS WEBSOCKET PER SINCRONIZZAZIONE IN TEMPO REALE

    newSocket.on('action-logged', (logRecord: ActionLogRecord) => {
      db.saveLog(logRecord);
    });

    newSocket.on('room-logs-cleared', () => {
      db.clearRoomLogs(roomId);
    });


    // EVENT LISTENERS WEBSOCKET PER SINCRONIZZAZIONE IN TEMPO REALE

    newSocket.on('token-moved-animated', ({ tokenId, endX, endY }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          tokens: prev.tokens.map((t) => (t.id === tokenId ? { ...t, x: endX, y: endY } : t)),
        };
      });
    });


    newSocket.on('token-hp-updated', ({ tokenId, hp, maxHp }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          tokens: prev.tokens.map((t) =>
            t.id === tokenId ? { ...t, hp, maxHp } : t
          ),
        };
      });
    });

    newSocket.on('token-avatar-updated', ({ tokenId, avatarUrl }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          tokens: prev.tokens.map((t) =>
            t.id === tokenId ? { ...t, avatarUrl } : t
          ),
        };
      });
    });

    newSocket.on('token-added', (newToken: Token) => {
      setRoom((prev) => {
        if (!prev) return null;
        if (prev.tokens.some((t) => t.id === newToken.id)) return prev;
        return {
          ...prev,
          tokens: [...prev.tokens, newToken],
        };
      });
    });

    newSocket.on('token-removed', ({ tokenId }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          tokens: prev.tokens.filter((t) => t.id !== tokenId),
        };
      });
    });

    newSocket.on('stroke-drawn', (stroke) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          drawings: [...prev.drawings, stroke],
        };
      });
    });

    newSocket.on('canvas-cleared', () => {
      setRoom((prev) => {
        if (!prev) return null;
        return { ...prev, drawings: [] };
      });
    });

    newSocket.on('background-updated', ({ backgroundUrl }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return { ...prev, backgroundUrl };
      });
    });

    newSocket.on('grid-updated', ({ gridSize, gridScale, gridVisible }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          gridSize: gridSize ?? prev.gridSize,
          gridScale: gridScale ?? prev.gridScale,
          gridVisible: gridVisible ?? prev.gridVisible,
        };
      });
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPassword.trim()) return;
    setPassword(inputPassword);
    sessionStorage.setItem(`dnd_password_${roomId}`, inputPassword);
    connectSocket(role, inputPassword, playerName, playerColor);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Se è richiesta la password o c'è un errore di autenticazione (ShadCN Card & Input)
  if (promptPassword || authError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
        <Card className="w-full max-w-md text-center border-amber-500/30 p-4 shadow-2xl">
          <CardHeader className="items-center pb-2">
            <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mb-2 border border-amber-500/30 shadow-gold-glow">
              <KeyRound size={28} />
            </div>
            <CardTitle className="text-2xl text-white rpg-font">Accesso Stanza Riservata</CardTitle>
            <CardDescription className="text-xs sm:text-sm text-slate-400">
              La stanza <span className="text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">{roomId}</span> richiede una password di verifica.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            {authError && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs sm:text-sm flex items-center justify-center gap-2">
                <AlertCircle size={18} className="text-red-400 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                type="password"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                placeholder="Inserisci password stanza"
                className="text-center font-mono tracking-wider"
                required
                autoFocus
              />

              <Button type="submit" variant="rpgGold" className="w-full text-sm">
                Entra nella Stanza
              </Button>
            </form>

            <Button
              variant="secondary"
              onClick={() => router.push('/')}
              className="w-full mt-4 text-xs gap-1.5 justify-center"
            >
              <ArrowLeft size={16} /> Torna alla Homepage
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Schermata di caricamento in attesa della sincronizzazione socket
  if (!room) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-14 h-14 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4 shadow-gold-glow" />
        <p className="font-bold text-sm sm:text-base rpg-font text-amber-300 tracking-wider">
          Connessione alla Stanza <span className="font-mono">{roomId}</span>...
        </p>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* BARRA SUPERIORE DI NAVIGAZIONE E INFORMAZIONI STANZA */}
      <header className="absolute top-4 left-4 z-40 flex items-center gap-3">
        <Button
          variant="icon"
          onClick={() => router.push('/')}
          className="bg-slate-900/80 hover:bg-slate-800 border-white/10 text-slate-300 hover:text-white backdrop-blur-md"
          title="Esci dalla stanza"
        >
          <LogOut size={20} />
        </Button>

        <div className="rounded-xl bg-slate-950/80 border border-white/10 px-3.5 py-1.5 flex items-center gap-3 text-xs shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <span className="text-amber-400 font-mono">#{room.id}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyCode}
            className="h-7 px-2.5 text-[11px] font-semibold text-slate-400 hover:text-amber-300 bg-slate-800/60 border border-white/5 gap-1.5"
            title="Copia codice stanza"
          >
            {copiedCode ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span className="text-emerald-400">Copiato!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copia Codice</span>
              </>
            )}
          </Button>

          <div className="w-px h-3.5 bg-white/10" />

          {role === 'MASTER' ? (
            <Badge variant="master" className="gap-1 px-2.5 py-1">
              <Crown size={14} className="text-amber-400" /> Master
            </Badge>
          ) : (
            <Badge variant="player" className="gap-1 px-2.5 py-1">
              <Shield size={14} className="text-blue-400" /> Giocatore
            </Badge>
          )}
        </div>

        {/* Pulsante Registro Azioni */}
        <ActionLogPanel roomId={room.id} role={role} socket={socket} />
      </header>


      {/* 1. LAYER CANVAS PRINCIPALE */}
      <MapCanvas
        room={room}
        role={role}
        myTokenId={myTokenId}
        socket={socket}
        activeTool={activeTool}
        activeShape={activeShape}
        brushColor={brushColor}
        brushWidth={brushWidth}
        centerTokenTrigger={centerTokenTrigger}
      />

      {/* 2. TOOLBAR SOSPESA (MASTER vs PLAYER) */}
      {role === 'MASTER' ? (
        <MasterToolbar
          room={room}
          socket={socket}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          activeShape={activeShape}
          setActiveShape={setActiveShape}
          brushColor={brushColor}
          setBrushColor={setBrushColor}
          brushWidth={brushWidth}
          setBrushWidth={setBrushWidth}
        />
      ) : (
        <PlayerToolbar
          playerToken={room.tokens.find((t) => t.id === myTokenId)}
          roomName={room.name}
          roomId={room.id}
          gridSize={room.gridSize}
          gridScale={room.gridScale}
          socket={socket}
          onCenterOnToken={() => setCenterTokenTrigger(Date.now())}
        />
      )}


      {/* 3. SIDEBAR LISTA TOKEN IN CAMPO */}
      <TokenList
        tokens={room.tokens}
        role={role}
        roomId={room.id}
        socket={socket}
        myTokenId={myTokenId}
      />
    </main>
  );
}


