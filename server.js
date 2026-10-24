const { createServer } = require('http');
const { randomUUID } = require('crypto');
const parseUrl = require('url').parse;
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || (dev ? 'localhost' : '0.0.0.0');
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// In-memory room store (in-sync with Supabase when configured)
const rooms = new Map();

// Stato stanza inviabile ai client: senza password né chiave del Master
const publicRoom = ({ password, masterKey, playerKeys, ...room }) => room;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parseUrl(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
    maxHttpBufferSize: 1e7, // 10MB to accommodate image uploads via socket
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Connesso socket: ${socket.id}`);

    // Helper per ancorare le coordinate al centro esatto di un quadrato della griglia
    const snapToCellCenter = (x, y, gridSize) => {
      const col = Math.floor(x / gridSize);
      const row = Math.floor(y / gridSize);
      return {
        x: (col + 0.5) * gridSize,
        y: (row + 0.5) * gridSize,
      };
    };

    // Helper per creare e trasmettere log delle azioni
    const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

    const createAndBroadcastLog = (roomId, actorName, actorRole, actionType, description, details = {}) => {
      const room = rooms.get(roomId);
      if (!room) return;

      if (!room.logs) room.logs = [];

      const timestamp = Date.now();
      const logRecord = {
        id: `log-${timestamp}-${Math.random().toString(36).substr(2, 5)}`,
        roomId,
        timestamp,
        expiresAt: timestamp + DEFAULT_TTL_MS,
        actorName: actorName || (actorRole === 'MASTER' ? 'Master' : 'Giocatore'),
        actorRole: actorRole || 'PLAYER',
        actionType,
        description,
        details,
      };

      room.logs.push(logRecord);
      if (room.logs.length > 500) {
        room.logs.shift();
      }

      io.to(roomId).emit('action-logged', logRecord);
    };

    // CREA STANZA (Master)
    socket.on('create-room', ({ roomId, roomName, password, masterKey, gridSize, gridScale }, callback) => {
      const cleanRoomId = (roomId || '').trim().toLowerCase();
      if (!cleanRoomId) {
        return callback?.({ success: false, error: 'Codice stanza non valido.' });
      }

      if (rooms.has(cleanRoomId)) {
        // Se la stanza esiste già, solo chi ha la chiave del Master può riprenderne il controllo
        // (la password è condivisa con i giocatori, quindi non basta)
        const existing = rooms.get(cleanRoomId);
        if (!masterKey || existing.masterKey !== masterKey) {
          return callback?.({ success: false, error: 'Stanza già esistente: solo il Master che l\'ha creata può gestirla.' });
        }
        existing.masterSocketId = socket.id;
        socket.join(cleanRoomId);
        socket.role = 'MASTER';
        socket.roomId = cleanRoomId;
        socket.playerName = 'Master';
        return callback?.({ success: true, room: publicRoom(existing), masterKey: existing.masterKey });
      }

      const newRoom = {
        id: cleanRoomId,
        name: roomName || `Stanza ${cleanRoomId}`,
        password: password || '',
        masterKey: randomUUID(),
        playerKeys: new Map(), // chiave segreta del giocatore -> id della sua pedina
        gridSize: gridSize || 50,
        gridScale: gridScale || 1, // Scala di default: 1 metro per quadrato
        gridVisible: true,
        snapToGrid: true,
        backgroundUrl: null,
        tokens: [],
        drawings: [],
        logs: [],
        masterSocketId: socket.id,
      };

      rooms.set(cleanRoomId, newRoom);
      socket.join(cleanRoomId);
      socket.role = 'MASTER';
      socket.roomId = cleanRoomId;
      socket.playerName = 'Master';

      console.log(`🏰 Stanza creata: ${cleanRoomId} dal Master ${socket.id}`);
      callback?.({ success: true, room: publicRoom(newRoom), masterKey: newRoom.masterKey });

      createAndBroadcastLog(cleanRoomId, 'Master', 'MASTER', 'USER_JOIN', `Il Master ha creato la stanza "${newRoom.name}".`);
    });

    // UNISCITI ALLA STANZA (solo Player: il ruolo Master passa da create-room con la chiave)
    socket.on('join-room', ({ roomId, password, playerKey, playerName, playerColor }, callback) => {
      const role = 'PLAYER';
      const cleanRoomId = (roomId || '').trim().toLowerCase();
      const room = rooms.get(cleanRoomId);

      if (!room) {
        return callback?.({ success: false, error: `La stanza "${cleanRoomId}" non esiste.` });
      }

      // Validazione Password
      if (room.password && room.password !== password) {
        return callback?.({ success: false, error: 'Password errata.' });
      }

      socket.join(cleanRoomId);
      socket.role = role;
      socket.roomId = cleanRoomId;
      socket.playerName = playerName || 'Giocatore';

      let playerToken = null;

      // La pedina si ritrova con la chiave del giocatore, non col nome (due giocatori possono chiamarsi uguale)
      const key = typeof playerKey === 'string' && playerKey ? playerKey : randomUUID();
      const existingToken = room.tokens.find((t) => t.id === room.playerKeys.get(key));

      if (existingToken) {
        existingToken.ownerId = socket.id;
        playerToken = existingToken;
      } else {
        // Genera coordinate di spawn ancorate al centro di un quadrato della griglia
        const spawnCol = Math.floor(Math.random() * 6 + 2);
        const spawnRow = Math.floor(Math.random() * 6 + 2);
        const snapped = snapToCellCenter(
          spawnCol * room.gridSize,
          spawnRow * room.gridSize,
          room.gridSize
        );

        playerToken = {
          id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: playerName || 'Giocatore',
          type: 'player',
          x: snapped.x,
          y: snapped.y,
          color: playerColor || '#3b82f6',
          ownerId: socket.id,
          size: room.gridSize * 0.8,
          hp: 20,
          maxHp: 20,
        };

        room.tokens.push(playerToken);
        room.playerKeys.set(key, playerToken.id);
        io.to(cleanRoomId).emit('token-added', playerToken);
      }

      socket.tokenId = playerToken.id;

      console.log(`👤 ${role} (${socket.playerName}) si è unito alla stanza: ${cleanRoomId}`);

      callback?.({
        success: true,
        room: publicRoom(room),
        assignedTokenId: playerToken.id,
        playerKey: key,
      });

      // Notifica tutti gli altri player nella stanza
      socket.to(cleanRoomId).emit('user-joined', {
        role,
        playerName: socket.playerName,
        socketId: socket.id,
      });

      createAndBroadcastLog(
        cleanRoomId,
        socket.playerName,
        role,
        'USER_JOIN',
        `${socket.playerName} (Giocatore) si è unito alla stanza.`
      );
    });

    // SPOSTAMENTO TOKEN IN TEMPO REALE (Ancorato al centro del quadrato)
    socket.on('move-token', ({ tokenId, x, y }) => {
      const roomId = socket.roomId; // never trust the client's roomId: it could target another room
      const room = rooms.get(roomId);
      if (!room) return;

      const token = room.tokens.find((t) => t.id === tokenId);
      if (!token) return;

      // CONTROLLO PERMESSI:
      if (socket.role !== 'MASTER' && token.ownerId !== socket.id && socket.tokenId !== tokenId) {
        console.warn(`⛔ Movimento rifiutato: Socket ${socket.id} non autorizzato a muovere ${token.name}`);
        return;
      }

      // Ancoraggio al centro esatto del quadrato
      const snapped = snapToCellCenter(x, y, room.gridSize);
      token.x = snapped.x;
      token.y = snapped.y;

      // Broadcast aggiornamento posizione
      io.to(roomId).emit('token-moved', { tokenId, x: token.x, y: token.y });
    });

    // FINE SPOSTAMENTO TOKEN (Trasmette l'animazione di scorrimento "trascinandosi" a tutti i partecipanti)
    socket.on('move-token-end', ({ tokenId, startX, startY, endX, endY }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const token = room.tokens.find((t) => t.id === tokenId);
      if (!token) return;

      if (socket.role !== 'MASTER' && token.ownerId !== socket.id && socket.tokenId !== tokenId) {
        return;
      }

      const finalSnapped = snapToCellCenter(endX ?? token.x, endY ?? token.y, room.gridSize);
      const actualStartX = startX ?? token.x;
      const actualStartY = startY ?? token.y;

      token.x = finalSnapped.x;
      token.y = finalSnapped.y;

      // Broadcast dell'animazione fluida di scorrimento a TUTTI i client connessi
      io.to(roomId).emit('token-moved-animated', {
        tokenId,
        startX: actualStartX,
        startY: actualStartY,
        endX: token.x,
        endY: token.y,
        duration: 450, // 450ms animazione di scorrimento
      });

      // Calcolo passi in quadretti e metri per il log
      const startCol = Math.floor(actualStartX / room.gridSize);
      const startRow = Math.floor(actualStartY / room.gridSize);
      const endCol = Math.floor(token.x / room.gridSize);
      const endRow = Math.floor(token.y / room.gridSize);

      const colDiff = Math.abs(endCol - startCol);
      const rowDiff = Math.abs(endRow - startRow);
      const gridSteps = Math.round(Math.hypot(colDiff, rowDiff));
      const metersMoved = Math.round(gridSteps * (room.gridScale || 1) * 10) / 10;

      const metersText = `${metersMoved}m`;
      const stepsText = `${gridSteps} ${gridSteps === 1 ? 'quadretto' : 'quadretti'}`;

      createAndBroadcastLog(
        roomId,
        socket.playerName || (socket.role === 'MASTER' ? 'Master' : token.name),
        socket.role,
        'TOKEN_MOVE',
        `${socket.playerName || token.name} ha mosso il token "${token.name}" di ${metersText} (${stepsText}).`,
        { tokenId, startX: actualStartX, startY: actualStartY, endX: token.x, endY: token.y, gridSteps, metersMoved }
      );
    });




    // AGGIORNAMENTO PUNTI VITA (HP & Max HP)
    socket.on('update-token-hp', ({ tokenId, hp, maxHp }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const token = room.tokens.find((t) => t.id === tokenId);
      if (!token) return;

      const canUpdate = socket.role === 'MASTER' || token.ownerId === socket.id || socket.tokenId === tokenId;
      if (!canUpdate) {
        console.warn(`⛔ Modifica HP rifiutata: Socket ${socket.id} non autorizzato su ${token.name}`);
        return;
      }

      const prevHp = token.hp;
      if (hp !== undefined) token.hp = Math.max(0, parseInt(hp, 10) || 0);
      if (maxHp !== undefined) token.maxHp = Math.max(1, parseInt(maxHp, 10) || 1);

      // Broadcast aggiornamento HP a tutti i client nella stanza
      io.to(roomId).emit('token-hp-updated', {
        tokenId,
        hp: token.hp,
        maxHp: token.maxHp,
      });

      createAndBroadcastLog(
        roomId,
        socket.playerName || (socket.role === 'MASTER' ? 'Master' : token.name),
        socket.role,
        'HP_UPDATE',
        `${socket.playerName || token.name} ha aggiornato gli HP di "${token.name}" a ${token.hp}/${token.maxHp} (da ${prevHp}).`
      );
    });

    // AGGIORNAMENTO AVATAR / IMMAGINE TOKEN
    socket.on('update-token-avatar', ({ tokenId, avatarUrl }, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return callback?.({ success: false, error: 'Stanza non trovata.' });

      const token = room.tokens.find((t) => t.id === tokenId);
      if (!token) return callback?.({ success: false, error: 'Token non trovato.' });

      const canUpdate = socket.role === 'MASTER' || token.ownerId === socket.id || socket.tokenId === tokenId;
      if (!canUpdate) {
        console.warn(`⛔ Modifica avatar rifiutata: Socket ${socket.id} non autorizzato su ${token.name}`);
        return callback?.({ success: false, error: 'Non hai i permessi per cambiare l\'immagine di questa pedina.' });
      }

      token.avatarUrl = avatarUrl || null;

      // Broadcast a tutti i client nella stanza
      io.to(roomId).emit('token-avatar-updated', {
        tokenId,
        avatarUrl: token.avatarUrl,
      });

      callback?.({ success: true, avatarUrl: token.avatarUrl });

      createAndBroadcastLog(
        roomId,
        socket.playerName || (socket.role === 'MASTER' ? 'Master' : token.name),
        socket.role,
        'AVATAR_UPDATE',
        `${socket.playerName || token.name} ha aggiornato l'immagine della pedina "${token.name}".`
      );
    });

    // AGGIUNTA TOKEN / NPC (Master only)
    socket.on('add-token', ({ tokenData }, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') {
        return callback?.({ success: false, error: 'Solo il Master può aggiungere NPC/Token.' });
      }

      const defaultX = tokenData.x || room.gridSize * 3.5;
      const defaultY = tokenData.y || room.gridSize * 3.5;
      const snapped = snapToCellCenter(defaultX, defaultY, room.gridSize);

      const newToken = {
        id: `npc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: tokenData.name || 'NPC',
        type: tokenData.type || 'npc',
        x: snapped.x,
        y: snapped.y,
        color: tokenData.color || '#ef4444',
        avatarUrl: tokenData.avatarUrl || null,
        size: tokenData.size || room.gridSize * 0.8,
        hp: tokenData.hp ?? 10,
        maxHp: tokenData.maxHp ?? 10,
      };

      room.tokens.push(newToken);
      io.to(roomId).emit('token-added', newToken);
      callback?.({ success: true, token: newToken });

      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'TOKEN_ADD',
        `Il Master ha aggiunto il token/NPC "${newToken.name}".`
      );
    });

    // RIMOZIONE TOKEN (Master only)
    socket.on('remove-token', ({ tokenId }, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') {
        return callback?.({ success: false, error: 'Solo il Master può rimuovere token.' });
      }

      const targetToken = room.tokens.find((t) => t.id === tokenId);
      const tokenName = targetToken ? targetToken.name : 'Token';

      room.tokens = room.tokens.filter((t) => t.id !== tokenId);
      io.to(roomId).emit('token-removed', { tokenId });
      callback?.({ success: true });

      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'TOKEN_REMOVE',
        `Il Master ha rimosso il token "${tokenName}".`
      );
    });

    // TRATTI DI DISEGNO (Master only)
    socket.on('draw-stroke', ({ stroke }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      room.drawings.push(stroke);
      io.to(roomId).emit('stroke-drawn', stroke);
    });

    // PULIZIA CANVAS (Master only)
    socket.on('clear-canvas', () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      room.drawings = [];
      io.to(roomId).emit('canvas-cleared');

      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'CLEAR_CANVAS',
        `Il Master ha pulito tutti i disegni dalla mappa.`
      );
    });

    // CARICAMENTO MAPPA DI SFONDO (Master only)
    socket.on('update-background', ({ backgroundUrl }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      room.backgroundUrl = backgroundUrl;
      io.to(roomId).emit('background-updated', { backgroundUrl });

      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'MAP_CHANGE',
        `Il Master ha aggiornato la mappa di sfondo.`
      );
    });

    // MODIFICA GRIGLIA (Master only)
    socket.on('update-grid', ({ gridSize, gridScale, gridVisible, snapToGrid }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      if (gridSize !== undefined) room.gridSize = gridSize;
      if (gridScale !== undefined) room.gridScale = gridScale;
      if (gridVisible !== undefined) room.gridVisible = gridVisible;
      if (snapToGrid !== undefined) room.snapToGrid = snapToGrid;

      io.to(roomId).emit('grid-updated', {
        gridSize: room.gridSize,
        gridScale: room.gridScale,
        gridVisible: room.gridVisible,
        snapToGrid: room.snapToGrid,
      });

      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'GRID_UPDATE',
        `Il Master ha modificato le impostazioni della griglia (1 quadrato = ${room.gridScale || 1}m).`
      );
    });


    // PULIZIA MANUALE REGISTRO AZIONI (Master only)
    socket.on('clear-room-logs', () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      room.logs = [];
      io.to(roomId).emit('room-logs-cleared');

      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'CLEAR_CANVAS',
        `Il Master ha svuotato il registro delle azioni.`
      );
    });

    // DISCONNESSIONE
    socket.on('disconnect', () => {
      console.log(`❌ Disconnesso socket: ${socket.id}`);
      if (socket.roomId && socket.role === 'MASTER') {
        const room = rooms.get(socket.roomId);
        if (room && room.masterSocketId === socket.id) {
          room.masterSocketId = null;
          io.to(socket.roomId).emit('master-status', { online: false });
        }
      }
    });
  });


  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Server WebSockets attivo ed in ascolto per D&D Map Manager`);
  });
});
