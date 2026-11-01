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

- Menu in alto a gruppi (Adriano 31/10/2026, `MENU_GRUPPI` in `views/layout.ts`, test in `tests/menu.test.ts`): Anagrafiche, Commerciale (Adriano 1/11/2026, in quest'ordine:
  CRM, Quotazioni componenti, Documenti dei clienti, Preventivi, Ordini clienti, Conferme d'ordine = elenco `/ordini/conferme`, poi Ordini da e-mail e PDF = Da acquisire), Acquisti (ordini a fornitore, miglior prezzo; poi magazzino), Produzione (commesse, Gantt; poi macchine e consumi),
  Amministrazione, Qualità (dal 1/11/2026); ogni gruppo ha la tendina con le pagine. Impostazioni, Suggerimenti e Guida piccoli a destra. Da aggiungere più avanti:
  Sicurezza e ambiente. Gli indirizzi delle pagine non cambiano; la sezione della pagina (`attiva`) accende il gruppo con `gruppoAttivo`.
  Tendine meno sensibili (Adriano 31/10/2026, `public/menu.js`): si chiudono 0,45 s dopo l'uscita del mouse, ponte invisibile tra nome e tendina,
  cambio gruppo solo se il mouse si ferma 0,18 s, clic sul nome a tendina chiusa (tablet) la apre.
  "Quotazioni" è la ex sezione Componenti (BOM, codifica, prezzi): indirizzo `/quotazioni`, i vecchi `/componenti/...` portano lì (`index.ts`);
  "Componenti" resta il nome dell'archivio in Anagrafiche, di Impostazioni → Componenti e della spunta del preventivo.
- Ricerca unica in alto (proposta della revisione, Adriano 1/11/2026 "applica i suggerimenti"; `rotte/cerca.ts`, regole in `engine/ricerca-globale.ts`, letture in
  `ricerca-globale-servizio.ts`, `public/cerca.js`, test in `tests/ricerca-globale.test.ts`): casella nella testata (tasto `/` o Ctrl+K), trova clienti, prodotti,
  commesse (C2026-0012), ordini e documenti (12/2026 o 12), fatture fornitori, preventivi, fornitori, CRM, componenti, guida; voci mentre si scrive
  (`/cerca?formato=json`), un solo risultato o numero esatto = pagina diretta; contabilità solo documenti.
- Scheda unica del cliente (proposta della revisione, Adriano 1/11/2026; `/anagrafiche/clienti/:id`, `scheda-cliente-servizio.ts`, conti in `engine/scheda-cliente.ts`,
  test in `tests/scheda-cliente.test.ts`): sei numeri (fatturato anno/anno prima, da incassare e scaduto con giorni medi di incasso, ordini aperti, commesse,
  DDT da fatturare, preventivi) + riquadri ordini, commesse, DDT, incassi scaduti, documenti, preventivi, prodotti e prezzi, CRM; pulsanti Dati fiscali, Prodotti,
  CRM, + Preventivo (`/preventivi/nuovo?cliente=ID` preseleziona il cliente), + Fattura, + DDT. Tasto "Scheda" nell'elenco Clienti; la ricerca in alto porta qui.
- Sezione Anagrafiche (menu in alto, `rotte/anagrafiche.ts`; Adriano 27/10/2026): TUTTE le anagrafiche stanno lì, non in Impostazioni.
  Tasti in alto Clienti / Fornitori / Prodotti / Componenti (archivio della codifica), sotto l'elenco con la ricerca veloce
  (`engine/ricerca.ts` = `public/ricerca.js`: filtra mentre si scrive, più parole, accenti e trattini dei codici non contano).
  Un'anagrafica nuova si aggiunge come altro tasto qui. I vecchi indirizzi /impostazioni/anagrafiche e /impostazioni/fornitori portano qui.
- Prezzi in anagrafica (Adriano 31/10/2026; migrazione 051, `engine/prezzi-fic.ts`, `prezzi-servizio.ts`, test in `tests/prezzi-fic.test.ts`): Prodotti → colonna
  Prezzo € (vendita a scheda), Componenti → ultimo acquisto (prezzo, fornitore, data, pezzi). Da FIC con `tools/prezzi-da-fic.ts`: prodotto = il più recente tra
  ultima fattura emessa al cliente e anagrafica prodotti FIC (differenze in un Excel per Adriano); componente = ultimo ordine a fornitore con quel P/N o codice
  (valuta estera → euro col cambio dell'ordine). Caricamento "Carica i prezzi da Fatture in Cloud" (anteprima → conferma, ricaricabile); prezzo scritto a mano
  = fonte 'manuale', il caricamento non lo tocca. Il prezzo va solo sul codice del cliente giusto (cliente non riconosciuto: solo se il codice è unico).
  Scaglioni di quantità (Adriano 31/10/2026; migrazione 052 `prodotti_scaglioni`, `engine/listino.ts`, test in `tests/listino.test.ts`): facoltativi, casella
  "1-5=10; 6-20=8; 21+=7" nel prodotto; senza scaglioni vale il prezzo unico. Fattura / NC / DDT: codice + quantità senza prezzo → prezzo dello scaglione
  (`completaDaListino` in `salvaBozza` e `salvaConferma`, e mentre si scrive con `public/documenti.js` → GET `/anagrafiche/prodotti/:id/listino`); prezzo scritto a mano resta.
  Codice delle righe SOLO dall'anagrafica (Adriano 31/10/2026, "vale per tutti i documenti"; `views/scelta-prodotto.ts`, test in `tests/documenti-anagrafica.test.ts`):
  fattura / NC / ND, DDT, conferma d'ordine = menu con i soli prodotti del cliente + "+ Nuovo prodotto…" (POST `/preventivi/prodotti`) + "— senza codice —" per servizi;
  descrizione dal prodotto (sola lettura); codici vecchi non in anagrafica restano "(non in anagrafica)"; al salvataggio il codice viene dal prodotto del cliente.
  Prezzo scritto a mano diverso dal listino → "Aggiorno l'anagrafica?" (`cosaAggiornare`: lo scaglione di quella quantità, altrimenti il prezzo unico, fonte 'manuale').
  Ordine a fornitore: P/N proposti dall'archivio Componenti mentre si scrive (`/anagrafiche/componenti-cerca`), stessa domanda per l'ultimo acquisto. Preventivi e
  Da acquisire avevano già il menu; autofatture escluse (righe del fornitore estero).

## Come lavorare
- Ogni richiesta di modifica (Adriano 31/10/2026): prima riscrivi la richiesta in 3 righe semplici (cosa cambia, dove, per chi).
  Se tocca formule economiche, preventivi salvati o anagrafiche, chiedi conferma ad Adriano prima di scrivere codice; il resto si fa e si pubblica dopo i test.
  Alla fine un riepilogo in italiano di cosa cambia per chi usa il portale (pagine, pulsanti, cosa fare di diverso), non l'elenco dei file.
  Quando Adriano corregge un modo di lavorare, la correzione si scrive qui (o nella memoria del progetto, se vale solo per un caso).
- Struttura database: mai modificare un file già esistente in `db/migrazioni/`; aggiungerne uno nuovo (`002_...sql`).
- Guida del portale (`/guida`, testi in `src/engine/guida.ts`; Adriano 28/10/2026): ogni funzione nuova o cambiata va spiegata anche lì,
  nell'argomento della sua area (frasi semplici, passi, pagine), con un caso di ricerca in `tests/guida.test.ts` se serve.
- Prima di salvare: `npm run verifica` (tipi) e `npm test` (deve passare tutto). Aggiungi un test per ogni regola nuova.
- Pagine HTML: usare `html\`...\`` di `src/server/views/html.ts` (protegge i testi); niente JavaScript inline
  (lo blocca la Content-Security-Policy): gli script stanno in `public/`.
- Tasto Elimina (Adriano, 26/10/2026: in tutte le sezioni, per le righe inserite per errore): conferma con `data-conferma="testo"`
  sul modulo o sul pulsante (`public/conferma.js`, caricato in ogni pagina); regole in `src/engine/eliminazioni.ts`. Ciò che è già usato
  non si elimina (preventivo con commessa, cliente/prodotto usati, fasi/parametri del catalogo di partenza → spunta "Attiva", utenti che hanno lavorato → "Attivo").
- Elenchi con spunte (Adriano 29/10/2026; `views/azioni-elenco.ts` + `public/elenco.js`, test in `tests/azioni-elenco.test.ts`): come l'elenco Preventivi,
  casella su ogni riga e pulsanti in alto a destra (`moduloAzioni`, POST `<sezione>/azioni`). Ci sono in Preventivi, Commesse (Stampa scheda, Rientro,
  Duplica, Elimina: insieme solo aperte e senza tempi), Ordini (righe; Conferma d'ordine, Segna evase, Stato dai DDT, Elimina = ordini interi; niente
  Duplica), BOM di Quotazioni, Ordini a fornitore (Duplica, Elimina = bozze eliminate, emessi annullati), Documenti del cliente, Da acquisire (Scarta), Suggerimenti,
  Documenti emessi (Adriano 31/10/2026; regole in `engine/azioni-documenti.ts`, `azioni-documenti-servizio.ts`, test in `tests/azioni-documenti.test.ts`):
  pulsanti per tipo (fatture: Stampa, XML/zip, Excel, Segna incassate → pagina con data e modo, Duplica, Nota di credito, Elimina; NC; autofatture; DDT: Fattura i DDT
  dello stesso cliente, Annulla DDT); Elimina SOLO bozze senza numero, il resto si storna/annulla e il messaggio dice cosa non è stato toccato; niente spunte per Contabilità. Un elenco nuovo con azioni usa lo stesso schema.
- Ogni push su `main` viene pubblicato da Render in automatico (render.yaml): lavora su un ramo se la modifica è grossa.
- Dati reali (dump del vecchio portale, export clienti) non vanno mai nel repository.

## Database su Neon (piano gratuito)
Il database si spegne dopo 5 minuti senza richieste e il piano ha 100 ore di calcolo al mese:
niente controlli periodici che interrogano il database (il controllo di Render `/salute` non lo tocca),
niente timer frequenti. Uso reale: lun–ven 8–20. Backup lun–ven alle 18:00 (Adriano 1/11/2026) in `BACKUP_DIR` (disco Render)
+ pulsante in Impostazioni → Backup.
Copia su Google Drive (Adriano 1/11/2026; `engine/backup-pc.ts`, `rotte/api-backup.ts`, test in `tests/backup-pc.test.ts`): Impostazioni → Backup →
"Installa sul PC" scarica un .bat con la chiave (impostazioni 'backup_pc'); sul PC dell'ufficio crea l'attività pianificata delle 18:30 (alla prima accensione se
spento) che chiede POST `/api/backup/piano` e scarica con GET `/api/backup/file/:nome` le copie nuove in `G:\Il mio Drive\01_LAVORO\CASTELTECH\16_Backup\Portale_Render`;
sul PC 60 giorni + la prima copia di ogni mese. Il portale non tocca Google (niente account di servizio: senza spazio su "Il mio Drive").
Il backup si scrive a pezzi (`scriviBackup`: 100 righe per volta, gzip in streaming, una sola transazione in lettura): mai tutto il
database in memoria (30/10/2026 il backup costruito in un colpo solo faceva uscire il portale con stato 134).
Nel backup TUTTE le tabelle (Adriano 31/10/2026) tranne `TABELLE_ESCLUSE` (sessioni, cache prezzi), in ordine di dipendenza
(`ordinaPerDipendenze`); copie oltre 750 MB tolte dalle più vecchie (almeno 5). `tools/ripristina-backup.ts` segue l'ordine del file.

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
   e conta il controllo visivo (fase 18V, 60 s a scheda). Montaggio → SMD → A mano (migrazione 044; Adriano 29/10/2026, campionature):
   SMD in giostra a 15 s l'uno (`tempoMontaggioSmdMano`), in SMD solo attrezzaggio serigrafia 45 min (`tempoAttrezSerigrafiaMano`), forno e consumi restano. Pre-produzione: 5 minuti standard a voce (3D 0; acquisti solo con la spunta).
   Riquadro totali: `src/engine/riepilogo.ts` (prezzo a scheda, una tantum interni/acquisti, margini, ore ciclo/uomo).
   Elenco con azioni multiple (crea commessa, duplica, elimina). Stampa per il cliente `/preventivi/:id/stampa` (Adriano 28/10/2026;
   `views/stampa-preventivo.ts`, `engine/stampa-preventivo.ts`, `public/stampa-preventivo.css`): impaginata come i preventivi FIC, pannello
   "Cosa stampare" a sinistra: `?vista=essenziale` (solo prezzo a scheda, niente sotto la descrizione: con una tantum le comprende e lo dice),
   `dettaglio` (predefinita: componenti, PCB, SMD, THT, consumo, spedizione; gestione materiale e imballaggio su SMD/THT 70/30 pesato sul valore,
   `quotaSmd`), `macro`, `fasi`; condizioni generali (`CONDIZIONI_GENERALI`) in seconda pagina con la firma del cliente, tolte con `condizioni=0` / `firma=0`.
   Ritocchi per il cliente (Adriano 29/10/2026; migrazione 046, `preventivi.stampa`, `leggiRitocchi`/`contiStampa`, POST `/preventivi/:id/stampa`): note per il cliente,
   sconto (% su tutto o € sul lotto), righe in più; solo nella stampa, il calcolo non cambia. Le note del preventivo sono interne (stampate solo con la spunta).
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
   Pannello: la mail aperta NON arriva al pannello (contextual trigger mai chiamato su info@, 29/10/2026): la pagina iniziale elenca le ultime
   mail con allegati + Cerca (`GmailApp.search`, ambito gmail.readonly). Script sul progetto Google standard (con un progetto Cloud proprio
   non partiva nulla); colleghi: script condiviso come Editor, ognuno "Testa i deployment → Installa".
   File arrivati dopo: "Aggiungi a documenti già caricati" (Gmail, `/api/gmail/preventivo/:id/aggiungi`) o "Aggiungi file a questo pacchetto"
   (pagina dei documenti), poi rianalisi. Versioni della stessa scheda (migrazione 043, `engine/scheda/versioni.ts`): quantità e versioni
   lette dalla mail ("167pz M0929-C versione HELIOS") → "Dividi per versione" = un pacchetto figlio per versione (`padre_id`, `versione`,
   `quantita` proposta nel preventivo) con i file comuni + quelli con il nome della versione; i file aggiunti al padre passano ai figli
   (`sincronizzaVersioni`). Mail salvata .eml nella cartella caricata (`emailDallaCartella`): testo in `pacchetti_scheda.email` se manca, allegati non letti. BOM divisa SMD + PTH (riferimenti diversi) unita in lettura (`engine/scheda/bom-divise.ts`); BOM in PDF non lette. BOM .txt a colonne fisse (`leggiBomColonneFisse`), pick and place "centri" (rif, X, Y, lato 1/2, rot, unità); pick and place con altra origine allineato al rame (`engine/scheda/allinea.ts`, avviso); nei figli di versione i riferimenti fuori dalla BOM della versione non contano (M0929-C, 29/10/2026).
   Più codici nella stessa mail (RDO Elemaster 20149766 / 1022303, Adriano 29/10/2026; `richiestePerCodice` in `engine/scheda/versioni.ts`): riga "codice descrizione"
   riconosciuta solo se il codice è nell'oggetto o nel nome di un allegato, quantità ("Primo odp 43pz") prima o dopo, Forecast e cicli sotto il codice →
   "Dividi per codice" (stesso meccanismo delle versioni, `versione` = codice); nel preventivo codice e descrizione dalla mail, cicli → spunte (`parametriDaCicli`:
   onda, THT a mano, AOI, etichette, pulizia, lavaggio; il resto in "Da controllare"). BOM con alternative del cliente (Pref/Alt, LLC 1/2;
   `engine/codifica/alternative-bom.ts`, anche in Quotazioni): una riga per componente, codice dalla preferita, colonna "Alternative del cliente".
   SMD/THT senza colonna di montaggio: descrizione "SMD …" = SMD, le altre THT (se almeno 1/4 delle righe comincia per SMD); dissipatori, viti, grasso,
   etichette, specifiche… = `accessorio` (non contano); "POST WAVE ASSEMBLY" = `dopoOnda` (vince il pezzo saldato sullo stesso riferimento).
   LPS Zapper (30/10/2026): "Non Montare" nella colonna Note = non montato; con la BOM, i riferimenti solo nel pick and place non si contano
   (restano nell'errore); vecchio Allegro senza "!" ("m" = BOT); strati CAM350 pastetop/maskbot/bot/int2; controllo piazzole muto se trovate per <30%.
   ⬜ Rotazioni per macchina (servono i file macchina e le regole), ODB++, BOM .xls, archivi .rar (LPS li manda: per ora si rifanno in zip).
3. ✅ Commesse e stampa scheda di produzione (`rotte/commesse.ts`, `commesse-servizio.ts`, `public/stampa.css`):
   prima pagina come la MASTERspec, fasi del preventivo ricalcolate sulla quantità (tempo previsto e effettivo, ciclo e uomo),
   fogli tempi, QR → `/c/<codice>`. Stampa: max 2 pagine di scheda (fasi in un'unica tabella compatta) + 2 fogli tempi
   = 2 fogli fronte/retro (provato con tutte le 63 fasi). Niente "tempo ultima produzione" (Adriano: andrebbe riparametrizzato sulla quantità).
   La scheda tecnica (programmi, lamine, paste, prog. forno, note) sta sulla revisione del prodotto e si ripropone ai lotti
   successivi (se la revisione è nuova: dall'ultima commessa dello stesso codice). Le segnalazioni della commessa vanno
   nello storico del prodotto (tabella segnalazioni) e si stampano sulle prossime schede.
   Numerazione fasi (migrazione 019): lettere per pre-produzione, M1… gestione materiale, poi 1, 2, 3… progressivi.
   Sigle operatori: Impostazioni → Operatori (dati reali: solo nel database, mai nel repository).
3b. ✅ Filiera commessa → DDT → fattura (proposta della revisione, Adriano 1/11/2026; `rigaDdtDaCommessa` e `rigaOrdinePerCommessa` in `engine/ddt.ts`,
   `creaDdtDaCommessa` e `documentiDellaCommessa` in `documenti-servizio.ts`, POST `/amministrazione/documenti/ddt-da-commessa/:id`, test in `tests/ddt.test.ts`):
   "Crea DDT" nella pagina della commessa e nel rientro confermato → bozza con cliente, prodotto, schede delle spedizioni del rientro (o tutta la commessa) meno quelle
   già partite con DDT del portale, prezzo dalla riga d'ordine (quella che cita la commessa, poi stesso prodotto nell'ordine scritto sulla commessa, poi la più vecchia
   aperta) o dal venduto o dal listino, `documenti.commessa_id` + `documenti_righe.commessa_id`, riga d'ordine collegata; la pagina della commessa elenca DDT e fatture.
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
   scelte e alternative a mano restano dopo Rielabora. BOM senza colonna P/N (Adriano 29/10/2026, `engine/codifica/candidati-pn.ts`): codici cercati in Valore e Descrizione,
   si compra quello che i distributori hanno; due codici diversi = stesso codice / JEDEC equivalente / "codice da validare"; dati BOM diversi dal codice
   (valore, case, tensione più bassa) = da validare; celle DNP / "Excluded from BOM" = non montato. Prezzo a mano per riga (`prezzoManuale`, POST `.../riga/:n/prezzo`): vale al posto di quello proposto.
   Ricerca e compatibili (Adriano 1/11/2026; `cercaPn`, `cercaVarianti`, `digikeySostituti` in `fornitori.ts`, `compatibileProposto` in `codifica-servizio.ts`,
   `proponiCompatibiliIa` in `lettura-ia.ts`, test in `tests/codifica-aggiunte.test.ts`): ogni P/N presso TUTTI i distributori in parallelo, un errore non ferma il
   distributore (si riprova; stop solo chiavi, limite, 3 errori di fila). P/N non trovato → `alternativaProposta` = compatibile "al 100% in teoria" che dà il prezzo
   (variante dello stesso P/N > stesso codice di produzione > sostituto DigiKey diretto > pin-to-pin dell'IA venduto da un distributore; mai "simile"/"upgrade"),
   reperibilità "attenzione", sezione "Codici compatibili da verificare" in cima alla BOM, "Confermo" = `alternativaScelta`. Arrow (`engine/arrow.ts`,
   ARROW_LOGIN + ARROW_API_KEY da developers.arrow.com, USD → EUR cambio BCE): lettura da confermare con la prima Prova.
   Codifica, regole aggiunte (registro `REGISTRO_AGGIUNTE` in `engine/codifica/aggiunte.ts`, visibile in Impostazioni → Componenti; ogni aggiunta nuova va lì):
   famiglie CF film, NT termistori, BT batterie, AN antenne; case nuovi/sinonimi (`CASE_AGGIUNTI`, `IC_FAM_AGGIUNTE`, DIP); categorie DigiKey dalla più specifica.
   I componenti in archivio non cambiano codice; le aggiunte toccano solo casi che il Python lasciava "da completare" (`tools/verifica-codifica.ts` da rifare con i dati veri).
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
   ✅ Ordini a fornitore (Adriano 31/10/2026: in FIC ~20 al mese, n. 204 del 30/10; `rotte/ordini-fornitore.ts`, `ordini-fornitore-servizio.ts`,
   `engine/ordini-fornitore.ts`, migrazione 047): Ordini → Ordini a fornitore (`/ordini/fornitori`), documento 'ordine_fornitore' con fornitore SOLO
   dall'anagrafica; bozza → Emetti (serie 'ordine_fornitore', PDF con `MODELLO_ORDINE_FORNITORE` di `pdf-conferma-ordine.ts`) → Invia con Gmail;
   arrivo merce per riga (`documenti_righe.arrivati`, caselle `arrivati[pN]`: con i soli numeri qs compatta l'elenco), fattura del fornitore collegata
   (`documenti.ricevuto_id`), commessa (`commessa_id`). Da Quotazioni → BOM → "Ordina i componenti": una bozza per distributore scelto (`righeOrdineDaBom`,
   fornitore abbinato per nome `fornitorePerDistributore`) + CSV per il carrello. Avviso finché la numerazione 2026 è sotto il 204 di FIC (allinearla il giorno del passaggio).
   In FIC molti ordini a Mouser/DigiKey/Anthropic erano fatti DOPO la fattura ("RELATIVO A FATTURA …"): nel portale l'autofattura nasce dalla fattura, non serve.
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
   Dati mancanti cercati online (Adriano 1/11/2026; `engine/crm-completamento.ts`, `completaCrm` in `crm-servizio.ts`, POST `/impostazioni/crm/completa`, test in
   `tests/crm-completamento.test.ts`): file `crm_completamento.json.gz` (`tipo: 'completamento'`, preparato fuori dal repository leggendo il sito di ogni azienda:
   pagina iniziale, contatti, privacy; P.IVA controllate con il VIES) → Impostazioni → CRM → "Dati mancanti cercati online": riempie SOLO i campi vuoti (P.IVA, email,
   telefono, sito), P.IVA solo valida e non già di un'altra azienda, fonte nelle note ("Ricerca online del …"), dubbi solo nelle note ("Da verificare …") e nell'Excel.
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
   Controllo settimanale di Claude (Adriano 1/11/2026; migrazione 054, `rotte/api-claude.ts`, test in `tests/suggerimenti.test.ts`): stato "Da chiarire"
   (in cima, giallo) + colonna `risposta` (domanda/risposta per chi ha proposto; chi risponde scrive nelle note). Claude legge e aggiorna con
   GET/POST `/api/claude/suggerimenti` e la chiave creata in Suggerimenti → Collegamento con Claude (impostazioni 'claude_api'; nel progetto Claude
   è un "Segreto di rete" per casteltech-portale.onrender.com, arriva come Authorization: Bearer, oppure x-chiave-portale); può cambiare solo stato, risposta e aggiungere una riga datata alle note.
   ✅ Calendario dei ritardi (idea di Federico; `engine/calendario-ritardi.ts`, `rotte/calendario.ts`, test in `tests/calendario-ritardi.test.ts`):
   `/calendario/<chiave>/ritardi.ics` aggiunto "Da URL" in Google Calendar di info@ (niente delega Workspace), indirizzo in Impostazioni → Promemoria.
   Eventi: consegna scaduta, fine Gantt superata, doveva partire, avviso 2 gg lavorativi prima dell'inizio, sovraccarico (ore > ore al giorno),
   commesse aperte oltre la consegna o oltre le ore uomo del preventivo. Copia in memoria, ricalcolata solo lun–ven 7–20 e al massimo ogni ora (Neon).
   Suggerimenti realizzati l'1/11/2026: data di consegna nel preventivo (`engine/consegna-preventivo.ts`, GET `/preventivi/:id/consegna`, test in
   `tests/consegna-preventivo.test.ts`: ultimo arrivo tra componenti e PCB + 3 gg lavorativi, ore ciclo del 1° lotto nelle ore libere del Gantt, + 5 gg lavorativi,
   proposta = venerdì della settimana ISO); BOM in Quotazioni ripulita (`pulisciRigheBom`: intestazioni ripetute e righe di solo testo; `rigaPcb`: PCB escluso,
   non cercato dai distributori; "togli" = POST `/quotazioni/bom/:id/riga/:n/elimina`); pasta saldante stimata dai Gerber (`stimaPastaDaGerber`, area aperture ×
   0,12 mm × 4,2 g/cm³) mostrata accanto alla regola del preventivo, che resta 1,5 g / 450 componenti finché Adriano non decide.
   ⬜ Avviso Telegram: "Da chiarire" (responsabili di fase, bot Telegram, quando avvisare).
4g. ✅ Guida (`rotte/guida.ts`, `engine/guida.ts`, `server/guida-ia.ts`, `public/guida.js`; Adriano 28/10/2026): voce Guida nel menu (anche produzione),
   macro aree con argomenti (cosa si fa, come, cosa non si può fare, pulsanti alle pagine), ricerca intelligente mentre si scrive
   (radici italiane, sinonimi, "ordine+documenti" = "ordine documenti"), "Chiedi alla guida" con l'IA che risponde solo dalla guida
   (senza chiave: rimanda agli argomenti trovati). Nessuna query al database.
4h. ✅ Consumi e limiti dei servizi (Adriano 29/10/2026; Impostazioni → Servizi, `rotte/servizi.ts`, `engine/servizi.ts`, `server/stato-servizi.ts`,
   `server/consumi-servizi.ts`, migrazione 045): tutte le chiamate all'IA passano da `server/ia.ts` (`chiediTestoIa`: token e costo stimato dal listino
   `PREZZI_IA`, limiti al minuto dalle intestazioni, errori in parole chiare con `erroreIa`: credito finito, tetto di spesa, chiave, troppe richieste).
   Contati anche distributori (richieste al giorno), Drive, Gmail; memoria del processo (picco, riavvii con la stessa versione = inattesi), spazio Neon.
   Contatori in memoria, salvati tutti insieme 15 s dopo l'ultima chiamata (`consumi_servizi`), errori in `eventi_servizi` (stesso errore al massimo ogni 6 ore).
   Credito Anthropic prepagato scritto dall'ufficio (l'API non lo dà); avviso giallo/rosso in cima alle pagine dell'ufficio dall'80% (`avvisoServizi`, niente query).
   Facoltativi su Render: ANTHROPIC_ADMIN_KEY (costo ufficiale del mese), NEON_API_KEY + NEON_PROJECT_ID (ore di calcolo), RENDER_MEMORIA_MB, NEON_SPAZIO_MB.
4i. ✅ Cruscotto generale = pagina iniziale dell'ufficio (Adriano 31/10/2026; `/cruscotto`, `rotte/cruscotto-generale.ts`, letture in `cruscotto-generale-servizio.ts`,
   conti in `engine/cruscotto-generale.ts`, test in `tests/cruscotto-generale.test.ts`; `paginaIniziale('ufficio')`): "Da fare oggi" (pulsanti rosso/giallo/verde con il numero,
   solo voci non a zero, una sola cosa = link diretto: `cosaDaFare`), sei numeri chiave, un riquadro per area (Commerciale, Ordini clienti, Produzione con il carico
   di 4 settimane dal Gantt = `pianificaProduzione` + `caricoSettimane`, Acquisti, Amministrazione con lo SdI, Promemoria e sistema: scadenze del 15/16, servizi, backup).
   Letture una volta sola all'apertura, niente aggiornamenti automatici (Neon). Contabilità resta su /amministrazione, reparto su /r. Una voce nuova = una riga in `cosaDaFare`.
4j. ✅ Qualità (Adriano 31/10/2026; menu Qualità, `rotte/qualita.ts`, regole in `engine/qualita.ts`, migrazione 055 `qualita_voci` = sezione + dati jsonb,
   test in `tests/qualita.test.ts`): le sezioni principali della cartella Drive 5_QUALITA, ognuna un registro descritto in `SEZIONI_QUALITA` (campo nuovo o
   sezione nuova = una voce lì, niente migrazione): documenti del sistema (EPR-SYS/EPR-OPE/EWI-OPE, manuale, moduli QF), non conformità e reclami (numero
   NC-anno-progressivo, codice difetto, trattamento, causa, azione entro il, Chiudi), codifica dei difetti (POST/CODIFICA DIFETTOLOGIA), strumenti e tarature
   (ultima + ogni quanti mesi), piano delle manutenzioni e verifiche ESD (mesi previsti, scadenza = mese previsto dopo l'ultima volta; spunte → "Fatto oggi"),
   formazione, audit, rischi e opportunità (valore × frequenza). Cruscotto `/qualita`: scadute, entro un mese, NC aperte, difetti più frequenti.
   Dati del Drive (vecchi, per la struttura): file `qualita_esempio.json.gz` in Project Files → qualita, "Carica i dati dal Drive" (ricaricabile, `chiaveImport`).
   ⬜ Sicurezza e ambiente; schede del personale e mansionario restano alla sezione Dipendenti.
4k. ✅ Dipendenti (Adriano 1/11/2026; menu Dipendenti, `rotte/dipendenti.ts`, `dipendenti-servizio.ts`, `lettura-paghe-ia.ts`, `engine/dipendenti.ts`, migrazione 056,
   test in `tests/dipendenti.test.ts`): Costo del personale per tutto l'ufficio (solo il TOTALE del mese: lordo + INPS azienda + TFR + enti; anni × mesi, confronto con
   gli stessi mesi dell'anno prima, peso sul fatturato, F24 con scadenza). Area riservata "Buste paga": solo l'utente ADMIN_EMAIL e chi ha `utenti.paghe` (spunta data da lui),
   più la password delle buste paga (impostazioni 'paghe_password', bcrypt), aperta 15 minuti: costo per qualifica, netto, PDF dello studio, storico. Documenti dello studio
   paghe (U.P.A.) riconosciuti dal NOME (`tipoDocumentoPaghe`: ced/cedolini, riepilogo, nc/nota contabile, f24) nella cartella Drive "Da acquisire" → `paghe_documenti`,
   mai in Ordini → Da acquisire; nota contabile e F24 letti dall'IA, cedolini e riepiloghi MAI all'IA. Storico 2019–2026 dalle note contabili dell'archivio
   (2019–2021 "bilancino" del vecchio studio, conti 5xxxx): file costi_personale.json.gz fuori dal repository (Project Files → dipendenti). Nota spese come il
   "Modulo rimborso km" Excel (km andata × 2 × tariffa + altre spese; tariffa copiata nella nota; import del modulo con la tariffa del mese da C4), destinazioni con i km,
   persone e auto, pagamenti e "da pagare" per anno, stampa da firmare. Dati delle persone SOLO nel database.
   Buste paga come dati (Adriano 1/11/2026; `engine/cedolini.ts`, `server/testo-pdf.ts` con pdfjs-dist, migrazione 060 `cedolini`, test in `tests/cedolini.test.ts`):
   un cedolino per persona, mese e mensilità (chiave codice fiscale|anno-mese|mensilità) letto dal TESTO del PDF, MAI dall'IA: modello U.P.A. (dal 2022) e
   Zucchetti (2019–2021, qualifiche tradotte con `qualificaZucchetti`); voci divise competenze/ritenute dalla colonna, cedolino su due pagine unito,
   avvisi se voci ≠ totali. Cedolini nuovi dalla cartella "Da acquisire" letti da soli (`leggiDocumentoPaghe`); storico 2019-04 → 2026-09 (736 cedolini)
   nel file cedolini.json.gz (Project Files → dipendenti, preparato con `tools/cedolini-da-pdf.ts` + pdftotext), stesso pulsante "Storico dall'archivio".
   Area riservata: tabella persone × mesi (netto), pagina persona (`/riservata/persona?p=`), pagina cedolino con le voci.
4l. ✅ Revisione e collaudo di tutto il portale (notte 31/10–1/11/2026; PR della revisione): portale provato in locale con i dati veri (storico FIC, ordini, CRM),
   3.000 pagine e tutti i flussi (preventivo → commessa → rientro → reparto, fattura → XML/PDF, DDT, conferma, acconto, ordine a fornitore). Regole nuove:
   DDT con causale reso non lavorato / garanzia / conto visione / conto lavorazione / campioni / prestito NON contano tra i "DDT da fatturare"
   (`causaleDaFatturare` in `engine/ddt.ts`, test in `tests/ddt.test.ts`; nella bozza stanno sotto "Altri DDT senza fattura"); in fattura entrano solo DDT emessi;
   all'emissione l'IVA "predefinita" viene scritta sulle righe (fotografia); nota di credito/debito solo su fatture non scartate; fatture scartate fuori da
   fatturato e da incassare; riferimento ordine oltre 20 caratteri = errore; lettera d'intento scritta a mano con l'anno come l'import (dicembre → anno dopo) e valida
   solo se protocollata entro la data della fattura. Rientro dell'ufficio: le righe del telefono si aggiornano (stesso id) e quelle ancora aperte restano;
   telefono: "Aperta per sbaglio: annulla l'apertura", una sola apertura per fase (migrazione 057). Prodotto già usato: il cliente non si cambia.
   Punti aperti decisi da Adriano (1/11/2026 sera; test in `tests/ddt.test.ts`, `azioni-documenti`, `cruscotto-amministrazione`, `scheda-cliente`, `ordini`, `acquisizioni`):
   DDT "da fatturare" = `SQL_DDT_DA_FATTURARE`/`ddtDaFatturareRegola` (fuori anche "riparato" e "completamento fornitura", DDT dello storico FIC a valore zero e quelli
   segnati "Già fatturato" = `documenti.fatturato_altrove`, migrazione 061, tasto nella pagina del DDT e azione dell'elenco); nota di credito aperta toglie dal "da incassare"
   (`SQL_IMPORTO_DA_INCASSARE`/`SQL_DATA_DA_INCASSARE`, nella fascia della fattura) e si chiude da sola con "Compensato con fattura" + "Compensazione con fattura n. X" quando la
   fattura è tutta incassata (`compensaNoteCredito`); Gantt: barra che finisce dopo la consegna = in ritardo (`oltreConsegna`); DDT letti da PDF oltre la riga d'ordine
   divisi tra le righe dello stesso codice in consegna entro 60 gg, altrimenti tutto sulla prima (`dividiDdt`). PIN del reparto restano a 4 cifre.
   Ordine con conferma emessa non si elimina. Pagina Prodotti leggera (una sola tendina clienti, `clienti-al-clic`). Niente doppio invio dei moduli (`conferma.js`).
   Limite 20 domande/ora alla guida IA. Pulizia sessioni dopo il login (non con un timer). Id non numerici negli indirizzi = pagina non trovata (non errore).
   ✅ Scorciatoie e elenchi (proposta della revisione, gruppo A, Adriano 1/11/2026 "applica i suggerimenti"; test in `tests/scorciatoie-elenchi.test.ts`):
   "Riprendi da dove eri" in cima al cruscotto (`engine/riprendi.ts`, `cosePerRiprendere` in `cruscotto-generale-servizio.ts`: ultime 8 cose aperte in 14 giorni,
   prima quelle dell'utente); tasti rapidi `public/tasti.js` in ogni pagina (Alt+N = pulsante "+ Nuovo…" della pagina, Esc, "?" = finestra dei tasti; / e Ctrl+K
   della ricerca, Ctrl+S delle bozze); elenchi lunghi a pagine da 100 (`engine/paginazione.ts` + `views/paginazione.ts`: `paginata(righe, req.query)` → righe, barra;
   preventivi, commesse, ordini, documenti emessi e ricevuti); pulsante Excel con lo stesso filtro su preventivi, commesse, ordini, clienti, prodotti, fornitori,
   CRM, fatture fornitori (`server/excel.ts`: `excelSemplice` + `inviaExcel`; un elenco nuovo aggiunge la sua rotta `/elenco.xlsx` con le stesse righe filtrate).
   ✅ Gruppo B delle proposte (Adriano 1/11/2026): ordine dal preventivo (`engine/ordine-da-preventivo.ts`, `ordine-da-preventivo-servizio.ts`, GET/POST
   `/preventivi/:id/ordine`, migrazione 058 `ordini.preventivo_id` + origine 'preventivo', test `tests/ordine-da-preventivo.test.ts`): "Crea ordine" nel preventivo
   salvato → riga schede al prezzo del preventivo + una tantum come servizi se primo lotto, consegna proposta da `stimaConsegna`, numero serie 9001, preventivo →
   accettato. "Cosa manca" nella commessa (`engine/cosa-manca.ts`, `mancantiCommessa`/`ordinaMancanti` in `ordini-fornitore-servizio.ts`, `/ordini/fornitori/commessa/:id`,
   test `tests/cosa-manca.test.ts`): BOM del preventivo per la quantità quotata più vicina contro gli ordini a fornitore con `bom_id`/`commessa_id` (chiave = codice
   distributore, poi P/N), bozze dei mancanti per distributore. Solleciti incassi (`engine/solleciti.ts`, `solleciti-servizio.ts`, `/amministrazione/solleciti[/:cliente]`,
   test `tests/solleciti.test.ts`): rate scadute per cliente, livello primo/secondo/ultimo (30/60 gg), email con fatture e IBAN, "Invia con Gmail" (delega) o mailto/copia +
   "Segna come mandato"; registrato in `crm_attivita` tipo email; "incassi scaduti" del cruscotto e la scheda cliente portano qui.
   ✅ Gruppo C delle proposte (Adriano 1/11/2026; test `tests/interfaccia-moduli.test.ts`): errori accanto al campo (`engine/errori-campo.ts`: `conCampo(url, campo, modulo?)`
   aggiunge `&campo=&modulo=` ai redirect con `?msg=`; `public/errori-campo.js` in ogni pagina salva i valori del modulo all'invio e, tornando con `campo=`, li rimette,
   scrive il messaggio sotto il campo e ci porta il cursore; password mai conservate; usato in Utenti, Fasi/Parametri/Voci, Clienti, Prodotti, attività CRM: un modulo
   nuovo che rifiuta un valore usa `conCampo`). Preventivo Semplice/Completo (`engine/preventivo-semplice.ts` `CAMPI_SEMPLICE` = quantità e costi che cambiano da una
   scheda all'altra, classe `campo-semplice`, pulsanti accanto a Salva, scelta in localStorage `preventivo-vista`, all'inizio Completo; i campi nascosti contano comunque).
   Numeri e date (`public/formati.js`): nelle caselle `inputmode="decimal"` il punto diventa virgola uscendo (solo "12.5", mai "1.000"); browser non in italiano =
   nota sotto la prima casella data; niente `type="number"` nel portale.
   ✅ Gruppo D delle proposte (Adriano 1/11/2026; `engine/reparto-oggi.ts`, test `tests/reparto-oggi.test.ts`): sul telefono `/r` "Le tue fasi di oggi" (righe `rilevazioni`
   dell'operatore di oggi, aperte prima; totale ore; "Riapri" = POST apri della stessa fase all'ora attuale) e "Le tue commesse degli ultimi giorni" (7 gg, senza QR);
   chiusa una fase il redirect porta `?dopo=<fase>` e la pagina della commessa propone la "Prossima fase" (`faseSuccessiva`: prima prevista dopo quella chiusa non
   ancora fatta né aperta da nessuno, altrimenti la prima saltata) con "Apri adesso". Avviso Telegram resta "Da chiarire" nei Suggerimenti.
   ✅ Gruppo E delle proposte (Adriano 1/11/2026; test `tests/controlli.test.ts`): avviso margine nella bozza di fattura (`engine/avviso-margine.ts`, `riferimentiPreventivi`
   in `controlli-servizio.ts`: ultimo preventivo del codice per quel cliente; prezzo netto sotto il prezzo a scheda di oltre l'1 % = riga gialla "sotto il preventivo",
   margine del preventivo < 10 % = "margine basso"; solo avviso, si emette comunque). Pagina Amministrazione → Controlli settimanali (`/amministrazione/controlli`,
   `engine/controlli.ts` `elencoControlli`: commesse oltre consegna, DDT da fatturare da 20+ gg, fasi aperte da 2+ gg, ordini senza data, prodotti in ordine senza prezzo,
   clienti fatturati senza SDI/PEC, fatture fornitori senza scadenza, preventivi bozza fermi 30+ gg; letto solo all'apertura; link nel riquadro Amministrazione del cruscotto).
   Un controllo nuovo = una voce in `elencoControlli` + la sua lettura in `datiControlli`. Backup su Drive: fatto con il PC dell'ufficio (vedi Database su Neon).
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
   Fatture fornitori (`/amministrazione/ricevuti`): filtro con etichette (anno, cerca, "Solo da pagare") in un riquadro, riquadro "Scadute da pagare"
   tra filtro ed elenco (Adriano 31/10/2026, `fattureScadute`: rate scadute non pagate di tutti gli anni, note di credito escluse), elenco, dettaglio; ogni rata (anche delle fatture emesse) si segna incassata/pagata con data, modo di pagamento (`MODI_PAGAMENTO`, migrazione 053: bonifico, Ri.Ba., bancomat, carta di credito, PayPal, compensato con fattura, stornato) e conto facoltativo (es. Bper).
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
   🟡 Invio allo SdI con Invoicetronic (Adriano 28/10/2026: passaggio dal portale lunedì 2/11; `server/invoicetronic.ts`, `engine/sdi.ts`, migrazione 040):
   chiave `INVOICETRONIC_API_KEY` (ik_test_ = prova/sandbox, ik_live_ = reale; `INVOICETRONIC_URL` solo per le prove in locale). Documento emesso →
   "Invia allo SdI" (POST /send?validate=true, nome file dato da Invoicetronic, Idempotency-Key); con la chiave di prova "Prova l'invio" anche dalle bozze
   (numero 0, non tocca lo stato). Ogni invio in `sdi_invii`; esiti dal webhook `/sdi/webhook` (prima di sessione e json, firma HMAC, doppioni in
   `sdi_eventi`, segreto in impostazioni 'invoicetronic' per ambiente; si collega da Impostazioni → Amministrazione → Invio allo SdI) o con "Aggiorna esito"
   (/update, gratis); niente controlli periodici. Stati: Inviato → inviato, Consegnato → consegnato, ImpossibilitaDiRecapito → non_consegnato (valida, avvisare
   il cliente), Scartato → scartato: "Correggi" la riporta a bozza con stesso numero e data (data bloccata, niente Elimina), si riemette e si rimanda.
   ✅ Fatture dei fornitori dallo SdI (`engine/fattura-ricevuta.ts`: XML o .p7m firmato, `registraRicevuta` in `server/invoicetronic.ts`): webhook receive.add
   o "Scarica dallo SdI" in Fatture fornitori (GET /receive?unread=true, gratis) → `documenti_ricevuti` origine 'sdi' con scadenze; fornitore per P.IVA
   (nuovo = aggiunto con nota DA VERIFICARE); doppioni con lo storico FIC (numero+data+fornitore) e copie delle nostre autofatture ignorati. Chiave di prova: solo riepilogo.
   ✅ DDT emessi dal portale (Adriano 28/10/2026; `engine/ddt.ts`, `documenti-servizio.ts`, stampa `views/stampa-documento.ts` → `/amministrazione/documenti/:id/stampa`):
   "Crea DDT" nella pagina dell'ordine (schede ancora da spedire, `riga_ordine_id` collegata: l'evasione la conta) o "+ Nuovo DDT"; trasporto in `dati_trasporto`
   (causale, a_cura, trasportatore, porto, colli, peso, aspetto, destinazione, inizio) proposto dall'ultimo DDT del cliente; prezzo non stampato (serve alla fattura).
   Emetti = numero in transazione (`controlliDdt`); "Annulla DDT" se la merce non parte (numero usato, stato annullato; non se è in una fattura); "Fattura questo DDT".
   ✅ PDF di cortesia di fattura e nota di credito (Adriano 31/10/2026; `stampaFattura` in `views/stampa-documento.ts`, stessa pagina `/documenti/:id/stampa`
   dei DDT, salvato in PDF dal browser): dati dell'azienda, cliente (fotografia dell'emissione), righe con IVA, riepilogo per aliquota/natura, bollo,
   lettera d'intento, pagamento con scadenze e IBAN; piede "copia di cortesia, il documento fiscale è l'XML". In bozza scritta BOZZA. Autofatture escluse.
   ✅ Registri IVA e controllo VIES (Adriano 31/10/2026; `engine/registri-iva.ts`, `registri-iva-servizio.ts`, `rotte/registri-iva.ts`, `engine/vies.ts`,
   `server/vies.ts`, migrazione 048): Amministrazione → Registri IVA per mese/trimestre/anno: vendite (fatture + NC in negativo, anche storico FIC),
   acquisti (protocollo calcolato in ordine di data nell'anno), autofatture (IVA a debito e a credito); fuori bozze, annullati, scartati. Riepilogo IVA del
   documento dal file XML (solo i blocchi DatiRiepilogo estratti da PostgreSQL: gli XML dei fornitori hanno allegati), altrimenti dalle righe, se non torna
   vincono i totali (segnalato). Split payment (EsigibilitaIVA S dall'XML, o `clienti.split_payment` senza XML) nel registro ma non a debito. Liquidazione MENSILE (Adriano 31/10/2026; `liquidazioniMensili`: credito riportato, sotto 25,82 € rinviata, versamento il 16 del mese dopo, luglio 20/8, codici 6001–6012; credito dell'anno prima in impostazioni `liquidazione_iva`; la pagina si apre su `meseDaLiquidare`); spese non elettroniche senza IVA fuori dal registro; "Da controllare" (numeri mancanti, scartate, bozze nel periodo). Excel e zip per il commercialista
   (Excel + XML, scritto a pezzi da 20). Controllo VIES (REST della Commissione, con la nostra P.IVA → numero di consultazione, `controlli_vies`; valido 90 gg;
   errori del servizio = "non verificabile", non "non valida"): pagina Amministrazione → Controllo VIES e riquadro nella bozza di fattura a cliente UE.
   ✅ Profilo Contabilità in sola lettura (Adriano 31/10/2026: il commercialista e Sonia di HTS; `engine/ruoli.ts`, migrazione 049, test in `tests/ruoli.test.ts`):
   ruolo 'contabilita' = solo GET sotto /amministrazione (`contabilitaPuo`, middleware `amministrazioneOContabilita` in `index.ts`) + Guida; menu con il solo
   pagine dell'Amministrazione in fila nella barra, senza tendine (`MENU_CONTABILITA` in `views/layout.ts`, Adriano 1/11/2026; il menu dell'ufficio non cambia),
   dopo l'accesso dritto al cruscotto `/amministrazione` (`paginaDopoAccesso`), `body.sola-lettura` nasconde i moduli POST. Utenti creati dall'ufficio in Impostazioni → Utenti.
   ✅ Analisi (Adriano 31/10/2026, "trend e analisi critica/di aiuto"; `/amministrazione/analisi`, `engine/analisi.ts`, `rotte/analisi.ts`, test `tests/analisi.test.ts`):
   dal 1/1 a oggi contro lo stesso periodo dell'anno prima (anni passati: anno intero), fatture emesse/ricevute anche storico FIC: fatturato, acquisti, resta dopo
   gli acquisti, peso dei primi clienti; commenti `commentiAnalisi` (critico/attenzione/bene + "Cosa fare": calo e da chi, previsione dai mesi chiusi, acquisti che
   pesano di più, dipendenza, clienti fermi/nuovi, ritardi d'incasso, scaduto > 60 gg, prezzi sotto preventivo, margine < 10 %); tabelle mesi, clienti (margine stimato
   = fatturato × margine dell'ultimo preventivo del codice, giorni di incasso), prodotti, acquisti per categoria FIC e fornitori. Non è il bilancio.
   ✅ Spese, bollo, lettere d'intento (Adriano 31/10/2026, fase 1; `engine/fiscale.ts`, `rotte/fiscale.ts`, test `tests/fiscale.test.ts`): spese senza fattura elettronica
   (`/amministrazione/spese`: scontrini, affitto, polizze…, in `documenti_ricevuti` con elettronica=false, origine 'manuale', categoria = tipo; fuori dal registro IVA se
   senza IVA; si eliminano solo le manuali); bollo virtuale per trimestre (`/amministrazione/bollo`, `bolloPerTrimestre`: codici 2521–2524, 31/5, 30/9, 30/11, fine
   febbraio; 1° trimestre sotto 5.000 € con il 2°, 1°+2° sotto 5.000 € al 30/11); plafond delle lettere d'intento (Anagrafiche → Clienti → Dati fiscali → Lettere
   d'intento, `/amministrazione/lettere-intento`, avviso nella bozza `riquadroPlafond`: fatture N3.5 dell'anno dalla data della prima lettera, giallo dall'80 %).
   ✅ Acquisti per fornitore e mese (`/amministrazione/ricevuti/mesi`, `acquistiPerFornitore` in `engine/cruscotto-amministrazione.ts`): tabella fornitori × mesi
   dalle fatture ricevute, clic = fatture del mese con descrizione, righe dell'autofattura e ordine a fornitore collegato (al posto degli ordini "di traccia" di FIC).
   ✅ Bozze che si salvano da sole (proposta della revisione, Adriano 1/11/2026; `server/autosalva.ts`, `public/autosalva.js`, test in `tests/autosalva.test.ts`):
   il modulo `#modulo-documento` con `data-autosalva="1"` (fattura/NC/DDT in bozza, conferma d'ordine non annullata, ordine a fornitore) si salva 2 s dopo l'ultima
   modifica con lo stesso POST del pulsante Salva + intestazione `X-Autosalva: 1` → JSON (`rispondiSalvataggio`); stato accanto a Salva, Ctrl+S = Salva, avviso
   del browser se si chiude con modifiche non salvate. Un modulo nuovo si aggancia con lo stesso attributo e `rispondiSalvataggio` nel suo POST.
   ✅ Fatture differite (proposta della revisione, Adriano 1/11/2026; `engine/fatture-differite.ts`, `ddtDaFatturareTutti` + `fatturaTuttiIDdt` in
   `documenti-servizio.ts`, `/amministrazione/differite`, test in `tests/fatture-differite.test.ts`): DDT da fatturare per cliente con il termine (15 del mese
   dopo il DDT più vecchio), "Fattura tutti i DDT" = una bozza per cliente (TD24 da sola all'emissione), "Fattura tutti i clienti in scadenza"; nel cruscotto
   generale voce "Da fare oggi" gialla dal 1° (DDT del mese prima) e rossa dal 16 (`differiteScadute` / `differiteInScadenza` in `cosaDaFare`); voce nel menu Amministrazione.
   ✅ Altri tipi di fattura e PA (Adriano 31/10/2026; `engine/tipi-fattura.ts`, migrazione 050): TD24 differita scelta da sola se la fattura cita DDT con
   data precedente (termine il 15 del mese dopo), TD02 acconto ("Fattura d'acconto" nella pagina dell'ordine; sul saldo "Scala gli acconti" = riga negativa per aliquota,
   `documenti_righe.acconto_id`, DatiFattureCollegate), TD26 beni ammortizzabili (menu "Tipo di fattura"), TD05 nota di debito ("Crea nota di debito" dalla fattura
   emessa, numerata con le fatture). Pubblica amministrazione (es. INFN): Anagrafiche → Clienti → "Dati fiscali" (PA, codice ufficio 6 caratteri, split payment);
   XML FPA12, numero/data ordine + CIG obbligatori (CUP se c'è) in DatiOrdineAcquisto; split payment = EsigibilitaIVA S, scadenza e PDF sul totale meno IVA.
   Fatture fornitori con ritenuta d'acconto / cassa (`datiFattureRicevute`): ritenuta, cassa, netto da pagare; F24 entro il 16 del mese dopo il pagamento.
   Storico FIC completo dal 2019 (file storico_fic_completo.json.gz, stesso caricamento): DDT dello storico prima del 2025 non proposti "da fatturare"
   (`INIZIO_DDT_DA_FATTURARE`). Archivio FIC (PDF emessi, XML/PDF fornitori, elenchi) in Project Files → archivio-fic, fuori dal repository.
   (conferme d'ordine: vedi 4c)
   ordini a fornitore, Gmail, banca BPER, accesso del commercialista, note spese (dopo il 10/11).
