const { createServer } = require('http');
const { randomUUID } = require('crypto');
const parseUrl = require('url').parse;
const path = require('path');
const { Server } = require('socket.io');
const { createRoomStore } = require('./persistence');

// Stato stanza inviabile ai client: senza password né chiave del Master.
// Delle scene non attive va solo nome e id: il loro contenuto (mappe pesanti) resta sul server.
const publicRoom = ({ password, masterKey, masterPassword, playerKeys, scenes, ...room }) => ({
  ...room,
  scenes: (scenes || []).map(({ id, name }) => ({ id, name })),
});

// Gli HP li vedono solo il Master e il proprietario della pedina: il server non li invia agli altri
const masterRoom = (roomId) => `${roomId}:master`;
const hideHp = (token) => ({ ...token, hp: undefined, maxHp: undefined });
// Gli NPC nascosti dal Master non arrivano ai giocatori: né la pedina, né i suoi turni, ingaggi o log
const isHiddenToken = (room, tokenId) => Boolean(room.tokens.find((t) => t.id === tokenId)?.hidden);
// Se è il turno di un NPC nascosto i giocatori vedono activeTokenId vuoto: non è il turno di nessuno di loro
const playerInitiative = (room) =>
  room.initiative && {
    ...room.initiative,
    entries: room.initiative.entries.filter((e) => !isHiddenToken(room, e.tokenId)),
    activeTokenId: isHiddenToken(room, room.initiative.activeTokenId) ? '' : room.initiative.activeTokenId,
  };
const playerEngagements = (room) => (room.engagements || []).filter((pair) => !pair.some((id) => isHiddenToken(room, id)));
// Elementi della mappa: i giocatori vedono i forzieri (il contenuto solo dopo l'apertura) e le trappole già scattate.
// Gli inneschi restano sempre del Master.
const playerFeatures = (room) =>
  (room.features || [])
    .filter((f) => f.kind === 'chest' || (f.kind === 'trap' && f.triggered))
    .map((f) => (f.triggered ? f : { ...f, text: undefined }));
// i giocatori non vedono l'elenco delle scene preparate dal Master
const playerView = (room, ownTokenId) => ({
  ...publicRoom(room),
  scenes: undefined,
  activeSceneId: undefined,
  tokens: room.tokens.filter((t) => !t.hidden).map((t) => (t.id === ownTokenId ? t : hideHp(t))),
  initiative: playerInitiative(room),
  engagements: playerEngagements(room),
  features: playerFeatures(room),
  whispers: (room.whispers || []).filter((w) => w.tokenId === ownTokenId),
  mutedTokenIds: (room.mutedTokenIds || []).filter((id) => id === ownTokenId),
  logs: (room.logs || []).filter((l) => !l.private),
});

// Limite ai tentativi di password errati, per IP e stanza: blocca chi prova password a raffica
const MAX_FAILED_JOINS = 10;
const FAILED_JOIN_WINDOW_MS = 15 * 60 * 1000;
const failedJoins = new Map(); // `${ip}|${roomId}` -> { count, resetAt }

const recordFailedJoin = (key) => {
  const now = Date.now();
  if (failedJoins.size > 1000) {
    // pulizia dei blocchi scaduti, perché la mappa non cresca all'infinito
    for (const [k, v] of failedJoins) if (v.resetAt <= now) failedJoins.delete(k);
  }
  const current = failedJoins.get(key);
  if (current && current.resetAt > now) current.count++;
  else failedJoins.set(key, { count: 1, resetAt: now + FAILED_JOIN_WINDOW_MS });
};

const isJoinBlocked = (key) => {
  const entry = failedJoins.get(key);
  return Boolean(entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILED_JOINS);
};

// Iniziativa: entries già ordinate (valore più alto prima, a parità vale l'ordine inviato dal Master).
// Le pedine sconosciute o ripetute vengono scartate.
const sortInitiativeEntries = (room, entries) => {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map((e) => ({ tokenId: e?.tokenId, value: Number(e?.value) }))
    .filter((e) => Number.isFinite(e.value) && room.tokens.some((t) => t.id === e.tokenId) && !seen.has(e.tokenId) && seen.add(e.tokenId))
    .sort((a, b) => b.value - a.value);
};

// SCENE: la scena attiva vive nei campi della stanza (sfondo, disegni, nebbia, NPC); le altre restano
// in room.scenes col loro contenuto. Le pedine dei giocatori sono comuni a tutte le scene.
const newSceneId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ensureScenes = (room) => {
  if (room.scenes?.length) return;
  room.scenes = [{ id: 'scena1', name: 'Scena 1' }]; // stanze create prima delle scene
  room.activeSceneId = 'scena1';
};
const switchScene = (room, target) => {
  const current = room.scenes.find((s) => s.id === room.activeSceneId);
  Object.assign(current, {
    backgroundUrl: room.backgroundUrl,
    drawings: room.drawings,
    fog: room.fog,
    features: room.features,
    npcs: room.tokens.filter((t) => t.type === 'npc'),
  });
  room.backgroundUrl = target.backgroundUrl ?? null;
  room.drawings = target.drawings ?? [];
  room.fog = target.fog ?? { enabled: false, areas: [] };
  room.features = target.features ?? [];
  room.tokens = [...room.tokens.filter((t) => t.type !== 'npc'), ...(target.npcs ?? [])];
  for (const key of ['backgroundUrl', 'drawings', 'fog', 'features', 'npcs']) delete target[key];
  room.activeSceneId = target.id;
  // gli ingaggi con NPC rimasti nell'altra scena non valgono più
  room.engagements = (room.engagements || []).filter((pair) => pair.every((id) => room.tokens.some((t) => t.id === id)));
};

// Una stanza rimasta senza nessuno connesso viene cancellata dopo questo tempo (se nessuno rientra)
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000;

