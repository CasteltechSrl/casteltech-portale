# Sito casteltech.net

Pubblicato da Render come pagine statiche ("Static Site" `casteltech-sito` in `render.yaml`, gratis): la cartella pubblicata è `pubblico/`.

## Il sito nuovo (dall'8/11/2026, Adriano)

- `pubblico/index.html` = tutto il sito in una sola pagina: le sezioni sono dopo il "#" (`/#produzione`, `/#preventivo`, `/#contatti`, …).
  Testi, sezioni e moduli stanno nello script della pagina (oggetto `P`: una funzione per sezione; `CONFIG` in alto = telefono, email, indirizzi del portale).
  Per cambiare un testo si modifica direttamente `index.html`. Tre ambienti grafici: "Fabbrica" (produzione), "Dal 1976" (azienda, persone), "Hub" (preventivo, stampa 3D).
- `pubblico/img/` = immagini (foto di repertorio Unsplash/Pexels, uso commerciale libero; illustrazioni generate). Niente foto aziendali finché non si rifanno.
- Moduli → portale (`src/server/rotte/sito.ts`, regole in `src/engine/sito.ts`, test in `tests/sito.test.ts`):
  - Preventivo guidato (`/api/sito/preventivo`): azienda o privato, cosa serve (schede, progettazione, prodotto finito, stampa 3D, cablaggi, rework, altro),
    domande guidate per ogni voce (arrivano già come "domanda: risposta" in `righe_json`), fino a 10 file / 40 MB → pacchetto "SITO – AZIENDA"
    (o "SITO – PRIVATO – NOME") nei Documenti dei clienti + email a info@.
  - Contatti (`/api/sito/contatto`) → email a info@. Candidatura (`/api/sito/candidatura`) → email a info@ con il curriculum allegato.
- Migliorie del 14/11/2026 (ramo `sito-migliorie-fable`):
  - Ricerca e condivisioni: titolo e descrizione nel `<head>` (e per ogni sezione nell'elenco `META` dello script), anteprima `img/anteprima.jpg` (1200×630),
    dati dell'azienda in JSON-LD (solo quelli già scritti nel sito). Dentro `<main id="app">` c'è un riassunto fisso per chi non ha JavaScript e per i motori
    di ricerca: lo script lo sostituisce con le sezioni. Se cambiano indirizzo, telefono o orari vanno corretti in tre punti: `CONFIG`, piede della pagina, JSON-LD.
  - Immagini: si mettono con `pic("chiave")` o `ph("chiave","stile")`, mai come sfondo: così hanno testo alternativo (`ALT`), misure (`DIM`) e si caricano solo
    quando servono (`pic("chiave",1)` = immagine in cima, caricata subito). Ogni `.jpg` grande ha accanto la copia `.webp` (metà del peso), rifatta con
    `convert foto.jpg -quality 76 -define webp:method=6 foto.webp`; il `.jpg` resta come ripiego. Una foto nuova = voce in `IMG`, `DIM`, `ALT` + la copia `.webp`.
  - Accessibilità: "Vai al contenuto" come primo tasto Tab, il fuoco passa al contenuto a ogni cambio di sezione, contorno del fuoco scuro sui fondi chiari,
    caselle da 16 px e pulsanti da 44 px sul telefono.
  - Testi: "Servizi online" (`#portale`) dice solo quello che c'è: preventivo guidato, offerta in PDF, conferma d'ordine, DDT per email. NON esiste un accesso
    per i clienti e il portale non ha giacenze: non scriverlo. L'elenco "Cosa serve per un preventivo" è uno solo (`SERVE`) e compare in home, servizi e modulo.
- Cookie: banner di Iubenda (stesso account del vecchio sito); Google Analytics e la mappa di Google partono solo dopo il consenso.
- `pubblico/<vecchio-indirizzo>/index.html` = rimandi dai vecchi indirizzi del WordPress (italiano e inglese) alla sezione giusta,
  rifatti da `strumenti/rimandi.py`. I PDF delle informative restano agli stessi indirizzi in `pubblico/wp-content/uploads/`.

## Il vecchio sito

`vecchio-wordpress/` = la copia statica del WordPress (2/11/2026, con `moduli.js` e `strumenti/prepara_sito.py`), conservata ma non pubblicata.
Per tornare indietro basta rimettere `staticPublishPath: ./sito/vecchio-wordpress` in `render.yaml`.
Copia completa del WordPress originale: Google Drive → 01_LAVORO/CASTELTECH/16_Backup.

## Dominio

casteltech.net: i nameserver sono ancora di Noamweb (DNS gestito dal pannello Noamweb), la posta è su Google Workspace (record MX di Google: non toccarli).
Per passare a Render si aggiungono i domini nel servizio `casteltech-sito` e si cambiano solo i record del sito (casteltech.net e www) come indica Render.
Prima di chiudere Noamweb bisogna spostare la gestione del DNS (nameserver) altrove, con tutti i record: MX e TXT di Google, verifica Microsoft, SPF.
