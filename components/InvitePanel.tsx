'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface InvitePanelProps {
  roomId: string;
  publicUrl: string | null; // link del tunnel (npm run sessione); senza, si usa l'indirizzo della pagina
}

// Solo Master: QR e link da far inquadrare ai giocatori. Porta alla home con la stanza già compilata.
export default function InvitePanel({ roomId, publicUrl }: InvitePanelProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${publicUrl ?? window.location.origin}/?join=${encodeURIComponent(roomId)}`;
  const isLocalOnly = !publicUrl && /localhost|127\.0\.0\.1/.test(window.location.hostname);

  useEffect(() => {
    QRCode.toDataURL(inviteUrl, { width: 280, margin: 1 }).then(setQrDataUrl);
  }, [inviteUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-slate-900/90 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white shadow-lg backdrop-blur-md gap-2"
        >
          <QrCode className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline font-medium text-xs">Invita giocatori</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[calc(100vw-1.5rem)] sm:w-80 p-4 text-center space-y-3">
        <h4 className="font-semibold text-sm text-slate-100">Invita i giocatori</h4>
        <p className="text-[11px] text-slate-400">
          Inquadrate il QR col telefono: si apre la stanza <span className="font-mono text-amber-300">#{roomId}</span>, poi
          serve la password.
        </p>

        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="QR code per entrare nella stanza" className="mx-auto w-56 h-56 rounded-lg bg-white p-2" />
        )}

        <div className="flex items-center gap-1.5 rounded-lg bg-slate-900/80 border border-slate-800 p-1.5">
          <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate-300 text-left px-1">{inviteUrl}</span>
          <Button size="sm" variant="secondary" onClick={copyLink} className="h-7 px-2 text-[11px] gap-1 shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiato' : 'Copia'}
          </Button>
        </div>

        {isLocalOnly && (
          <p className="text-[11px] text-amber-400 leading-snug">
            Questo link funziona solo su questo PC. Per i telefoni avvia la sessione con <span className="font-mono">npm run sessione</span>.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
