// Test delle regole di accesso del server socket: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { io: connect } = require('socket.io-client');
const { attachSocketServer } = require('../server');

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
