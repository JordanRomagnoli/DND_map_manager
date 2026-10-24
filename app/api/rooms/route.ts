import { NextResponse } from 'next/server';
import { loadRoomFromSupabase, saveRoomToSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { RoomState } from '@/lib/types';

// In-memory store fallback if Supabase env vars are not set
const memoryRooms = new Map<string, RoomState>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomId, roomName, password, gridSize } = body;

    const cleanRoomId = (roomId || '').trim().toLowerCase();
    if (!cleanRoomId) {
      return NextResponse.json({ success: false, error: 'Codice stanza obbligatorio.' }, { status: 400 });
    }
    if (!password || !password.trim()) {
      return NextResponse.json({ success: false, error: 'Password obbligatoria.' }, { status: 400 });
    }

    // Controlla se esiste su Supabase o in memoria
    let existingRoom: RoomState | null = null;
    if (isSupabaseConfigured) {
      existingRoom = await loadRoomFromSupabase(cleanRoomId);
    } else {
      existingRoom = memoryRooms.get(cleanRoomId) || null;
    }

    if (existingRoom) {
      if (existingRoom.password !== password) {
        return NextResponse.json(
          { success: false, error: 'La stanza esiste già con una password diversa.' },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, room: existingRoom, created: false });
    }

    const newRoom: RoomState = {
      id: cleanRoomId,
      name: roomName || `Stanza ${cleanRoomId}`,
      password,
      gridSize: gridSize || 50,
      gridVisible: true,
      snapToGrid: true,
      backgroundUrl: null,
      tokens: [],
      drawings: [],
      masterSocketId: null,
    };

    if (isSupabaseConfigured) {
      await saveRoomToSupabase(newRoom);
    }
    memoryRooms.set(cleanRoomId, newRoom);

    console.log(`🏰 Stanza creata tramite API REST: ${cleanRoomId}`);

    return NextResponse.json({ success: true, room: newRoom, created: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Errore server' }, { status: 500 });
  }
}
