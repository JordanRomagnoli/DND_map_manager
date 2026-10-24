-- Schema SQL per Supabase D&D Map Manager
-- Esegui questo script nell'SQL Editor di Supabase per configurare il database

-- Tabella Stanze
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  grid_size INTEGER DEFAULT 50,
  grid_visible BOOLEAN DEFAULT true,
  snap_to_grid BOOLEAN DEFAULT true,
  background_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabella Token (Player e NPC)
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('player', 'npc')),
  x NUMERIC NOT NULL DEFAULT 100,
  y NUMERIC NOT NULL DEFAULT 100,
  color TEXT NOT NULL DEFAULT '#d4af37',
  avatar_url TEXT,
  owner_id TEXT,
  size INTEGER DEFAULT 40,
  hp INTEGER,
  max_hp INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabella Disegni del Master
CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  points JSONB NOT NULL,
  color TEXT NOT NULL DEFAULT '#000000',
  width INTEGER DEFAULT 4,
  is_eraser BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita Realtime su tutte le tabelle
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE drawings;
