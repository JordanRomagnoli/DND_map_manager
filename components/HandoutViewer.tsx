'use client';

import React, { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface HandoutViewerProps {
  socket: Socket | null;
  role: UserRole;
}

// Handout mostrato dal Master a tutti (lettera, ritratto, oggetto). Ognuno può chiuderlo per sé, il Master anche per tutti.
export default function HandoutViewer({ socket, role }: HandoutViewerProps) {
  const [handout, setHandout] = useState<{ imageUrl: string; title: string } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handleHandout = (h: { imageUrl: string | null; title: string }) =>
      setHandout(h.imageUrl ? { imageUrl: h.imageUrl, title: h.title } : null);
    socket.on('handout-updated', handleHandout);
    return () => {
      socket.off('handout-updated', handleHandout);
    };
  }, [socket]);

  return (
    <Dialog open={Boolean(handout)} onOpenChange={(open) => !open && setHandout(null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            <ScrollText size={22} className="text-amber-400" />
            <span>{handout?.title || 'Handout'}</span>
          </DialogTitle>
          <DialogDescription>Mostrato dal Master a tutto il tavolo.</DialogDescription>
        </DialogHeader>

        {handout && (
          <img
            src={handout.imageUrl}
            alt={handout.title || 'Handout'}
            className="w-full max-h-[70vh] object-contain rounded-lg"
          />
        )}

        {role === 'MASTER' && (
          <Button variant="secondary" onClick={() => socket?.emit('show-handout', { imageUrl: null })}>
            Chiudi per tutti
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
