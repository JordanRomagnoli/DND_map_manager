'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RoomState, UserRole, Token, ActionLogRecord, Initiative } from '@/lib/types';
import MapCanvas from '@/components/MapCanvas';
import MasterToolbar from '@/components/MasterToolbar';
import PlayerToolbar from '@/components/PlayerToolbar';
import TokenList from '@/components/TokenList';
import ActionLogPanel from '@/components/ActionLogPanel';
import InitiativePanel from '@/components/InitiativePanel';
import InvitePanel from '@/components/InvitePanel';
import HandoutViewer from '@/components/HandoutViewer';
import { db } from '@/lib/db';
import { hiddenByFog } from '@/lib/utils';
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

  // Rientro da un dispositivo nuovo: il server propone le pedine giocatore libere tra cui scegliere
  const [tokenChoices, setTokenChoices] = useState<Pick<Token, 'id' | 'name' | 'color' | 'avatarUrl'>[] | null>(null);
  const joinRoomRef = useRef<(choice: { claimTokenId?: string; newCharacter?: boolean }) => void>(() => {});

  // Stato per attivare il centraggio telecamera sul proprio Token
  const [centerTokenTrigger, setCenterTokenTrigger] = useState<number>(0);

  // UI state per copia codice stanza
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Link pubblico del tunnel (npm run sessione), inviato dal server solo al Master
  const [publicUrl, setPublicUrl] = useState<string | null>(null);


  // Toolbar State per il Master
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'brush' | 'eraser' | 'shape' | 'fog-reveal' | 'fog-hide'>('select');
  const [activeShape, setActiveShape] = useState<'rectangle' | 'circle'>('rectangle');
  const [brushColor, setBrushColor] = useState<string>('#000000');
  const [brushWidth, setBrushWidth] = useState<number>(5);

  useEffect(() => {
    if (!roomId) return;

    // Pulizia periodica automatica dei log di azione scaduti col TTL
    db.purgeExpiredLogs();

    // Recupera parametri da URL o SessionStorage
    // Un browser che ha già la chiave del Master per questa stanza rientra come Master (es. link dai preferiti)
    const urlRole =
      (searchParams.get('role') as UserRole) ||
      sessionStorage.getItem(`dnd_role_${roomId}`) ||
      (localStorage.getItem(`dnd_masterkey_${roomId}`) ? 'MASTER' : 'PLAYER');
    // La password non si legge mai dall'URL: solo da sessionStorage o dal form
    const storedPassword = sessionStorage.getItem(`dnd_password_${roomId}`) || '';
    const urlName = searchParams.get('name') || sessionStorage.getItem(`dnd_name_${roomId}`) || 'Giocatore';
    const urlColor = searchParams.get('color') || sessionStorage.getItem(`dnd_color_${roomId}`) || '#3b82f6';

    setRole(urlRole);
    setPassword(storedPassword);
    setPlayerName(urlName);
    setPlayerColor(urlColor);

    if (!storedPassword && urlRole !== 'MASTER') {
      setPromptPassword(true);
      return;
    }

    connectSocket(urlRole, storedPassword, urlName, urlColor);

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
            // password del Master: per rientrare da un dispositivo senza chiave
            masterPassword: sessionStorage.getItem(`dnd_masterpw_${roomId}`),
          },
          (res: any) => {
            if (res?.success) {
              localStorage.setItem(`dnd_masterkey_${roomId}`, res.masterKey);
              setPublicUrl(res.publicUrl ?? null);
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
        // choice: pedina scelta dall'elenco (claimTokenId) o nuovo personaggio, dopo la richiesta del server
        joinRoomRef.current = (choice) => newSocket.emit(
          'join-room',
          {
            roomId,
            password: currentPassword,
            playerKey: localStorage.getItem(`dnd_playerkey_${roomId}`),
            playerName: name,
            playerColor: color,
            ...choice,
          },
          (res: any) => {
            if (res?.chooseToken) {
              setTokenChoices(res.chooseToken);
              return;
            }
            setTokenChoices(null);
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
        joinRoomRef.current({});
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

    // Movimento fuori turno: solo la posizione finale, senza animazione
    newSocket.on('token-moved', ({ tokenId, x, y }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          tokens: prev.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)),
        };
      });
    });

    newSocket.on('initiative-updated', (initiative: Initiative | null) => {
      setRoom((prev) => (prev ? { ...prev, initiative } : null));
    });

    newSocket.on('engagements-updated', (engagements: [string, string][]) => {
      setRoom((prev) => (prev ? { ...prev, engagements } : null));
    });

    newSocket.on('room-deleted', () => {
      alert('Il Master ha eliminato questa stanza.');
      router.push('/');
    });

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

    newSocket.on('token-hidden-updated', ({ tokenId, hidden }) => {
      setRoom((prev) =>
        prev ? { ...prev, tokens: prev.tokens.map((t) => (t.id === tokenId ? { ...t, hidden } : t)) } : null
      );
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

    newSocket.on('fog-updated', (fog) => {
      setRoom((prev) => (prev ? { ...prev, fog } : null));
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
    if (role === 'MASTER') {
      // al Master il form chiede la password del Master (quella della stanza serve solo a crearla)
      sessionStorage.setItem(`dnd_masterpw_${roomId}`, inputPassword);
      connectSocket(role, password, playerName, playerColor);
      return;
    }
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
                placeholder={role === 'MASTER' ? 'Inserisci la password del Master' : 'Inserisci password stanza'}
                className="text-center font-mono tracking-wider"
                required
                autoFocus
              />

              <Button type="submit" variant="rpgGold" className="w-full text-sm">
                Entra nella Stanza
              </Button>
            </form>

            {role !== 'MASTER' && (
              <p className="mt-4 text-[11px] text-slate-400">
                Sei il Master? Torna alla homepage e usa &quot;Crea o Riapri come Master&quot; con la password del Master.
              </p>
            )}

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

  // Rientro senza chiave: il giocatore indica quale pedina è la sua (o ne crea una nuova)
  if (tokenChoices && !room) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
        <Card className="w-full max-w-md text-center border-amber-500/30 p-4 shadow-2xl">
          <CardHeader className="items-center pb-2">
            <CardTitle className="text-2xl text-white rpg-font">Qual è il tuo personaggio?</CardTitle>
            <CardDescription className="text-xs sm:text-sm text-slate-400">
              Nella stanza <span className="font-mono text-amber-300">{roomId}</span> ci sono personaggi senza giocatore
              collegato. Tocca il tuo per riprenderlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {tokenChoices.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => joinRoomRef.current({ claimTokenId: t.id })}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-700 hover:border-amber-500/60 text-left"
              >
                {t.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.avatarUrl} alt="" className="w-10 h-10 object-contain shrink-0" />
                ) : (
                  <span className="token-badge shrink-0" style={{ backgroundColor: t.color }}>
                    {t.name[0]?.toUpperCase()}
                  </span>
                )}
                <span className="font-semibold text-slate-100">{t.name}</span>
              </button>
            ))}
            <Button
              variant="secondary"
              onClick={() => joinRoomRef.current({ newCharacter: true })}
              className="w-full mt-2 text-xs"
            >
              Nessuno di questi: nuovo personaggio
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
      <header className="absolute top-4 left-4 right-4 z-40 flex flex-wrap items-center gap-2 sm:gap-3 pointer-events-none [&>*]:pointer-events-auto">
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
                <span className="hidden sm:inline">Copia Codice</span>
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

        {/* Master: QR e link per far entrare i giocatori */}
        {role === 'MASTER' && <InvitePanel roomId={room.id} publicUrl={publicUrl} />}

        {/* Combattimento a iniziativa: ordine dei turni */}
        <InitiativePanel room={room} role={role} socket={socket} myTokenId={myTokenId} />
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
          canMove={!room.initiative || room.initiative.activeTokenId === myTokenId}
          onCenterOnToken={() => setCenterTokenTrigger(Date.now())}
        />
      )}


      <HandoutViewer socket={socket} role={role} />

      {/* 3. SIDEBAR LISTA TOKEN IN CAMPO */}
      <TokenList
        tokens={role === 'MASTER' ? room.tokens : room.tokens.filter((t) => !hiddenByFog(room.fog, t))}
        role={role}
        roomId={room.id}
        socket={socket}
        myTokenId={myTokenId}
      />
    </main>
  );
}


