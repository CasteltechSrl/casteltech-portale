# Sito casteltech.net

Dal 2/11/2026 (Adriano) il sito non è più un WordPress su Noamweb: sono pagine statiche pubblicate da Render
("Static Site" `casteltech-sito` in `render.yaml`, gratis), copiate dal WordPress con lo stesso aspetto, gli stessi
indirizzi, titoli e descrizioni (niente posizionamento perso su Google).

- `pubblico/` = il sito così com'è pubblicato. Le pagine sono `pubblico/<pagina>/index.html` (italiano) e `pubblico/en/<pagina>/index.html` (inglese).
- `pubblico/moduli.js` = moduli Contatti e Richiedi un preventivo: li manda al portale (`/api/sito/contatto`, `/api/sito/preventivo`,
  `src/server/rotte/sito.ts`, regole in `src/engine/sito.ts`). Contatti → email a info@; preventivo → pacchetto "SITO – AZIENDA" nei Documenti dei clienti.
- `pubblico/sitemap_index.xml`, `page-sitemap.xml`, `robots.txt` = mappa del sito per Google (stessi nomi del vecchio Yoast).
- `strumenti/prepara_sito.py` = come è stato fatto: copia con `wget --mirror --page-requisites` del sito vero, poi lo script toglie
  WordPress (wp-json, emoji, Contact Form 7, reCAPTCHA), rende gli indirizzi relativi (tranne canonical/hreflang/og:url) e rifà le sitemap.
  Dopo lo script va ricopiato `moduli.js` in `pubblico/`.

Per cambiare un testo: si modifica l'HTML della pagina (italiano e inglese). Ogni modifica in `sito/` pubblica solo il sito, non il portale.
Restano dal vecchio sito: Google Analytics / Tag Manager, il banner cookie di Iubenda e la mappa di Google.

Dominio: casteltech.net è registrato tramite Google (posta Google Workspace). Per passare a Render si cambiano solo i record del sito
(www e casteltech.net) verso Render; i record MX della posta non si toccano.
