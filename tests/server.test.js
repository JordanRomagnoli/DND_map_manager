// Test delle regole di accesso del server socket: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { io: connect } = require('socket.io-client');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { attachSocketServer, createRoomStore } = require('../server');

let httpServer;
let ioServer;
let url;
const clients = [];

// Ogni test usa codici stanza propri: lo stato delle stanze è condiviso nel processo
const client = () => {
  const socket = connect(url, { forceNew: true });
  clients.push(socket);
  return socket;
};
const ack = (socket, event, data) => new Promise((resolve) => socket.emit(event, data, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  console.log = console.warn = () => {}; // silenzia i log del server
  httpServer = createServer();
  ioServer = attachSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${httpServer.address().port}`;
});

after(() => {
  clients.forEach((socket) => socket.disconnect());
  ioServer.close();
});

test('un Master non può modificare la stanza di un altro', async () => {
  const victim = client();
  const evil = client();
  const { masterKey } = await ack(victim, 'create-room', { roomId: 'victim', password: 'a' });
  await ack(evil, 'create-room', { roomId: 'evil', password: 'b' });
  victim.emit('draw-stroke', { stroke: { id: 's1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } });

  let cleared = false;
  victim.on('canvas-cleared', () => (cleared = true));
  evil.emit('clear-canvas', { roomId: 'victim' });
  await wait(200);

  const res = await ack(client(), 'create-room', { roomId: 'victim', masterKey });
  assert.equal(cleared, false);
  assert.equal(res.room.drawings.length, 1);
});

test('cambiando stanza il socket smette di ricevere gli eventi della precedente', async () => {
  const dmA = client();
  const roamer = client();
  await ack(dmA, 'create-room', { roomId: 'old-a', password: 'pw' });
  await ack(client(), 'create-room', { roomId: 'new-b', password: 'pw' });

  // il roamer è Master di una sua stanza, poi entra in A come giocatore e infine va in B
  await ack(roamer, 'create-room', { roomId: 'roamer-home', password: 'pw' });
  await ack(roamer, 'join-room', { roomId: 'old-a', password: 'pw', playerName: 'R' });
  await ack(roamer, 'join-room', { roomId: 'new-b', password: 'pw', playerName: 'R' });

  const seen = [];
  roamer.onAny((event) => seen.push(event));
  dmA.emit('clear-canvas');
  const { token } = await ack(dmA, 'add-token', { tokenData: { name: 'Goblin', hp: 7 } });
  dmA.emit('update-token-hp', { tokenId: token.id, hp: 3 });
  await wait(200);

  assert.deepEqual(seen, [], 'nessun evento dalla stanza A');
});

test('dopo 10 password errate la stanza rifiuta altri tentativi', async () => {
  await ack(client(), 'create-room', { roomId: 'brute', password: 'giusta' });
  await ack(client(), 'create-room', { roomId: 'other', password: 'giusta' });

  // socket sempre nuovi, come farebbe un attacco: il limite è per IP, non per connessione
  for (let i = 0; i < 10; i++) {
    const res = await ack(client(), 'join-room', { roomId: 'brute', password: `prova${i}`, playerName: 'X' });
    assert.equal(res.error, 'Password errata.');
  }

  const blocked = await ack(client(), 'join-room', { roomId: 'brute', password: 'giusta', playerName: 'X' });
  assert.equal(blocked.success, false, 'bloccato anche con la password giusta');
  assert.match(blocked.error, /Troppi tentativi/);

  const elsewhere = await ack(client(), 'join-room', { roomId: 'other', password: 'giusta', playerName: 'X' });
  assert.ok(elsewhere.success, 'il blocco riguarda solo quella stanza');
});

test('un NPC messo a x=0, y=0 resta nel primo quadretto', async () => {
  const dm = client();
  await ack(dm, 'create-room', { roomId: 'origin', password: 'pw' });
  const { token } = await ack(dm, 'add-token', { tokenData: { name: 'Ratto', x: 0, y: 0 } });
  assert.deepEqual([token.x, token.y], [25, 25], 'centro del quadretto (0,0) con griglia da 50');
});

test('la password da sola non dà il ruolo di Master', async () => {
  const dm = client();
  const player = client();
  const made = await ack(dm, 'create-room', { roomId: 'r1', password: 'pw' });
  assert.ok(made.success);
  assert.equal(typeof made.masterKey, 'string');
  assert.ok(!('masterKey' in made.room) && !('password' in made.room), 'chiave e password non inviate');

  const steal = await ack(player, 'create-room', { roomId: 'r1', password: 'pw' });
  assert.equal(steal.success, false);

  const joined = await ack(player, 'join-room', { roomId: 'r1', password: 'pw', role: 'MASTER', playerName: 'Bob' });
  assert.ok(joined.success);
  const rm = await ack(player, 'remove-token', { tokenId: joined.assignedTokenId });
  assert.equal(rm.success, false, 'join-room con role MASTER resta giocatore');

  const back = await ack(client(), 'create-room', { roomId: 'r1', masterKey: made.masterKey });
  assert.ok(back.success, 'il Master rientra con la chiave');
});

test('la pedina è legata alla chiave del giocatore, non al nome', async () => {
  const dm = client();
  let leaked = false;
  dm.onAny((event, data) => {
    if (JSON.stringify(data ?? '').includes('playerKey')) leaked = true;
  });
  await ack(dm, 'create-room', { roomId: 'pk', password: 'pw' });

  const a = await ack(client(), 'join-room', { roomId: 'pk', password: 'pw', playerName: 'Aragorn' });
  const b = await ack(client(), 'join-room', { roomId: 'pk', password: 'pw', playerName: 'Aragorn' });
  assert.notEqual(a.assignedTokenId, b.assignedTokenId, 'stesso nome, pedine diverse');
  assert.notEqual(a.playerKey, b.playerKey);

  const back = await ack(client(), 'join-room', { roomId: 'pk', password: 'pw', playerKey: a.playerKey, playerName: 'Aragorn' });
  assert.equal(back.assignedTokenId, a.assignedTokenId, 'rientrando con la chiave si ritrova la pedina');
  assert.equal(back.room.tokens.length, 2, 'nessuna pedina duplicata');
  assert.ok(!('playerKeys' in back.room) && !leaked, 'le chiavi non vengono mai inviate');

  const odd = await ack(client(), 'join-room', { roomId: 'pk', password: 'pw', playerKey: '__proto__', playerName: 'X' });
  assert.notEqual(odd.assignedTokenId, a.assignedTokenId);
});

test('gli HP arrivano solo al Master e al proprietario della pedina', async () => {
  const dm = client();
  const a = client();
  const b = client();
  const seen = { dm: [], a: [], b: [] };
  for (const [name, socket] of Object.entries({ dm, a, b })) socket.onAny((event, data) => seen[name].push(data));
  const received = (name, pattern) => seen[name].some((data) => pattern.test(JSON.stringify(data ?? '')));

  const { masterKey } = await ack(dm, 'create-room', { roomId: 'hp', password: 'pw' });
  const ja = await ack(a, 'join-room', { roomId: 'hp', password: 'pw', playerName: 'A' });
  const jb = await ack(b, 'join-room', { roomId: 'hp', password: 'pw', playerName: 'B' });
  const { token: dragon } = await ack(dm, 'add-token', { tokenData: { name: 'Drago', hp: 77, maxHp: 77 } });
  dm.emit('update-token-hp', { tokenId: dragon.id, hp: 12 });
  a.emit('update-token-hp', { tokenId: ja.assignedTokenId, hp: 9 });
  await wait(200);

  assert.ok(!received('b', /"hp":(77|12)|12\/77/), 'B non riceve gli HP del drago');
  assert.ok(!received('b', /"hp":9|9\/20/), 'B non riceve gli HP di A');
  assert.ok(jb.room.tokens.every((t) => t.id === jb.assignedTokenId || t.hp === undefined));
  assert.equal(jb.room.tokens.find((t) => t.id === jb.assignedTokenId).hp, 20, 'B vede i propri HP');
  assert.ok(seen.b.some((data) => data?.id === dragon.id), 'B vede comparire il drago');
  assert.ok(received('dm', /"hp":12/) && received('dm', /"hp":9/), 'il Master riceve tutti gli HP');
  assert.ok(received('a', /"hp":9/) && !received('a', /"hp":12/), 'A riceve solo i propri HP');

  const late = await ack(client(), 'join-room', { roomId: 'hp', password: 'pw', playerName: 'L' });
  assert.ok(!/12\/77|9\/20/.test(JSON.stringify(late.room.logs)), 'nessun log HP a chi entra dopo');
  const back = await ack(client(), 'create-room', { roomId: 'hp', masterKey });
  assert.equal(back.room.tokens.find((t) => t.id === dragon.id).hp, 12, 'il Master rientrando vede gli HP');
});

// Registra gli eventi ricevuti da un socket, per controllare cosa arriva e cosa no
const recorder = (socket) => {
  const events = [];
  socket.onAny((event, data) => events.push({ event, data }));
  return {
    events,
    has: (event, match = () => true) => events.some((e) => e.event === event && match(e.data)),
    clear: () => (events.length = 0),
  };
};
const isMoveLog = (data) => data?.actionType === 'TOKEN_MOVE';

test('fuori dal combattimento i movimenti mostrano solo il risultato e non vengono registrati', async () => {
  const dm = client();
  const pl = client();
  await ack(dm, 'create-room', { roomId: 'free', password: 'pw' });
  const { assignedTokenId: heroId } = await ack(pl, 'join-room', { roomId: 'free', password: 'pw', playerName: 'Eroe' });
  const { token: npc } = await ack(dm, 'add-token', { tokenData: { name: 'Orco', x: 25, y: 25 } });
  const seen = recorder(pl);

  pl.emit('move-token-end', { tokenId: heroId, startX: 25, startY: 25, endX: 125, endY: 125 });
  dm.emit('move-token-end', { tokenId: npc.id, startX: 25, startY: 25, endX: 275, endY: 25 });
  await wait(200);

  assert.ok(seen.has('token-moved', (d) => d.tokenId === heroId && d.x === 125), 'posizione finale del giocatore');
  assert.ok(seen.has('token-moved', (d) => d.tokenId === npc.id && d.x === 275), 'posizione finale dell\'NPC');
  assert.ok(!seen.has('token-moved-animated'), 'nessuna animazione');
  assert.ok(!seen.has('action-logged', isMoveLog), 'nessun log di movimento');
});

test('in combattimento solo la pedina di turno si muove con animazione e log', async () => {
  const dm = client();
  const pl = client();
  await ack(dm, 'create-room', { roomId: 'fight', password: 'pw' });
  const { assignedTokenId: heroId } = await ack(pl, 'join-room', { roomId: 'fight', password: 'pw', playerName: 'Eroe' });
  const { token: npc } = await ack(dm, 'add-token', { tokenData: { name: 'Orco', x: 25, y: 25 } });
  const seen = recorder(pl);

  const started = await ack(dm, 'set-initiative', { entries: [{ tokenId: heroId, value: 10 }, { tokenId: npc.id, value: 15 }] });
  assert.ok(started.success);
  await wait(100);
  assert.ok(seen.has('initiative-updated', (d) => d.activeTokenId === npc.id && d.round === 1), 'inizia chi ha iniziativa più alta');
  seen.clear();

  // turno dell'Orco: il giocatore non può muoversi
  pl.emit('move-token-end', { tokenId: heroId, endX: 525, endY: 525 });
  await wait(100);
  assert.ok(!seen.has('token-moved') && !seen.has('token-moved-animated'), 'giocatore fuori turno bloccato');

  // il Master muove l'Orco di turno: animato e registrato
  dm.emit('move-token-end', { tokenId: npc.id, startX: 25, startY: 25, endX: 125, endY: 25 });
  // il Master riposiziona l'Eroe (non di turno): solo il risultato, nessun log
  dm.emit('move-token-end', { tokenId: heroId, endX: 325, endY: 325 });
  await wait(200);
  assert.ok(seen.has('token-moved-animated', (d) => d.tokenId === npc.id), 'mossa di turno animata');
  assert.ok(seen.has('action-logged', (d) => isMoveLog(d) && d.details.tokenId === npc.id), 'mossa di turno registrata');
  assert.ok(seen.has('token-moved', (d) => d.tokenId === heroId && d.x === 325), 'riposizionamento silenzioso');
  assert.ok(!seen.has('action-logged', (d) => isMoveLog(d) && d.details.tokenId === heroId), 'riposizionamento non registrato');
  seen.clear();

  // tocca all'Eroe
  dm.emit('next-turn');
  await wait(100);
  pl.emit('move-token-end', { tokenId: heroId, startX: 325, startY: 325, endX: 375, endY: 325 });
  await wait(200);
  assert.ok(seen.has('token-moved-animated', (d) => d.tokenId === heroId), 'ora il giocatore si muove');
  assert.ok(seen.has('action-logged', (d) => isMoveLog(d) && d.details.tokenId === heroId));
});

test('ordine dei turni, round, rimozione di pedine e fine combattimento', async () => {
  const dm = client();
  const pl = client();
  await ack(dm, 'create-room', { roomId: 'order', password: 'pw' });
  const { assignedTokenId: heroId } = await ack(pl, 'join-room', { roomId: 'order', password: 'pw', playerName: 'Eroe' });
  const a = (await ack(dm, 'add-token', { tokenData: { name: 'A' } })).token.id;
  const b = (await ack(dm, 'add-token', { tokenData: { name: 'B' } })).token.id;
  let state = null;
  pl.on('initiative-updated', (s) => (state = s));

  const denied = await ack(pl, 'set-initiative', { entries: [{ tokenId: heroId, value: 99 }] });
  assert.equal(denied.success, false, 'solo il Master gestisce l\'iniziativa');

  await ack(dm, 'set-initiative', {
    entries: [{ tokenId: a, value: 5 }, { tokenId: heroId, value: 20 }, { tokenId: b, value: 12 }, { tokenId: 'fantasma', value: 30 }],
  });
  await wait(100);
  assert.deepEqual(state.entries.map((e) => e.tokenId), [heroId, b, a], 'ordinate per valore, pedine sconosciute scartate');

  const turns = [];
  for (let i = 0; i < 3; i++) {
    dm.emit('next-turn');
    await wait(60);
    turns.push([state.activeTokenId, state.round]);
  }
  assert.deepEqual(turns, [[b, 1], [a, 1], [heroId, 2]], 'in fondo alla lista ricomincia con round +1');

  dm.emit('next-turn'); // turno di B
  await wait(60);
  await ack(dm, 'remove-token', { tokenId: b });
  await wait(60);
  assert.equal(state.activeTokenId, a, 'rimossa la pedina di turno, tocca alla successiva');
  assert.deepEqual(state.entries.map((e) => e.tokenId), [heroId, a]);

  dm.emit('end-initiative');
  await wait(60);
  assert.equal(state, null, 'combattimento terminato');
  const seen = recorder(pl);
  pl.emit('move-token-end', { tokenId: heroId, endX: 75, endY: 75 });
  await wait(100);
  assert.ok(seen.has('token-moved') && !seen.has('token-moved-animated'), 'dopo il combattimento i movimenti tornano silenziosi');
});

test('la creazione di un NPC non compare nel registro', async () => {
  const dm = client();
  const pl = client();
  await ack(dm, 'create-room', { roomId: 'quiet-npc', password: 'pw' });
  await ack(pl, 'join-room', { roomId: 'quiet-npc', password: 'pw', playerName: 'Eroe' });
  const seen = recorder(pl);
  const masterSeen = recorder(dm);

  await ack(dm, 'add-token', { tokenData: { name: 'Imboscata' } });
  await wait(150);

  assert.ok(seen.has('token-added', (d) => d.name === 'Imboscata'), 'la pedina compare sulla mappa');
  assert.ok(!seen.has('action-logged') && !masterSeen.has('action-logged'), 'nessuna voce nel registro');
  const back = await ack(client(), 'join-room', { roomId: 'quiet-npc', password: 'pw', playerName: 'Altro' });
  assert.ok(!back.room.logs.some((l) => l.description.includes('Imboscata')), 'nemmeno nello storico');
});

test('le stanze abbandonate vengono cancellate, quelle ancora in uso no', async () => {
  // secondo server con attesa breve: in produzione sono 6 ore
  const shortServer = createServer();
  const shortIo = attachSocketServer(shortServer, { roomIdleTtlMs: 150 });
  await new Promise((resolve) => shortServer.listen(0, resolve));
  const shortUrl = `http://localhost:${shortServer.address().port}`;
  const open = () => connect(shortUrl, { forceNew: true });
  const exists = async (roomId) => {
    const probe = open();
    const res = await ack(probe, 'join-room', { roomId, password: 'pw', playerName: 'Sonda' });
    probe.disconnect();
    return res.success;
  };

  try {
    // 1. abbandonata: il Master esce e nessuno rientra
    const dm1 = open();
    await ack(dm1, 'create-room', { roomId: 'idle-gone', password: 'pw' });
    dm1.disconnect();
    await wait(400);
    assert.equal(await exists('idle-gone'), false, 'stanza vuota cancellata dopo l\'attesa');

    // 2. ancora in uso: il Master esce ma un giocatore resta
    const dm2 = open();
    const stay = open();
    await ack(dm2, 'create-room', { roomId: 'idle-busy', password: 'pw' });
    await ack(stay, 'join-room', { roomId: 'idle-busy', password: 'pw', playerName: 'Resto' });
    dm2.disconnect();
    await wait(400);
    assert.equal(await exists('idle-busy'), true, 'stanza con qualcuno dentro non cancellata');
    stay.disconnect();

    // 3. rientro in tempo: il timer si annulla
    const dm3 = open();
    const { masterKey } = await ack(dm3, 'create-room', { roomId: 'idle-back', password: 'pw' });
    dm3.disconnect();
    await wait(50);
    const back = open();
    assert.ok((await ack(back, 'create-room', { roomId: 'idle-back', masterKey })).success, 'rientro prima della scadenza');
    await wait(400);
    assert.equal(await exists('idle-back'), true, 'stanza salvata dal rientro');
    back.disconnect();
  } finally {
    shortIo.close();
  }
});

