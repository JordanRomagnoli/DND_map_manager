import { NextResponse } from 'next/server';
import { loadRoomFromSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { RoomState } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomId, password } = body;

    const cleanRoomId = (roomId || '').trim().toLowerCase();
    if (!cleanRoomId) {
      return NextResponse.json({ success: false, error: 'Codice stanza obbligatorio.' }, { status: 400 });
    }

    let room: RoomState | null = null;
    if (isSupabaseConfigured) {
      room = await loadRoomFromSupabase(cleanRoomId);
    }

    // Se non trovata o Supabase non configurato, il server WebSocket provvederà alla verifica in stanza
    if (room) {
      if (room.password && room.password !== password) {
        return NextResponse.json({ success: false, error: 'Password errata.' }, { status: 401 });
      }
      return NextResponse.json({ success: true, room });
    }

    return NextResponse.json({ success: true, message: 'Verifica completata.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Errore server' }, { status: 500 });
  }
}
