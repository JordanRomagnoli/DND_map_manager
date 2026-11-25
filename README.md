# D&D Map Manager

Mappa condivisa in tempo reale per sessioni di D&D: il Master gestisce scene, pedine, iniziativa e votazioni, i giocatori si collegano dal proprio dispositivo.

## Servizi e strumenti esterni necessari

| Servizio | A cosa serve | Obbligatorio | Link |
| --- | --- | --- | --- |
| **Node.js** (≥ 18.17, richiesto da Next.js 14) e **npm** | Eseguire server e build | Sì | <https://nodejs.org/it/download> |
| **Registro npm** | Scaricare le dipendenze con `npm install` (solo la prima volta) | Sì | <https://www.npmjs.com/> |
| **Cloudflare Tunnel** (`cloudflared`) | Link pubblico HTTPS per i giocatori, senza account (`*.trycloudflare.com`) | Solo per `npm run sessione` | <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/> |
| **Homebrew** (macOS) | Installare `cloudflared` | Solo su macOS, se usi `brew` | <https://brew.sh/> |
| **winget** (Windows) | Installare `cloudflared` | Solo su Windows | <https://learn.microsoft.com/it-it/windows/package-manager/winget/> |
| **Google Fonts** | Font *Outfit* e *Cinzel* caricati da `app/globals.css` | No (senza rete si usano font di sistema) | <https://fonts.google.com/> |

Non servono database, account o chiavi API: le stanze vengono salvate in locale nella cartella `data/rooms`.

## Installazione

```bash
npm install
```

Per le sessioni con giocatori da remoto installa una sola volta `cloudflared`:

```bash
# macOS
brew install cloudflared

# Windows
winget install --id Cloudflare.cloudflared
```

## Avvio

| Comando | Cosa fa |
| --- | --- |
| `npm run sessione` | Compila se serve, apre il tunnel Cloudflare, avvia il server e stampa link + QR per i giocatori. Il Master si apre su <http://localhost:3000>. |
| `npm run dev` | Server di sviluppo su <http://localhost:3000> (nessun tunnel). |
| `npm run build` + `npm start` | Build e server di produzione (in ascolto su `0.0.0.0`, raggiungibile in rete locale). |
| `npm test` | Esegue i test. |

`Ctrl+C` chiude tutto e salva le stanze prima di uscire.

## Variabili d'ambiente (facoltative)

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `PORT` | `3000` | Porta del server |
| `HOSTNAME` | `localhost` in sviluppo, `0.0.0.0` in produzione | Indirizzo di ascolto |
| `PUBLIC_URL` | — | Link pubblico mostrato al Master nel pannello "Invita" (lo imposta da solo `npm run sessione`) |