// Avvia un server separato (con il suo stato) per i test di persistenza e pulizia
const startServer = async (options) => {
  const http = createServer();
  const io = attachSocketServer(http, options);
  await new Promise((resolve) => http.listen(0, resolve));
  const url = `http://localhost:${http.address().port}`;
  const sockets = [];
  const open = () => {
    const socket = connect(url, { forceNew: true });
    sockets.push(socket);
    return socket;
  };
  const stop = () => {
    sockets.forEach((socket) => socket.disconnect());
    io.close();
  };
  return { open, stop };
};
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-rooms-'));

test("dopo un riavvio la stanza torna com'era, con ruoli e pedine", async () => {
  const dir = tempDir();
  const map = 'data:image/jpeg;base64,' + 'A'.repeat(50_000);

  // prima sessione
  const first = await startServer({ store: createRoomStore(dir, { saveDelayMs: 20 }) });
  const dm = first.open();
  const pl = first.open();
  const { masterKey } = await ack(dm, 'create-room', { roomId: 'campagna', password: 'pw' });
  const { assignedTokenId: heroId, playerKey } = await ack(pl, 'join-room', { roomId: 'campagna', password: 'pw', playerName: 'Eroe' });
  const { token: orc } = await ack(dm, 'add-token', { tokenData: { name: 'Orco', x: 125, y: 125, hp: 30, maxHp: 30 } });
  dm.emit('update-token-hp', { tokenId: orc.id, hp: 11 });
  dm.emit('update-background', { backgroundUrl: map });
  dm.emit('draw-stroke', { stroke: { id: 's1', points: [{ x: 0, y: 0 }, { x: 9, y: 9 }], color: '#000', width: 3 } });
  await ack(dm, 'set-initiative', { entries: [{ tokenId: heroId, value: 12 }, { tokenId: orc.id, value: 8 }] });
  dm.emit('next-turn');
  await wait(200);
  first.stop();

  // seconda sessione: nuovo server sulla stessa cartella
  const second = await startServer({ store: createRoomStore(dir) });
  try {
    const wrong = await ack(second.open(), 'join-room', { roomId: 'campagna', password: 'sbagliata', playerName: 'X' });
    assert.equal(wrong.success, false, 'la password è ancora richiesta');

    const back = await ack(second.open(), 'create-room', { roomId: 'campagna', masterKey });
    assert.ok(back.success, 'il Master rientra con la sua chiave');
    const room = back.room;
    assert.equal(room.tokens.find((t) => t.id === orc.id).hp, 11, "HP dell'Orco");
    assert.equal(room.backgroundUrl, map, 'mappa di sfondo');
    assert.equal(room.drawings.length, 1, 'disegni');
    assert.deepEqual([room.initiative.activeTokenId, room.initiative.round], [orc.id, 1], 'combattimento e turno');

    const hero = await ack(second.open(), 'join-room', { roomId: 'campagna', password: 'pw', playerKey, playerName: 'Eroe' });
    assert.equal(hero.assignedTokenId, heroId, 'il giocatore ritrova la sua pedina');
    assert.equal(hero.room.tokens.length, 2, 'nessuna pedina duplicata');
  } finally {
    second.stop();
  }
});

