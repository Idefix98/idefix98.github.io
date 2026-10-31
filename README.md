# SaltaClip

App per creare e montare video verticali: idee e formati, editor video, template e basi musicali originali.
Funziona tutta sul telefono: nessun account, nessuna pubblicità, nessun dato raccolto.

## Aggiornare i contenuti senza ripubblicare l'app

L'app installata da Google Play carica i contenuti da questo sito, quindi basta modificare i file qui su GitHub
(icona a forma di matita sul file, poi "Commit changes").

- `data/trends.json` – la sezione **Trend**: titolo, descrizione, idee, passi, hashtag e template collegato.
  Aggiorna anche la data in `"updated"`.
- `data/sounds.json` – la lista **Suoni del momento** nella sezione Audio. Ogni voce:
  `{ "title": "Nome del suono", "artist": "Autore", "idea": "Come usarlo", "link": "https://..." }`.
  Se la lista è vuota, la sezione non compare.
- `data/templates.json` – i **template**: nome, descrizione, base musicale (`lofi`, `pop`, `trap`, `chill`)
  e gli spazi con durata in secondi (`dur`) e scritta (`caption`).
- `privacy.html` – l'informativa: tienila aggiornata con il tuo nome e la tua email.

Dopo ogni modifica controlla che il file sia ancora JSON valido (virgole e virgolette), per esempio su jsonlint.com.

## File

- `index.html`, `css/`, `js/` – l'app
- `sw.js` – fa funzionare l'app anche senza connessione
- `manifest.webmanifest`, `icons/` – nome, colori e icone usati da Android
- `.well-known/assetlinks.json` – da aggiungere: collega il sito all'app di Google Play
