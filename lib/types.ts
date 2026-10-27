export type UserRole = 'MASTER' | 'PLAYER';

export interface Token {
  id: string;
  name: string;
  type: 'player' | 'npc';
  x: number;
  y: number;
  color: string;
  avatarUrl?: string;
  ownerId?: string; // Socket ID or Player ID bound to this token
  size: number; // Token diameter in grid units or pixels
  hp?: number;
  maxHp?: number;
  hidden?: boolean; // NPC nascosto dal Master: il server non lo invia ai giocatori
  conditions?: string[]; // nomi delle condizioni attive (vedi CONDITIONS in lib/utils)
}

export type ShapeType = 'freehand' | 'rectangle' | 'circle';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  points: DrawingPoint[];
  color: string;
  width: number;
  isEraser: boolean;
  shapeType?: ShapeType;
}

export type ActionType = 
  | 'TOKEN_MOVE'
  | 'HP_UPDATE'
  | 'DRAW'
  | 'TOKEN_REMOVE'
  | 'MAP_CHANGE'
  | 'GRID_UPDATE'
  | 'CLEAR_CANVAS'
  | 'AVATAR_UPDATE'
  | 'USER_JOIN'
  | 'TURN'
  | 'ENGAGEMENT';

export interface ActionLogRecord {
  id: string;
  roomId: string;
  timestamp: number;
  expiresAt: number; // TTL (es. Date.now() + 24 ore)
  actorName: string;
  actorRole: UserRole;
  actionType: ActionType;
  description: string;
  details?: Record<string, any>;
}

// Nebbia di guerra: rettangoli applicati in ordine, ognuno rivela (o con hide ricopre) la sua area
export interface FogArea {
  x: number;
  y: number;
  w: number;
  h: number;
  hide?: boolean;
}

export interface FogOfWar {
  enabled: boolean;
  areas: FogArea[];
}

// Combattimento a iniziativa: entries già ordinate dal server (valore più alto prima)
export interface Initiative {
  entries: { tokenId: string; value: number }[];
  activeTokenId: string; // pedina di turno: solo i suoi movimenti sono animati e registrati
  round: number;
}

export interface RoomState {
  id: string;
  name: string;
  password: string;
  gridSize: number; // Grid cell size in pixels (e.g. 50)
  gridScale?: number; // Scale in meters per cell (default: 1)

  gridVisible: boolean;
  backgroundUrl: string | null; // null = default white grid sheet
  tokens: Token[];
  drawings: DrawingStroke[];
  logs?: ActionLogRecord[];
  initiative?: Initiative | null; // null = nessun combattimento in corso
  engagements?: [string, string][]; // coppie di pedine in combattimento tra loro (reciproco)
  fog?: FogOfWar; // assente nelle stanze create prima della nebbia = spenta
  scenes?: { id: string; name: string }[]; // solo per il Master: le mappe preparate (il contenuto resta sul server)
  activeSceneId?: string;
}