test('una stanza abbandonata esce dalla memoria ma resta su disco e si ricarica al rientro', async () => {
  const dir = tempDir();
  const srv = await startServer({ store: createRoomStore(dir, { saveDelayMs: 20 }), roomIdleTtlMs: 150 });
  const fileOf = (roomId) => path.join(dir, `room-${Buffer.from(roomId).toString('base64url')}.json`);
  try {
    // due stanze abbandonate; il codice "../con" non deve uscire dalla cartella né usare nomi riservati
    for (const roomId of ['../con', 'pausa']) {
      const dm = srv.open();
      const { masterKey } = await ack(dm, 'create-room', { roomId, password: 'pw' });
      await ack(dm, 'add-token', { tokenData: { name: `Orco di ${roomId}` } });
      await wait(100);
      dm.disconnect();
      fs.writeFileSync(path.join(dir, `${Buffer.from(roomId).toString('base64url')}.key`), masterKey);
    }
    await wait(400); // oltre l'attesa: entrambe tolte dalla memoria

    assert.ok(fs.readdirSync(dir).every((f) => !f.includes('..') && !/^con/i.test(f)), 'nomi file sicuri');
    assert.equal(fs.existsSync(path.join(path.dirname(dir), 'con.json')), false, 'niente fuori dalla cartella');

    // "pausa" è ancora su disco e torna intera al rientro del Master
    assert.ok(fs.existsSync(fileOf('pausa')), 'file ancora su disco');
    const masterKey = fs.readFileSync(path.join(dir, `${Buffer.from('pausa').toString('base64url')}.key`), 'utf8');
    const back = await ack(srv.open(), 'create-room', { roomId: 'pausa', masterKey });
    assert.ok(back.success && back.room.tokens.some((t) => t.name === 'Orco di pausa'), 'stanza ricaricata dal disco');

    // "../con" era davvero uscita dalla memoria: senza file non esiste più
    fs.rmSync(fileOf('../con'));
    const gone = await ack(srv.open(), 'join-room', { roomId: '../con', password: 'pw', playerName: 'X' });
    assert.equal(gone.success, false, 'non era più in memoria');

    // un file corrotto viene ignorato senza bloccare il server: la stanza risulta inesistente
    fs.writeFileSync(fileOf('rotta'), '{ non è json');
    const broken = await ack(srv.open(), 'join-room', { roomId: 'rotta', password: 'pw', playerName: 'X' });
    assert.equal(broken.success, false);
  } finally {
    srv.stop();
  }
});

