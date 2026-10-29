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
  (menu Anagrafiche), mai testo libero; tutto in MAIUSCOLO. I nomi scritti in modo diverso nei vecchi
  preventivi sono collegati con `alias_clienti` / `alias_prodotti`. Clienti/prodotti non in elenco non vanno in anagrafica.
- Regola codice-cliente (Adriano 29/10/2026, `engine/anagrafiche.ts`, test in `tests/anagrafiche-regola.test.ts`): ogni codice prodotto
  ha SEMPRE il suo cliente. Non si salva un prodotto senza cliente (Anagrafiche, preventivo, import: i prodotti nuovi senza cliente nel file non entrano);
  nel preventivo il menu Codice mostra SOLO i codici del cliente scelto (`prodottiPerCliente`), il prodotto nuovo si aggiunge con "+ Nuovo prodotto";
  i vecchi codici senza cliente sono in evidenza in Anagrafiche → Prodotti (in cima, gialli, conteggio sul tasto) finché non si assegnano o si eliminano.

- Menu in alto (Adriano 28/10/2026, `views/layout.ts`, test in `tests/menu.test.ts`): CRM, Anagrafiche, Quotazioni, Preventivi, Ordini, Commesse,
  Amministrazione, Impostazioni, Suggerimenti, Guida. "Quotazioni" è la ex sezione Componenti (BOM, codifica, prezzi): indirizzo `/quotazioni`,
  i vecchi `/componenti/...` portano lì (`index.ts`); "Componenti" resta il nome dell'archivio in Anagrafiche, di Impostazioni → Componenti e della spunta del preventivo.
- Sezione Anagrafiche (menu in alto, `rotte/anagrafiche.ts`; Adriano 27/10/2026): TUTTE le anagrafiche stanno lì, non in Impostazioni.
  Tasti in alto Clienti / Fornitori / Prodotti / Componenti (archivio della codifica), sotto l'elenco con la ricerca veloce
  (`engine/ricerca.ts` = `public/ricerca.js`: filtra mentre si scrive, più parole, accenti e trattini dei codici non contano).
  Un'anagrafica nuova si aggiunge come altro tasto qui. I vecchi indirizzi /impostazioni/anagrafiche e /impostazioni/fornitori portano qui.

## Come lavorare
- Struttura database: mai modificare un file già esistente in `db/migrazioni/`; aggiungerne uno nuovo (`002_...sql`).
- Guida del portale (`/guida`, testi in `src/engine/guida.ts`; Adriano 28/10/2026): ogni funzione nuova o cambiata va spiegata anche lì,
  nell'argomento della sua area (frasi semplici, passi, pagine), con un caso di ricerca in `tests/guida.test.ts` se serve.
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
   Montaggio → AOI: TOP · BOT · Visivo (migrazione 038; Adriano 28/10/2026): AOI segue i lati SMD, Visivo toglie ispezione e programmazione AOI
   e conta il controllo visivo (fase 18V, 60 s a scheda). Pre-produzione: 5 minuti standard a voce (3D 0; acquisti solo con la spunta).
   Riquadro totali: `src/engine/riepilogo.ts` (prezzo a scheda, una tantum interni/acquisti, margini, ore ciclo/uomo).
   Elenco con azioni multiple (crea commessa, duplica, elimina). Stampa per il cliente `/preventivi/:id/stampa` (Adriano 28/10/2026;
   `views/stampa-preventivo.ts`, `engine/stampa-preventivo.ts`, `public/stampa-preventivo.css`): impaginata come i preventivi FIC, pannello
   "Cosa stampare" a sinistra: `?vista=essenziale` (solo prezzo a scheda, niente sotto la descrizione: con una tantum le comprende e lo dice),
   `dettaglio` (predefinita: componenti, PCB, SMD, THT, consumo, spedizione; gestione materiale e imballaggio su SMD/THT 70/30 pesato sul valore,
   `quotaSmd`), `macro`, `fasi`; condizioni generali (`CONDIZIONI_GENERALI`) in seconda pagina con la firma del cliente, tolte con `condizioni=0` / `firma=0`.
