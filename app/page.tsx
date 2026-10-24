'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Crown,
  User,
  Lock,
  Sparkles,
  RefreshCw,
  KeyRound,
  Zap,
  Grid,
  Map,
  Heart,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

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

  // Form Unisciti Stanza (Player)
  const [joinRoomId, setJoinRoomId] = useState<string>('');
  const [joinPassword, setJoinPassword] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [playerColor, setPlayerColor] = useState<string>('#3b82f6');

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

    const roomId = createRoomId.trim().toLowerCase();

    sessionStorage.setItem(`dnd_role_${roomId}`, 'MASTER');
    sessionStorage.setItem(`dnd_password_${roomId}`, createPassword);
    sessionStorage.setItem(`dnd_name_${roomId}`, masterName);

    router.push(`/room/${roomId}?role=MASTER&password=${encodeURIComponent(createPassword)}`);
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

    router.push(
      `/room/${roomId}?role=PLAYER&password=${encodeURIComponent(joinPassword)}&name=${encodeURIComponent(
        playerName
      )}&color=${encodeURIComponent(playerColor)}`
    );
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8 relative overflow-hidden bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      {/* Dynamic Radial Ambient Lights */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-xl my-auto z-10 flex flex-col items-center">
        {/* Header Title */}
        <div className="text-center mb-8">
          <Badge variant="default" className="mb-4 px-3.5 py-1.5 gap-2 text-xs font-semibold shadow-gold-glow animate-pulse">
            <Sparkles size={16} className="text-amber-400" />
            <span>D&D Real-Time Battlespace v0.1</span>
          </Badge>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight rpg-font mb-3 drop-shadow-md">
            Map Manager <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">D&D</span>
          </h1>

          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Organizza i tuoi combattimenti tattici in tempo reale: disegna mappe, posiziona mostri e muovi i token dei giocatori istantaneamente.
          </p>
        </div>

        {/* Card Form Principale ShadCN */}
        <Card className="w-full border-amber-500/30 p-2 sm:p-4 shadow-2xl">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-center text-lg text-slate-200">Accedi alla Sessione di Gioco</CardTitle>
            <CardDescription className="text-center text-slate-400">
              Scegli se creare una nuova stanza come Dungeon Master o unirti come Giocatore.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 pt-2">
            {/* Tabs ShadCN */}
            <Tabs defaultValue="create" value={activeTab} onValueChange={(val) => { setActiveTab(val); setErrorMsg(''); }}>
              <TabsList className="mb-6 h-13">
                <TabsTrigger value="create">
                  <Crown size={18} className={activeTab === 'create' ? 'text-amber-400' : ''} />
                  <span>Crea Stanza (Master)</span>
                </TabsTrigger>
                <TabsTrigger value="join">
                  <User size={18} className={activeTab === 'join' ? 'text-blue-400' : ''} />
                  <span>Unisciti (Giocatore)</span>
                </TabsTrigger>
              </TabsList>

              {/* Alert Errore */}
              {errorMsg && (
                <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs sm:text-sm flex items-center gap-2.5">
                  <Lock size={18} className="text-red-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* TAB 1: CREA STANZA (MASTER) */}
              <TabsContent value="create" className="mt-0">
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Codice / Nome Stanza
                    </label>
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
                        className="whitespace-nowrap text-xs gap-1.5 shrink-0 h-10 px-3"
                        title="Genera Codice Casuale"
                      >
                        <RefreshCw size={16} className="text-amber-400" />
                        <span>Casuale</span>
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound size={16} className="text-amber-400" />
                      <span>Password di Accesso per i Giocatori</span>
                    </label>
                    <Input
                      type="password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Imposta una password segreta"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Nome Dungeon Master
                    </label>
                    <Input
                      type="text"
                      value={masterName}
                      onChange={(e) => setMasterName(e.target.value)}
                      placeholder="Dungeon Master"
                    />
                  </div>

                  <Button type="submit" variant="rpgGold" className="w-full mt-4 py-3.5 text-sm gap-2">
                    <Crown size={20} />
                    <span>Avvia Stanza come Master</span>
                  </Button>
                </form>
              </TabsContent>

              {/* TAB 2: UNISCITI (PLAYER) */}
              <TabsContent value="join" className="mt-0">
                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Codice Stanza
                    </label>
                    <Input
                      type="text"
                      value={joinRoomId}
                      onChange={(e) => setJoinRoomId(e.target.value)}
                      placeholder="Es. campagna-draghi"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound size={16} className="text-amber-400" />
                      <span>Password Stanza</span>
                    </label>
                    <Input
                      type="password"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      placeholder="Password fornita dal Master"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Nome del tuo Personaggio
                    </label>
                    <Input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Es. Valeros il Guerriero"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Colore Token Personaggio
                    </label>
                    <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setPlayerColor(c)}
                          className={`w-9 h-9 rounded-full transition-all duration-200 border-2 flex items-center justify-center ${
                            playerColor === c
                              ? 'scale-110 border-amber-400 shadow-md shadow-amber-500/20'
                              : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c }}
                        >
                          {playerColor === c && <Check size={16} className="text-white drop-shadow" />}
                        </button>
                      ))}
                      <input
                        type="color"
                        value={playerColor}
                        onChange={(e) => setPlayerColor(e.target.value)}
                        className="w-9 h-9 rounded-full border-none bg-transparent cursor-pointer hover:scale-105 transition-transform"
                        title="Colore Personalizzato"
                      />
                    </div>
                  </div>

                  <Button type="submit" variant="rpgBlue" className="w-full mt-4 py-3.5 text-sm gap-2">
                    <Shield size={20} />
                    <span>Entra nel Campo di Battaglia</span>
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 w-full">
          <Card className="p-3.5 text-center flex flex-col items-center justify-center border-white/5 hover:border-amber-500/30 transition-colors bg-slate-950/60">
            <Zap size={22} className="text-amber-400 mb-2" />
            <span className="text-xs font-semibold text-slate-200">Sync Real-Time</span>
            <span className="text-[10px] text-slate-400">WebSocket ultra-veloce</span>
          </Card>

          <Card className="p-3.5 text-center flex flex-col items-center justify-center border-white/5 hover:border-amber-500/30 transition-colors bg-slate-950/60">
            <Grid size={22} className="text-blue-400 mb-2" />
            <span className="text-xs font-semibold text-slate-200">Griglia Tattica</span>
            <span className="text-[10px] text-slate-400">Snap magnetico a quadretti</span>
          </Card>

          <Card className="p-3.5 text-center flex flex-col items-center justify-center border-white/5 hover:border-amber-500/30 transition-colors bg-slate-950/60">
            <Map size={22} className="text-emerald-400 mb-2" />
            <span className="text-xs font-semibold text-slate-200">Mappe Custom</span>
            <span className="text-[10px] text-slate-400">Upload JPG/PNG o link</span>
          </Card>

          <Card className="p-3.5 text-center flex flex-col items-center justify-center border-white/5 hover:border-amber-500/30 transition-colors bg-slate-950/60">
            <Heart size={22} className="text-red-400 mb-2" />
            <span className="text-xs font-semibold text-slate-200">Token & HP</span>
            <span className="text-[10px] text-slate-400">Gestione mostri e PG</span>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="z-10 text-center text-xs text-slate-500 mt-6">
        D&D Map Manager &copy; {new Date().getFullYear()} &bull; Real-Time Battlespace powered by ShadCN UI
      </footer>
    </main>
  );
}


