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
  Ruler,
  CloudFog,
  ScrollText,
  Triangle,
  CircleDot,
  MoveRight,
  Layers,
  Sun,
  Eye,
  EyeOff,
  Bomb,
} from 'lucide-react';

import { MapFeatureKind, RoomState } from '@/lib/types';
import { Socket } from 'socket.io-client';
import { cn, resizeImageFile, FEATURES } from '@/lib/utils';
import type { MeasureKind } from '@/lib/measure';
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

const MEASURE_TOOLS: { kind: MeasureKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'ruler', label: 'Righello', icon: <Ruler size={18} /> },
  { kind: 'sphere', label: 'Sfera', icon: <CircleDot size={18} /> },
  { kind: 'cone', label: 'Cono', icon: <Triangle size={18} /> },
  { kind: 'line', label: 'Linea', icon: <MoveRight size={18} /> },
];

const BRUSH_COLORS = ['#1e293b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff'];
const BRUSH_WIDTHS = [
  { width: 2, label: 'Sottile' },
  { width: 5, label: 'Medio' },
  { width: 10, label: 'Spesso' },
  { width: 20, label: 'Muro' },
];

// Pulsante della barra: icona con l'etichetta sotto, leggibile anche da telefono dove i tooltip non ci sono.
// active undefined = pulsante semplice (non interruttore). forwardRef: serve come PopoverTrigger asChild.
const ToolButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; label: string; active?: boolean; danger?: boolean }
>(({ icon, label, active, danger = false, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-pressed={active}
    className={cn(
      'flex flex-col items-center justify-center gap-1 min-w-[58px] h-[52px] px-2 rounded-xl border shrink-0 transition-colors',
      active
        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30'
        : danger
          ? 'text-red-400 border-transparent hover:bg-red-500/15'
          : 'text-slate-300 border-transparent hover:bg-slate-800 hover:text-amber-300',
      className
    )}
    {...props}
  >
    {icon}
    <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{label}</span>
  </button>
));
ToolButton.displayName = 'ToolButton';

// Gruppo di pulsanti col suo nome sopra (nascosto su telefono per risparmiare spazio)
function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <span className="hidden sm:block text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

const Divider = () => <div className="w-px self-stretch my-1 bg-white/10 shrink-0" />;

interface MasterToolbarProps {
  room: RoomState;
  socket: Socket | null;
  activeTool: 'select' | 'pan' | 'brush' | 'eraser' | 'shape' | 'fog-reveal' | 'fog-hide' | 'measure' | 'feature';
  setActiveTool: (tool: 'select' | 'pan' | 'brush' | 'eraser' | 'shape' | 'fog-reveal' | 'fog-hide' | 'measure' | 'feature') => void;
  measureKind: MeasureKind;
  setMeasureKind: (kind: MeasureKind) => void;
  featureKind: MapFeatureKind;
  setFeatureKind: (kind: MapFeatureKind) => void;
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
  measureKind,
  setMeasureKind,
  featureKind,
  setFeatureKind,
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

  const handleCoverAll = () => {
    if (confirm('Ricoprire di nebbia tutta la mappa?')) socket?.emit('update-fog', { reset: true });
  };

  // Scene: gli errori del server (es. combattimento in corso) arrivano come avviso
  const sceneAction = (event: string, data: object) =>
    socket?.emit(event, data, (res: { success: boolean; error?: string }) => {
      if (!res?.success) alert(res?.error || 'Operazione non riuscita.');
    });

  const handleNewScene = () => {
    const name = prompt('Nome della nuova scena (es. Taverna, Dungeon). Parte da un foglio bianco:');
    if (name !== null) sceneAction('create-scene', { name });
  };

  const isDrawTool = activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'shape';

  // Nebbia: il primo clic la accende e passa a "Rivela"; se è già accesa riprende a rivelare
  const handleFogMode = () => {
    if (!fog.enabled) socket?.emit('update-fog', { enabled: true });
    setActiveTool('fog-reveal');
  };

  const handleFogOff = () => {
    socket?.emit('update-fog', { enabled: false });
    setActiveTool('select');
  };

  return (
    <>
      {/* BARRA DEL MASTER: in basso al centro. Sopra compare la sottobarra con le opzioni di Disegno o Nebbia */}
      <div className="absolute bottom-20 sm:bottom-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 max-w-[calc(100vw-1rem)]">
        {isDrawTool && (
          <div className="glass-panel flex items-center gap-1.5 px-2 py-1.5 max-w-full overflow-x-auto">
            <ToolButton icon={<Pencil size={18} />} label="Pennello" active={activeTool === 'brush'} onClick={() => setActiveTool('brush')} />
            <ToolButton
              icon={<Square size={18} />}
              label="Rettangolo"
              active={activeTool === 'shape' && activeShape === 'rectangle'}
              onClick={() => {
                setActiveShape('rectangle');
                setActiveTool('shape');
              }}
            />
            <ToolButton
              icon={<Circle size={18} />}
              label="Cerchio"
              active={activeTool === 'shape' && activeShape === 'circle'}
              onClick={() => {
                setActiveShape('circle');
                setActiveTool('shape');
              }}
            />
            <ToolButton icon={<Eraser size={18} />} label="Gomma" active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} />

            <Divider />

            {/* Colore: tinte rapide più un selettore libero */}
            <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Colore">
              {BRUSH_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Colore ${color}`}
                  aria-pressed={brushColor === color}
                  onClick={() => setBrushColor(color)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    brushColor === color ? 'border-amber-300 scale-110' : 'border-white/20 hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-none bg-transparent"
                title="Altro colore"
              />
            </div>

            <Divider />

            {/* Spessore del tratto */}
            <div className="flex items-center rounded-lg bg-slate-950/60 border border-white/10 p-0.5 shrink-0" role="group" aria-label="Spessore">
              {BRUSH_WIDTHS.map(({ width, label }) => (
                <button
                  key={width}
                  type="button"
                  aria-pressed={brushWidth === width}
                  onClick={() => setBrushWidth(width)}
                  className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${
                    brushWidth === width ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Divider />

            <ToolButton icon={<Trash2 size={18} />} label="Cancella tutto" danger onClick={handleClearDrawings} />
          </div>
        )}

        {activeTool === 'measure' && (
          <div className="glass-panel flex items-center gap-1.5 px-2 py-1.5 max-w-full overflow-x-auto">
            {MEASURE_TOOLS.map(({ kind, label, icon }) => (
              <ToolButton
                key={kind}
                icon={icon}
                label={label}
                active={measureKind === kind}
                onClick={() => setMeasureKind(kind)}
              />
            ))}
            <span className="hidden md:block max-w-[220px] px-2 text-[11px] leading-snug text-slate-400">
              Trascina sulla mappa: tutti vedono la misura. Un clic senza trascinare la toglie.
            </span>
          </div>
        )}

        {activeTool === 'feature' && (
          <div className="glass-panel flex items-center gap-1.5 px-2 py-1.5 max-w-full overflow-x-auto">
            {(Object.keys(FEATURES) as MapFeatureKind[]).map((kind) => (
              <ToolButton
                key={kind}
                icon={<span className="text-lg leading-[18px]">{FEATURES[kind].icon}</span>}
                label={FEATURES[kind].label}
                active={featureKind === kind}
                onClick={() => setFeatureKind(kind)}
              />
            ))}
            <span className="hidden md:block max-w-[240px] px-2 text-[11px] leading-snug text-slate-400">
              Tocca un quadretto per piazzarlo, o uno già piazzato per riarmarlo o eliminarlo. {FEATURES[featureKind].hint}
            </span>
          </div>
        )}

        {isFogTool && (
          <div className="glass-panel flex items-center gap-1.5 px-2 py-1.5 max-w-full overflow-x-auto">
            <ToolButton icon={<Eye size={18} />} label="Rivela" active={activeTool === 'fog-reveal'} onClick={() => setActiveTool('fog-reveal')} />
            <ToolButton icon={<EyeOff size={18} />} label="Ricopri" active={activeTool === 'fog-hide'} onClick={() => setActiveTool('fog-hide')} />
            <span className="hidden md:block max-w-[220px] px-2 text-[11px] leading-snug text-slate-400">
              Trascina sulla mappa per scegliere i quadretti. Gli NPC sotto la nebbia sono invisibili ai giocatori.
            </span>
            <Divider />
            <ToolButton icon={<CloudFog size={18} />} label="Ricopri tutto" onClick={handleCoverAll} />
            <ToolButton icon={<Sun size={18} />} label="Spegni nebbia" danger onClick={handleFogOff} />
          </div>
        )}

        <div className="glass-panel flex items-end gap-1 px-2 py-1.5 max-w-full overflow-x-auto">
          <ToolGroup label="Vista">
            <ToolButton icon={<MousePointer size={20} />} label="Seleziona" active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
            <ToolButton icon={<Hand size={20} />} label="Sposta" active={activeTool === 'pan'} onClick={() => setActiveTool('pan')} />
          </ToolGroup>

          <Divider />

          <ToolGroup label="Strumenti">
            <ToolButton
              icon={<Pencil size={20} />}
              label="Disegna"
              active={isDrawTool}
              onClick={() => !isDrawTool && setActiveTool('brush')}
            />
            <ToolButton
              icon={<CloudFog size={20} />}
              label={fog.enabled ? 'Nebbia ●' : 'Nebbia'}
              active={isFogTool}
              onClick={handleFogMode}
              title={fog.enabled ? 'La nebbia è attiva: clic per rivelare o ricoprire' : 'Avvolgi la mappa nella nebbia di guerra'}
            />
            <ToolButton
              icon={<Ruler size={20} />}
              label="Misura"
              active={activeTool === 'measure'}
              onClick={() => setActiveTool('measure')}
              title="Righello e aree d'effetto degli incantesimi"
            />
            <ToolButton
              icon={<Bomb size={20} />}
              label="Trappole"
              active={activeTool === 'feature'}
              onClick={() => setActiveTool('feature')}
              title="Trappole, inneschi e forzieri che scattano quando un giocatore ci passa sopra"
            />
          </ToolGroup>

          <Divider />

          <ToolGroup label="Scena">
            <ToolButton icon={<ImageIcon size={20} />} label="Mappa" onClick={() => setShowMapModal(true)} title="Carica la mappa di sfondo" />
            <ToolButton icon={<PlusCircle size={20} />} label="NPC" onClick={() => setShowNpcModal(true)} title="Evoca un nuovo NPC o mostro" />
            <ToolButton
              icon={<ScrollText size={20} />}
              label="Handout"
              onClick={() => handoutInputRef.current?.click()}
              title="Mostra a tutti un'immagine: lettera, ritratto, oggetto"
            />
            <input ref={handoutInputRef} type="file" accept="image/*" onChange={handleHandoutUpload} className="hidden" />

            <Popover>
              <PopoverTrigger asChild>
                <ToolButton icon={<Layers size={20} />} label="Scene" title="Prepara più mappe e passa dall'una all'altra" />
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1.5 bg-slate-900/95 border-amber-500/30 backdrop-blur-xl shadow-2xl flex flex-col gap-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Scene della campagna
                </div>
                {(room.scenes ?? []).map((scene) => {
                  const current = scene.id === room.activeSceneId;
                  return (
                    <div key={scene.id} className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-current={current}
                        className={`flex-1 min-w-0 justify-start gap-2 text-xs h-8 ${
                          current
                            ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                            : 'text-slate-200 hover:bg-slate-800'
                        }`}
                        onClick={() => !current && sceneAction('switch-scene', { sceneId: scene.id })}
                      >
                        <span className="truncate">{scene.name}</span>
                        {current && <span className="ml-auto text-[10px] font-semibold opacity-80">in corso</span>}
                      </Button>
                      {!current && (
                        <button
                          type="button"
                          aria-label={`Elimina la scena ${scene.name}`}
                          title="Elimina scena"
                          onClick={() =>
                            confirm(`Eliminare la scena "${scene.name}" con la sua mappa e i suoi NPC?`) &&
                            sceneAction('delete-scene', { sceneId: scene.id })
                          }
                          className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start gap-2 text-xs h-8 text-amber-300 hover:bg-slate-800"
                  onClick={handleNewScene}
                >
                  <PlusCircle size={14} /> Nuova scena
                </Button>
                <p className="px-2 py-1 text-[10px] text-slate-400 leading-snug">
                  Ogni scena ricorda mappa, disegni, nebbia e NPC. Le pedine dei giocatori passano da una scena all'altra.
                </p>
              </PopoverContent>
            </Popover>
          </ToolGroup>

          <Divider />

          <ToolGroup label="Griglia">
            <Popover>
              <PopoverTrigger asChild>
                <ToolButton icon={<Grid size={20} />} label={`${room.gridScale || 1} m`} title="Griglia e scala" />
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 bg-slate-900/95 border-amber-500/30 backdrop-blur-xl shadow-2xl flex flex-col gap-2 text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`justify-start gap-2 text-xs h-8 ${
                    room.gridVisible ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-200 hover:bg-slate-800'
                  }`}
                  onClick={handleToggleGrid}
                >
                  <Grid size={16} className="text-amber-400" />
                  <span>{room.gridVisible ? 'Griglia visibile' : 'Griglia nascosta'}</span>
                </Button>
                <div className="flex items-center gap-1.5 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <Ruler size={12} className="text-amber-400" /> Metri per quadretto
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
                      onClick={() => socket?.emit('update-grid', { roomId: room.id, gridScale: scale })}
                    >
                      {scale}m
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </ToolGroup>
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
    </>
  );
}


