'use client';

import React, { useRef, useState } from 'react';
import {
  MousePointer,
  Hand,
  Pencil,
  Eraser,
  Image as ImageIcon,
  PlusCircle,
  Trash2,
  Grid,
  Upload,
  Sparkles,
  Square,
  Circle,
  ChevronDown,
  Ruler,
  Camera,
  CloudFog,
  ScrollText,
  Eye,
  EyeOff,
} from 'lucide-react';

import { RoomState } from '@/lib/types';
import { Socket } from 'socket.io-client';
import { resizeImageFile } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

interface MasterToolbarProps {
  room: RoomState;
  socket: Socket | null;
  activeTool: 'select' | 'pan' | 'brush' | 'eraser' | 'shape' | 'fog-reveal' | 'fog-hide';
  setActiveTool: (tool: 'select' | 'pan' | 'brush' | 'eraser' | 'shape' | 'fog-reveal' | 'fog-hide') => void;
  activeShape: 'rectangle' | 'circle';
  setActiveShape: (shape: 'rectangle' | 'circle') => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushWidth: number;
  setBrushWidth: (width: number) => void;
}

export default function MasterToolbar({
  room,
  socket,
  activeTool,
  setActiveTool,
  activeShape,
  setActiveShape,
  brushColor,
  setBrushColor,
  brushWidth,
  setBrushWidth,
}: MasterToolbarProps) {
  const [showNpcModal, setShowNpcModal] = useState<boolean>(false);
  const [showMapModal, setShowMapModal] = useState<boolean>(false);

  // Form NPC State
  const [npcName, setNpcName] = useState<string>('Goblin');
  const [npcColor, setNpcColor] = useState<string>('#ef4444');
  const [npcHp, setNpcHp] = useState<number>(12);
  const [npcAvatarUrl, setNpcAvatarUrl] = useState<string>('');
  const [npcHidden, setNpcHidden] = useState<boolean>(false);

  // Form Mappa Sfondo State
  const [mapUrl, setMapUrl] = useState<string>('');

  // Caricamento Immagine Avatar per NPC
  const handleNpcAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 350);
      setNpcAvatarUrl(dataUrl);
    } catch (err) {
      console.error('Error uploading NPC avatar:', err);
    }
  };

  // Aggiunta NPC
  const handleAddNpc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;

    socket.emit('add-token', {
      roomId: room.id,
      tokenData: {
        name: npcName || 'NPC',
        type: 'npc',
        color: npcColor,
        avatarUrl: npcAvatarUrl || null,
        hp: npcHp,
        maxHp: npcHp,
        size: room.gridSize * 0.8,
        hidden: npcHidden,
      },
    });

    setShowNpcModal(false);
    setNpcName('');
    setNpcAvatarUrl('');
  };

  // Handout: immagine mostrata a schermo intero a tutti i giocatori
  const handoutInputRef = useRef<HTMLInputElement | null>(null);
  const handleHandoutUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // così si può rimostrare lo stesso file
    if (!file || !socket) return;

    try {
      const imageUrl = await resizeImageFile(file, 1600);
      if (imageUrl.length > 9_500_000) {
        alert("L'immagine è troppo pesante anche dopo il ridimensionamento. Prova con un'immagine più piccola.");
        return;
      }
      const title = prompt("Titolo dell'handout (facoltativo):", file.name.replace(/\.[^.]+$/, ''));
      if (title === null) return; // annullato
      socket.emit('show-handout', { imageUrl, title });
    } catch (err) {
      console.error('Error uploading handout:', err);
      alert('Impossibile leggere questa immagine.');
    }
  };

  // Caricamento File Mappa Locale JPG/PNG
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    try {
      // Ridimensiona in JPEG: il server accetta al massimo 10MB per messaggio, oltre chiude la connessione
      const dataUrl = await resizeImageFile(file, 4096, false);
      if (dataUrl.length > 9_500_000) {
        alert('La mappa è troppo pesante anche dopo il ridimensionamento. Prova con un\'immagine più piccola.');
        return;
      }
      socket.emit('update-background', {
        roomId: room.id,
        backgroundUrl: dataUrl,
      });
      setShowMapModal(false);
    } catch (err) {
      console.error('Error uploading map:', err);
      alert('Impossibile leggere questa immagine.');
    }
  };

  // Caricamento via URL
  const handleUrlUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapUrl || !socket) return;
    socket.emit('update-background', {
      roomId: room.id,
      backgroundUrl: mapUrl,
    });
    setShowMapModal(false);
    setMapUrl('');
  };

  // Reset a Sfondo Bianco
  const handleResetBackground = () => {
    if (!socket) return;
    socket.emit('update-background', {
      roomId: room.id,
      backgroundUrl: null,
    });
    setShowMapModal(false);
  };

  // Pulisci Disegni
  const handleClearDrawings = () => {
    if (confirm('Sei sicuro di voler cancellare tutti i disegni dal foglio?') && socket) {
      socket.emit('clear-canvas', { roomId: room.id });
    }
  };

  // Toggle Griglia e Snap
  const handleToggleGrid = () => {
    if (!socket) return;
    socket.emit('update-grid', {
      roomId: room.id,
      gridVisible: !room.gridVisible,
    });
  };

  const fog = room.fog ?? { enabled: false, areas: [] };
  const isFogTool = activeTool === 'fog-reveal' || activeTool === 'fog-hide';

  // Accendendo la nebbia si passa subito allo strumento per rivelare; spegnendola si torna a selezionare
  const handleToggleFog = () => {
    socket?.emit('update-fog', { enabled: !fog.enabled });
    setActiveTool(fog.enabled ? 'select' : 'fog-reveal');
  };

  const handleCoverAll = () => {
    if (confirm('Ricoprire di nebbia tutta la mappa?')) socket?.emit('update-fog', { reset: true });
  };

  const fogItemClass = (on: boolean) =>
    `justify-start gap-2 text-xs h-8 ${
      on ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-200 hover:bg-slate-800'
    }`;

  return (
    <TooltipProvider>
      {/* BARRA DEGLI STRUMENTI DEL MASTER (ShadCN UI + Tooltips) */}
      <div className="toolbar-floating glass-panel border border-amber-500/30 shadow-2xl backdrop-blur-md">
        <div className="toolbar-group">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className={activeTool === 'select' ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30' : ''}
                onClick={() => setActiveTool('select')}
              >
                <MousePointer size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Seleziona e Muovi Token</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className={activeTool === 'pan' ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30' : ''}
                onClick={() => setActiveTool('pan')}
              >
                <Hand size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sposta Vista Mappa (Pan)</TooltipContent>
          </Tooltip>
        </div>

        <div className="toolbar-divider" />

        {/* Strumenti di Disegno */}
        <div className="toolbar-group">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className={activeTool === 'brush' ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30' : ''}
                onClick={() => setActiveTool('brush')}
              >
                <Pencil size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Disegna Mappa a Mano Libera</TooltipContent>
          </Tooltip>

          {/* Dropdown Forme Geometriche (Rettangolo e Cerchio) */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="icon"
                    className={`gap-1 px-2.5 w-auto ${
                      activeTool === 'shape'
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30'
                        : ''
                    }`}
                  >
                    {activeShape === 'rectangle' ? (
                      <Square size={19} />
                    ) : (
                      <Circle size={19} />
                    )}
                    <ChevronDown size={13} className="opacity-70" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Disegna Forme Geometriche</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-44 p-1.5 bg-slate-900/95 border-amber-500/30 backdrop-blur-xl shadow-2xl flex flex-col gap-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                Forme Geometriche
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={`justify-start gap-2 text-xs h-8 ${
                  activeTool === 'shape' && activeShape === 'rectangle'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
                onClick={() => {
                  setActiveShape('rectangle');
                  setActiveTool('shape');
                }}
              >
                <Square size={16} className="text-amber-400" />
                <span>Rettangolo</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`justify-start gap-2 text-xs h-8 ${
                  activeTool === 'shape' && activeShape === 'circle'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
                onClick={() => {
                  setActiveShape('circle');
                  setActiveTool('shape');
                }}
              >
                <Circle size={16} className="text-amber-400" />
                <span>Cerchio</span>
              </Button>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className={activeTool === 'eraser' ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30' : ''}
                onClick={() => setActiveTool('eraser')}
              >
                <Eraser size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Gomma da Cancellare</TooltipContent>
          </Tooltip>

          {/* Selettore Colore */}
          <div className="relative flex items-center justify-center p-1 rounded-xl bg-slate-900/60 border border-white/10 hover:border-amber-400 transition-colors">
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-none bg-transparent"
              title="Colore Pennello"
            />
          </div>

          {/* Spessore Tratto */}
          <select
            value={brushWidth}
            onChange={(e) => setBrushWidth(Number(e.target.value))}
            className="h-11 px-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs font-semibold text-slate-200 cursor-pointer outline-none hover:border-amber-400"
            title="Spessore Pennello"
          >
            <option value={2}>Sottile</option>
            <option value={5}>Medio</option>
            <option value={10}>Spesso</option>
            <option value={20}>Muro</option>
          </select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className="hover:bg-red-500/20 hover:border-red-500/40 text-red-400"
                onClick={handleClearDrawings}
              >
                <Trash2 size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cancella tutti i disegni</TooltipContent>
          </Tooltip>
        </div>

        <div className="toolbar-divider" />

        {/* Gestione Mappa & NPC */}
        <div className="toolbar-group">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className="hover:border-amber-400 hover:text-amber-400"
                onClick={() => setShowMapModal(true)}
              >
                <ImageIcon size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Carica Mappa di Sfondo (JPG/PNG)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className="hover:border-amber-400 text-amber-400"
                onClick={() => setShowNpcModal(true)}
              >
                <PlusCircle size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Evoca Nuovo NPC / Mostro</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className="hover:border-amber-400 hover:text-amber-400"
                onClick={() => handoutInputRef.current?.click()}
              >
                <ScrollText size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mostra un Handout a tutti (lettera, ritratto, oggetto)</TooltipContent>
          </Tooltip>
          <input ref={handoutInputRef} type="file" accept="image/*" onChange={handleHandoutUpload} className="hidden" />
        </div>

        <div className="toolbar-divider" />

        {/* Nebbia di guerra */}
        <div className="toolbar-group">
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="icon"
                    className={`gap-1 px-2.5 w-auto ${
                      isFogTool ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30' : fog.enabled ? 'text-amber-400' : ''
                    }`}
                  >
                    <CloudFog size={19} />
                    <ChevronDown size={13} className="opacity-70" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Nebbia di Guerra</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-56 p-1.5 bg-slate-900/95 border-amber-500/30 backdrop-blur-xl shadow-2xl flex flex-col gap-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                Nebbia di Guerra
              </div>
              <Button variant="ghost" size="sm" className={fogItemClass(fog.enabled)} onClick={handleToggleFog}>
                <CloudFog size={16} className="text-amber-400" />
                <span>{fog.enabled ? 'Attiva (clic per spegnere)' : 'Spenta (clic per attivare)'}</span>
              </Button>
              {fog.enabled && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={fogItemClass(activeTool === 'fog-reveal')}
                    onClick={() => setActiveTool('fog-reveal')}
                  >
                    <Eye size={16} className="text-amber-400" />
                    <span>Rivela area</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={fogItemClass(activeTool === 'fog-hide')}
                    onClick={() => setActiveTool('fog-hide')}
                  >
                    <EyeOff size={16} className="text-amber-400" />
                    <span>Ricopri area</span>
                  </Button>
                  <Button variant="ghost" size="sm" className={fogItemClass(false)} onClick={handleCoverAll}>
                    <Trash2 size={16} className="text-red-400" />
                    <span>Ricopri tutta la mappa</span>
                  </Button>
                  <p className="px-2 py-1 text-[10px] text-slate-400 leading-snug">
                    Trascina sulla mappa per scegliere i quadretti. Gli NPC sotto la nebbia sono invisibili ai giocatori.
                  </p>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="toolbar-divider" />

        {/* Grid & Snap & Scale Controls */}
        <div className="toolbar-group">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                className={room.gridVisible ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/30' : ''}
                onClick={handleToggleGrid}
              >
                <Grid size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mostra/Nascondi Griglia</TooltipContent>
          </Tooltip>

          {/* Impostazione Metri per Quadrato (Scala Griglia) */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="icon" className="gap-1 px-2 w-auto">
                    <Ruler size={19} className="text-amber-400" />
                    <span className="text-[11px] font-bold text-slate-200">{room.gridScale || 1}m</span>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Imposta Scala Griglia (Metri per quadrato)</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-52 p-2 bg-slate-900/95 border-amber-500/30 backdrop-blur-xl shadow-2xl flex flex-col gap-2 text-xs">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Scala Griglia (Metri / Quadrato)
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[0.5, 1, 1.5, 2, 3, 5].map((scale) => (
                  <Button
                    key={scale}
                    variant="ghost"
                    size="sm"
                    className={`h-7 text-xs ${
                      (room.gridScale || 1) === scale
                        ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => {
                      if (socket) {
                        socket.emit('update-grid', {
                          roomId: room.id,
                          gridScale: scale,
                        });
                      }
                    }}
                  >
                    {scale}m
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

      </div>

      {/* MODALE AGGIUNTA NPC SHADCN DIALOG */}
      <Dialog open={showNpcModal} onOpenChange={setShowNpcModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Sparkles size={22} className="text-amber-400" />
              <span>Evoca Nuovo NPC / Mostro</span>
            </DialogTitle>
            <DialogDescription>
              Crea un nuovo token controllato dal Master e posizionalo sul campo di battaglia.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddNpc} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Nome Personaggio / Mostro
              </label>
              <Input
                type="text"
                value={npcName}
                onChange={(e) => setNpcName(e.target.value)}
                placeholder="Es. Goblin Arciere, Drago Rosso"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Punti Vita (HP)
                </label>
                <Input
                  type="number"
                  value={npcHp}
                  onChange={(e) => setNpcHp(Number(e.target.value))}
                  min={1}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Colore Token
                </label>
                <div className="flex items-center gap-2.5 bg-slate-900/60 p-2 rounded-xl border border-slate-800 h-10">
                  <input
                    type="color"
                    value={npcColor}
                    onChange={(e) => setNpcColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-none bg-transparent"
                  />
                  <span className="text-xs font-mono font-semibold text-slate-300">{npcColor}</span>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={npcHidden}
                onChange={(e) => setNpcHidden(e.target.checked)}
                className="accent-amber-400"
              />
              Nascosto ai giocatori (lo mostri tu quando entra in scena)
            </label>

            {/* Immagine Pedina NPC (Opzionale) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Immagine Pedina / Avatar (Opzionale)
              </label>
              <div className="flex items-center gap-3 bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                {npcAvatarUrl ? (
                  <img
                    src={npcAvatarUrl}
                    alt="NPC Avatar"
                    className="w-10 h-10 rounded-lg object-contain bg-slate-900/80 border border-amber-400/50 shrink-0"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border border-white/20 shrink-0"
                    style={{ backgroundColor: npcColor }}
                  >
                    {npcName[0]?.toUpperCase() || 'N'}
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleNpcAvatarUpload}
                    className="hidden"
                    id="npc-avatar-file-input"
                  />
                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" asChild className="h-7 text-xs flex-1">
                      <label htmlFor="npc-avatar-file-input" className="cursor-pointer gap-1 justify-center">
                        <Upload size={12} />
                        <span>Carica Foto</span>
                      </label>
                    </Button>
                    {npcAvatarUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNpcAvatarUrl('')}
                        className="h-7 text-xs text-red-400 hover:text-red-300 px-2"
                      >
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" variant="rpgGold" className="w-full mt-4 text-sm">
              Aggiungi Token NPC alla Mappa
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODALE CARICAMENTO MAPPA SHADCN DIALOG */}
      <Dialog open={showMapModal} onOpenChange={setShowMapModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <ImageIcon size={22} className="text-amber-400" />
              <span>Sfondo Mappa di Gioco</span>
            </DialogTitle>
            <DialogDescription>
              Carica un'immagine per la mappa di sfondo oppure specifica un link URL.
            </DialogDescription>
          </DialogHeader>

          {/* Opzione 1: Upload File Locale JPG/PNG */}
          <div className="mt-2 p-5 rounded-xl bg-slate-900/60 border-2 border-dashed border-amber-500/40 text-center hover:border-amber-400 transition-colors">
            <Upload size={30} className="mx-auto mb-2 text-amber-400 animate-bounce" />
            <p className="text-sm font-semibold text-slate-200 mb-1">Carica Mappa dal PC</p>
            <p className="text-xs text-slate-400 mb-3">Formati supportati: JPG, PNG, WEBP</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileUpload}
              className="hidden"
              id="map-file-input"
            />
            <Button variant="secondary" asChild className="text-xs">
              <label htmlFor="map-file-input" className="cursor-pointer">
                Seleziona File Immagine
              </label>
            </Button>
          </div>

          {/* Opzione 2: Caricamento via Link URL */}
          <form onSubmit={handleUrlUpload} className="space-y-3 mt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Oppure Inserisci URL Immagine Mappa
              </label>
              <Input
                type="url"
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                placeholder="https://example.com/dungeon_map.jpg"
              />
            </div>
            <Button type="submit" variant="rpgGold" className="w-full text-xs">
              Imposta da URL
            </Button>
          </form>

          {/* Pulsante Reset a Foglio Bianco */}
          <Button
            type="button"
            variant="secondary"
            onClick={handleResetBackground}
            className="w-full text-xs mt-2"
          >
            Ripristina Foglio Bianco Predefinito
          </Button>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}


