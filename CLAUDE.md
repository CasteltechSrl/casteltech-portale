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
- Tasto Elimina (Adriano, 26/10/2026: in tutte le sezioni, per le righe inserite per errore): conferma con `data-conferma="testo"`
  sul modulo o sul pulsante (`public/conferma.js`, caricato in ogni pagina); regole in `src/engine/eliminazioni.ts`. Ciò che è già usato
  non si elimina (preventivo con commessa, cliente/prodotto usati, fasi/parametri del catalogo di partenza → spunta "Attiva", utenti che hanno lavorato → "Attivo").
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
   La scheda tecnica (programmi, lamine, paste, prog. forno, note) sta sulla revisione del prodotto e si ripropone ai lotti
   successivi (se la revisione è nuova: dall'ultima commessa dello stesso codice). Le segnalazioni della commessa vanno
   nello storico del prodotto (tabella segnalazioni) e si stampano sulle prossime schede.
   Numerazione fasi (migrazione 019): lettere per pre-produzione, M1… gestione materiale, poi 1, 2, 3… progressivi.
   Sigle operatori: Impostazioni → Operatori (dati reali: solo nel database, mai nel repository).
4. 🟡 Rientro schede. ✅ Inserimento manuale (ufficio): `/commesse/:id/rientro`, controlli in `src/engine/rientro.ts`
   (errori bloccano la conferma, avvisi no), consumi del lotto e spedizioni sulla commessa, la scheda stampata si
   compila da sola (tempo effettivo ciclo e uomo, consumo reale a scheda).
   Pagina commessa: inserimento rapido dei tempi per fase (pre-produzione, tempi dimenticati, anche dopo il rientro:
   righe "solo totale" S in coda al foglio tempi, già confermate se la commessa è rientrata). Correggere una commessa
   già rientrata dalla pagina Rientro mantiene la conferma.
   ✅ Reparto da telefono/tablet (`rotte/reparto.ts`, `/r`, migrazione 020): sigla + PIN (Impostazioni → Operatori, il telefono
   lo ricorda 120 giorni), QR `/c/<codice>` → scelta fase → apri tempo (ora attuale o scritta) o tempo totale → chiudi con pezzi,
   S/P, note. Righe in `rilevazioni` (origine tablet, aperta_il/chiusa_il); il rientro dell'ufficio le conserva.
   Promemoria (`engine/promemoria.ts`, `server/promemoria.ts`): dopo 2× il tempo previsto (min 30'), alle 16:30 a tutti,
   il giorno lavorativo dopo con link di chiusura; timer in memoria, database solo all'ora giusta. Orari in Impostazioni → Promemoria.
   Canale: per ora solo nel portale (tabella notifiche); SMS/WhatsApp/Telegram da scegliere (numeri da Adriano).
   Una fase per volta dal telefono (sulla carta resta possibile "10+12").
   ⬜ Lettura automatica: scanner con ADF (PDF multipagina, il QR riconosce la commessa), API Anthropic, conferma ufficio.
   Sul foglio tempi la DATA è solo gg/mm ("/" prestampato): l'anno si ricava da data scansione / consegna / ordine.
4b. ✅ Componenti (`rotte/componenti.ts`, `codifica-servizio.ts`, migrazione 021): codifica come il programma Python
   "Codifica componenti" (regole e decodifica P/N portate in `src/engine/codifica/*`, identiche: `tools/verifica-codifica.ts`
   con i casi generati dal Python, dati reali fuori dal repository). Codice di produzione (armadio, es. RS-0603-2K2-1-100MW) e
   gestionale (Moka, es. SRS-0603-2K20F-001, progressivo dall'archivio `componenti`). Resistenze solo all'1% (5% non si comprano),
   potenza standard del case se manca. Righe senza P/N: se il codice di produzione è già in archivio si riprendono i codici.
   BOM xlsx/csv → archivio, decodifica, DigiKey, colonne, IA (ANTHROPIC_API_KEY) → codici → prezzi da DigiKey, Mouser,
   Farnell, TME (`fornitori.ts`, chiavi solo su Render, cache 24 h) → scarto (`engine/acquisti.ts`: passivi <0,10 € +10%,
   <1 € +5%, 1–3 € +1 pz, oltre 0; Impostazioni → Componenti), miglior fornitore, reperibilità. Excel con codifica e acquisti.
   Archivio iniziale: file componenti_casteltech.json.gz da Impostazioni → Componenti.
   BOM collegata al preventivo (migrazione 024, `preventivi.bom_id`): nel gruppo ACQUISTI si sceglie una BOM caricata e il costo
   componenti a scheda si ricalcola sulle schede del preventivo con le offerte già lette (`costoMaterialiPer`, niente chiamate ai
   distributori); il valore resta nei parametri del preventivo. Scrivere il costo a mano toglie il collegamento; eliminare la BOM no.
4c. 🟡 Ordini clienti (`rotte/ordini.ts`, `ordini-servizio.ts`, `engine/ordini.ts`, migrazione 022): righe d'ordine con stato da evadere /
   parziale / evaso (schede: quantità spedita con DDT; servizi: fatturati o tutte le schede evase; lo stato scritto dall'ufficio vince),
   date del foglio "Schedulazione produzione" (lavorazione = arrivo materiale + 3 gg, prevista = lavorazione + 5 gg + ritardi),
   consegne a programma (es. Univac 15 mesi), cruscotto (fatturato, media mesi chiusi, da evadere per mese, previsione anno),
   Gantt all'indietro dalla consegna con ore ciclo dell'ultimo preventivo del prodotto ÷ ore al giorno, fatture senza ordine.
   Dati: import JSON(.gz) da Impostazioni → Ordini, preparato fuori dal repository incrociando gli export di Fatture in Cloud
   con gli ordini PDF dei clienti (ricaricabile: restano date, ritardi, stati e note scritti nel portale).
   🟡 Acquisizione (`rotte/acquisizioni.ts`, `acquisizioni-servizio.ts`, `lettura-ordini-ia.ts`, `engine/acquisizioni.ts`, migrazione 023):
   Ordini → Da acquisire, file caricati (poi dalla cartella Google Drive): PDF/foto/email .eml/testo letti dall'IA → proposta
   da confermare (cliente SOLO dall'anagrafica, prodotti ricollegati al cliente scelto) → ordine origine email, numero dal 9001 nell'anno.
   Cartella Google Drive (`server/drive.ts`): account di servizio (GOOGLE_SERVICE_ACCOUNT = JSON della chiave, solo su Render;
   DRIVE_CARTELLA_ORDINI facoltativa, altrimenti l'unica cartella condivisa), ogni 15' lun–ven 8–20, database solo se ci sono
   file nuovi, i file letti vanno nella sottocartella "Acquisiti". Pulsante "Controlla adesso" in Da acquisire.
   ⬜ Incrocio con gli export FIC dentro il portale, script che salva le email d'ordine di info@ nella cartella.
4d. ✅ CRM (`rotte/crm.ts`, `crm-servizio.ts`, `engine/crm.ts`, migrazione 025): ricerca aziende (nome, città, referenti, telefoni, email, P.IVA),
   scheda con recapiti e referenti, registro attività (telefonata, email, visita, offerta, fiera, nota) con prossima azione e data
   (scadute in rosso in prima pagina). Le aziende del CRM NON sono l'anagrafica: si collegano a un cliente in anagrafica (`cliente_id`,
   per P.IVA o nome uguale) e i clienti dell'anagrafica entrano nel CRM da soli. Base: file CRM_Database_Clienti di Adriano, import da
   Impostazioni → CRM (file preparato fuori dal repository): solo le aziende sicure, senza le vecchie attività (scelta di Adriano, 26/10/2026);
   le dubbie (doppioni, nomi rovinati, dati web poco sicuri) sono in un Excel a parte.
   Scritte uniformi per colonna (Adriano, 26/10/2026), imposte all'import e a ogni salvataggio (`FORMATI_CRM` in `engine/crm.ts`): nome, P.IVA,
   provincia, responsabile MAIUSCOLO; città, indirizzo, persone Iniziali Maiuscole; settore, descrizione, ruolo solo la prima lettera; email e sito minuscolo; note libere. Colonna `da_verificare` + pagina /crm/verificare pronte se servisse caricarle.
   Clienti in anagrafica evidenziati "già cliente" con la fascia del fatturato medio annuo (migrazione 026, `fatturato_clienti`: totale per cliente
   e anno dagli export fatture FIC, file fatturato_clienti.json.gz da Impostazioni → CRM; media = totale ÷ anni caricati, un anno senza fatture vale 0).
   Un cliente aggiunto in anagrafica dopo l'import si collega da solo all'azienda del CRM con stessa P.IVA o nome (se è una sola).
5. ⬜ Analisi commessa, prezzo corretto, storico prodotto e interrogazioni. Se al rientro i tempi peggiorano in modo
   importante: ricalcolo del preventivo e nuova proposta commerciale per il lotto successivo, da inviare con mOKa.
6. ⬜ Collegamento mOKa (anagrafiche, invio preventivo, ordini → commesse): in attesa della documentazione API.
