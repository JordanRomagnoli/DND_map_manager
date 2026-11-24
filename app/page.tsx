'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import {
  Shield,
  Crown,
  User,
  Lock,
  RefreshCw,
  Zap,
  Grid,
  Map,
  Heart,
  Check,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#ef4444', // Red
  '#6366f1', // Indigo
];

export default function LandingPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('create');

  // Form Crea Stanza (Master)
  const [createRoomId, setCreateRoomId] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [masterName, setMasterName] = useState<string>('Dungeon Master');
  const [masterPassword, setMasterPassword] = useState<string>('');

  // Form Unisciti Stanza (Player)
  const [joinRoomId, setJoinRoomId] = useState<string>('');
  const [joinPassword, setJoinPassword] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [playerColor, setPlayerColor] = useState<string>('#3b82f6');

  // Link d'invito del Master (/?join=<codice>): apre "Unisciti" con il codice già compilato.
  // window.location invece di useSearchParams, che renderebbe la home non statica.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join');
    if (code) {
      setActiveTab('join');
      setJoinRoomId(code);
    }
  }, []);

  // Stanze esistenti, per rientrare senza ricordarsi il codice (chiede l'elenco al server e chiude)
  const [existingRooms, setExistingRooms] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const socket = io();
    socket.emit('list-rooms', (list: { id: string; name: string }[]) => {
      setExistingRooms(list);
      socket.disconnect();
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Sceglie una stanza dall'elenco: apre la scheda giusta col codice compilato, resta da mettere la password
  const pickRoom = (roomId: string, tab: 'create' | 'join') => {
    setCreateRoomId(roomId);
    setJoinRoomId(roomId);
    setActiveTab(tab);
    setErrorMsg('');
  };

  // Elimina una stanza (solo Master): basta la chiave se questo browser ce l'ha, altrimenti la password del Master
  const deleteRoom = (room: { id: string; name: string }) => {
    const masterKey = localStorage.getItem(`dnd_masterkey_${room.id}`);
    const masterPassword = masterKey ? null : prompt(`Password del Master per eliminare "${room.name}":`);
    if (!masterKey && !masterPassword) return;
    if (!confirm(`Eliminare definitivamente "${room.name}"? Mappa, pedine e disegni andranno persi.`)) return;

    const socket = io();
    socket.emit('delete-room', { roomId: room.id, masterKey, masterPassword }, (res: { success: boolean; error?: string }) => {
      socket.disconnect();
      if (!res?.success) {
        setErrorMsg(res?.error || 'Impossibile eliminare la stanza.');
        return;
      }
      localStorage.removeItem(`dnd_masterkey_${room.id}`);
      setExistingRooms((prev) => prev.filter((r) => r.id !== room.id));
    });
  };

  // Error Messages
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Generatore Codice Stanza Casuale
  const handleGenerateRoomCode = () => {
    const randomCode = Math.random().toString(36).substring(2, 8).toLowerCase();
    setCreateRoomId(randomCode);
  };

  // Submit Crea Stanza (Master): la stanza viene creata dal server socket all'ingresso
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!createRoomId.trim()) {
      setErrorMsg('Inserisci un codice o nome per la stanza.');
      return;
    }
    if (!createPassword.trim()) {
      setErrorMsg('Imposta una password per proteggere la stanza.');
      return;
    }
    if (!masterPassword.trim()) {
      setErrorMsg('Imposta la password del Master: serve per rientrare nella stanza.');
      return;
    }

    const roomId = createRoomId.trim().toLowerCase();

    sessionStorage.setItem(`dnd_role_${roomId}`, 'MASTER');
    sessionStorage.setItem(`dnd_password_${roomId}`, createPassword);
    sessionStorage.setItem(`dnd_masterpw_${roomId}`, masterPassword);
    sessionStorage.setItem(`dnd_name_${roomId}`, masterName);

    // Credenziali solo in sessionStorage: nell'URL finirebbero in cronologia e nei link copiati
    router.push(`/room/${roomId}`);
  };

  // Submit Unisciti Stanza (Player): la password viene verificata dal server socket all'ingresso
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!joinRoomId.trim()) {
      setErrorMsg('Inserisci il codice della stanza.');
      return;
    }
    if (!joinPassword.trim()) {
      setErrorMsg('Inserisci la password di accesso alla stanza.');
      return;
    }
    if (!playerName.trim()) {
      setErrorMsg('Inserisci il nome del tuo personaggio.');
      return;
    }

    const roomId = joinRoomId.trim().toLowerCase();

    sessionStorage.setItem(`dnd_role_${roomId}`, 'PLAYER');
    sessionStorage.setItem(`dnd_password_${roomId}`, joinPassword);
    sessionStorage.setItem(`dnd_name_${roomId}`, playerName);
    sessionStorage.setItem(`dnd_color_${roomId}`, playerColor);

    router.push(`/room/${roomId}`);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-400 selection:text-slate-950">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <header className="h-16 flex items-center justify-between">
          <span className="rpg-font text-lg text-slate-100">Map Manager D&amp;D</span>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-12 pt-8 pb-16 lg:pt-12 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:gap-16 lg:items-start">
          {/* Colonna sinistra: titolo e accesso */}
          <div>
            <h1 className="rpg-font text-4xl sm:text-5xl leading-[1.08] text-slate-100">
              La mappa di battaglia del tuo tavolo
            </h1>
            <p className="mt-4 text-lg leading-7 text-slate-400">
              Disegna mappe, posiziona i mostri e lascia che ogni giocatore muova la propria pedina dal telefono, in tempo reale.
            </p>

            <Card className="mt-8 p-4 sm:p-6">
              {/* Stanze esistenti: rientro veloce senza ricordarsi il codice */}
              {existingRooms.length > 0 && (
                <div className="mb-6">
                  <h2 className="mb-2 text-sm text-slate-400">Stanze esistenti</h2>
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {existingRooms.map((r) => (
                      <div
                        key={r.id}
                        className={`flex flex-wrap items-center gap-2 p-2 rounded-lg border bg-slate-800/60 ${
                          r.id === joinRoomId || r.id === createRoomId ? 'border-amber-400/40' : 'border-white/[0.06]'
                        }`}
                      >
                        {/* su telefono il nome sta su una riga intera e i pulsanti sotto */}
                        <div className="w-full sm:w-auto sm:flex-1 min-w-0 pl-1 text-left">
                          <p className="text-sm text-slate-100 truncate">{r.name}</p>
                          <p className="text-xs font-mono text-slate-500 truncate">#{r.id}</p>
                        </div>
                        <Button type="button" size="sm" variant="ghost" onClick={() => pickRoom(r.id, 'join')} className="h-8 px-2 gap-1.5 flex-1 sm:flex-none">
                          <User size={16} strokeWidth={1.5} /> Giocatore
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => pickRoom(r.id, 'create')} className="h-8 px-2 gap-1.5 flex-1 sm:flex-none">
                          <Crown size={16} strokeWidth={1.5} /> Master
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteRoom(r)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-red-400"
                          title={`Elimina ${r.name}`}
                          aria-label={`Elimina ${r.name}`}
                        >
                          <Trash2 size={16} strokeWidth={1.5} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Tabs defaultValue="create" value={activeTab} onValueChange={(val) => { setActiveTab(val); setErrorMsg(''); }}>
                <TabsList className="mb-6">
                  <TabsTrigger value="create">
                    <Crown size={16} strokeWidth={1.5} />
                    <span>Crea stanza<span className="hidden sm:inline"> (Master)</span></span>
                  </TabsTrigger>
                  <TabsTrigger value="join">
                    <User size={16} strokeWidth={1.5} />
                    <span>Unisciti<span className="hidden sm:inline"> (Giocatore)</span></span>
                  </TabsTrigger>
                </TabsList>

                {errorMsg && (
                  <div role="alert" className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-300 text-sm flex items-start gap-2">
                    <Lock size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <TabsContent value="create" className="mt-0">
                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <Field label="Codice o nome della stanza">
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={createRoomId}
                          onChange={(e) => setCreateRoomId(e.target.value)}
                          placeholder="Es. campagna-draghi"
                          required
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleGenerateRoomCode}
                          className="h-10 px-3 gap-1.5 shrink-0"
                          title="Genera un codice casuale"
                        >
                          <RefreshCw size={16} strokeWidth={1.5} />
                          <span>Casuale</span>
                        </Button>
                      </div>
                    </Field>

                    <Field label="Password per i giocatori">
                      <Input
                        type="password"
                        value={createPassword}
                        onChange={(e) => setCreatePassword(e.target.value)}
                        placeholder="La condividi con il gruppo"
                        required
                      />
                    </Field>

                    <Field
                      label="Password del Master"
                      hint="Per rientrare in una stanza esistente, da qualsiasi dispositivo: stesso codice e stessa password del Master."
                    >
                      <Input
                        type="password"
                        value={masterPassword}
                        onChange={(e) => setMasterPassword(e.target.value)}
                        placeholder="Solo tua, diversa da quella dei giocatori"
                        required
                      />
                    </Field>

                    <Field label="Nome del Master">
                      <Input
                        type="text"
                        value={masterName}
                        onChange={(e) => setMasterName(e.target.value)}
                        placeholder="Dungeon Master"
                      />
                    </Field>

                    <Button type="submit" size="lg" className="w-full mt-2 gap-2">
                      <Crown size={18} strokeWidth={1.5} />
                      <span>Crea o riapri come Master</span>
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="join" className="mt-0">
                  <form onSubmit={handleJoinRoom} className="space-y-4">
                    <Field label="Codice della stanza">
                      <Input
                        type="text"
                        value={joinRoomId}
                        onChange={(e) => setJoinRoomId(e.target.value)}
                        placeholder="Es. campagna-draghi"
                        required
                      />
                    </Field>

                    <Field label="Password della stanza">
                      <Input
                        type="password"
                        value={joinPassword}
                        onChange={(e) => setJoinPassword(e.target.value)}
                        placeholder="Te la dà il Master"
                        required
                      />
                    </Field>

                    <Field label="Nome del personaggio">
                      <Input
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="Es. Valeros il guerriero"
                        required
                      />
                    </Field>

                    <Field label="Colore della pedina">
                      <div className="flex items-center gap-2 flex-wrap">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setPlayerColor(c)}
                            aria-label={`Colore ${c}`}
                            aria-pressed={playerColor === c}
                            className={`w-8 h-8 rounded-full flex items-center justify-center ring-offset-2 ring-offset-slate-900 transition-[box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                              playerColor === c ? 'ring-2 ring-slate-100' : 'opacity-80 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: c }}
                          >
                            {playerColor === c && <Check size={16} strokeWidth={2} className="text-white" />}
                          </button>
                        ))}
                        <input
                          type="color"
                          value={playerColor}
                          onChange={(e) => setPlayerColor(e.target.value)}
                          className="w-8 h-8 rounded-full border-none bg-transparent cursor-pointer"
                          title="Colore personalizzato"
                          aria-label="Colore personalizzato"
                        />
                      </div>
                    </Field>

                    <Button type="submit" size="lg" className="w-full mt-2 gap-2">
                      <Shield size={18} strokeWidth={1.5} />
                      <span>Entra in partita</span>
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          {/* Colonna destra: anteprima della mappa, la pedina prende il colore scelto */}
          <div className="lg:sticky lg:top-8">
            <BattleMapPreview color={playerColor} name={playerName} />

            <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {FEATURES_LIST.map(({ Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <Icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-slate-500" />
                  <div>
                    <p className="text-sm text-slate-200">{title}</p>
                    <p className="text-sm text-slate-400">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="py-8 border-t border-white/[0.06] text-xs text-slate-500">
          Map Manager D&amp;D &copy; {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-2 text-sm text-slate-300">{label}</span>
      {children}
      {hint && <span className="block mt-2 text-xs leading-4 text-slate-500">{hint}</span>}
    </label>
  );
}

const FEATURES_LIST = [
  { Icon: Zap, title: 'In tempo reale', text: 'Ogni mossa arriva subito a tutto il tavolo' },
  { Icon: Grid, title: 'Griglia tattica', text: 'Le pedine si agganciano ai quadretti' },
  { Icon: Map, title: 'Le tue mappe', text: "Carica un'immagine JPG o PNG, o incolla un link" },
  { Icon: Heart, title: 'Pedine e punti vita', text: 'Mostri e personaggi con i loro HP' },
];

// Anteprima disegnata in codice: due stanze, il gruppo, i goblin e la mossa che stai per fare.
const CELL = 32;
const at = (c: number) => c * CELL + CELL / 2;

function BattleMapPreview({ color, name }: { color: string; name: string }) {
  const initial = (name.trim()[0] || 'V').toUpperCase();
  const party = [
    { c: 2, r: 4, color: '#10b981', label: 'M' },
    { c: 4, r: 2, color: '#8b5cf6', label: 'T' },
  ];
  const goblins = [
    { c: 12, r: 2 },
    { c: 13, r: 4 },
  ];
  const me = { c: 3, r: 6 };
  const target = { c: 7, r: 5 };

  return (
    <figure className="rounded-2xl border border-white/[0.08] bg-slate-900 overflow-hidden">
      <figcaption className="h-10 px-4 flex items-center justify-between border-b border-white/[0.06] text-xs">
        <span className="font-mono text-slate-400">#campagna-draghi</span>
        <span className="text-slate-500 tabular-nums">Round 3 · tocca a {name.trim() || 'Valeros'}</span>
      </figcaption>
      <svg viewBox="16 16 448 288" className="block w-full h-auto" role="img" aria-label="Anteprima di una mappa di battaglia con griglia e pedine">
        <defs>
          <pattern id="bm-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="rgba(239,233,222,0.08)" strokeWidth="1" />
          </pattern>
          <radialGradient id="bm-torch" cx="0.22" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#d9b36c" stopOpacity="0.16" />
            <stop offset="1" stopColor="#d9b36c" stopOpacity="0" />
          </radialGradient>
          <clipPath id="bm-floor">
            <rect x={32} y={32} width={256} height={256} />
            <rect x={288} y={128} width={64} height={64} />
            <rect x={352} y={32} width={96} height={192} />
          </clipPath>
        </defs>

        <rect width="480" height="320" fill="#12110f" />
        <g clipPath="url(#bm-floor)">
          <rect width="480" height="320" fill="#24211e" />
          <rect width="480" height="320" fill="url(#bm-torch)" />
          <rect width="480" height="320" fill="url(#bm-grid)" />
        </g>

        {/* Muri, con le porte lasciate aperte verso il corridoio */}
        <path
          d="M 288 128 L 288 32 L 32 32 L 32 288 L 288 288 L 288 192 M 288 128 L 352 128 L 352 32 L 448 32 L 448 224 L 352 224 L 352 192 L 288 192"
          fill="none"
          stroke="#5c5750"
          strokeWidth="6"
          strokeLinejoin="round"
        />

        {/* Forziere */}
        <rect x={7 * CELL + 6} y={CELL + 9} width={20} height={14} rx={2} fill="#a8803a" />
        <line x1={7 * CELL + 6} y1={CELL + 14} x2={7 * CELL + 26} y2={CELL + 14} stroke="#654c22" strokeWidth="1.5" />

        {/* La mossa: percorso tratteggiato e il quadretto di arrivo */}
        <line x1={at(me.c)} y1={at(me.r)} x2={at(target.c)} y2={at(target.r)} stroke="#d9b36c" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
        <rect x={target.c * CELL + 2} y={target.r * CELL + 2} width={CELL - 4} height={CELL - 4} rx={3} fill="rgba(217,179,108,0.1)" stroke="#d9b36c" strokeWidth="1.5" strokeDasharray="4 3" />
        <g transform={`translate(${at(target.c)} ${target.r * CELL - 10})`}>
          <rect x={-26} y={-10} width={52} height={20} rx={4} fill="#12110f" stroke="rgba(239,233,222,0.12)" />
          <text textAnchor="middle" y={4} fontSize="11" fontFamily="ui-monospace, monospace" fill="#efe9de">6 m</text>
        </g>

        {goblins.map(({ c, r }) => (
          <Token key={`${c}-${r}`} x={at(c)} y={at(r)} color="#7f1d1d" label="G" />
        ))}
        {party.map((t) => (
          <Token key={t.label} x={at(t.c)} y={at(t.r)} color={t.color} label={t.label} />
        ))}
        <Token x={at(me.c)} y={at(me.r)} color={color} label={initial} />
      </svg>
    </figure>
  );
}

function Token({ x, y, color, label }: { x: number; y: number; color: string; label: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={12} fill={color} stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
      <text textAnchor="middle" y={4} fontSize="12" fontWeight="500" fontFamily="Outfit, sans-serif" fill="#fff">
        {label}
      </text>
    </g>
  );
}
