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
Fatto l'8/11/2026: A casteltech.net = 216.24.57.1, CNAME www = casteltech-sito.onrender.com; su Render www rimanda a casteltech.net,
quindi l'indirizzo principale (canonical, sitemap, robots) è https://casteltech.net/ senza www.
Prima di chiudere Noamweb bisogna spostare la gestione del DNS (nameserver) altrove, con tutti i record: MX e TXT di Google, verifica Microsoft, SPF.
