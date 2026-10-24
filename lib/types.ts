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
  | 'TOKEN_ADD'
  | 'TOKEN_REMOVE'
  | 'MAP_CHANGE'
  | 'GRID_UPDATE'
  | 'CLEAR_CANVAS'
  | 'AVATAR_UPDATE'
  | 'USER_JOIN';

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

export interface RoomState {
  id: string;
  name: string;
  password: string;
  gridSize: number; // Grid cell size in pixels (e.g. 50)
  gridScale?: number; // Scale in meters per cell (default: 1)

  gridVisible: boolean;
  snapToGrid: boolean;
  backgroundUrl: string | null; // null = default white grid sheet
  tokens: Token[];
  drawings: DrawingStroke[];
  masterSocketId: string | null;
  logs?: ActionLogRecord[];
}


export interface JoinRoomPayload {
  roomId: string;
  password?: string;
  role: UserRole;
  playerName?: string;
  playerColor?: string;
}

