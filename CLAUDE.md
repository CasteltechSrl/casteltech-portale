# Istruzioni per Claude (e per chiunque modifichi il progetto)

Portale interno di Casteltech S.r.l. (assemblaggio schede elettroniche conto terzi): preventivi, schede di
produzione con QR, consuntivi, storico prodotto, collegamento con il gestionale mOKa.
Il titolare (Adriano) non è un programmatore: le modifiche le chiede a Claude. Scrivi e spiega in **italiano**,
codice e commenti compresi, con nomi di variabili italiani come nel resto del progetto.

## Regole che non si toccano senza conferma di Adriano
- Formule economiche in `src/engine/calcolo.ts`: costo fase = ore ciclo × costo azienda + ore ciclo × persone ×
  costo operatore (produzione o ufficio); prezzo = costo × ricarico; una tantum solo nel primo lotto.
  Gli arrotondamenti replicano il vecchio portale: `tools/verifica-legacy.ts` deve restare a 1.093 identici.
- Un preventivo salvato conserva la "fotografia" del catalogo (`preventivi.catalogo`): cambiare fasi o tariffe
  non deve mai cambiare i preventivi già salvati.
- Fasi, parametri, materiali e voci si modificano dal pannello Impostazioni (dati nel database);
  `src/catalogo/iniziale.ts` serve solo al primo avvio. Per cambiare formule già in uso: nuova migrazione
  che aggiorna solo le righe ancora uguali al valore iniziale (vedi `003_...`).
- Anagrafiche: nei preventivi cliente, codice e descrizione si scelgono SOLO da clienti/prodotti in anagrafica
  (Impostazioni → Anagrafiche), mai testo libero; tutto in MAIUSCOLO. I nomi scritti in modo diverso nei vecchi
  preventivi sono collegati con `alias_clienti` / `alias_prodotti`. Clienti/prodotti non in elenco non vanno in anagrafica.

## Come lavorare
- Struttura database: mai modificare un file già esistente in `db/migrazioni/`; aggiungerne uno nuovo (`002_...sql`).
- Prima di salvare: `npm run verifica` (tipi) e `npm test` (deve passare tutto). Aggiungi un test per ogni regola nuova.
- Pagine HTML: usare `html\`...\`` di `src/server/views/html.ts` (protegge i testi); niente JavaScript inline
  (lo blocca la Content-Security-Policy): gli script stanno in `public/`.
- Ogni push su `main` viene pubblicato da Render in automatico (render.yaml): lavora su un ramo se la modifica è grossa.
- Dati reali (dump del vecchio portale, export clienti) non vanno mai nel repository.

## Database su Neon (piano gratuito)
Il database si spegne dopo 5 minuti senza richieste e il piano ha 100 ore di calcolo al mese:
niente controlli periodici che interrogano il database (il controllo di Render `/salute` non lo tocca),
niente timer frequenti. Uso reale: lun–ven 8–20. Backup lun–ven alle 20:30 in `BACKUP_DIR` (disco Render)
+ pulsante in Impostazioni → Backup.

## Avvio in locale
Serve PostgreSQL. Variabili: `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (crea il primo utente ufficio), `PORT`.
`npm install && npm run dev`.

## Stato dei lavori (aggiornare quando cambia)
1. ✅ Motore di calcolo, catalogo dalla scheda di produzione, tempo ciclo/uomo, energia forno/onda.
2. ✅ Sito: login, preventivi (calcolo in tempo reale), impostazioni, utenti, import dal vecchio portale.
   INFORMAZIONI GENERALI del preventivo: 12 spunte (1ª produzione, TOP, TOP+BOT, THT onda, THT a mano, componenti, PCB,
   lamina std 110 €, lamina con trattamenti 165 €, etichette, pulizia saldature, lavaggio) che mostrano/nascondono
   sezioni e campi (`data-dipende`) e attivano fasi e costi (migrazioni 011, 014). Programmazioni solo con 1ª produzione.
   Le voci possono avere un prezzo di vendita fisso (`formula_prezzo`, niente ricarico): es. lamine.
   Riquadro totali: `src/engine/riepilogo.ts` (prezzo a scheda, una tantum interni/acquisti, margini, ore ciclo/uomo).
   Elenco con azioni multiple (crea commessa, duplica, elimina). Stampa per il cliente `/preventivi/:id/stampa`
   (solo prezzi; `?vista=fasi` dettaglio per fasi, `?vista=macro` solo macro aree).
3. ✅ Commesse e stampa scheda di produzione (`rotte/commesse.ts`, `commesse-servizio.ts`, `public/stampa.css`):
   prima pagina come la MASTERspec, fasi del preventivo ricalcolate sulla quantità (tempo previsto e effettivo, ciclo e uomo),
   fogli tempi, QR → `/c/<codice>`. Stampa: max 2 pagine di scheda (fasi in un'unica tabella compatta) + 2 fogli tempi
   = 2 fogli fronte/retro (provato con tutte le 63 fasi). Niente "tempo ultima produzione" (Adriano: andrebbe riparametrizzato sulla quantità).
   La scheda tecnica (programmi, lamine, paste, note) sta sulla revisione del prodotto e si ripropone ai lotti successivi.
4. 🟡 Rientro schede. ✅ Inserimento manuale (ufficio): `/commesse/:id/rientro`, controlli in `src/engine/rientro.ts`
   (errori bloccano la conferma, avvisi no), consumi del lotto e spedizioni sulla commessa, la scheda stampata si
   compila da sola (tempo effettivo ciclo e uomo, consumo reale a scheda).
   Gli operatori per ora scrivono solo sulla carta (app da telefono in futuro).
   ⬜ Lettura automatica: scanner con ADF (PDF multipagina, il QR riconosce la commessa), API Anthropic, conferma ufficio.
5. ⬜ Analisi commessa, prezzo corretto, storico prodotto e interrogazioni. Se al rientro i tempi peggiorano in modo
   importante: ricalcolo del preventivo e nuova proposta commerciale per il lotto successivo, da inviare con mOKa.
6. ⬜ Collegamento mOKa (anagrafiche, invio preventivo, ordini → commesse): in attesa della documentazione API.
