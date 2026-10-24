import Dexie, { Table } from 'dexie';
import { ActionLogRecord } from './types';

// Impostazione di default TTL: 24 Ore (in millisecondi)
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export class ActionLogDatabase extends Dexie {
  actionLogs!: Table<ActionLogRecord, string>;

  constructor() {
    super('DNDActionLogsDB');
    this.version(1).stores({
      actionLogs: 'id, roomId, timestamp, expiresAt, actorName, actionType',
    });
  }

  /**
   * Salva o aggiorna un log singolo nell'IndexedDB locale.
   */
  async saveLog(log: ActionLogRecord): Promise<string> {
    const expiresAt = log.expiresAt || (log.timestamp + DEFAULT_TTL_MS);
    return await this.actionLogs.put({
      ...log,
      expiresAt,
    });
  }

  /**
   * Salva in blocco una lista di log (es. al primo join della stanza).
   */
  async saveLogsBulk(logs: ActionLogRecord[]): Promise<void> {
    if (!logs || logs.length === 0) return;
    const preparedLogs = logs.map((log) => ({
      ...log,
      expiresAt: log.expiresAt || (log.timestamp + DEFAULT_TTL_MS),
    }));
    await this.actionLogs.bulkPut(preparedLogs);
  }

  /**
   * Rimuove i record il cui TTL è scaduto (expiresAt < Date.now()).
   */
  async purgeExpiredLogs(): Promise<number> {
    const now = Date.now();
    try {
      const expiredCount = await this.actionLogs
        .where('expiresAt')
        .below(now)
        .delete();

      if (expiredCount > 0) {
        console.log(`🧹 [Dexie TTL] Puliti ${expiredCount} log di azioni scaduti.`);
      }
      return expiredCount;
    } catch (err) {
      console.error('Errore durante la pulizia dei log scaduti con Dexie:', err);
      return 0;
    }
  }

  /**
   * Elimina tutti i log di una determinata stanza (es. pulizia manuale del Master).
   */
  async clearRoomLogs(roomId: string): Promise<number> {
    try {
      return await this.actionLogs.where('roomId').equals(roomId).delete();
    } catch (err) {
      console.error(`Errore nell'eliminazione dei log per la stanza ${roomId}:`, err);
      return 0;
    }
  }
}

export const db = new ActionLogDatabase();
