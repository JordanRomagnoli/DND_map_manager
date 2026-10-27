// Salvataggio delle stanze su disco, così la campagna sopravvive allo spegnimento del server.
// Un file JSON per stanza; le mappe di sfondo (fino a ~10MB ciascuna, una per scena) stanno in file
// a parte e si riscrivono solo quando cambiano, non a ogni mossa.
const fs = require('fs');
const path = require('path');

const SAVE_DELAY_MS = 2000;

function createRoomStore(dir, { saveDelayMs = SAVE_DELAY_MS } = {}) {
  fs.mkdirSync(dir, { recursive: true });

  // Il codice stanza lo sceglie l'utente: in base64url non può uscire dalla cartella né
  // coincidere con nomi riservati di Windows (CON, NUL...)
  const fileBase = (roomId) => path.join(dir, `room-${Buffer.from(roomId).toString('base64url')}`);
  const pending = new Map(); // roomId -> { room, timer }
  const savedBackgrounds = new Map(); // roomId -> Map(id scena -> backgroundUrl già scritto su disco)

  // File della mappa di una scena. Chiave '' = stanze di prima delle scene. Gli id delle scene
  // li genera il server (solo lettere e cifre), quindi sono sicuri come nomi di file.
  const bgFile = (roomId, sceneId) => `${fileBase(roomId)}${sceneId ? `.${sceneId}` : ''}.bg`;
  const readBg = (roomId, sceneId) => {
    const file = bgFile(roomId, sceneId);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };

  // Scrive su un file temporaneo e poi lo rinomina: un'interruzione a metà non lascia file corrotti
  const writeAtomic = (file, data) => {
    fs.writeFileSync(`${file}.tmp`, data);
    fs.renameSync(`${file}.tmp`, file);
  };

  const save = (room) => {
    try {
      const { backgroundUrl, playerKeys, scenes, ...rest } = room;
      // la mappa della scena attiva è room.backgroundUrl, quelle delle altre scene stanno nella scena
      const backgrounds = new Map((scenes || []).map((s) => [s.id, s.backgroundUrl ?? null]));
      backgrounds.set(room.activeSceneId || '', backgroundUrl);
      const saved = savedBackgrounds.get(room.id) || new Map();
      for (const [sceneId, url] of backgrounds) {
        if (saved.get(sceneId) === url) continue;
        if (url) writeAtomic(bgFile(room.id, sceneId), url);
        else fs.rmSync(bgFile(room.id, sceneId), { force: true });
      }
      for (const sceneId of saved.keys()) {
        if (!backgrounds.has(sceneId)) fs.rmSync(bgFile(room.id, sceneId), { force: true }); // scena eliminata
      }
      savedBackgrounds.set(room.id, backgrounds);

      const lightScenes = scenes?.map(({ backgroundUrl: _bg, ...scene }) => scene);
      writeAtomic(`${fileBase(room.id)}.json`, JSON.stringify({ ...rest, scenes: lightScenes, playerKeys: [...playerKeys] }));
    } catch (err) {
      console.error(`Errore nel salvataggio della stanza ${room.id}:`, err);
    }
  };

  return {
    // Stanze salvate per l'elenco della home: solo codice, nome e ultima modifica (niente dati segreti)
    list() {
      return fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('room-') && f.endsWith('.json'))
        .flatMap((f) => {
          const file = path.join(dir, f);
          try {
            const { id, name } = JSON.parse(fs.readFileSync(file, 'utf8'));
            return [{ id, name, updatedAt: fs.statSync(file).mtimeMs }];
          } catch {
            return []; // file illeggibile: già segnalato da load() quando qualcuno prova a entrare
          }
        });
    },

    // Stanza salvata, o null se non esiste. Un file illeggibile viene segnalato e trattato come assente.
    load(roomId) {
      const file = `${fileBase(roomId)}.json`;
      if (!fs.existsSync(file)) return null;
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const activeId = data.activeSceneId || '';
        const scenes = data.scenes?.map((s) => (s.id === activeId ? s : { ...s, backgroundUrl: readBg(roomId, s.id) }));
        const backgroundUrl = readBg(roomId, activeId);
        const backgrounds = new Map((scenes || []).map((s) => [s.id, s.backgroundUrl ?? null]));
        backgrounds.set(activeId, backgroundUrl);
        savedBackgrounds.set(roomId, backgrounds);
        return { ...data, scenes, backgroundUrl, playerKeys: new Map(data.playerKeys) };
      } catch (err) {
        console.error(`Stanza salvata non leggibile, ignorata: ${file}`, err);
        return null;
      }
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

    // Cancella la stanza dal disco (eliminata dal Master), compreso un eventuale salvataggio in attesa
    remove(roomId) {
      clearTimeout(pending.get(roomId)?.timer);
      pending.delete(roomId);
      savedBackgrounds.delete(roomId);
      // il file della stanza e le mappe di tutte le sue scene (il punto separa il codice dal resto)
      const prefix = `${path.basename(fileBase(roomId))}.`;
      fs.readdirSync(dir)
        .filter((f) => f.startsWith(prefix))
        .forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
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