test('ingaggio: reciproco, visibile a tutti, con permessi e pulizia', async () => {
  const dm = client();
  const a = client();
  const b = client();
  await ack(dm, 'create-room', { roomId: 'duel', password: 'pw' });
  const { assignedTokenId: aId } = await ack(a, 'join-room', { roomId: 'duel', password: 'pw', playerName: 'A' });
  const { assignedTokenId: bId } = await ack(b, 'join-room', { roomId: 'duel', password: 'pw', playerName: 'B' });
  const orc = (await ack(dm, 'add-token', { tokenData: { name: 'Orco' } })).token.id;
  const goblin = (await ack(dm, 'add-token', { tokenData: { name: 'Goblin' } })).token.id;
  let seen = null;
  b.on('engagements-updated', (list) => (seen = list));
  const sameAs = (pairs) => assert.deepEqual(seen.map((p) => [...p].sort()).sort(), pairs.map((p) => [...p].sort()).sort());

  a.emit('toggle-engagement', { tokenId: aId, targetId: orc });
  a.emit('toggle-engagement', { tokenId: aId, targetId: goblin });
  await wait(100);
  sameAs([[aId, orc], [aId, goblin]]); // anche B (estraneo) vede gli ingaggi

  dm.emit('toggle-engagement', { tokenId: orc, targetId: aId }); // stessa coppia vista dall'altro lato: la toglie
  a.emit('toggle-engagement', { tokenId: bId, targetId: orc }); // A non può ingaggiare per conto di B
  a.emit('toggle-engagement', { tokenId: aId, targetId: aId }); // né con sé stesso
  await wait(100);
  sameAs([[aId, goblin]]);

  dm.emit('toggle-engagement', { tokenId: orc, targetId: bId });
  await wait(100);
  await ack(dm, 'remove-token', { tokenId: goblin });
  await wait(100);
  sameAs([[orc, bId]]); // la pedina rimossa esce dagli ingaggi

  await ack(dm, 'set-initiative', { entries: [{ tokenId: orc, value: 10 }] });
  dm.emit('end-initiative');
  await wait(100);
  assert.deepEqual(seen, [], 'a fine combattimento nessuno resta ingaggiato');
});

