// Salvataggio delle stanze su disco, così la campagna sopravvive allo spegnimento del server.
// Un file JSON per stanza; la mappa di sfondo (fino a ~10MB) sta in un file a parte e si
// riscrive solo quando cambia, non a ogni mossa.
const fs = require('fs');
const path = require('path');

const SAVE_DELAY_MS = 2000;

function createRoomStore(dir, { saveDelayMs = SAVE_DELAY_MS } = {}) {
  fs.mkdirSync(dir, { recursive: true });

  // Il codice stanza lo sceglie l'utente: in base64url non può uscire dalla cartella né
  // coincidere con nomi riservati di Windows (CON, NUL...)
  const fileBase = (roomId) => path.join(dir, `room-${Buffer.from(roomId).toString('base64url')}`);
  const pending = new Map(); // roomId -> { room, timer }
  const savedBackgrounds = new Map(); // roomId -> backgroundUrl già scritto su disco

  // Scrive su un file temporaneo e poi lo rinomina: un'interruzione a metà non lascia file corrotti
  const writeAtomic = (file, data) => {
    fs.writeFileSync(`${file}.tmp`, data);
    fs.renameSync(`${file}.tmp`, file);
  };

  const save = (room) => {
    try {
      const { backgroundUrl, playerKeys, ...rest } = room;
      if (savedBackgrounds.get(room.id) !== backgroundUrl) {
        if (backgroundUrl) writeAtomic(`${fileBase(room.id)}.bg`, backgroundUrl);
        else fs.rmSync(`${fileBase(room.id)}.bg`, { force: true });
        savedBackgrounds.set(room.id, backgroundUrl);
      }
      writeAtomic(`${fileBase(room.id)}.json`, JSON.stringify({ ...rest, playerKeys: [...playerKeys] }));
    } catch (err) {
      console.error(`Errore nel salvataggio della stanza ${room.id}:`, err);
    }
  };

  return {
    // Stanze salvate; un file illeggibile viene segnalato e ignorato, senza bloccare l'avvio
    loadAll() {
      return fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('room-') && f.endsWith('.json'))
        .map((f) => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            const bgFile = path.join(dir, f.replace(/\.json$/, '.bg'));
            const backgroundUrl = fs.existsSync(bgFile) ? fs.readFileSync(bgFile, 'utf8') : null;
            savedBackgrounds.set(data.id, backgroundUrl);
            return { ...data, backgroundUrl, playerKeys: new Map(data.playerKeys) };
          } catch (err) {
            console.error(`Stanza salvata non leggibile, ignorata: ${f}`, err);
            return null;
          }
        })
        .filter(Boolean);
    },

    // Salva la stanza al massimo una volta ogni saveDelayMs: modifiche ravvicinate = una scrittura sola
    markDirty(room) {
      if (pending.has(room.id)) return;
      const timer = setTimeout(() => {
        pending.delete(room.id);
        save(room);
      }, saveDelayMs);
      timer.unref();
      pending.set(room.id, { room, timer });
    },

    remove(roomId) {
      clearTimeout(pending.get(roomId)?.timer);
      pending.delete(roomId);
      savedBackgrounds.delete(roomId);
      fs.rmSync(`${fileBase(roomId)}.json`, { force: true });
      fs.rmSync(`${fileBase(roomId)}.bg`, { force: true });
    },

    // Scrive subito i salvataggi in attesa (alla chiusura del server)
    flush() {
      for (const { room, timer } of pending.values()) {
        clearTimeout(timer);
        save(room);
      }
      pending.clear();
    },
  };
}

module.exports = { createRoomStore };
