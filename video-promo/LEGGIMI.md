# Video promozionale del portale

Video di circa 85 secondi (16:9, 1920x1080) che presenta il portale a chi potrebbe comprarlo: voce sintetica italiana,
scritte piccole in basso, musica generata (niente diritti d'autore). Tutti i dati sono INVENTATI (aziende, codici, importi).

Non ha né nome né marchio: nelle riprese "Portale Casteltech" diventa "Il tuo portale" e i loghi sono nascosti.
Quando il nome commerciale sarà deciso, va cambiato in `video/motore.js` (indirizzo nella barra e scena finale) e in `video/riprese.cjs`.

## Cosa c'è
| File | A cosa serve |
|---|---|
| `dati-demo/dati-demo.json` | clienti, prodotti, fornitori, ordini, CRM inventati (si possono cambiare) |
| `dati-demo/semina.ts` | carica i dati demo in un database VUOTO di prova (fatture 2025–2026, ordini, preventivi con il calcolo vero, commesse, banca) |
| `dati-demo/scheda_demo.py` | crea i file finti di una scheda (Gerber, foratura, BOM, pick and place) con 2 errori voluti |
| `dati-demo/pacchetto.ts` | carica la scheda finta come richiesta d'offerta e fa il preventivo "da validare" |
| `dati-demo/prezzi-demo.ts` | prezzi finti dei distributori + "Codifica la BOM" |
| `testi.json` | le battute: `voce` (come si pronuncia) e `scritta` (sottotitolo); in `voci` le due voci (maschile e femminile) |
| `voce.py` | crea i file della voce in `voce/maschile` e `voce/femminile` (`python3 voce.py v1` rifà solo una battuta) |
| `video/storia.js` | la sceneggiatura: scene, pagine, movimenti di camera, riquadri evidenziati |
| `video/motore.js`, `video/stile.css`, `video/index.html` | il "montaggio" (animazioni che dipendono solo dal tempo) |
| `video/riprese.cjs`, `video/riprese.json` | fotografa le pagine del portale demo (cartella `video/riprese/`, non salvata nel repository) |
| `video/render.cjs` | crea il video fotogramma per fotogramma e aggiunge voce e musica |
| `musica.py` | la musica di sottofondo |
| `rigenera.sh` | tutto in fila: database demo → riprese → voce → video |

Il video finito e le riprese sono in Project Files → `video-promo/`.

## Rifare il video (es. dopo una funzione nuova)
1. Se la funzione nuova va nel video: una battuta in più in `testi.json` (stesso `id` della scena), una scena in `video/storia.js`
   e la pagina da fotografare in `video/riprese.json`. Se servono dati, aggiungerli in `dati-demo/`.
2. Lanciare `bash video-promo/rigenera.sh` (serve PostgreSQL in locale, Chromium/Playwright, ffmpeg, `pip install edge-tts`).
   Per provare solo alcuni istanti: `node video-promo/video/render.cjs /tmp/prova.mp4 --voce=femminile --fotogrammi=10,30`.
   Escono due video, uno per voce (`--voce=maschile` o `--voce=femminile`).

La voce è quella neurale di Microsoft Edge (it-IT-GiuseppeMultilingualNeural e it-IT-IsabellaNeural) tramite `edge-tts`: per un uso commerciale importante conviene
valutare una voce con licenza o una voce registrata; basta sostituire i file in `voce/maschile` o `voce/femminile` con gli stessi nomi.
