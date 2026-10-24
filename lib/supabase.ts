import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RoomState, Token, DrawingStroke } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helpers per salvare e caricare lo stato della stanza su Supabase
export async function saveRoomToSupabase(room: RoomState): Promise<boolean> {
  if (!supabase) return false;
  try {
    // Upsert Stanza
    const { error: roomError } = await supabase.from('rooms').upsert({
      id: room.id,
      name: room.name,
      password: room.password,
      grid_size: room.gridSize,
      grid_visible: room.gridVisible,
      snap_to_grid: room.snapToGrid,
      background_url: room.backgroundUrl,
    });
    if (roomError) console.error('Errore salvataggio stanza Supabase:', roomError);

    return true;
  } catch (err) {
    console.error('Errore Supabase saveRoom:', err);
    return false;
  }
}

export async function saveTokenToSupabase(roomId: string, token: Token): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('tokens').upsert({
      id: token.id,
      room_id: roomId,
      name: token.name,
      type: token.type,
      x: token.x,
      y: token.y,
      color: token.color,
      avatar_url: token.avatarUrl || null,
      owner_id: token.ownerId || null,
      size: token.size || 40,
      hp: token.hp ?? null,
      max_hp: token.maxHp ?? null,
    });
    if (error) console.error('Errore salvataggio token Supabase:', error);
    return !error;
  } catch (err) {
    console.error('Errore Supabase saveToken:', err);
    return false;
  }
}

export async function deleteTokenFromSupabase(tokenId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('tokens').delete().eq('id', tokenId);
    return !error;
  } catch (err) {
    console.error('Errore eliminazione token Supabase:', err);
    return false;
  }
}

export async function saveDrawingToSupabase(roomId: string, stroke: DrawingStroke): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('drawings').upsert({
      id: stroke.id,
      room_id: roomId,
      points: JSON.stringify(stroke.points),
      color: stroke.color,
      width: stroke.width,
      is_eraser: stroke.isEraser,
    });
    return !error;
  } catch (err) {
    console.error('Errore salvataggio disegno Supabase:', err);
    return false;
  }
}

export async function clearDrawingsFromSupabase(roomId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('drawings').delete().eq('room_id', roomId);
    return !error;
  } catch (err) {
    console.error('Errore cancellazione disegni Supabase:', err);
    return false;
  }
}

export async function loadRoomFromSupabase(roomId: string): Promise<RoomState | null> {
  if (!supabase) return null;
  try {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomError || !roomData) return null;

    const { data: tokensData } = await supabase
      .from('tokens')
      .select('*')
      .eq('room_id', roomId);

    const { data: drawingsData } = await supabase
      .from('drawings')
      .select('*')
      .eq('room_id', roomId);

    const tokens: Token[] = (tokensData || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      x: Number(t.x),
      y: Number(t.y),
      color: t.color,
      avatarUrl: t.avatar_url || undefined,
      ownerId: t.owner_id || undefined,
      size: t.size || 40,
      hp: t.hp ?? undefined,
      maxHp: t.max_hp ?? undefined,
    }));

    const drawings: DrawingStroke[] = (drawingsData || []).map((d: any) => ({
      id: d.id,
      points: typeof d.points === 'string' ? JSON.parse(d.points) : d.points,
      color: d.color,
      width: d.width,
      isEraser: d.is_eraser,
    }));

    return {
      id: roomData.id,
      name: roomData.name,
      password: roomData.password,
      gridSize: roomData.grid_size || 50,
      gridVisible: roomData.grid_visible ?? true,
      snapToGrid: roomData.snap_to_grid ?? true,
      backgroundUrl: roomData.background_url || null,
      tokens,
      drawings,
      masterSocketId: null,
    };
  } catch (err) {
    console.error('Errore caricamento stanza da Supabase:', err);
    return null;
  }
}
