'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { RoomState, Token, DrawingStroke, UserRole } from '@/lib/types';
import { Socket } from 'socket.io-client';
import { Plus, Minus, Maximize2, Heart, Shield, Skull, Check, Camera, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import { resizeImageFile } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MapCanvasProps {
  room: RoomState;
  role: UserRole;
  myTokenId?: string;
  socket: Socket | null;
  activeTool: 'select' | 'pan' | 'brush' | 'eraser' | 'shape';
  activeShape?: 'rectangle' | 'circle';
  brushColor: string;
  brushWidth: number;
  centerTokenTrigger?: number;
}

export default function MapCanvas({
  room,
  role,
  myTokenId,
  socket,
  activeTool,
  activeShape = 'rectangle',
  brushColor,
  brushWidth,
  centerTokenTrigger,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan e Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);

  // Effetto per centrare la vista sul proprio Token quando scatta il trigger
  useEffect(() => {
    if (centerTokenTrigger && myTokenId && canvasRef.current) {
      const myToken = room.tokens.find((t) => t.id === myTokenId);
      if (myToken) {
        const width = canvasRef.current.width || window.innerWidth;
        const height = canvasRef.current.height || window.innerHeight;
        setPan({
          x: width / 2 - myToken.x * zoom,
          y: height / 2 - myToken.y * zoom,
        });
      }
    }
  }, [centerTokenTrigger, myTokenId, room.tokens, zoom]);

  const startPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Stato per il trascinamento dei Token
  const [draggedTokenId, setDraggedTokenId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const localDragPosRef = useRef<{ x: number; y: number } | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mappa delle animazioni fluide di scorrimento ("trascinandosi") per ogni Token
  const animatingTokensRef = useRef<
    Map<
      string,
      { startX: number; startY: number; endX: number; endY: number; startTime: number; duration: number }
    >
  >(new Map());

  // Ascolto evento socket token-moved-animated per attivare l'animazione di scorrimento fluida per tutti i client
  useEffect(() => {
    if (!socket) return;

    const handleAnimatedMove = ({
      tokenId,
      startX,
      startY,
      endX,
      endY,
      duration = 450,
    }: {
      tokenId: string;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      duration?: number;
    }) => {
      animatingTokensRef.current.set(tokenId, {
        startX,
        startY,
        endX,
        endY,
        startTime: Date.now(),
        duration,
      });
    };

    socket.on('token-moved-animated', handleAnimatedMove);
    return () => {
      socket.off('token-moved-animated', handleAnimatedMove);
    };
  }, [socket]);



  // Stato Popover HP Token
  const [hpModalToken, setHpModalToken] = useState<Token | null>(null);
  const [inputHp, setInputHp] = useState<number>(10);
  const [inputMaxHp, setInputMaxHp] = useState<number>(10);

  // Stato per il Disegno a mano libera del Master
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);

  // Immagine di Sfondo caricata
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const avatarImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [bgLoaded, setBgLoaded] = useState<boolean>(false);

  // Caricamento Sfondo JPG/PNG quando cambia l'URL
  useEffect(() => {
    if (room.backgroundUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = room.backgroundUrl;
      img.onload = () => {
        bgImageRef.current = img;
        setBgLoaded((prev) => !prev);
      };
    } else {
      bgImageRef.current = null;
      setBgLoaded((prev) => !prev);
    }
  }, [room.backgroundUrl]);

  // Conversione dalle coordinate dello Schermo alle coordinate del World/Canvas
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const clientX = screenX - rect.left;
      const clientY = screenY - rect.top;

      const worldX = (clientX - pan.x) / zoom;
      const worldY = (clientY - pan.y) / zoom;
      return { x: worldX, y: worldY };
    },
    [pan, zoom]
  );

  // Render Loop sul Canvas HTML5
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ridimensiona il canvas al contenitore
    const width = canvas.width;
    const height = canvas.height;

    // Reset trasformazioni
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // SFONDO BASE: Foglio bianco pulito di default
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Applica trasformazioni di Pan & Zoom
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 1. LAYER SFONDO MAPPA CUSTOM (se caricata dal Master)
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0);
    }

    // 2. LAYER GRIGLIA TATTICA A QUADRETTI
    if (room.gridVisible && room.gridSize > 5) {
      const gridSize = room.gridSize;
      const startX = Math.floor(-pan.x / zoom / gridSize) * gridSize;
      const startY = Math.floor(-pan.y / zoom / gridSize) * gridSize;
      const endX = startX + (width / zoom) + gridSize * 2;
      const endY = startY + (height / zoom) + gridSize * 2;

      ctx.beginPath();
      ctx.strokeStyle = room.backgroundUrl ? 'rgba(0, 0, 0, 0.25)' : 'rgba(203, 213, 225, 0.8)';
      ctx.lineWidth = 1 / zoom;

      for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();
    }

    // 3. LAYER DISEGNO DEL MASTER (Tratti e Forme Geometriche salvate)
    room.drawings.forEach((stroke) => {
      if (stroke.points.length < 1) return;
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = stroke.width;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
      }

      if (stroke.shapeType === 'rectangle' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[1];
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      } else if (stroke.shapeType === 'circle' && stroke.points.length >= 2) {
        const center = stroke.points[0];
        const edge = stroke.points[1];
        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        if (stroke.points.length < 2) return;
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    });

    // Anteprima del tratto o della forma geometrica in corso di disegno dal Master
    if (isDrawing && currentStrokeRef.current.length >= 1) {
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (activeTool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = brushWidth * 1.5;
      } else {
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushWidth;
      }

      const pts = currentStrokeRef.current;
      if (activeTool === 'shape') {
        if (pts.length >= 2) {
          const start = pts[0];
          const end = pts[pts.length - 1];
          if (activeShape === 'rectangle') {
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
          } else if (activeShape === 'circle') {
            const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            ctx.beginPath();
            ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } else {
        if (pts.length > 1) {
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
      }
    }

    // 3.5 LAYER FEEDBACK VISIVO MOVIMENTO LOCALE (Solo per il controllore durante il drag)
    if (draggedTokenId && dragStartPosRef.current && localDragPosRef.current) {
      const startPos = dragStartPosRef.current;
      const currentDragPos = localDragPosRef.current;
      const gridSize = room.gridSize;

      const targetCol = Math.floor(currentDragPos.x / gridSize);
      const targetRow = Math.floor(currentDragPos.y / gridSize);

      // A. Evidenziazione del quadrato di destinazione della griglia
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)'; // Giallo ambra trasparente
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2 / zoom;
      ctx.fillRect(targetCol * gridSize, targetRow * gridSize, gridSize, gridSize);
      ctx.strokeRect(targetCol * gridSize, targetRow * gridSize, gridSize, gridSize);

      // B. Punto di partenza iniziale
      ctx.beginPath();
      ctx.arc(startPos.x, startPos.y, (gridSize * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      // C. Vettore di movimento tratteggiato dal centro iniziale al centro target
      ctx.beginPath();
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(currentDragPos.x, currentDragPos.y);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5 / zoom;
      ctx.stroke();
      ctx.setLineDash([]); // Reset tratteggio

      // D. HUD Calcolo Distanza in Metri e Quadretti
      const startCol = Math.floor(startPos.x / gridSize);
      const startRow = Math.floor(startPos.y / gridSize);
      const colDiff = Math.abs(targetCol - startCol);
      const rowDiff = Math.abs(targetRow - startRow);

      const gridSteps = Math.round(Math.hypot(colDiff, rowDiff));
      const metersMoved = Math.round(gridSteps * (room.gridScale || 1) * 10) / 10;

      const hudText = `📏 ${metersMoved}m (${gridSteps} ${gridSteps === 1 ? 'quadretto' : 'quadretti'})`;
      ctx.font = `bold ${Math.max(12, 13 / zoom)}px Outfit, sans-serif`;
      const textWidth = ctx.measureText(hudText).width;
      const padding = 6 / zoom;
      const hudX = currentDragPos.x;
      const hudY = currentDragPos.y - (gridSize * 0.7);

      // Sfondo Badge HUD
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(hudX - textWidth / 2 - padding, hudY - 11 / zoom, textWidth + padding * 2, 22 / zoom);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(hudX - textWidth / 2 - padding, hudY - 11 / zoom, textWidth + padding * 2, 22 / zoom);

      // Testo HUD
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hudText, hudX, hudY);
    }

    // 4. LAYER TOKEN (PLAYER & NPC)
    room.tokens.forEach((token) => {
      const radius = (token.size || room.gridSize * 0.8) / 2;
      const isMine = token.id === myTokenId;
      const isSelected = draggedTokenId === token.id;

      // Calcolo coordinate visive (animazione di scorrimento "trascinandosi" o drag locale)
      let renderX = token.x;
      let renderY = token.y;

      const anim = animatingTokensRef.current.get(token.id);
      if (anim) {
        const elapsed = Date.now() - anim.startTime;
        const progress = Math.min(1, elapsed / anim.duration);
        // Interpolazione Ease-Out Quad per movimento di scorrimento naturale
        const ease = 1 - (1 - progress) * (1 - progress);
        renderX = anim.startX + (anim.endX - anim.startX) * ease;
        renderY = anim.startY + (anim.endY - anim.startY) * ease;

        if (progress >= 1) {
          animatingTokensRef.current.delete(token.id);
        }
      } else if (isSelected && localDragPosRef.current) {
        renderX = localDragPosRef.current.x;
        renderY = localDragPosRef.current.y;
      }

      ctx.save();
      ctx.translate(renderX, renderY);


      // Ombra del Token
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 8 / zoom;
      ctx.shadowOffsetY = 3 / zoom;

      let hasAvatarImage = false;
      let imgDrawW = radius * 2;
      let imgDrawH = radius * 2;

      if (token.avatarUrl) {
        let cachedImg = avatarImageCacheRef.current.get(token.avatarUrl);
        if (!cachedImg) {
          cachedImg = new Image();
          cachedImg.crossOrigin = 'anonymous';
          cachedImg.src = token.avatarUrl;
          avatarImageCacheRef.current.set(token.avatarUrl, cachedImg);
        }
        if (cachedImg.complete && cachedImg.naturalWidth > 0) {
          hasAvatarImage = true;
          const imgW = cachedImg.naturalWidth;
          const imgH = cachedImg.naturalHeight;
          const maxDim = radius * 2.2; // Dimensione pedina
          if (imgW > imgH) {
            imgDrawW = maxDim;
            imgDrawH = maxDim * (imgH / imgW);
          } else {
            imgDrawH = maxDim;
            imgDrawW = maxDim * (imgW / imgH);
          }

          // Anello/Base di selezione o appartenenza sotto la pedina
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.lineWidth = isSelected || isMine ? 3 / zoom : 2 / zoom;
          ctx.strokeStyle = isSelected ? '#ffd700' : isMine ? '#3b82f6' : token.type === 'npc' ? '#ef4444' : '#ffffff';
          ctx.beginPath();
          ctx.ellipse(0, imgDrawH / 2 - 2 / zoom, imgDrawW / 2, Math.max(4 / zoom, imgDrawH / 5), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // Disegna l'immagine direttamente come pedina (senza ritaglio a cerchio)
          ctx.drawImage(cachedImg, -imgDrawW / 2, -imgDrawH / 2, imgDrawW, imgDrawH);
        }
      }

      if (!hasAvatarImage) {
        // Cerchio Token Base
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = token.color || '#3b82f6';
        ctx.fill();

        // Disattiva ombra per dettagli interni
        ctx.shadowColor = 'transparent';

        // Bordo del Cerchio (Oro se selezionato/mio, Rosso se NPC, Bianco di default)
        ctx.lineWidth = isSelected || isMine ? 3 / zoom : 2 / zoom;
        ctx.strokeStyle = isSelected ? '#ffd700' : isMine ? '#d4af37' : token.type === 'npc' ? '#ef4444' : '#ffffff';
        ctx.stroke();

        // Iniziali del Nome Token
        const initials = (token.name || 'T')
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(12, radius * 0.7)}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, 0, 0);
      }

      // Etichetta del Nome e HP sotto la pedina
      const canSeeHp = role === 'MASTER' || isMine;
      const hpDisplay = canSeeHp && token.hp !== undefined ? ` (${token.hp})` : '';
      const labelText = `${token.name}${hpDisplay}`;
      ctx.font = `bold ${Math.max(11, 12 / zoom)}px Outfit, sans-serif`;

      const textWidth = ctx.measureText(labelText).width;
      const padding = 4 / zoom;
      const labelYOffset = (hasAvatarImage ? imgDrawH / 2 : radius) + (4 / zoom);

      // Sfondo etichetta
      ctx.fillStyle = 'rgba(11, 13, 20, 0.85)';
      ctx.fillRect(
        -textWidth / 2 - padding,
        labelYOffset,
        textWidth + padding * 2,
        (16 / zoom)
      );

      // Bordo etichetta
      ctx.strokeStyle = token.type === 'npc' ? '#ef4444' : '#3b82f6';
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(
        -textWidth / 2 - padding,
        labelYOffset,
        textWidth + padding * 2,
        (16 / zoom)
      );

      // Testo etichetta
      ctx.fillStyle = '#f0f4fc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, 0, labelYOffset + (8 / zoom));

      ctx.restore();
    });
  }, [
    pan,
    zoom,
    room,
    isDrawing,
    activeTool,
    activeShape,
    brushColor,
    brushWidth,
    draggedTokenId,
    myTokenId,
    role,
  ]);

  // Loop di animazione continuo per canvas fluido
  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      renderCanvas();
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [renderCanvas]);

  // Gestione Resize Finestra
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Gestione Zoom con Rotella Mouse
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.3), 3.0);

    // Zoom centrato sul cursore
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    }
  };

  // Controlli Zoom Manuali
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.25, 3.0);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.25, 0.3);
    setZoom(newZoom);
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // MOUSE DOWN: Inizio Pan, Trascinamento Token o Disegno
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    const isRightClick = e.button === 2;
    const worldPos = screenToWorld(e.clientX, e.clientY);

    // Pan con tasto destro o strumento PAN
    if (isRightClick || activeTool === 'pan') {
      setIsPanning(true);
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    // STRUMENTO SELEZIONA/SPOSTA TOKEN
    if (activeTool === 'select') {
      // Cerca se abbiamo cliccato sopra un token
      const clickedToken = [...room.tokens].reverse().find((t) => {
        const radius = (t.size || room.gridSize * 0.8) / 2;
        const dx = worldPos.x - t.x;
        const dy = worldPos.y - t.y;
        return Math.sqrt(dx * dx + dy * dy) <= radius;
      });

      if (clickedToken) {
        // CONTROLLO PERMESSI:
        // Il Master può trascinare QUALSIASI token.
        // Il Giocatore può trascinare ESCLUSIVAMENTE il PROPRIO token.
        const canMove = role === 'MASTER' || clickedToken.id === myTokenId || clickedToken.ownerId === socket?.id;

        if (canMove) {
          setDraggedTokenId(clickedToken.id);
          dragStartPosRef.current = { x: clickedToken.x, y: clickedToken.y };
          localDragPosRef.current = { x: clickedToken.x, y: clickedToken.y };
          dragOffsetRef.current = {
            x: worldPos.x - clickedToken.x,
            y: worldPos.y - clickedToken.y,
          };
          return;
        } else {
          console.log('⛔ Puoi muovere esclusivamente il tuo token personale!');
        }
      } else {
        // Se non abbiamo cliccato un token, attiva Pan
        setIsPanning(true);
        startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
    }

    // STRUMENTO PENNELLO / GOMMA / FORME GEOMETRICHE (Solo per il Master)
    if ((activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'shape') && role === 'MASTER') {
      setIsDrawing(true);
      if (activeTool === 'shape') {
        currentStrokeRef.current = [{ x: worldPos.x, y: worldPos.y }, { x: worldPos.x, y: worldPos.y }];
      } else {
        currentStrokeRef.current = [{ x: worldPos.x, y: worldPos.y }];
      }
    }
  };

  // MOUSE MOVE: Trascinamento in corso
  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Gestione Pan
    if (isPanning) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);

    // 2. Gestione Trascinamento Token (Privato al controllore, visibile agli altri solo al rilascio)
    if (draggedTokenId) {
      const rawTargetX = worldPos.x - dragOffsetRef.current.x;
      const rawTargetY = worldPos.y - dragOffsetRef.current.y;

      const col = Math.floor(rawTargetX / room.gridSize);
      const row = Math.floor(rawTargetY / room.gridSize);

      const targetX = (col + 0.5) * room.gridSize;
      const targetY = (row + 0.5) * room.gridSize;

      localDragPosRef.current = { x: targetX, y: targetY };
      // Il movimento è visibile solo al controllore sul proprio canvas fino al rilascio del mouse.
      return;
    }


    // 3. Gestione Disegno a mano libera o Forma Geometrica
    if (isDrawing && role === 'MASTER') {
      if (activeTool === 'shape') {
        currentStrokeRef.current = [currentStrokeRef.current[0], { x: worldPos.x, y: worldPos.y }];
      } else {
        currentStrokeRef.current.push({ x: worldPos.x, y: worldPos.y });
      }
    }
  };

  // MOUSE UP: Rilascio e Rilevamento Click Popover HP
  const handleMouseUp = (e?: React.MouseEvent) => {
    if (e && activeTool === 'select') {
      const dx = e.clientX - mouseDownPosRef.current.x;
      const dy = e.clientY - mouseDownPosRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Se la distanza del movimento è minima (< 5px), è un CLICK, non un trascinamento
      if (dist < 5 && e.button === 0) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const clickedToken = [...room.tokens].reverse().find((t) => {
          const radius = (t.size || room.gridSize * 0.8) / 2;
          const dX = worldPos.x - t.x;
          const dY = worldPos.y - t.y;
          return Math.sqrt(dX * dX + dY * dY) <= radius;
        });

        if (clickedToken) {
          // PERMESSI: Master apre popover HP di TUTTI; Player SOLO per la sua pedina
          const canOpenHp =
            role === 'MASTER' || clickedToken.id === myTokenId || clickedToken.ownerId === socket?.id;

          if (canOpenHp) {
            setHpModalToken(clickedToken);
            setInputHp(clickedToken.hp ?? 10);
            setInputMaxHp(clickedToken.maxHp ?? 10);
          }
        }
      }
    }

    if (isPanning) {
      setIsPanning(false);
    }

    // Se stiamo rilasciando il trascinamento di una pedina, inviamo il movimento finale per attivare l'animazione per tutti
    if (draggedTokenId) {
      const token = room.tokens.find((t) => t.id === draggedTokenId);
      const startPos = dragStartPosRef.current;
      const endPos = localDragPosRef.current;

      if (token && startPos && endPos && socket) {
        const distMoved = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
        if (distMoved > 2) {
          socket.emit('move-token-end', {
            roomId: room.id,
            tokenId: draggedTokenId,
            startX: startPos.x,
            startY: startPos.y,
            endX: endPos.x,
            endY: endPos.y,
          });
        }
      }
      dragStartPosRef.current = null;
      localDragPosRef.current = null;
      setDraggedTokenId(null);
    }



    if (isDrawing && role === 'MASTER') {
      setIsDrawing(false);
      const minPointsNeeded = activeTool === 'shape' ? 2 : 2;
      if (currentStrokeRef.current.length >= minPointsNeeded && socket) {
        const newStroke: DrawingStroke = {
          id: `stroke-${Date.now()}`,
          points: [...currentStrokeRef.current],
          color: brushColor,
          width: activeTool === 'eraser' ? brushWidth * 1.5 : brushWidth,
          isEraser: activeTool === 'eraser',
          shapeType: activeTool === 'shape' ? activeShape : 'freehand',
        };

        // Invia il tratto finale al server WebSocket
        socket.emit('draw-stroke', {
          roomId: room.id,
          stroke: newStroke,
        });
      }
      currentStrokeRef.current = [];
    }
  };

  // Gestione Touch Mobile (Single touch drag/pan & 2-finger pinch-to-zoom)
  const touchPinchDistRef = useRef<number | null>(null);
  const touchPinchZoomRef = useRef<number>(1);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchPinchDistRef.current = null;
      const touch = e.touches[0];
      handleMouseDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0,
        preventDefault: () => {},
      } as any);
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchPinchDistRef.current = dist;
      touchPinchZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !touchPinchDistRef.current) {
      const touch = e.touches[0];
      handleMouseMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
      } as any);
    } else if (e.touches.length === 2 && touchPinchDistRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (touchPinchDistRef.current > 0) {
        const factor = dist / touchPinchDistRef.current;
        const newZoom = Math.min(Math.max(touchPinchZoomRef.current * factor, 0.3), 3.0);
        setZoom(newZoom);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      handleMouseUp();
      touchPinchDistRef.current = null;
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !hpModalToken || !socket) return;
    try {
      const dataUrl = await resizeImageFile(file, 350);
      socket.emit('update-token-avatar', {
        roomId: room.id,
        tokenId: hpModalToken.id,
        avatarUrl: dataUrl,
      });
      setHpModalToken((prev) => (prev ? { ...prev, avatarUrl: dataUrl } : null));
    } catch (err) {
      console.error('Error uploading avatar:', err);
    }
  };

  const handleRemoveAvatar = () => {
    if (!hpModalToken || !socket) return;
    socket.emit('update-token-avatar', {
      roomId: room.id,
      tokenId: hpModalToken.id,
      avatarUrl: null,
    });
    setHpModalToken((prev) => (prev ? { ...prev, avatarUrl: undefined } : null));
  };

  // Salvataggio HP tramite socket
  const handleSaveHp = (newHp: number, newMaxHp: number) => {
    if (!hpModalToken || !socket) return;
    const clampedHp = Math.max(0, Math.min(newHp, newMaxHp));
    socket.emit('update-token-hp', {
      roomId: room.id,
      tokenId: hpModalToken.id,
      hp: clampedHp,
      maxHp: newMaxHp,
    });
    setHpModalToken(null);
  };

  return (
    <div
      className={`canvas-wrapper ${isPanning ? 'panning' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />


      {/* CONTROLLI GALLEGGIANTI DI ZOOM (IN BASSO A SINISTRA) */}
      <div className="absolute bottom-4 left-4 z-40 flex items-center gap-1.5 glass-panel-sm p-1.5 border border-white/10 shadow-lg backdrop-blur-md">
        <button
          onClick={handleZoomOut}
          className="btn-icon w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
          title="Zoom Indietro"
        >
          <Minus size={16} />
        </button>

        <button
          onClick={handleResetZoom}
          className="px-2.5 py-1 text-xs font-mono font-bold text-amber-300 hover:text-white transition-colors"
          title="Ripristina Zoom 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          onClick={handleZoomIn}
          className="btn-icon w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
          title="Zoom Avanti"
        >
          <Plus size={16} />
        </button>

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        <button
          onClick={handleResetZoom}
          className="btn-icon w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
          title="Centra Mappa"
        >
          <Maximize2 size={15} />
        </button>
      </div>

      {/* DIALOG POPOVER MODALE HP TOKEN */}
      <Dialog open={!!hpModalToken} onOpenChange={(open) => !open && setHpModalToken(null)}>
        <DialogContent className="bg-slate-900/95 text-slate-100 border-amber-500/30 backdrop-blur-xl max-w-sm rounded-2xl p-6 shadow-2xl shadow-amber-950/20">
          {hpModalToken && (
            <div className="flex flex-col gap-5">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-4 h-4 rounded-full border border-white/30 shadow-sm shrink-0"
                      style={{ backgroundColor: hpModalToken.color }}
                    />
                    <DialogTitle className="text-xl font-bold rpg-font text-amber-200 truncate">
                      {hpModalToken.name}
                    </DialogTitle>
                  </div>
                  <Badge
                    variant={hpModalToken.type === 'npc' ? 'npc' : 'player'}
                  >
                    {hpModalToken.type === 'npc' ? 'NPC' : 'Giocatore'}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-slate-400">
                  Imposta HP ed personalizza l'immagine della pedina.
                </DialogDescription>
              </DialogHeader>

              {/* Sezione Modifica Avatar Pedina (Master o Proprietario Token) */}
              {(role === 'MASTER' || hpModalToken.id === myTokenId || hpModalToken.ownerId === socket?.id) && (
                <div className="p-3 bg-slate-950/60 rounded-xl border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-amber-300">
                      <Camera className="w-3.5 h-3.5 text-amber-400" /> Immagine Pedina
                    </span>
                    {hpModalToken.avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="text-[10px] text-red-400 hover:underline flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3 h-3" /> Rimuovi
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {hpModalToken.avatarUrl ? (
                      <img
                        src={hpModalToken.avatarUrl}
                        alt={hpModalToken.name}
                        className="w-11 h-11 rounded-lg object-contain bg-slate-950 border border-amber-400/50 shadow-md shrink-0"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 border-white/20 shrink-0"
                        style={{ backgroundColor: hpModalToken.color }}
                      >
                        {hpModalToken.name[0]?.toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                        id={`popover-avatar-input-${hpModalToken.id}`}
                      />
                      <Button variant="secondary" size="sm" asChild className="w-full text-xs h-8">
                        <label htmlFor={`popover-avatar-input-${hpModalToken.id}`} className="cursor-pointer gap-1.5 justify-center">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{hpModalToken.avatarUrl ? 'Cambia Foto' : 'Carica Foto'}</span>
                        </label>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress bar HP attuale */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="flex items-center gap-1 text-slate-300">
                    <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400/20" /> Salute Attuale
                  </span>
                  <span className="font-mono text-amber-300">
                    {inputHp} / {inputMaxHp} HP
                  </span>
                </div>
                <Progress
                  value={inputMaxHp > 0 ? Math.min(100, Math.max(0, (inputHp / inputMaxHp) * 100)) : 0}
                  className="h-2.5 bg-slate-800"
                />
              </div>

              {/* Input HP e Max HP */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-red-400" /> HP Attuali
                  </label>
                  <Input
                    type="number"
                    value={inputHp}
                    onChange={(e) => setInputHp(parseInt(e.target.value) || 0)}
                    className="bg-slate-800/80 border-slate-700 text-white font-mono text-center font-bold focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-amber-400" /> HP Massimi
                  </label>
                  <Input
                    type="number"
                    value={inputMaxHp}
                    onChange={(e) => setInputMaxHp(parseInt(e.target.value) || 1)}
                    className="bg-slate-800/80 border-slate-700 text-white font-mono text-center font-bold focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Pulsanti Rapidi Modifica HP */}
              <div className="flex items-center justify-between gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-red-950/40 border-red-800/40 hover:bg-red-900/60 text-red-300 font-mono text-xs"
                  onClick={() => setInputHp((prev) => Math.max(0, prev - 5))}
                >
                  -5
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-red-950/30 border-red-800/30 hover:bg-red-900/40 text-red-300 font-mono text-xs"
                  onClick={() => setInputHp((prev) => Math.max(0, prev - 1))}
                >
                  -1
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-amber-950/40 border-amber-800/40 hover:bg-amber-900/60 text-amber-300 font-mono text-xs"
                  onClick={() => setInputHp(inputMaxHp)}
                >
                  MAX
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-emerald-950/30 border-emerald-800/30 hover:bg-emerald-900/40 text-emerald-300 font-mono text-xs"
                  onClick={() => setInputHp((prev) => Math.min(inputMaxHp, prev + 1))}
                >
                  +1
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-emerald-950/40 border-emerald-800/40 hover:bg-emerald-900/60 text-emerald-300 font-mono text-xs"
                  onClick={() => setInputHp((prev) => Math.min(inputMaxHp, prev + 5))}
                >
                  +5
                </Button>
              </div>

              {/* Pulsanti Azione */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 text-slate-400 hover:text-white hover:bg-slate-800"
                  onClick={() => setHpModalToken(null)}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-600/20"
                  onClick={() => handleSaveHp(inputHp, inputMaxHp)}
                >
                  <Check className="w-4 h-4 mr-1.5" /> Salva HP
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