test('gli ingaggi compaiono nel registro azioni', async () => {
  const dm = client();
  const pl = client();
  await ack(dm, 'create-room', { roomId: 'duel-log', password: 'pw' });
  const { assignedTokenId: heroId } = await ack(pl, 'join-room', { roomId: 'duel-log', password: 'pw', playerName: 'Aragorn' });
  const orc = (await ack(dm, 'add-token', { tokenData: { name: 'Orco' } })).token.id;
  const logs = [];
  dm.on('action-logged', (log) => log.actionType === 'ENGAGEMENT' && logs.push(log.description));

  pl.emit('toggle-engagement', { tokenId: heroId, targetId: orc });
  pl.emit('toggle-engagement', { tokenId: orc, targetId: heroId }); // non è sua: rifiutato, nessuna voce
  await wait(100);
  pl.emit('toggle-engagement', { tokenId: heroId, targetId: orc });
  await wait(100);

  assert.deepEqual(logs, ['"Aragorn" ingaggia "Orco".', '"Aragorn" e "Orco" non sono più in combattimento.']);
});

test("il Master rientra con la sua password da un altro dispositivo, nessun altro", async () => {
  await ack(client(), 'create-room', { roomId: 'mpw', password: 'pw', masterPassword: 'drago' });

  const noKey = await ack(client(), 'create-room', { roomId: 'mpw' });
  assert.equal(noKey.success, false);
  assert.match(noKey.error, /password del Master/);

  const roomPw = await ack(client(), 'create-room', { roomId: 'mpw', masterPassword: 'pw' });
  assert.equal(roomPw.success, false, 'la password della stanza non basta');

  const newDevice = client();
  const back = await ack(newDevice, 'create-room', { roomId: 'mpw', masterPassword: 'drago' });
  assert.ok(back.success, 'password del Master giusta da un dispositivo nuovo');
  assert.equal(typeof back.masterKey, 'string', 'riceve la chiave per i rientri automatici');
  assert.ok(!('masterPassword' in back.room), 'la password del Master non viene inviata');
  const npc = await ack(newDevice, 'add-token', { tokenData: { name: 'Prova' } });
  assert.ok(npc.success, 'ha i poteri del Master');
});