2b. 🟡 Preventivo dai documenti del cliente (Adriano 27/10/2026; `rotte/schede-cliente.ts`, `schede-cliente-servizio.ts`, `engine/scheda/*`, migrazione 035):
   Preventivi → Da documenti del cliente: un caricamento per scheda (file, zip o cartella; cartelle OLD/VECCHI/ARCHIVIO/BACKUP ignorate).
   Legge BOM, pick and place (PADS, Allegro, KiCad, Altium, senza intestazione con lato dal nome), Gerber RS-274X (anche incrementali/G74,
   macro) in SVG, forature Excellon (anche Allegro con "Holesize"), GenCAD. Incrocio: SMD TOP/BOT, THT (CAD > pick and place > BOM > impronta),
   feeder, item, refori (≥ 0,7 mm metallizzati, o piedini THT del CAD), fiducial, misure; saldatura THT: SMD su due lati → a mano, altrimenti
   onda (casi particolari li decide l'ufficio); consumi in `CONSUMI` (pasta 1,5 g / 450 componenti, onda 0,016 g/foro + 20%, filo 0,125 g/piedino).
   Segnalazioni: valori diversi BOM/pick and place, riferimenti mancanti, montaggio SMD/THT dichiarato sbagliato, lati, sovrapposizioni, DNP.
   Nel database solo i file utili compressi (PDF/3D/immagini restano sul Drive, solo nell'elenco). "Codifica la BOM" → sezione Componenti.
   Macchine: linea con Essemtec Fox (42 feeder 8 mm, 2×12, 1×16/24, vassoi; altezza max 25 mm), iPulse M1 e M4s (feeder 8–44 mm, max 11 mm).
   Preventivo "da validare" (Adriano 28/10/2026; `engine/scheda/preventivo.ts`, migrazione 036): dalla pagina dei documenti, catalogo e tariffe
   attuali + valori letti (SMD per lato, feeder, lamine, THT onda/mano, stagno, item); stato `da_validare` con l'elenco "Da controllare",
   il primo Salva dell'ufficio lo porta a bozza. Controllo piazzole/case (`engine/scheda/piazzole.ts`): piazzole del Gerber contro le
   piazzole IPC-7351 nominali dei chip 0201–2512; segnala solo se somigliano chiaramente a un altro case (es. BOM 0603, piazzole 0805).
   Stampe per la produzione (`views/stampa-scheda-cliente.ts`, `engine/scheda/documentazione.ts`, `/preventivi/documenti/:id/stampa?foglio=`):
   SMD TOP, SMD BOT (BOM del lato + disegno con riferimenti, piedino 1 dal GenCAD, critici in rosso), THT (stesso colore = stesso codice),
   protezioni per l'onda (fori e zone segnati sul disegno con "Segna le protezioni", salvati in `pacchetti_scheda.protezioni`).
   Segnalazioni "Va bene" (migrazione 037, `pacchetti_scheda.accettate`, `engine/scheda/accettate.ts`): chiave livello|testo, applicate in
   lettura (`conAccettate`): non contano tra gli errori né nel preventivo, componenti non più critici nelle stampe; restano dopo Rianalizza.
   File di testo in UTF-8 se validi (Ω di KiCad), altrimenti Latin-1; ponticelli SolderJumper/NetTie non sono componenti.
   Cartella grande (Adriano 29/10/2026; `engine/scheda/scelta-file.ts`, POST `/preventivi/documenti/:id/scelta`): il browser manda prima nomi e
   dimensioni, il portale sceglie i file utili; PDF, 3D (STEP da 80 MB), immagini, ODB++, .doc/.dsn…, file oltre 25 MB (zip oltre 60 MB) non si
   mandano e restano solo nell'elenco. Ignorati anche i file di lavoro di Casteltech: cartelle Armadi/Topografico e pick and place/BOM con i
   codici di produzione (`lavoratoDaCasteltech`). Strati PADS L1_TOP/L4_BOTTOM = rame esterno.
   Memoria (Render 512 MB, riavvio del 29/10/2026; `server/memoria.ts`): caricamenti dei file e analisi prenotano memoria e si mettono in fila
   (un'analisi alla volta); negli zip si estraggono solo i file utili (`sceltaFile`), PDF/3D/ODB++ restano chiusi; gli zip si aprono una volta sola.
   Prodotto nuovo dal preventivo (Adriano 28/10/2026; `engine/scheda/prodotto.ts`, POST `/preventivi/prodotti`): "+ Nuovo prodotto" accanto al codice
   lo aggiunge all'anagrafica del cliente senza uscire; codice, descrizione e revisione obbligatori (revisione non indicata = "0"), tutto MAIUSCOLO,
   stesso codice già presente = si sceglie quello. La revisione è obbligatoria per salvare ogni preventivo. Dai documenti del cliente codice,
   descrizione e revisione sono proposti (`analisi.prodotto`: intestazione BOM > Gerber X2 TF.ProjectId > GenCAD DRAWING/REVISION > nome
   caricamento/cartella tipo "EA1002-0") e precompilati nel preventivo da validare: entrano in anagrafica solo con "Aggiungi in anagrafica".
   Spunta Componenti su un preventivo nato dai documenti (Adriano 28/10/2026): `POST /preventivi/:id/quota-bom` → `quotaBomPacchetto` (BOM del
   pacchetto in Componenti, una sola volta, collegata a `preventivi.bom_id` senza toccare lo stato), poi il costo arriva dal preventivo con
   `problemiBom` (da completare, da validare, senza prezzo, non disponibili, critici) → "Risolvi nella BOM quotata" → riquadro in testa
   alla BOM → "Torna al preventivo per la quota" (`?quota-bom=1` ricalcola il costo).
   Pulsante in Gmail (Adriano 29/10/2026; pannello Apps Script in `tools/gmail-addon/` con LEGGIMI per l'installazione, `rotte/gmail.ts`,
   `engine/gmail.ts`, migrazione 042): da una mail aperta Preventivo / Ordine / Fattura estera. Indirizzi `/api/gmail/*` senza sessione, con la
   chiave `GMAIL_ADDON_CHIAVE` (Render) = `PORTALE_CHIAVE` (proprietà dello script), montati prima dei lettori da 2 MB. Preventivo: pacchetto
   con `pacchetti_scheda.email` (testo in cima alla pagina e nelle note del preventivo da validare), nomi e dimensioni → `scegliFileDaCaricare`,
   poi solo i file utili, analisi dopo la risposta (Gmail aspetta max 30 s; stato `in_analisi`, `errore`); cliente dal mittente solo se sicuro
   (stessa email o dominio di un solo cliente in CRM/anagrafica). Ordine / Fattura estera: la mail intera .eml in `acquisizioni`, IA dopo la risposta.
   ⬜ Installazione per tutto l'ufficio (Marketplace privato + console di amministrazione).
   ⬜ Rotazioni per macchina (servono i file macchina e le regole), ODB++, BOM .xls.
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
   Tempi scritti a mano (telefono, Aggiungi tempi, Rientro: `engine/tempi-scritti.ts` + `public/tempi.js`, Adriano 27/10/2026): base 60 come
   l'orologio, 1.30 = 1,30 = 1:30 = 1h 30', numero da solo = minuti (o secondi se la casella è in secondi), "1.5" rifiutato (ambiguo);
   uscendo dalla casella il tempo si riscrive leggibile (1h 30').
   🟡 Lettura delle schede scansionate (`engine/fogli-tempi.ts`, migrazione 027): stessa cartella Drive / Da acquisire degli ordini;
   l'IA riconosce la SCHEDA DI PRODUZIONE (n. commessa stampato), legge i fogli tempi, la fase si trova dal numero stampato
   ("1+2" = fasi insieme: nota "FASI 1+2 INSIEME"; aprendo il Rientro il tempo si divide tra le fasi in proporzione al tempo ciclo
   previsto, righe una dopo l'altra, parti uguali se una fase non ha previsto; `ripartisciFasiInsieme`, Adriano 27/10/2026: anche le righe già salvate, poi Salva), operatori "MH+NG", DATA gg/mm con l'anno della scansione (oltre 7 gg nel futuro = anno prima).
   Le righe si aggiungono in fondo al Rientro (`/commesse/:id/rientro?acquisizione=N`, evidenziate, quelle già presenti non si ripetono):
   l'ufficio controlla e salva. ⬜ Provata solo con lettura simulata: manca la prova con scansioni vere.
4b. ✅ Quotazioni, ex Componenti (`/quotazioni`, `rotte/componenti.ts`, `codifica-servizio.ts`, migrazione 021): codifica come il programma Python
   "Codifica componenti" (regole e decodifica P/N portate in `src/engine/codifica/*`, identiche: `tools/verifica-codifica.ts`
   con i casi generati dal Python, dati reali fuori dal repository). Codice di produzione (armadio, es. RS-0603-2K2-1-100MW) e
   gestionale (Moka, es. SRS-0603-2K20F-001, progressivo dall'archivio `componenti`). Resistenze solo all'1% (5% non si comprano),
   potenza standard del case se manca. Righe senza P/N: se il codice di produzione è già in archivio si riprendono i codici.
   BOM xlsx/csv → archivio, decodifica, DigiKey, colonne, IA (ANTHROPIC_API_KEY) → codici → prezzi da DigiKey, Mouser,
   Farnell, TME (`fornitori.ts`, chiavi solo su Render, cache 24 h) → scarto (`engine/acquisti.ts`: passivi <0,10 € +10%,
   <1 € +5%, 1–3 € +1 pz, oltre 0; Impostazioni → Componenti), miglior fornitore, reperibilità. Excel con codifica e acquisti.
   Reperibilità (Adriano 28/10/2026): si cerca presso tutti i distributori; critico SOLO se non disponibile da nessuna parte, attenzione solo
   se la quantità va divisa o un distributore non ha risposto (`nonControllati`); fine vita/scorte basse solo note. P/N critico → alternative
   (`cercaAlternative`: varianti dello stesso P/N + stesse caratteristiche = stesso codice di produzione, solo famiglie senza RID/PN nel codice),
   prezzate da tutti; l'operatore sceglie ("Usa questa", `alternativaScelta`) o ne scrive una a mano (POST `/componenti/bom/:id/riga/:n/alternativa`);
   scelte e alternative a mano restano dopo Rielabora. Prezzo a mano per riga (`prezzoManuale`, POST `.../riga/:n/prezzo`): vale al posto di quello proposto.
   Archivio iniziale: file componenti_casteltech.json.gz da Impostazioni → Componenti.
   Miglior prezzo di un P/N (Adriano 28/10/2026; `/quotazioni/prezzo`, `confrontaOfferte` in `engine/acquisti.ts`): P/N + pezzi → tutti gli shop collegati
   affiancati, in cima la stessa scelta della BOM (`sceltaMigliore`), colonna "In più"; usa `cercaPn` e la cache di 24 h. ⬜ LCSC: serve la chiave
   (richiesta a support@lcsc.com con i documenti dell'azienda, IP di Render da autorizzare); per ora solo il link "Cerca su LCSC".
   BOM collegata al preventivo (migrazione 024, `preventivi.bom_id`): nel gruppo ACQUISTI si sceglie una BOM caricata e il costo
   componenti a scheda si ricalcola sulle schede del preventivo con le offerte già lette (`costoMaterialiPer`, niente chiamate ai
   distributori); il valore resta nei parametri del preventivo. Scrivere il costo a mano toglie il collegamento; eliminare la BOM no.
4c. 🟡 Ordini clienti (`rotte/ordini.ts`, `ordini-servizio.ts`, `engine/ordini.ts`, migrazione 022): righe d'ordine con stato da evadere /
   parziale / evaso (schede: quantità spedita con DDT; servizi: fatturati o tutte le schede evase; lo stato scritto dall'ufficio vince),
   date del foglio "Schedulazione produzione" (lavorazione = arrivo materiale + 3 gg, prevista = lavorazione + 5 gg + ritardi),
   consegne a programma (es. Univac 15 mesi), cruscotto (fatturato, media mesi chiusi, da evadere per mese, previsione anno),
   Gantt all'indietro dalla consegna con ore ciclo dell'ultimo preventivo del prodotto ÷ ore al giorno, fatture senza ordine.
   Gantt a giorni su tutta la larghezza (Adriano 28/10/2026, `periodoGantt`): 1 mese (5 settimane dal lunedì) standard, Settimana o 3 mesi, nient'altro; ‹ Oggi ›.
   Dati: import JSON(.gz) da Impostazioni → Ordini, preparato fuori dal repository incrociando gli export di Fatture in Cloud
   con gli ordini PDF dei clienti (ricaricabile: restano date, ritardi, stati e note scritti nel portale).
   🟡 Acquisizione (`rotte/acquisizioni.ts`, `acquisizioni-servizio.ts`, `lettura-ordini-ia.ts`, `engine/acquisizioni.ts`, migrazione 023):
   Ordini → Da acquisire, file caricati (poi dalla cartella Google Drive): PDF/foto/email .eml/testo letti dall'IA → proposta
   da confermare (cliente SOLO dall'anagrafica, prodotti ricollegati al cliente scelto) → ordine origine email, numero dal 9001 nell'anno.
   Cartella Google Drive (`server/drive.ts`): account di servizio (GOOGLE_SERVICE_ACCOUNT = JSON della chiave, solo su Render;
   DRIVE_CARTELLA_ORDINI facoltativa, altrimenti l'unica cartella condivisa), ogni 15' lun–ven 8–20, database solo se ci sono
   file nuovi, i file letti vanno nella sottocartella "Acquisiti". Pulsante "Controlla adesso" in Da acquisire.
   DDT di Casteltech in PDF (migrazione 029): l'IA li riconosce (Casteltech mittente), ogni riga si abbina alla riga d'ordine aperta del cliente
   con lo stesso codice (`abbinaDdt`: prima quelle ancora da spedire, poi l'ordine citato, poi la consegna più vicina); l'ufficio conferma →
   `ddt_righe` origine 'acquisito' (lo spedito della riga = import + DDT acquisiti). Ricaricando il file ordini restano, salvo che il file contenga lo stesso DDT.
   Evasione automatica (Adriano 28/10/2026, `abbinaSpedizioni` in `engine/ordini.ts`): i DDT del portale (storico FIC, poi quelli emessi dal portale;
   le fatture no: possono essere anticipi) non già contati nell'import si abbinano alle righe aperte stesso cliente + stesso codice (o descrizione), prima gli ordini
   più vecchi; calcolato in lettura, niente tabelle nuove. Servizi (`eServizio`: lamine, programmazione attrezzature, una tantum, trasporto…) non sono
   da evadere: evasi se fatturati o se l'ordine non ha più schede aperte. "Segna tutto evaso" nella pagina dell'ordine per le consegne non riconosciute.
   ✅ Conferma d'ordine (Adriano 28/10/2026; `rotte/conferme-ordine.ts`, `conferme-ordine-servizio.ts`, `engine/conferme-ordine.ts`, migrazione 041):
   pulsante nella pagina dell'ordine → documento 'conferma_ordine' (bozza) con righe e date di consegna copiate dall'ordine (una riga per consegna
   a programma, annullate escluse), modificabili senza toccare l'ordine; Emetti = numero della serie conferma_ordine + PDF salvato in `documenti.pdf`
   (`pdf-conferma-ordine.ts`, pdf-lib, impaginato come la stampa preventivi), serve una data di consegna per riga; dopo l'emissione si corregge
   ancora (PDF rifatto, stesso numero), bozza si elimina, emessa si annulla. Invio con Gmail (`server/gmail.ts`): account di servizio
   GOOGLE_SERVICE_ACCOUNT + delega di dominio Google Workspace, casella GMAIL_MITTENTE (info@casteltech.net), ambiti gmail.send (+ gmail.readonly per
   trovare la conversazione); risposta all'email dell'ordine (.eml in acquisizioni: Message-ID → In-Reply-To/References). ⬜ Delega da attivare.
   ⬜ Script che salva le email d'ordine di info@ nella cartella.
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
   Import che si aggiunge (foglio lead PER_FEDERICO, 26/10/2026): il file può portare attività (non ripetute: stessa data, tipo, testo),
   prossima azione (solo dove manca), responsabile, stato (solo alle aziende ancora "Da contattare") e `scollega_cliente` per i collegamenti
   sbagliati; altri nomi, telefoni, email e note si uniscono a quelli del portale (`unisciElenco`). Nome uguale ma P.IVA diversa: non è lo stesso cliente.
4e. ✅ Anagrafica fornitori (`rotte/fornitori-anagrafica.ts`, `engine/anagrafica-fornitori.ts`, migrazione 028, tabella `fornitori_anagrafica`;
   diversa da `fornitori.ts`, che sono i distributori di componenti): Anagrafiche → Fornitori. Regole di Adriano (26/10/2026): solo con P.IVA
   valida (italiana: cifra di controllo; estera: formato del paese, scritta con il prefisso), una P.IVA = un fornitore, tutto MAIUSCOLO (email e PEC minuscolo).
   Base: elenco fornitori di FIC ripulito fuori dal repository (file fornitori_casteltech.json.gz, ricaricabile: aggiunge e aggiorna, non toglie);
   i dubbi sono stati incrociati con gli export acquisti 2025–26: caricati solo se comprati, con nota "DA VERIFICARE".
4f. ✅ Suggerimenti del team (`rotte/suggerimenti.ts`, `engine/suggerimenti.ts`, migrazione 031; Adriano 27/10/2026): voce Suggerimenti nel menu,
   idee da sviluppare più avanti con chi le propone, data, area, priorità, stato (da valutare / in programma / in sviluppo / fatto / scartato) e note.
   Elenco: aperti in cima per stato e priorità, fatti e scartati nascosti ("mostra tutti"). Elimina sempre possibile (non collegati ad altro).
   Primi due (Federico): avviso Telegram al responsabile della fase successiva seguendo il Gantt (responsabili di fase ancora da definire);
   promemoria nel calendario di info@ per le commesse in ritardo su preventivo, capacità produttiva e scadenza.
4g. ✅ Guida (`rotte/guida.ts`, `engine/guida.ts`, `server/guida-ia.ts`, `public/guida.js`; Adriano 28/10/2026): voce Guida nel menu (anche produzione),
   macro aree con argomenti (cosa si fa, come, cosa non si può fare, pulsanti alle pagine), ricerca intelligente mentre si scrive
   (radici italiane, sinonimi, "ordine+documenti" = "ordine documenti"), "Chiedi alla guida" con l'IA che risponde solo dalla guida
   (senza chiave: rimanda agli argomenti trovati). Nessuna query al database.
5. ⬜ Analisi commessa, prezzo corretto, storico prodotto e interrogazioni. Se al rientro i tempi peggiorano in modo
   importante: ricalcolo del preventivo e nuova proposta commerciale per il lotto successivo, da inviare con mOKa.
6. ~~Collegamento mOKa~~: superato (Adriano, 26/10/2026: niente mOKa né Fatture in Cloud, che scade il 10/11/2026).
7. 🟡 Amministrazione (piano: 27/10–4/11, fatture vere dal 5/11): SdI tramite Invoicetronic (`INVOICETRONIC_API_KEY` su Render, per ora
   chiave di prova; codice destinatario 7HD37X0 da registrare all'Agenzia quando la ricezione funziona; conservazione gratuita dell'Agenzia).
   ✅ Impostazioni → Amministrazione (`rotte/impostazioni-amministrazione.ts`, `engine/amministrazione.ts`, migrazione 032): dati dell'azienda,
   numerazioni per tipo/sezionale/anno (numero dato solo all'emissione, `assegnaNumero` in transazione, date in ordine; valori 2026 da FIC
   da riallineare il giorno del passaggio), aliquote/nature IVA con bollo 2 € oltre 77,47 €, condizioni di pagamento (giorni poi fine mese),
   dati fiscali dei clienti, lettere d'intento, tabelle `documenti` / `documenti_righe` / `documenti_scadenze` per tutti i documenti.
   ✅ Da Fatture in Cloud (Impostazioni → Amministrazione, file preparati fuori dal repository, anteprima poi conferma, ricaricabili):
   dati fiscali dei clienti già in anagrafica (`caricaClientiFiscali`) e storico dal 2025 (`caricaStoricoFic`, migrazione 033): fatture, note di
   credito, autofatture, DDT in `documenti` (origine 'fic', `fic_id`), righe, scadenze incassate/aperte con il conto; DDT → fattura (`fattura_id`,
   uniti in FIC o citati in una riga "DDT n. X del"); fatture/NC ricevute in `documenti_ricevuti` (+ scadenze). Le numerazioni salgono all'ultimo n. di FIC.
   ✅ Menu Amministrazione (`rotte/amministrazione.ts`, `documenti-servizio.ts`): elenco documenti per tipo/anno (anche storico FIC), documenti ricevuti;
   fattura / nota di credito: bozza (cliente SOLO dall'anagrafica, righe, DDT da fatturare del cliente, IVA predefinita del cliente) → Emetti:
   numero in transazione, scadenza dalla condizione di pagamento, XML FatturaPA (`engine/fatturapa.ts`: TD01/TD04, lettera d'intento in
   AltriDatiGestionali, bollo virtuale, DatiDDT, cliente estero XXXXXXX, PEC), DDT segnati fatturati; con errori non si emette e il numero non si consuma. Bozza senza errori: "Scarica XML di prova" (numero 0, non consuma la numerazione).
   ✅ Cruscotto (`/amministrazione`, `rotte/cruscotto-amministrazione.ts`, conti in `engine/cruscotto-amministrazione.ts`; Adriano 27/10/2026): fatturato e acquisti
   dell'anno con lo stesso periodo dell'anno prima, grafico per mese, incassi e pagamenti aperti per urgenza (scadute, 7 gg, 30 gg, oltre), DDT da fatturare, bozze.
   Fatture fornitori (`/amministrazione/ricevuti`): elenco, "solo da pagare", dettaglio; ogni rata (anche delle fatture emesse) si segna incassata/pagata con data e conto.
   ✅ Autofatture TD17/18/19 (Adriano 28/10/2026; `engine/autofatture.ts`, `autofatture-servizio.ts`, `rotte/autofatture.ts`, migrazione 039):
   la fattura del fornitore estero (PDF) si carica in Documenti emessi → Autofatture o si mette nella cartella Drive degli ordini (l'IA la riconosce,
   acquisizione tipo 'fattura_estera'); l'IA legge fornitore, numero, data, valuta, tutte le righe. Pagina di controllo `/amministrazione/fatture-estere/:id`:
   fornitore cercato in anagrafica per P.IVA o nome (se nuovo si aggiunge con le regole dell'anagrafica fornitori), tipo proposto dal paese della P.IVA
   (servizi TD17, beni UE TD18, beni extra UE TD19 con avviso dogana), cambio BCE alla data della fattura per le valute estere, blocco se esiste già
   un'autofattura che cita lo stesso numero (anche dallo storico FIC). Fornitore cercato anche per nome senza forme societarie ("MOUSER ELECTRONICS, INC." = "MOUSER
ELECTRONICS"); senza P.IVA europea sulla fattura (Mouser dalla sede di Assago: solo FED ID) si riprende quella delle autofatture precedenti, con avviso.
   Provato il 28/10/2026 con le fatture vere 2026 (Mouser, DigiKey, Anthropic, FedEx, Cina): stessi tipo, righe, imponibile e IVA di FIC. Conferma → fattura tra le fatture fornitori (origine 'acquisito') + bozza
   dell'autofattura (sezionale AF, righe in euro con IVA 22 %) → Emetti: XML `generaAutofatturaXml` (cedente estero RF18, CAP 00000, DatiFattureCollegate).
   ⬜ Sottocartella Drive dedicata (per ora la stessa cartella degli ordini).
   Nota di credito da una fattura emessa (righe copiate, fattura collegata). XML controllato con lo schema ufficiale: `npx tsx tools/verifica-fatturapa.ts`
   (rifarlo a ogni modifica di fatturapa.ts). Documenti emessi non si eliminano (si stornano).
   ⬜ PDF della fattura, Invoicetronic, DDT (conferme d'ordine: vedi 4c),
   ordini a fornitore, Gmail, banca BPER, accesso del commercialista, note spese (dopo il 10/11).