// Collega socket.io e tutta la logica delle stanze a un server HTTP (usato da main e dai test)
// store (opzionale): salvataggio su disco delle stanze, vedi persistence.js
// publicUrl (opzionale): link pubblico del tunnel, mostrato al Master per invitare i giocatori
function attachSocketServer(httpServer, { roomIdleTtlMs = ROOM_IDLE_TTL_MS, store = null, publicUrl = null } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
    maxHttpBufferSize: 1e7, // 10MB to accommodate image uploads via socket
  });

  // Stanze attive in memoria (copia di lavoro). Con lo store, una stanza non in memoria viene
  // caricata dal disco la prima volta che qualcuno ci entra (anche dopo un riavvio).
  const rooms = new Map();
  const getRoom = (roomId) => {
    if (!rooms.has(roomId) && store) {
      const saved = store.load(roomId);
      if (saved) {
        ensureScenes(saved);
        rooms.set(roomId, saved);
      }
    }
    return rooms.get(roomId);
  };

  // Le stanze abbandonate vengono tolte dalla memoria, altrimenti ci restano fino al riavvio.
  // Su disco restano: la campagna non si perde, al rientro viene ricaricata.
  // Allo scadere ricontrolla: se nel frattempo qualcuno è rientrato la stanza resta.
  const cleanupTimers = new Map(); // roomId -> timeout
  const scheduleRoomCleanupIfEmpty = (roomId) => {
    if (!rooms.has(roomId) || io.sockets.adapter.rooms.get(roomId)?.size) return;
    clearTimeout(cleanupTimers.get(roomId)); // ogni nuova uscita fa ripartire l'attesa da capo
    const timer = setTimeout(() => {
      cleanupTimers.delete(roomId);
      if (!io.sockets.adapter.rooms.get(roomId)?.size) rooms.delete(roomId);
    }, roomIdleTtlMs);
    timer.unref(); // non tiene acceso il processo
    cleanupTimers.set(roomId, timer);
  };

  io.on('connection', (socket) => {
    console.log(`🔌 Connesso socket: ${socket.id}`);

    // Dopo ogni evento la stanza del socket viene salvata a breve. setImmediate: i gestori sono
    // sincroni e girano dopo onAny, così socket.roomId è già aggiornato (anche per create/join-room)
    socket.onAny(() =>
      setImmediate(() => {
        const room = rooms.get(socket.roomId);
        if (room) store?.markDirty(room);
      })
    );

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

    // audience: socket.io rooms/socket ids che possono vedere il log (default: tutta la stanza)
    const createAndBroadcastLog = (roomId, actorName, actorRole, actionType, description, details = {}, audience = null) => {
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
        ...(audience && { private: true }),
      };

      room.logs.push(logRecord);
      if (room.logs.length > 500) {
        room.logs.shift();
      }

      io.to(audience || roomId).emit('action-logged', logRecord);
    };

    // Iniziativa e ingaggi: il Master li riceve completi, i giocatori senza gli NPC nascosti
    const emitInitiative = (roomId, room) => {
      io.to(masterRoom(roomId)).emit('initiative-updated', room.initiative);
      io.to(roomId).except(masterRoom(roomId)).emit('initiative-updated', playerInitiative(room));
    };
    const emitFeatures = (roomId, room) => {
      io.to(masterRoom(roomId)).emit('features-updated', room.features || []);
      io.to(roomId).except(masterRoom(roomId)).emit('features-updated', playerFeatures(room));
    };
    const emitEngagements = (roomId, room) => {
      io.to(masterRoom(roomId)).emit('engagements-updated', room.engagements);
      io.to(roomId).except(masterRoom(roomId)).emit('engagements-updated', playerEngagements(room));
    };
    // Eventi e log su una pedina nascosta vanno solo al Master (null = tutta la stanza, per i log)
    const hiddenAudience = (roomId, ...tokens) => (tokens.some((t) => t?.hidden) ? masterRoom(roomId) : null);

    // Colore con cui gli altri vedono ping e misure di questo socket: oro il Master, il colore della pedina i giocatori
    const socketColor = (room) =>
      socket.role === 'MASTER' ? '#fbbf24' : room.tokens.find((t) => t.id === socket.tokenId)?.color || '#3b82f6';

    // Un socket sta in una sola stanza: prima di entrare in un'altra esce dalla precedente
    // (anche dalla sua stanza Master), così smette di riceverne eventi e HP
    const leaveCurrentRoom = () => {
      if (!socket.roomId) return;
      io.to(socket.roomId).emit('measured', { id: socket.id, measure: null }); // la sua misura sparisce
      socket.leave(socket.roomId);
      socket.leave(masterRoom(socket.roomId));
      scheduleRoomCleanupIfEmpty(socket.roomId);
    };

    // ELENCO STANZE per la home: codice e nome, dalla più recente. Per entrare servono comunque le password.
    socket.on('list-rooms', (callback) => {
      const byId = new Map((store?.list() ?? []).map((r) => [r.id, r]));
      // stanze appena create e non ancora salvate: contano come modificate adesso
      rooms.forEach((room) => byId.has(room.id) || byId.set(room.id, { id: room.id, name: room.name, updatedAt: Date.now() }));
      callback?.([...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt));
    });

    // È il Master di questa stanza? Con la chiave salvata nel browser, oppure con la password del Master da
    // qualsiasi dispositivo (la password della stanza è condivisa con i giocatori, quindi non basta).
    // Restituisce il messaggio d'errore, o null se è il Master.
    const masterAuthError = (room, { masterKey, masterPassword }) => {
      const attemptKey = `${socket.handshake.address}|${room.id}`;
      if (isJoinBlocked(attemptKey)) return 'Troppi tentativi errati. Riprova tra qualche minuto.';
      const byKey = Boolean(masterKey) && room.masterKey === masterKey;
      const byPassword = Boolean(masterPassword) && room.masterPassword === masterPassword;
      if (byKey || byPassword) return null;
      if (masterPassword) recordFailedJoin(attemptKey);
      return masterPassword
        ? 'Password del Master errata.'
        : 'Questa stanza esiste già: per gestirla serve la password del Master.';
    };

    // ELIMINA STANZA (solo Master): irreversibile, toglie la stanza dalla memoria e dal disco
    socket.on('delete-room', ({ roomId, masterKey, masterPassword }, callback) => {
      const cleanRoomId = (roomId || '').trim().toLowerCase();
      const room = getRoom(cleanRoomId);
      if (!room) return callback?.({ success: false, error: 'La stanza non esiste più.' });

      const authError = masterAuthError(room, { masterKey, masterPassword });
      if (authError) return callback?.({ success: false, error: authError });

      // chi è dentro viene avvisato e fatto uscire
      io.to(cleanRoomId).emit('room-deleted');
      io.in(cleanRoomId).socketsLeave([cleanRoomId, masterRoom(cleanRoomId)]);
      rooms.delete(cleanRoomId);
      store?.remove(cleanRoomId);
      callback?.({ success: true });
    });

    // CREA STANZA (Master)
    socket.on('create-room', ({ roomId, roomName, password, masterKey, masterPassword, gridSize, gridScale }, callback) => {
      const cleanRoomId = (roomId || '').trim().toLowerCase();
      if (!cleanRoomId) {
        return callback?.({ success: false, error: 'Codice stanza non valido.' });
      }

      const existing = getRoom(cleanRoomId);
      if (existing) {
        const authError = masterAuthError(existing, { masterKey, masterPassword });
        if (authError) return callback?.({ success: false, error: authError });
        leaveCurrentRoom();
        socket.join([cleanRoomId, masterRoom(cleanRoomId)]);
        socket.role = 'MASTER';
        socket.roomId = cleanRoomId;
        socket.playerName = 'Master';
        return callback?.({ success: true, room: publicRoom(existing), masterKey: existing.masterKey, publicUrl });
      }

      const newRoom = {
        id: cleanRoomId,
        name: roomName || `Stanza ${cleanRoomId}`,
        password: password || '',
        masterKey: randomUUID(),
        masterPassword: masterPassword || '', // per rientrare come Master da qualsiasi dispositivo
        playerKeys: new Map(), // chiave segreta del giocatore -> id della sua pedina
        gridSize: gridSize || 50,
        gridScale: gridScale || 1, // Scala di default: 1 metro per quadrato
        gridVisible: true,
        backgroundUrl: null,
        tokens: [],
        drawings: [],
        logs: [],
        initiative: null, // { entries: [{ tokenId, value }], activeTokenId, round } durante il combattimento
        engagements: [], // coppie [idA, idB] di pedine in combattimento tra loro
        fog: { enabled: false, areas: [] }, // nebbia di guerra: aree { x, y, w, h, hide } applicate in ordine
        scenes: [{ id: 'scena1', name: 'Scena 1' }], // vedi switchScene
        activeSceneId: 'scena1',
        whispers: [], // sussurri privati tra Master e giocatori, per pedina: { id, tokenId, from, name, text, at }
        mutedTokenIds: [], // pedine dei giocatori che il Master ha silenziato: non possono sussurrare
        features: [], // trappole, inneschi e forzieri della scena: { id, kind, x, y, name, text, triggered }
      };

      rooms.set(cleanRoomId, newRoom);
      leaveCurrentRoom();
      socket.join([cleanRoomId, masterRoom(cleanRoomId)]);
      socket.role = 'MASTER';
      socket.roomId = cleanRoomId;
      socket.playerName = 'Master';

      console.log(`🏰 Stanza creata: ${cleanRoomId} dal Master ${socket.id}`);
      callback?.({ success: true, room: publicRoom(newRoom), masterKey: newRoom.masterKey, publicUrl });

      createAndBroadcastLog(cleanRoomId, 'Master', 'MASTER', 'USER_JOIN', `Il Master ha creato la stanza "${newRoom.name}".`);
    });

    // UNISCITI ALLA STANZA (solo Player: il ruolo Master passa da create-room con la chiave)
    // Senza una pedina legata alla sua chiave, il giocatore sceglie tra le pedine giocatore libere
    // (claimTokenId) o ne crea una nuova (newCharacter): così la ritrova anche da un altro dispositivo.
    socket.on('join-room', ({ roomId, password, playerKey, playerName, playerColor, claimTokenId, newCharacter }, callback) => {
      const role = 'PLAYER';
      const cleanRoomId = (roomId || '').trim().toLowerCase();
      const room = getRoom(cleanRoomId);

      if (!room) {
        return callback?.({ success: false, error: `La stanza "${cleanRoomId}" non esiste.` });
      }

      // Validazione Password (con limite ai tentativi errati)
      const attemptKey = `${socket.handshake.address}|${cleanRoomId}`;
      if (isJoinBlocked(attemptKey)) {
        return callback?.({ success: false, error: 'Troppi tentativi errati. Riprova tra qualche minuto.' });
      }
      if (room.password && room.password !== password) {
        recordFailedJoin(attemptKey);
        return callback?.({ success: false, error: 'Password errata.' });
      }

      // La pedina si ritrova con la chiave del giocatore, non col nome (due giocatori possono chiamarsi uguale)
      const key = typeof playerKey === 'string' && playerKey ? playerKey : randomUUID();
      let existingToken = room.tokens.find((t) => t.id === room.playerKeys.get(key));

      // Una pedina è "in uso" se il suo proprietario è collegato a questa stanza
      const isInUse = (token) => {
        const owner = io.sockets.sockets.get(token.ownerId);
        return Boolean(owner?.connected && owner.roomId === cleanRoomId && owner.id !== socket.id);
      };
      if (!existingToken && claimTokenId) {
        const claimed = room.tokens.find((t) => t.id === claimTokenId && t.type === 'player');
        if (!claimed || isInUse(claimed)) {
          return callback?.({ success: false, error: 'Questa pedina non è disponibile: la sta già usando un altro giocatore.' });
        }
        // una pedina ha un solo proprietario: le chiavi vecchie che puntavano a lei non valgono più
        for (const [k, tokenId] of room.playerKeys) if (tokenId === claimed.id) room.playerKeys.delete(k);
        room.playerKeys.set(key, claimed.id);
        existingToken = claimed;
      }
      if (!existingToken && !newCharacter) {
        const free = room.tokens.filter((t) => t.type === 'player' && !isInUse(t));
        if (free.length > 0) {
          return callback?.({
            success: false,
            chooseToken: free.map(({ id, name, color, avatarUrl }) => ({ id, name, color, avatarUrl })),
          });
        }
      }

      leaveCurrentRoom(); // copre anche l'ex Master che rientra come giocatore nella stessa stanza
      socket.join(cleanRoomId);
      socket.role = role;
      socket.roomId = cleanRoomId;
      socket.playerName = playerName || 'Giocatore';

      let playerToken = null;

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
        io.to([masterRoom(cleanRoomId), socket.id]).emit('token-added', playerToken);
        io.to(cleanRoomId).except([masterRoom(cleanRoomId), socket.id]).emit('token-added', hideHp(playerToken));
      }

      socket.tokenId = playerToken.id;

      console.log(`👤 ${role} (${socket.playerName}) si è unito alla stanza: ${cleanRoomId}`);

      callback?.({
        success: true,
        room: playerView(room, playerToken.id),
        assignedTokenId: playerToken.id,
        playerKey: key,
      });

      createAndBroadcastLog(
        cleanRoomId,
        socket.playerName,
        role,
        'USER_JOIN',
        `${socket.playerName} (Giocatore) si è unito alla stanza.`
      );
    });

    // FINE SPOSTAMENTO TOKEN (Trasmette l'animazione di scorrimento "trascinandosi" a tutti i partecipanti)
    socket.on('move-token-end', ({ tokenId, startX, startY, endX, endY }) => {
      const roomId = socket.roomId; // mai il roomId del client: potrebbe puntare a un'altra stanza
      const room = rooms.get(roomId);
      if (!room) return;

      const token = room.tokens.find((t) => t.id === tokenId);
      if (!token) return;

      if (socket.role !== 'MASTER' && token.ownerId !== socket.id && socket.tokenId !== tokenId) {
        return;
      }

      // Solo il movimento della pedina di turno fa parte della giocata: animato per tutti e registrato.
      // In combattimento i giocatori si muovono solo nel proprio turno; il Master può sempre riposizionare.
      const isTurnMove = room.initiative?.activeTokenId === tokenId;
      if (room.initiative && !isTurnMove && socket.role !== 'MASTER') {
        return;
      }

      const finalSnapped = snapToCellCenter(endX ?? token.x, endY ?? token.y, room.gridSize);
      const actualStartX = startX ?? token.x;
      const actualStartY = startY ?? token.y;

      token.x = finalSnapped.x;
      token.y = finalSnapped.y;

      // Fuori turno (piazzamento, riposizionamento): tutti vedono solo la posizione finale, nessun log
      if (!isTurnMove) {
        io.to(hiddenAudience(roomId, token) || roomId).emit('token-moved', { tokenId, x: token.x, y: token.y });
        triggerFeatures(roomId, room, token);
        return;
      }

      // Broadcast dell'animazione fluida di scorrimento a TUTTI i client connessi
      io.to(hiddenAudience(roomId, token) || roomId).emit('token-moved-animated', {
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
        { tokenId, startX: actualStartX, startY: actualStartY, endX: token.x, endY: token.y, gridSteps, metersMoved },
        hiddenAudience(roomId, token)
      );
      triggerFeatures(roomId, room, token);
    });

    // TRAPPOLE, INNESCHI E FORZIERI: scattano quando una pedina giocatore arriva nel loro quadretto.
    // Trappola e forziere avvisano tutti; l'innesco solo il Master. Scattano una volta, finché il Master non li riarma.
    const FEATURE_TEXT = {
      trap: (who, f) => `${who} fa scattare la trappola "${f.name}"!`,
      chest: (who, f) => `${who} apre il forziere "${f.name}".`,
      trigger: (who, f) => `${who} attiva l'innesco "${f.name}".`,
    };
    const triggerFeatures = (roomId, room, token) => {
      if (token.type !== 'player') return;
      const cell = (v) => Math.floor(v / room.gridSize);
      const hits = (room.features || []).filter(
        (f) => !f.triggered && cell(f.x) === cell(token.x) && cell(f.y) === cell(token.y)
      );
      if (!hits.length) return;
      for (const f of hits) {
        f.triggered = true;
        const audience = f.kind === 'trigger' ? masterRoom(roomId) : null;
        const description = FEATURE_TEXT[f.kind](token.name, f) + (f.text ? ` ${f.text}` : '');
        io.to(audience || roomId).emit('feature-triggered', { feature: f, tokenName: token.name });
        createAndBroadcastLog(roomId, token.name, 'PLAYER', 'MAP_CHANGE', description, { featureId: f.id }, audience);
      }
      emitFeatures(roomId, room);
    };




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

      // Solo il Master e il proprietario della pedina ricevono gli HP
      const hpAudience = [masterRoom(roomId), token.ownerId].filter(Boolean);
      io.to(hpAudience).emit('token-hp-updated', {
        tokenId,
        hp: token.hp,
        maxHp: token.maxHp,
      });

      createAndBroadcastLog(
        roomId,
        socket.playerName || (socket.role === 'MASTER' ? 'Master' : token.name),
        socket.role,
        'HP_UPDATE',
        `${socket.playerName || token.name} ha aggiornato gli HP di "${token.name}" a ${token.hp}/${token.maxHp} (da ${prevHp}).`,
        {},
        hpAudience
      );
    });

    // DANNI / CURE DI GRUPPO (Master only): delta negativo danneggia, positivo cura, su più pedine insieme
    // (es. palla di fuoco). Gli HP restano tra 0 e il massimo; come sempre li vedono solo Master e proprietario.
    socket.on('apply-hp-delta', ({ tokenIds, delta } = {}) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      const amount = parseInt(delta, 10);
      if (!room || socket.role !== 'MASTER' || !Array.isArray(tokenIds) || !amount) return;

      room.tokens
        .filter((t) => tokenIds.includes(t.id))
        .forEach((token) => {
          const max = token.maxHp ?? Infinity;
          token.hp = Math.max(0, Math.min(max, (token.hp ?? 0) + amount));

          const hpAudience = [masterRoom(roomId), token.ownerId].filter(Boolean);
          io.to(hpAudience).emit('token-hp-updated', { tokenId: token.id, hp: token.hp, maxHp: token.maxHp });
          createAndBroadcastLog(
            roomId,
            'Master',
            'MASTER',
            'HP_UPDATE',
            amount < 0
              ? `Il Master infligge ${-amount} danni a "${token.name}" (${token.hp}/${token.maxHp}).`
              : `Il Master cura "${token.name}" di ${amount} HP (${token.hp}/${token.maxHp}).`,
            {},
            hpAudience
          );
        });
    });

    // CONDIZIONI (Master su tutte le pedine, giocatore sulla propria): attiva o toglie una condizione.
    // Visibili a tutti come le pedine; l'elenco dei nomi validi sta nel client (lib/utils CONDITIONS).
    socket.on('toggle-token-condition', ({ tokenId, condition } = {}) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || typeof condition !== 'string' || !condition.trim() || condition.length > 30) return;

      const token = room.tokens.find((t) => t.id === tokenId);
      if (!token) return;
      if (socket.role !== 'MASTER' && token.ownerId !== socket.id && socket.tokenId !== tokenId) return;

      const name = condition.trim();
      const current = token.conditions || [];
      const active = !current.includes(name);
      if (active && current.length >= 16) return;
      token.conditions = active ? [...current, name] : current.filter((c) => c !== name);

      io.to(hiddenAudience(roomId, token) || roomId).emit('token-conditions-updated', { tokenId, conditions: token.conditions });

      createAndBroadcastLog(
        roomId,
        socket.playerName || (socket.role === 'MASTER' ? 'Master' : token.name),
        socket.role,
        'HP_UPDATE',
        active ? `"${token.name}" ha ora la condizione ${name}.` : `"${token.name}" non ha più la condizione ${name}.`,
        {},
        hiddenAudience(roomId, token)
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
      io.to(hiddenAudience(roomId, token) || roomId).emit('token-avatar-updated', {
        tokenId,
        avatarUrl: token.avatarUrl,
      });

      callback?.({ success: true, avatarUrl: token.avatarUrl });

      createAndBroadcastLog(
        roomId,
        socket.playerName || (socket.role === 'MASTER' ? 'Master' : token.name),
        socket.role,
        'AVATAR_UPDATE',
        `${socket.playerName || token.name} ha aggiornato l'immagine della pedina "${token.name}".`,
        {},
        hiddenAudience(roomId, token)
      );
    });

    // AGGIUNTA TOKEN / NPC (Master only)
    socket.on('add-token', ({ tokenData }, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') {
        return callback?.({ success: false, error: 'Solo il Master può aggiungere NPC/Token.' });
      }

      const defaultX = tokenData.x ?? room.gridSize * 3.5;
      const defaultY = tokenData.y ?? room.gridSize * 3.5;
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
        hidden: tokenData.type !== 'player' && Boolean(tokenData.hidden), // NPC preparato in segreto
      };

      room.tokens.push(newToken);
      io.to(masterRoom(roomId)).emit('token-added', newToken);
      if (!newToken.hidden) io.to(roomId).except(masterRoom(roomId)).emit('token-added', hideHp(newToken));
      callback?.({ success: true, token: newToken }); // nessun log: la preparazione della scena non fa parte della giocata
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

      if (room.engagements?.some((pair) => pair.includes(tokenId))) {
        room.engagements = room.engagements.filter((pair) => !pair.includes(tokenId));
        emitEngagements(roomId, room);
      }
      callback?.({ success: true });

      // Una pedina rimossa esce dall'iniziativa; se era di turno, il turno passa a chi la seguiva
      if (room.initiative?.entries.some((e) => e.tokenId === tokenId)) {
        const { entries, activeTokenId } = room.initiative;
        const index = entries.findIndex((e) => e.tokenId === tokenId);
        const remaining = entries.filter((e) => e.tokenId !== tokenId);
        if (remaining.length === 0) {
          room.initiative = null;
        } else {
          room.initiative.entries = remaining;
          if (activeTokenId === tokenId) room.initiative.activeTokenId = remaining[index % remaining.length].tokenId;
        }
        emitInitiative(roomId, room);
      }

      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'TOKEN_REMOVE',
        `Il Master ha rimosso il token "${tokenName}".`,
        {},
        hiddenAudience(roomId, targetToken)
      );
    });

    // INIZIATIVA (Master only): avvia o aggiorna l'ordine dei turni
    socket.on('set-initiative', ({ entries }, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') {
        return callback?.({ success: false, error: "Solo il Master può gestire l'iniziativa." });
      }

      const sorted = sortInitiativeEntries(room, entries);
      if (sorted.length === 0) {
        return callback?.({ success: false, error: "Inserisci l'iniziativa di almeno una pedina." });
      }

      const starting = !room.initiative;
      if (starting) {
        room.initiative = { entries: sorted, activeTokenId: sorted[0].tokenId, round: 1 };
      } else {
        room.initiative.entries = sorted;
        // se la pedina di turno è stata tolta dall'ordine, il turno passa alla prima
        if (!sorted.some((e) => e.tokenId === room.initiative.activeTokenId)) {
          room.initiative.activeTokenId = sorted[0].tokenId;
        }
      }

      emitInitiative(roomId, room);
      callback?.({ success: true });

      if (starting) {
        const first = room.tokens.find((t) => t.id === room.initiative.activeTokenId);
        // i giocatori sanno che il combattimento inizia, ma non chi agisce se è nascosto
        const turnOf = first.hidden ? '' : ` Round 1: turno di "${first.name}".`;
        createAndBroadcastLog(roomId, 'Master', 'MASTER', 'TURN', `Inizia il combattimento.${turnOf}`);
      }
    });

    // TURNO SUCCESSIVO (Master only): passa alla pedina seguente, in fondo alla lista inizia un nuovo round
    socket.on('next-turn', () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER' || !room.initiative) return;

      const { entries } = room.initiative;
      const next = entries.findIndex((e) => e.tokenId === room.initiative.activeTokenId) + 1;
      if (next >= entries.length) room.initiative.round++;
      room.initiative.activeTokenId = entries[next % entries.length].tokenId;

      emitInitiative(roomId, room);

      const active = room.tokens.find((t) => t.id === room.initiative.activeTokenId);
      createAndBroadcastLog(
        roomId,
        'Master',
        'MASTER',
        'TURN',
        `Round ${room.initiative.round}: turno di "${active.name}".`,
        {},
        hiddenAudience(roomId, active)
      );
    });

    // FINE COMBATTIMENTO (Master only): da qui i movimenti tornano liberi e non registrati
    socket.on('end-initiative', () => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER' || !room.initiative) return;

      room.initiative = null;
      room.engagements = []; // finito il combattimento nessuno è più ingaggiato
      io.to(roomId).emit('initiative-updated', null);
      io.to(roomId).emit('engagements-updated', room.engagements);
      createAndBroadcastLog(roomId, 'Master', 'MASTER', 'TURN', 'Il combattimento è terminato.');
    });

    // INGAGGIO: segna (o toglie) che due pedine sono in combattimento tra loro. È reciproco:
    // la coppia è salvata una volta sola, con gli id in ordine. Il giocatore parte dalla propria pedina.
    socket.on('toggle-engagement', ({ tokenId, targetId }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || tokenId === targetId) return;

      const token = room.tokens.find((t) => t.id === tokenId);
      const target = room.tokens.find((t) => t.id === targetId);
      if (!token || !target) return;
      if (socket.role !== 'MASTER' && token.ownerId !== socket.id && socket.tokenId !== tokenId) return;

      const pair = [tokenId, targetId].sort();
      const engagements = room.engagements || [];
      const exists = engagements.some(([a, b]) => a === pair[0] && b === pair[1]);
      room.engagements = exists
        ? engagements.filter(([a, b]) => !(a === pair[0] && b === pair[1]))
        : [...engagements, pair];
      emitEngagements(roomId, room);

      createAndBroadcastLog(
        roomId,
        socket.playerName || (socket.role === 'MASTER' ? 'Master' : token.name),
        socket.role,
        'ENGAGEMENT',
        exists
          ? `"${token.name}" e "${target.name}" non sono più in combattimento.`
          : `"${token.name}" ingaggia "${target.name}".`,
        {},
        hiddenAudience(roomId, token, target)
      );
    });

    // NASCONDI / MOSTRA NPC (Master only): per i giocatori la pedina sparisce o compare,
    // insieme ai suoi turni e ingaggi
    socket.on('set-token-hidden', ({ tokenId, hidden }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      const token = room.tokens.find((t) => t.id === tokenId && t.type === 'npc');
      if (!token || Boolean(token.hidden) === Boolean(hidden)) return;
      token.hidden = Boolean(hidden);

      io.to(masterRoom(roomId)).emit('token-hidden-updated', { tokenId, hidden: token.hidden });
      const players = io.to(roomId).except(masterRoom(roomId));
      if (token.hidden) players.emit('token-removed', { tokenId });
      else players.emit('token-added', hideHp(token));
      emitInitiative(roomId, room);
      emitEngagements(roomId, room);
    });

    // PING (tutti): pressione lunga sulla mappa, un segnale che tutti vedono per un attimo. Non viene salvato.
    socket.on('map-ping', ({ x, y } = {}) => {
      const room = rooms.get(socket.roomId);
      if (!room || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const now = Date.now();
      if (now - (socket.lastPingAt || 0) < 300) return; // niente raffiche
      socket.lastPingAt = now;

      io.to(socket.roomId).emit('map-pinged', { x, y, name: socket.playerName, color: socketColor(room) });
    });

    // MISURE (tutti): righello o area d'effetto, visibile a tutta la stanza finché l'autore non la toglie
    // (measure null). Il server non la salva: serve solo a mostrarla a tutti.
    const MEASURE_KINDS = ['ruler', 'sphere', 'cone', 'line'];
    socket.on('measure', (measure) => {
      const room = rooms.get(socket.roomId);
      if (!room) return;
      const valid =
        measure && MEASURE_KINDS.includes(measure.kind) && ['x1', 'y1', 'x2', 'y2'].every((k) => Number.isFinite(measure[k]));
      if (measure !== null && !valid) return;

      io.to(socket.roomId).emit('measured', {
        id: socket.id,
        measure: valid && {
          kind: measure.kind,
          x1: measure.x1,
          y1: measure.y1,
          x2: measure.x2,
          y2: measure.y2,
          name: socket.playerName,
          color: socketColor(room),
        },
      });
    });

    // HANDOUT (Master only): un'immagine mostrata a schermo intero a tutti; imageUrl null la chiude per tutti.
    // Non viene salvata nella stanza: chi entra dopo non la vede.
    socket.on('show-handout', ({ imageUrl, title } = {}) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;
      if (imageUrl !== null && !(typeof imageUrl === 'string' && imageUrl.startsWith('data:image/'))) return;

      const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 100) : '';
      io.to(roomId).emit('handout-updated', { imageUrl, title: cleanTitle });

      if (imageUrl) {
        const named = cleanTitle ? `: "${cleanTitle}"` : '.';
        createAndBroadcastLog(roomId, 'Master', 'MASTER', 'MAP_CHANGE', `Il Master mostra un handout${named}`);
      }
    });

    // Dopo un cambio di scena ognuno riceve la stanza intera, filtrata per il suo ruolo
    const sendRoomToAll = (roomId, room) => {
      for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
        const s = io.sockets.sockets.get(id);
        s?.emit('room-reloaded', s.role === 'MASTER' ? publicRoom(room) : playerView(room, s.tokenId));
      }
    };

    // Le scene si cambiano solo fuori dal combattimento: l'iniziativa riguarda le pedine della scena
    const sceneError = (room) => {
      if (!room || socket.role !== 'MASTER') return 'Solo il Master può gestire le scene.';
      if (room.initiative) return 'Termina il combattimento prima di cambiare scena.';
      return null;
    };

    const goToScene = (roomId, room, target) => {
      switchScene(room, target);
      sendRoomToAll(roomId, room);
      createAndBroadcastLog(roomId, 'Master', 'MASTER', 'MAP_CHANGE', `Il Master passa alla scena "${target.name}".`);
    };

    // NUOVA SCENA (Master only): parte vuota (foglio bianco, niente NPC né nebbia) e diventa quella attiva
    socket.on('create-scene', ({ name } = {}, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      const error = sceneError(room);
      if (error) return callback?.({ success: false, error });

      const cleanName = typeof name === 'string' ? name.trim().slice(0, 40) : '';
      const scene = { id: newSceneId(), name: cleanName || `Scena ${room.scenes.length + 1}` };
      room.scenes.push(scene);
      goToScene(roomId, room, scene);
      callback?.({ success: true });
    });

    // CAMBIA SCENA (Master only)
    socket.on('switch-scene', ({ sceneId } = {}, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      const error = sceneError(room);
      if (error) return callback?.({ success: false, error });

      const target = room.scenes.find((s) => s.id === sceneId);
      if (!target) return callback?.({ success: false, error: 'Scena non trovata.' });
      if (target.id !== room.activeSceneId) goToScene(roomId, room, target);
      callback?.({ success: true });
    });

    // ELIMINA SCENA (Master only): non quella attiva. Con lei spariscono la sua mappa e i suoi NPC.
    socket.on('delete-scene', ({ sceneId } = {}, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return callback?.({ success: false, error: 'Solo il Master può gestire le scene.' });
      if (sceneId === room.activeSceneId) return callback?.({ success: false, error: 'Non puoi eliminare la scena in corso.' });
      if (!room.scenes.some((s) => s.id === sceneId)) return callback?.({ success: false, error: 'Scena non trovata.' });

      room.scenes = room.scenes.filter((s) => s.id !== sceneId);
      io.to(masterRoom(roomId)).emit('scenes-updated', publicRoom(room).scenes);
      callback?.({ success: true });
    });

    // ELEMENTI DELLA MAPPA (Master only): uno per quadretto, al centro del quadretto
    const FEATURE_KINDS = ['trap', 'trigger', 'chest'];
    const FEATURE_NAMES = { trap: 'Trappola', trigger: 'Innesco', chest: 'Forziere' };
    const MAX_FEATURES = 200;
    socket.on('add-feature', ({ kind, x, y, name, text } = {}, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return callback?.({ success: false, error: 'Solo il Master.' });
      if (!FEATURE_KINDS.includes(kind) || !Number.isFinite(x) || !Number.isFinite(y)) {
        return callback?.({ success: false, error: 'Elemento non valido.' });
      }
      if (!room.features) room.features = [];
      if (room.features.length >= MAX_FEATURES) return callback?.({ success: false, error: 'Troppi elementi in questa scena.' });
      const pos = snapToCellCenter(x, y, room.gridSize);
      if (room.features.some((f) => f.x === pos.x && f.y === pos.y)) {
        return callback?.({ success: false, error: "C'è già un elemento in questo quadretto." });
      }

      const cleanName = typeof name === 'string' ? name.trim().slice(0, 40) : '';
      const cleanText = typeof text === 'string' ? text.trim().slice(0, 300) : '';
      room.features.push({
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind,
        ...pos,
        name: cleanName || FEATURE_NAMES[kind],
        text: cleanText,
        triggered: false,
      });
      emitFeatures(roomId, room);
      callback?.({ success: true });
    });

    // Riarma (triggered false) o elimina un elemento
    socket.on('update-feature', ({ featureId, remove } = {}) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;
      const feature = (room.features || []).find((f) => f.id === featureId);
      if (!feature) return;
      if (remove) room.features = room.features.filter((f) => f !== feature);
      else feature.triggered = false;
      emitFeatures(roomId, room);
    });

    // SUSSURRI: messaggi privati tra un giocatore e il Master. La conversazione è legata alla pedina del
    // giocatore (la ritrova da qualsiasi dispositivo); il Master risponde indicando la pedina (toTokenId).
    // Un giocatore silenziato dal Master non può scrivere, ma continua a ricevere le risposte.
    const MAX_WHISPERS = 300;
    socket.on('whisper', ({ text, toTokenId } = {}, callback) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room) return callback?.({ success: false, error: 'Stanza non trovata.' });
      const clean = typeof text === 'string' ? text.trim().slice(0, 500) : '';
      if (!clean) return callback?.({ success: false, error: 'Messaggio vuoto.' });

      const isMaster = socket.role === 'MASTER';
      const tokenId = isMaster ? toTokenId : socket.tokenId;
      const token = room.tokens.find((t) => t.id === tokenId && t.type === 'player');
      if (!token) return callback?.({ success: false, error: 'Giocatore non trovato.' });
      if (!isMaster && room.mutedTokenIds?.includes(tokenId)) {
        return callback?.({ success: false, error: 'Il Master ti ha silenziato.' });
      }
      const now = Date.now();
      if (!isMaster && now - (socket.lastWhisperAt || 0) < 500) {
        return callback?.({ success: false, error: 'Aspetta un attimo prima di scrivere ancora.' });
      }
      socket.lastWhisperAt = now;

      const whisper = {
        id: `w-${now}-${Math.random().toString(36).slice(2, 6)}`,
        tokenId,
        from: isMaster ? 'MASTER' : 'PLAYER',
        name: isMaster ? 'Master' : socket.playerName || token.name,
        text: clean,
        at: now,
      };
      if (!room.whispers) room.whispers = [];
      room.whispers.push(whisper);
      if (room.whispers.length > MAX_WHISPERS) room.whispers.shift();

      io.to([masterRoom(roomId), token.ownerId].filter(Boolean)).emit('whispered', whisper);
      callback?.({ success: true });
    });

    // SILENZIA / RIATTIVA GIOCATORE (Master only)
    socket.on('set-player-muted', ({ tokenId, muted } = {}) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;
      const token = room.tokens.find((t) => t.id === tokenId && t.type === 'player');
      if (!token) return;

      const others = (room.mutedTokenIds || []).filter((id) => id !== tokenId);
      room.mutedTokenIds = muted ? [...others, tokenId] : others;
      io.to(masterRoom(roomId)).emit('muted-updated', room.mutedTokenIds);
      if (token.ownerId) io.to(token.ownerId).emit('muted-updated', muted ? [tokenId] : []);
    });

    // TRATTI DI DISEGNO (Master only)
    socket.on('draw-stroke', ({ stroke }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      room.drawings.push(stroke);
      io.to(roomId).emit('stroke-drawn', stroke);
    });

    // NEBBIA DI GUERRA (Master only): enabled la accende o spegne, area rivela un rettangolo
    // (o lo ricopre con hide), reset ricopre tutta la mappa
    const MAX_FOG_AREAS = 2000;
    socket.on('update-fog', ({ enabled, area, reset } = {}) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      if (!room.fog) room.fog = { enabled: false, areas: [] };
      const wasEnabled = room.fog.enabled;
      if (typeof enabled === 'boolean') room.fog.enabled = enabled;
      if (reset) room.fog.areas = [];
      const valid = area && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(area[k])) && area.w > 0 && area.h > 0;
      if (valid && room.fog.areas.length < MAX_FOG_AREAS) {
        room.fog.areas.push({ x: area.x, y: area.y, w: area.w, h: area.h, hide: Boolean(area.hide) });
      }

      io.to(roomId).emit('fog-updated', room.fog);

      if (room.fog.enabled !== wasEnabled) {
        createAndBroadcastLog(
          roomId,
          'Master',
          'MASTER',
          'MAP_CHANGE',
          room.fog.enabled ? 'Il Master ha avvolto la mappa nella nebbia di guerra.' : 'Il Master ha dissolto la nebbia di guerra.'
        );
      }
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
    socket.on('update-grid', ({ gridSize, gridScale, gridVisible }) => {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (!room || socket.role !== 'MASTER') return;

      if (gridSize !== undefined) room.gridSize = gridSize;
      if (gridScale !== undefined) room.gridScale = gridScale;
      if (gridVisible !== undefined) room.gridVisible = gridVisible;

      io.to(roomId).emit('grid-updated', {
        gridSize: room.gridSize,
        gridScale: room.gridScale,
        gridVisible: room.gridVisible,
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
      // a questo punto il socket è già uscito dalle sue stanze
      if (socket.roomId) {
        io.to(socket.roomId).emit('measured', { id: socket.id, measure: null }); // la sua misura sparisce
        scheduleRoomCleanupIfEmpty(socket.roomId);
      }
    });
  });

  return io;
}

if (require.main === module) {
  // --production al posto di NODE_ENV=production: la sintassi VAR=valore non funziona nel terminale di Windows
  if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';
  const next = require('next');

  const dev = process.env.NODE_ENV !== 'production';
  const hostname = process.env.HOSTNAME || (dev ? 'localhost' : '0.0.0.0');
  const port = parseInt(process.env.PORT || '3000', 10);

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
      const parsedUrl = parseUrl(req.url, true);
      handle(req, res, parsedUrl);
    });

    // Le stanze vengono salvate in data/rooms e ricaricate quando qualcuno ci rientra
    const store = createRoomStore(path.join(__dirname, 'data', 'rooms'));
    attachSocketServer(httpServer, { store, publicUrl: process.env.PUBLIC_URL || null });

    // Alla chiusura (Ctrl+C o finestra del terminale chiusa) scrive i salvataggi ancora in attesa
    const shutdown = () => {
      store.flush();
      process.exit(0);
    };
    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => process.on(signal, shutdown));

    httpServer.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Server WebSockets attivo ed in ascolto per D&D Map Manager`);
    });
  });
}

module.exports = { attachSocketServer, createRoomStore };