test('la password del Master ha lo stesso limite ai tentativi', async () => {
  await ack(client(), 'create-room', { roomId: 'mpw-brute', password: 'pw', masterPassword: 'giusta' });
  for (let i = 0; i < 10; i++) await ack(client(), 'create-room', { roomId: 'mpw-brute', masterPassword: `prova${i}` });
  const blocked = await ack(client(), 'create-room', { roomId: 'mpw-brute', masterPassword: 'giusta' });
  assert.equal(blocked.success, false);
  assert.match(blocked.error, /Troppi tentativi/);
});

test('rientrando da un dispositivo nuovo il giocatore sceglie la sua pedina', async () => {
  const dm = client();
  await ack(dm, 'create-room', { roomId: 'pick', password: 'pw', masterPassword: 'm' });
  await ack(dm, 'add-token', { tokenData: { name: 'Orco' } }); // gli NPC non si possono scegliere

  // prima sessione: Aragorn e Legolas, poi Aragorn chiude
  const oldPhone = client();
  const first = await ack(oldPhone, 'join-room', { roomId: 'pick', password: 'pw', playerName: 'Aragorn' });
  const elf = client();
  const legolas = await ack(elf, 'join-room', { roomId: 'pick', password: 'pw', playerName: 'Legolas', newCharacter: true });
  oldPhone.disconnect();
  await wait(100);

  // telefono nuovo (nessuna chiave): vede solo le pedine giocatore libere
  const newPhone = client();
  const ask = await ack(newPhone, 'join-room', { roomId: 'pick', password: 'pw', playerName: 'Aragorn' });
  assert.equal(ask.success, false);
  assert.deepEqual(ask.chooseToken.map((t) => t.name), ['Aragorn'], 'Legolas è collegato, l\'Orco è un NPC');

  const taken = await ack(newPhone, 'join-room', { roomId: 'pick', password: 'pw', claimTokenId: legolas.assignedTokenId });
  assert.equal(taken.success, false, 'non si prende una pedina in uso');

  const back = await ack(newPhone, 'join-room', { roomId: 'pick', password: 'pw', claimTokenId: first.assignedTokenId });
  assert.ok(back.success);
  assert.equal(back.assignedTokenId, first.assignedTokenId, 'ha ritrovato la sua pedina');
  assert.equal(back.room.tokens.find((t) => t.id === first.assignedTokenId).hp, 20, 'con i suoi HP');

  // la chiave del vecchio telefono non vale più: non può riprendersi la pedina
  const stale = await ack(client(), 'join-room', { roomId: 'pick', password: 'pw', playerKey: first.playerKey, playerName: 'X' });
  assert.notEqual(stale.assignedTokenId, first.assignedTokenId);

  // "Nuovo personaggio" crea comunque una pedina nuova
  const fresh = await ack(client(), 'join-room', { roomId: 'pick', password: 'pw', playerName: 'Gimli', newCharacter: true });
  assert.ok(fresh.success && ![first.assignedTokenId, legolas.assignedTokenId].includes(fresh.assignedTokenId));
});

test('elenco stanze per la home: codice e nome, anche dopo un riavvio, senza dati segreti', async () => {
  const dir = tempDir();
  const first = await startServer({ store: createRoomStore(dir, { saveDelayMs: 20 }) });
  await ack(first.open(), 'create-room', { roomId: 'vecchia', roomName: 'Campagna vecchia', password: 'pw', masterPassword: 'm' });
  await wait(100);
  await ack(first.open(), 'create-room', { roomId: 'nuova', roomName: 'Campagna nuova', password: 'pw', masterPassword: 'm' });
  await wait(100);
  first.stop();

  const second = await startServer({ store: createRoomStore(dir) });
  try {
    const list = await new Promise((resolve) => second.open().emit('list-rooms', resolve));
    assert.deepEqual(list.map((r) => [r.id, r.name]), [['nuova', 'Campagna nuova'], ['vecchia', 'Campagna vecchia']], 'dalla più recente, dal disco');
    assert.ok(list.every((r) => Object.keys(r).sort().join() === 'id,name,updatedAt'), 'solo codice, nome e data');
  } finally {
    second.stop();
  }
});

test('il Master elimina una stanza: sparisce da elenco e disco, chi è dentro viene avvisato', async () => {
  const dir = tempDir();
  const srv = await startServer({ store: createRoomStore(dir, { saveDelayMs: 20 }) });
  const list = () => new Promise((resolve) => srv.open().emit('list-rooms', resolve));
  try {
    const dm = srv.open();
    const { masterKey } = await ack(dm, 'create-room', { roomId: 'addio', password: 'pw', masterPassword: 'm' });
    const pl = srv.open();
    await ack(pl, 'join-room', { roomId: 'addio', password: 'pw', playerName: 'A' });
    let kicked = false;
    pl.on('room-deleted', () => (kicked = true));
    await wait(100);

    const byPlayer = await ack(srv.open(), 'delete-room', { roomId: 'addio', masterPassword: 'pw' });
    assert.equal(byPlayer.success, false, 'la password della stanza non basta');

    const ok = await ack(srv.open(), 'delete-room', { roomId: 'addio', masterKey });
    assert.ok(ok.success, 'con la chiave del Master');
    await wait(100);

    assert.ok(kicked, 'il giocatore collegato viene avvisato');
    assert.deepEqual((await list()).map((r) => r.id), [], 'non è più in elenco');
    assert.deepEqual(fs.readdirSync(dir), [], 'cancellata dal disco');
    const join = await ack(srv.open(), 'join-room', { roomId: 'addio', password: 'pw', playerName: 'B' });
    assert.equal(join.success, false, 'non si può più entrare');
  } finally {
    srv.stop();
  }
});

test('nebbia di guerra: solo il Master la modifica, arriva a tutti e resta nella stanza', async () => {
  const dm = client();
  const { masterKey } = await ack(dm, 'create-room', { roomId: 'nebbia', password: 'pw' });
  const pl = client();
  await ack(pl, 'join-room', { roomId: 'nebbia', password: 'pw', playerName: 'A' });
  const seen = [];
  pl.on('fog-updated', (fog) => seen.push(fog));

  pl.emit('update-fog', { enabled: true }); // un giocatore non può
  dm.emit('update-fog', { enabled: true });
  dm.emit('update-fog', { area: { x: 0, y: 0, w: 100, h: 50 } });
  dm.emit('update-fog', { area: { x: 'a', y: 0, w: 1, h: 1 } }); // scartata
  await wait(200);

  const expected = { enabled: true, areas: [{ x: 0, y: 0, w: 100, h: 50, hide: false }] };
  assert.deepEqual(seen.at(-1), expected);
  const res = await ack(client(), 'create-room', { roomId: 'nebbia', masterKey });
  assert.deepEqual(res.room.fog, expected);

  dm.emit('update-fog', { reset: true });
  await wait(100);
  assert.deepEqual(seen.at(-1).areas, [], 'ricopri tutto');
});
