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
  CRM, Quotazioni componenti, Documenti dei clienti, Preventivi, Ordini clienti, Conferme d'ordine = elenco `/ordini/conferme`, poi Ordini da e-mail e PDF = Da acquisire), Acquisti (ordini a fornitore, DDT ricevuti, Fatture fornitori = `/amministrazione/ricevuti` spostata qui da Amministrazione il 7/11/2026 con `tastiAcquisti` e gruppo acceso da `attiva`, acquisti per mese, miglior prezzo; poi magazzino), Produzione (commesse, Gantt, Codifica componenti; poi macchine e consumi),
  Amministrazione (Adriano 2/11/2026: DDT, Fatture, Autofatture, Note di credito direttamente nel menu e nei tasti della sezione, niente più "Documenti emessi"; indirizzo `/amministrazione/documenti?tipo=`), Qualità (dal 1/11/2026); ogni gruppo ha la tendina con le pagine. Impostazioni, Suggerimenti e Guida piccoli a destra. Da aggiungere più avanti:
  Sicurezza e ambiente. Gli indirizzi delle pagine non cambiano; la sezione della pagina (`attiva`) accende il gruppo con `gruppoAttivo`.
  Richieste del 7/11/2026 (test in `tests/menu-pagamenti-cruscotto.test.ts`): modi di pagamento (con RID) e banche/strumenti modificabili in Impostazioni → Amministrazione →
  Modi di pagamento e banche (impostazioni 'modi_pagamento', `engine/modi-pagamento.ts`, `modi-pagamento-servizio.ts`; una voce per riga; "Compensato con fattura" e "Stornato"
  restano sempre; banche non salvate = quelle già usate nelle rate; `modoPagamento(valore, elenco)`), RID = MP09 nelle condizioni di pagamento; controlli settimanali
  nel cruscotto sotto "Da fare oggi" (`sezioneControlli` in `rotte/cruscotto-generale.ts`, urgenti aperti, prime 8 righe); `/` senza accesso va sempre al login
  (poi cruscotto), il reparto ricordato trova "continua come …" sotto il login.
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
  Codici prodotti per anno (Adriano 5/11/2026, "quanti codici diversi ho fatto di Selea nel 2026?"; `codiciPerAnno` in `engine/scheda-cliente.ts`, tabella in fondo alla scheda):
  una colonna per anno (ultimi 3, `?anni=tutti` per tutti) con i pezzi e in testa quanti codici diversi; contano DDT con causale di vendita/reso lavorato (`causaleDaFatturare`)
  e fatture senza DDT; fuori servizi (`eServizio` sulla prima riga della descrizione, salvo riga collegata a un prodotto), resi non lavorati, garanzie.
- Sezione Anagrafiche (menu in alto, `rotte/anagrafiche.ts`; Adriano 27/10/2026): TUTTE le anagrafiche stanno lì, non in Impostazioni.
  Tasti in alto Clienti / Fornitori / Prodotti / Componenti (archivio della codifica), sotto l'elenco con la ricerca veloce
  (`engine/ricerca.ts` = `public/ricerca.js`: filtra mentre si scrive, più parole, accenti e trattini dei codici non contano).
  Un'anagrafica nuova si aggiunge come altro tasto qui. I vecchi indirizzi /impostazioni/anagrafiche e /impostazioni/fornitori portano qui.
  Componenti (Adriano 2/11/2026; `engine/componenti-archivio.ts`, test in `tests/ddt-email.test.ts`): senza ricerca l'elenco di TUTTO l'archivio a pagine da 100 con filtro
  per famiglia; "+ Aggiungi componente" (anche precompilato dalla ricerca vuota) = P/N già presente → lo mostra, altrimenti codifica singola come Quotazioni → Codifica un P/N,
  poi "Salva nell'archivio" riporta qui. Non è un magazzino (giacenze non esistono nel portale).
  Codifica componenti senza prezzi (Adriano 4/11/2026; menu Produzione → Codifica componenti = `/produzione/codifica-componenti`, `rotteCodificaComponenti` in
  `rotte/componenti.ts`, migrazione 069 `bom_analisi.solo_codifica`, test in `tests/codifica-senza-prezzi.test.ts`): BOM codificata come in Quotazioni (archivio, P/N,
  colonne, IA) ma SENZA distributori, quantità, acquisti, reperibilità, alternative; Excel con il solo foglio "BOM codificata" (si apre anche in Google Sheets);
  non collegabile ai preventivi; "Cerca anche i prezzi" (POST `/quotazioni/bom/:id/prezzi`) la passa a Quotazioni. Excel con più fogli: si legge il foglio "BOM"
  (`foglioBom` in `engine/codifica/bom.ts`, vale anche per Quotazioni), altrimenti il primo con dati.
  Componenti clienti (Adriano 2/11/2026; migrazione 063 `componenti_clienti`, `engine/componenti-clienti.ts`, `componenti-clienti-servizio.ts`, test in `tests/componenti-clienti.test.ts`):
  materiale in conto lavoro con i codici del cliente (Selea, Idea automazione), ogni codice col suo cliente, MAIUSCOLO; caricamento da Excel/CSV (anteprima → conferma,
  aggiunge e aggiorna, non toglie; CSV in Windows-1252 letto). DDT: ogni riga ha "Da" = prodotto / componente nostro (codice = gestionale, descrizione = "P/N (codice produzione)",
  ricerca su tutti e tre i codici) / componente cliente / libero (`documenti_righe.fonte`, `componente_id`, `componente_cliente_id`; `risolviFontiDdt` al salvataggio).
  "Libero" vale SOLO nei DDT. Ordini a fornitore: la ricerca dei P/N trova anche gestionale e produzione a metà codice (`cercaComponentiPerOrdine`).
  Materiali di consumo (Adriano 3/11/2026; migrazione 065 `materiali_consumo`, `engine/materiali-consumo.ts`, `materiali-consumo-servizio.ts`, `rotte/materiali-consumo.ts`,
  `public/articoli-ordine.js`, test in `tests/materiali-consumo.test.ts`): lamine, pasta saldante, barre/filo di stagno, Kapton, punte Weller (UN solo codice, modello
  nella descrizione della riga), flussanti, pulizia, coating, imballaggio, ESD. Codici SOLO nostri `MC-<categoria>-<nnn>` dati dal portale (`prossimoCodice`), codici
  del fornitore nella descrizione; elenco iniziale dagli acquisti 2022–26 delle fatture fornitori FIC, ultimi prezzi dal file `materiali_prezzi.json.gz` (Project Files →
  materiali-consumo; 'manuale' non si tocca). Ordine a fornitore: nel Codice una parola ("lamina") → menu materiali + componenti (`/anagrafiche/materiali/cerca`),
  descrizione sempre modificabile nella riga, in fondo "+ Nuovo materiale" e "Riga libera"; righe con codice fuori anagrafica → riquadro "Righe non in anagrafica"
  con "Aggiungi ai materiali" (la riga prende il codice MC-…). Si elimina solo se in nessun ordine, altrimenti spunta "Attivo".
  Servizi una tantum (Adriano 3/11/2026; migrazione 066 `servizi_una_tantum`, `engine/servizi-una-tantum.ts`, `servizi-una-tantum-servizio.ts`, `rotte/servizi-una-tantum.ts`,
  test in `tests/servizi-una-tantum.test.ts`): lamina, documentazione, programmazione attrezzature, attrezzaggio PCB = codici Casteltech UT-… validi per TUTTI i clienti
  (eccezione voluta alla regola codice-cliente, per questo non sono in `prodotti`). Gruppo "Servizi una tantum" in fondo al menu Codice (`opzioniServizi`: documenti con
  `cellaCodice(x, i, prodotti, servizi)`, ordine con valore `ut:CODICE` → riga tipo servizio), descrizione modificabile, prezzo proposto; Ordini da e-mail e PDF propongono
  il servizio dalla descrizione (`servizioProposto`). Venduto per anno nella pagina: codice UT o, per le fatture di prima/FIC, la prima riga della descrizione che cita UN servizio.
- Documentazione dei prodotti (Adriano 6/11/2026, "non pesare sul portale, ma solo su Google Drive"; migrazione 081 `prodotti_documenti`, regole in
  `engine/documenti-prodotto.ts`, letture in `documenti-prodotto-servizio.ts`, pagina `rotte/documenti-prodotto.ts` = tasto "Doc" in Anagrafiche → Prodotti →
  `/anagrafiche/prodotti/:id/documentazione`, test in `tests/documenti-prodotto.test.ts`): per ogni prodotto le REVISIONI dei documenti del cliente come RIASSUNTO
  (`riassuntoDaAnalisi`: componenti ref/P/N/valore/case/lato, conteggi, misure, strati Gerber, nomi dei file e cartella del Drive; ~2–20 KB), MAI i file.
  Revisione dai file (`analisi.prodotto`) o dai nomi (`revisioneDaNomi`: "Rev.C", "V1.0.7", "r2"), altrimenti "0"; già presente = "C-2". Revisione nuova dalla pagina
  del prodotto: stesso caricamento dei Documenti dei clienti (`schede-cliente.js` con `data-prodotto`), poi POST `.../da-pacchetto/:pid` → `revisioneDaPacchetto`
  (i file del pacchetto si svuotano dal database salvo la spunta "Tieni anche i file"). Confronto con la revisione prima (`confrontaRevisioni`: aggiunti, tolti,
  cambiati, conteggi, strati; "stravolto" = meno della metà dei riferimenti in comune o misure diverse oltre il 20 % → niente confronto riga per riga).
  Acquisizione dal Drive fatta da Claude con `tools/documentazione-da-cartella.ts` (stesso motore, solo il riassunto) → POST `/api/claude/documentazione`
  (GET = prodotti venduti nell'anno con le revisioni; GET `/api/claude/spazio` = peso delle tabelle su Neon).
- Sede operativa dei clienti (Adriano 4/11/2026, caso ELEXES; migrazione 072 `clienti.sede_operativa_diversa` + `sede_op_*`, `engine/sede-operativa.ts`, test in
  `tests/sede-operativa.test.ts`): l'indirizzo dei dati fiscali è la sede legale (fattura, intestazione DDT); spunta "Sede operativa diversa dalla sede legale" in
  Anagrafiche → Clienti → Dati fiscali mostra i campi della seconda sede (presso, indirizzo, CAP, comune, provincia, nazione, note per la consegna; CSS `:has`).
  Nei DDT nuovi il luogo di destinazione proposto è la sede operativa (`destinazioneProposta`, prima dell'ultimo DDT), avviso se il DDT ne ha un'altra.
  Da FIC (campo "Indirizzo di spedizione"): file `sedi_operative_fic.json.gz` (Project Files → sedi-operative) in Impostazioni → Amministrazione → Sedi operative
  (`caricaSediOperative`: solo clienti in anagrafica, non tocca sedi già scritte nel portale né altri dati).
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

- Ruoli e riservatezza (Adriano 3/11/2026; `engine/ruoli.ts`, migrazione 068, test in `tests/ruoli.test.ts`): ruolo **amministratore** (lo usa Adriano con
  info@casteltech.net) = tutto quello che fa l'ufficio (`eUfficio(ruolo)`: usarlo al posto di `ruolo === 'ufficio'` in ogni controllo nuovo) + l'UNICO che sceglie
  o cambia i ruoli in Impostazioni → Utenti (`controlloUtente`/`controlloEliminaUtente`: l'ufficio aggiunge solo Produzione, non tocca gli amministratori, nessuno
  si cambia il ruolo, resta sempre un amministratore attivo). Primo amministratore all'avvio: l'utente di ADMIN_EMAIL se non ce n'è nessuno (`catalogo-db.ts`).
  Stipendi, buste paga e previsione di cassa (da cui si ricavano gli stipendi) SOLO a chi `vedePaghe`: amministratore, contabilità, ufficio con `utenti.paghe`;
  ruolo e permesso letti dal database. Analisi riservata (Adriano 6/11/2026, `vedeAnalisi`/`analisiPermessa`/`PERCORSO_ANALISI` in `engine/ruoli.ts`, guardia su
  `/analisi` in `rotte/amministrazione.ts`): tutta Amministrazione → Analisi SOLO ad amministratore ed esterno; ufficio e contabilità ricevono 403 e non vedono i
  link (menu filtrato con `linkPermesso` in `layout.ts`, `spegniLinkNonPermessi` ora anche per l'ufficio: i link "Analisi" spariscono); la Previsione di cassa resta a `vedePaghe`. La contabilità legge anche `/dipendenti/riservata` (senza password dall'8/11/2026: la password vale solo per ufficio e produzione, `chiedePasswordRiservata`).
- Registro "chi ha cambiato cosa e quando" e accessi (Adriano, lista del 4/11/2026; migrazione 075 `registro_attivita`, regole in `engine/registro.ts`, scrittura in
  `registro-servizio.ts` = middleware `registraAttivita` in `index.ts`, pagina Impostazioni → Registro, test in `tests/registro.test.ts`): una riga per ogni POST riuscito
  (sezione dal percorso, azione = `azione` del modulo o ultima parola, righe = id nel percorso + `ids` spuntati; elimina/annulla/scarta = 'eliminazione'), accessi e
  accessi sbagliati; MAI i valori dei moduli; autosalva una volta ogni 10 minuti. Utente disattivato / ruolo o password cambiati = sessioni chiuse subito
  (`chiudereSessioni`, `chiudiSessioniUtente`; reparto: PIN cambiato/tolto o operatore tolto = `chiudiSessioniOperatori`); password con `problemaPassword` (10 caratteri, non facili); login: 8 tentativi per indirizzo+email, 20 per email.
  Una rotta nuova che modifica dati è già nel registro; un'eliminazione deve avere "elimina/annulla/scarta" nell'indirizzo o nel valore di `azione`.
- Condizioni di vendita e di acquisto (Adriano 7/11/2026, proposta in Project Files → condizioni-documenti; testi SOLO in `engine/condizioni.ts` con `REVISIONE_CONDIZIONI`,
  PDF in `server/pdf-condizioni.ts`, test in `tests/condizioni.test.ts`): preventivo = 14 clausole + riquadro della seconda firma (artt. 1341-1342: `VESSATORIE_FORNITURA`
  elencate una per una); conferma d'ordine = `notaConfermaOrdine` sopra le firme + pagina condizioni in coda; DDT = `noteDdt(causale)`; fattura (non NC) = `notaFattura`
  nel PDF/stampa e nella Causale XML (`pezziCausale`); ordine a fornitore = `PAGINA_ACQUISTO`. Garanzia 12 mesi, IPC-A-610 cl. 2, Foro di Piacenza, materiale del cliente
  rimborsato solo per quanto paga l'assicurazione, lamine del cliente. Cambiare un testo = nuova revisione (non è consulenza legale: rilettura del legale consigliata).
- Email dagli indirizzi per funzione (Adriano 2/11/2026; `engine/mittenti-email.ts` `FUNZIONI_EMAIL`, `mittentePer(tipo)` in `server/gmail.ts`, test in `tests/mittenti-email.test.ts`):
  alias di info@ = amministrazione@ (DDT, fatture, NC, autofatture, solleciti), ordini@ (conferme d'ordine), preventivi@, acquisti@ (ordini a fornitore), produzione@.
  La delega resta su GMAIL_MITTENTE (info@); l'alias si usa nel From solo se è tra gli "Invia messaggio come" del Gmail di info@ (letti con gmail.readonly,
  `settings/sendAs`, in memoria 1 ora), altrimenti parte da info@. Stato in Impostazioni → Servizi → "Da chi partono le email". Un invio nuovo usa `mittentePer('<tipo>')`.

- Invio dei documenti (Adriano 4/11/2026; `engine/invii.ts`, `views/invio.ts`, migrazione 073, test in `tests/invii.test.ts`): colonna "Inviato" negli elenchi e riquadro
  nella scheda di preventivi, conferme, DDT, fatture/NC/autofatture, ordini a fornitore; NESSUN segno = da inviare. ✉ email del portale (data e destinatario), ✓ a mano
  ("Segna come inviato", POST `/amministrazione/documenti/:id/segna-inviato` o `/preventivi/:id/segna-inviato`) o "Da FIC"; fatture: segno SdI a parte con l'esito.
  Un invio email nuovo scrive `email_a`/`email_inviata_il` e `inviato_a_mano = false`. Preventivo per email dalla stampa (`preventivo-email-servizio.ts`, PDF in
  `pdf-preventivo.ts` con le righe di `contenutoStampa`, uguali alla pagina; da `mittentePer('preventivo')` = preventivi@).
  Email del cliente per documento (migrazione 074, Dati fiscali del cliente): `email_amministrazione` = fatture E DDT (Adriano: "è lo stesso"),
  `email_preventivi` (più indirizzi con la virgola), proposte per prime (`destinatarioPreventivo` dopo il mittente della richiesta Gmail, `destinatarioDdt`);
  la colonna `email_ddt` della 074 non si usa.
  Tempi di consegna del preventivo (Adriano 4/11/2026; `Ritocchi.consegna`, `testoConsegna`/`consegnaCompleta` in `engine/stampa-preventivo.ts`, test in `tests/stampa-preventivo.test.ts`):
  obbligatori prima di stampare o mandare (fieldset "Tempi di consegna" nei ritocchi, settimane 1–26, sempre "circa"): conto lavoro = "circa N settimane dall'arrivo
  del materiale"; materiale comprato da noi (proposto dalla spunta Componenti) = "circa N settimane per l'arrivo del materiale e circa M per il montaggio".
  Stampati sopra il pagamento, anche nel PDF; senza, "Stampa" non parte (`public/stampa.js`) e `inviaPreventivoEmail` rifiuta.
  Fattura e nota di credito di cortesia per email (Adriano 4/11/2026, "come per i preventivi"; `fattura-email-servizio.ts`, PDF con pdf-lib in `pdf-fattura.ts`,
  regole in `engine/fattura-email.ts`, test in `tests/fattura-email.test.ts`): riquadro `#invia-email` nella pagina del documento emesso dal portale (non bozza, annullato,
  scartato, FIC), "✉ Invia per email" in alto e nella stampa (anche DDT), stesse rotte del DDT (GET `/documenti/:id/pdf`, POST `/documenti/:id/email`); indirizzo =
  `email_amministrazione` > ultima fattura mandata > CRM (mai la PEC); da `mittentePer(tipo)` = amministrazione@; la stampa usa `datiStampaFattura`, come il PDF.

## Come lavorare
- Ogni richiesta di modifica (Adriano 31/10/2026): prima riscrivi la richiesta in 3 righe semplici (cosa cambia, dove, per chi).
  Se tocca formule economiche, preventivi salvati o anagrafiche, chiedi conferma ad Adriano prima di scrivere codice; il resto si fa e si pubblica dopo i test.
  Alla fine un riepilogo in italiano di cosa cambia per chi usa il portale (pagine, pulsanti, cosa fare di diverso), non l'elenco dei file.
  Quando Adriano corregge un modo di lavorare, la correzione si scrive qui (o nella memoria del progetto, se vale solo per un caso).
- Struttura database: mai modificare un file già esistente in `db/migrazioni/`; aggiungerne uno nuovo (`002_...sql`).
- Controllo notturno del 4/11/2026 (PR del controllo, test in `tests/controllo-notte.test.ts`, `tests/link-profilo.test.ts`, `tests/excel-celle.test.ts`):
  contabilità/esterno/produzione non vedono link a pagine che non possono aprire (`engine/link-profilo.ts`, middleware in `index.ts`: pulsanti tolti, link come testo);
  BOM: `avviaElaborazione(id, { mancanti: true })` per riga a mano / riga aggiunta / colonne = solo i P/N mai cercati vanno ai distributori (`cercaPn` `cacheLunga`);
  correzioni di "Ricalcola" salvate in `righe_file[].mano.codifica` e rimesse a ogni rielaborazione; `nonControllati` senza Würth (codici non WE) e senza Arrow se un altro ha risposto;
  una tantum riscritte a mano divise in proporzione (`pareggiaSulPiuGrande`, mai negative), ordine dal preventivo con lo sconto della stampa; `stampa.riferimento` = prezzo
  calcolato e schede quando si scrivono i prezzi a mano (avviso se il preventivo cambia); "Emetti e invia" con le spunte non emette senza chiave né con la chiave di prova.
- Controllo serale del 5/11/2026 (routine "Controllo serale del portale", lun–ven 22:30; report in Project Files → controlli; test in `tests/conferme-ordine.test.ts`, `tests/controlli.test.ts`):
  flussi provati con i dati veri in locale (storico FIC + ordini + CRM, PostgreSQL del container; preventivo → stampa → ordine → conferma → commessa → DDT → fattura → NC, BOM vere di LPS).
  Servizi d'ordine (una tantum dal preventivo) non viaggiano col DDT: riquadro "Servizi degli ordini non ancora fatturati" nella bozza fattura (`righeOrdineDaFatturare`,
  POST `/documenti/:id/righe-ordine` → `aggiungiRigheOrdine`, riga con `riga_ordine_id`); `righeOrdini` conta anche le fatture emesse dal portale (`fatturato_portale`),
  così il servizio fatturato diventa evaso; controllo settimanale `servizi-non-fatturati` (urgente). Conferma d'ordine: righe senza data prendono la prima consegna
  dell'ordine (`righeConfermaDaOrdine`). Ricerca per parametri dei passivi senza P/N: esito in `fornitori_cache` ('parametri', radice del gestionale, 7 giorni,
  `parametriDaCache`/`parametriInCache`) e riusato tra righe uguali della stessa BOM.
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
- Ordinare gli elenchi cliccando le colonne (Adriano 3/11/2026; `public/ordina-tabelle.js` in ogni pagina, stile `th.ordinabile` in `stile.css`, test in `tests/ordina-tabelle.test.ts`):
  ogni `<table>` in `<main>` con `<thead>` si ordina da sola: clic = crescente, secondo = decrescente, terzo = ordine di partenza; date gg/mm/aaaa, numeri 61/2026,
  importi all'italiana per valore, vuoti in fondo, scelta ricordata nel browser. Escluse da sole: intestazioni unite, righe di gruppo, caselle di un modulo che contiene
  la tabella (righe dei documenti, rientro, fasi del preventivo); `data-ordina` / `data-non-ordinare` per forzare, `data-valore` sulla cella per il valore da usare.
  Elenchi a pagine: il clic ordina la pagina; "Mostra tutte" (`?pagina=tutte` in `paginata`) mette tutto in una pagina. Una tabella nuova con `<thead>` è già ordinabile.
- Caselle con elenco di scelte (Adriano 4/11/2026, causale del trasporto del DDT; `public/elenchi-scelta.js` in ogni pagina, test in `tests/elenchi-scelta.test.ts`):
  niente menu del browser (il datalist mostrava solo le voci che cominciano come il testo già scritto): ogni `<input list="…">` apre il suo elenco con tutte le voci al clic
  o con freccia giù, scrivendo filtra, testo libero sempre possibile. Una casella nuova con `list=` + `<datalist>` è già a posto.
- Ogni push su `main` viene pubblicato da Render in automatico (render.yaml): lavora su un ramo se la modifica è grossa.
- Sito casteltech.net (Adriano 2/11/2026): pagine statiche in `sito/pubblico` (Static Site `casteltech-sito` su Render, gratis; prima WordPress su Noamweb),
  vedi `sito/LEGGIMI.md`. Moduli Contatti/Preventivo → portale (`rotte/sito.ts`, `engine/sito.ts`, test in `tests/sito.test.ts`): email a info@ e pacchetto "SITO – AZIENDA"
  nei Documenti dei clienti. Dall'8/11/2026 (Adriano) è il SITO NUOVO: una sola pagina `sito/pubblico/index.html` con sezioni dopo il "#", solo in italiano,
  immagini in `sito/pubblico/img`; il vecchio WordPress resta in `sito/vecchio-wordpress` (non pubblicato) e i vecchi indirizzi rimandano alle sezioni
  (`sito/strumenti/rimandi.py`). Preventivo guidato: azienda o privato, domande per tipo di lavoro in `righe_json`, pacchetto "SITO – PRIVATO – NOME" per i privati;
  candidatura `/api/sito/candidatura` con il CV allegato all'email. Testi del sito: SPI e AOI (mai "in linea"), niente saldatura stagno-piombo, Casteltech S.r.l.
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
Copia serale: contano solo le copie senza motivo nel nome (`backupSeraleDaFare`; il 3/11/2026 le copie "prima-di-eliminare" l'avevano fatta saltare), fatta tra le 18 e le 22.
Ripristino provato il 4/11/2026 con la copia del 3/11 in un PostgreSQL vuoto (`tools/ripristina-backup.ts`): 63 tabelle, tutte le righe uguali, 20 secondi.
Neon gratuito: si torna indietro nel tempo solo di 6 ore; oltre servono i backup del portale.
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
   Elenco con azioni multiple (crea commessa, duplica, elimina). Colonna "€/PCB con u.t." (Adriano 5/11/2026; `engine/elenco-preventivi.ts`, test in `tests/elenco-preventivi.test.ts`):
   prezzo a scheda del primo lotto = `totali.prezzoSchedaPrimoLotto`, con * se scritto a mano in `stampa.prezzi.con`; anche nell'Excel. Stampa per il cliente `/preventivi/:id/stampa` (Adriano 28/10/2026;
   `views/stampa-preventivo.ts`, `engine/stampa-preventivo.ts`, `public/stampa-preventivo.css`): impaginata come i preventivi FIC, pannello
   "Cosa stampare" a sinistra: `?vista=essenziale` (solo prezzo a scheda, niente sotto la descrizione: con una tantum le comprende e lo dice),
   `dettaglio` (predefinita: componenti, PCB, SMD, THT, consumo, spedizione; gestione materiale e imballaggio su SMD/THT 70/30 pesato sul valore,
   `quotaSmd`), `macro`, `fasi`; condizioni generali (`CONDIZIONI_GENERALI`) in seconda pagina con la firma del cliente, tolte con `condizioni=0` / `firma=0`; dettaglio delle voci una tantum tolto con `ut=0`
   (Adriano 4/11/2026, spunta "Dettaglio dei costi una tantum", vale anche per il PDF dell'email: `parametriStampa`, `contenutoStampa({ dettaglioUnaTantum })`).
   Ritocchi per il cliente (Adriano 29/10/2026; migrazione 046, `preventivi.stampa`, `leggiRitocchi`/`contiStampa`, POST `/preventivi/:id/stampa`): note per il cliente,
   sconto (% su tutto o € sul lotto), righe in più; solo nella stampa, il calcolo non cambia. Le note del preventivo sono interne (stampate solo con la spunta).
   Riquadri in alto del preventivo (Adriano 5/11/2026; `totali` in `rotte/preventivi.ts`, campi nuovi di `engine/riepilogo.ts`, classe `totali-preventivo`): 2 righe × 3 riquadri
   per tipo: Prezzo a scheda (senza/con una tantum), Vendita a scheda per voce (montaggio = prezzo senza una tantum − componenti − PCB, componenti, PCB), Una tantum;
   Costi a scheda (produzione = fasi + consumo/energia/spedizione, acquisto = voci MATERIALE PER PRODUZIONE), Margini, Ore del lotto.
   Validità e alternative nella stampa (Adriano 5/11/2026; `validitaOfferta`/`materialeVenduto` in `engine/stampa-preventivo.ts`, `engine/alternative-cliente.ts`, test in
   `tests/stampa-preventivo.test.ts`): montaggio 30 giorni, componenti/PCB 10 giorni solo se li vendiamo, accanto ai tempi di consegna; condizioni generali riscritte (validità,
   ordine, da quando contano le settimane, cosa sposta la consegna, codici alternativi). Righe della BOM collegata con `alternativaScelta`/`alternativaProposta` ≠ P/N
   = avviso sotto le righe + ultimo foglio "Componenti: alternative da confermare e problemi di acquisto" (Sì/No e firma), stessa coppia di codici = una riga; anche nel PDF.
   Nello stesso foglio (Adriano 5/11/2026, `componentiDaVerificare`): non trovati (non quotati), non disponibili, disponibilità da riconfermare, fine vita; spunta
   "Pagina componenti" sempre attiva, `?allegato=0` la toglie (OpzioniStampa.allegato, anche nel PDF dell'email).
   Riquadro verde (Adriano 4/11/2026, `prezziRiquadro`): sotto le righe e sopra il totale, SOLO prezzo a scheda senza e con le una tantum. I due prezzi a scheda si riscrivono a mano nei ritocchi
   (Adriano 4/11/2026, al posto dell'arrotondamento automatico: `Ritocchi.prezzi`, `basePrezzi`: lotto = scheda × schede, una tantum = (con − senza) × schede, righe pareggiate con
   `pareggiaSulPiuGrande`); il calcolo non cambia, "Crea ordine" (`prezziComeInStampa`) e l'avviso "sotto il preventivo" in fattura usano il prezzo scritto a mano. La stampa è sempre
   l'ultima versione salvata: `Cache-Control: no-store`, "Stampa" con modifiche non salvate prima salva (`public/preventivo.js`), la scheda già aperta si ricarica
   da sola se il preventivo cambia (GET `/preventivi/:id/stampa/versione`, `public/stampa.js`).
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
   Punti di saldatura THT (Adriano 4/11/2026; `engine/scheda/piedini.ts`, `punti-saldatura-servizio.ts`, GET `/preventivi/punti-saldatura`, test in `tests/punti-saldatura.test.ts`):
   punti = piedini dei THT montati (CAD > impronta/descrizione: DIP8, TO-220, 2x05, poli, assiale/radiale = 2), confrontati con i fori metallizzati del Gerber
   (fissaggio da 3 mm in su, fori dei non montati e fori senza componente NON contano); THT senza piedini = fori che restano, senza fori 2 a pezzo ("stima", da controllare).
   Nel preventivo "Conta i punti dai componenti" (sezione THT; documenti del cliente, altrimenti BOM collegata con tecnologia T): THT a mano → punti a mano + filo 0,125 g,
   onda → punti in `stagno` (reofori; g a reoforo = materiale stagnoLF di Impostazioni, 0,02 g, Adriano 4/11/2026), `stagnoPerSaldature` 0; punti scritti a mano → filo segue da solo (`public/preventivo.js`).
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
3a. ✅ Scheda di pre-produzione della commessa (Adriano 5/11/2026; `/commesse/:id/pre-produzione`, regole in `engine/pre-produzione.ts`, letture in
   `pre-produzione-servizio.ts`, pagina in `views/pre-produzione.ts`, migrazione 077 `commesse.pre_produzione`, test in `tests/pre-produzione.test.ts`): pulsante
   "Pre-produzione" nella commessa = una pagina con 1) cliente, riga d'ordine collegata (`ordini_righe.commessa_id`), conferme, preventivo e scheda tecnica; 2) pacchetto dei
   documenti del cliente (quello del preventivo, altrimenti l'ultimo della stessa revisione, con avviso) con file scaricabili (GET `/preventivi/documenti/:id/file?nome=`);
   3) segnalazioni preanalisi/preventivo/storico; 4) BOM quotata con le offerte della quantità più vicina e stato del materiale (`situazioneMateriale`: dal cliente =
   `clienteFornisce` o codice in `componenti_clienti`, arrivato/ordinato/da ordinare da `mancantiCommessa`, "già in casa" spuntato a mano: NON c'è magazzino);
   5) cosa fare / non fare proposti (`propostaCosaFare`) + caselle dell'ufficio; 6) checklist (`VOCI_CHECKLIST` filtrate dalle lavorazioni) con firma (nome utente + data)
   per voce, "Via libera alla produzione" solo a checklist completa (commessa aperta → in produzione), decade se si toglie una voce. Una voce nuova = una riga in `VOCI_CHECKLIST`.
3a2. ✅ Flusso di produzione nel cruscotto (Adriano 6/11/2026; regole in `engine/flusso.ts`, letture e azioni in `flusso-servizio.ts`, finestre e rotte in `rotte/flusso.ts`
   montate su `/produzione/flusso`, migrazione 079 `flusso_righe` + `commesse.fine_lavorazione` + `documenti.partito_il/partito_da`, test in `tests/flusso.test.ts`):
   cinque finestre in cima a `/cruscotto` (sopra "Da fare oggi"; menu Produzione → Flusso di produzione = `/cruscotto?flusso=preparare`): 1 Da acquistare, 2 Da preparare per
   produzione, 3 In produzione, 4 Da spedire, 5 Spedite nel mese. Unità = riga d'ordine di tipo scheda (`daEvadere`), una riga può stare in più finestre (`valutaRiga`).
   Priorità automatica = consegna richiesta, poi data ordine (`ordinaPerPriorita`); numero a mano in `flusso_righe.priorita` (▲ ▼ / casella, "auto" lo toglie).
   1: cose da comprare dalle spunte del preventivo + righe di costo dell'ordine (`cosaAcquistare`), spunte con nome e data (`flusso_righe.acquisti`).
   2: fasi macro dal ciclo (`fasiPreviste` da `commesse_fasi`/parametri: estrazione, SMD TOP/BOT, THT, meccanico, collaudo, coating, etichettatura), spunta materiale per
   fase (`flusso_righe.materiale`); tutte spuntate o "Passa in produzione" → commessa in_produzione. 3: fasi segnate da sole dalle `rilevazioni` chiuse (✓ blu) o a mano;
   fine lavorazione parziale/totale in `commesse.fine_lavorazione` (`aggiungiFineLavorazione`: mai oltre la quantità) da cruscotto, telefono (`POST /r/c/:codice/fine-lavorazione`),
   pagina della commessa (`POST /commesse/:id/fine-lavorazione`) e riquadro FINE LAVORAZIONE sulla scheda stampata letto dall'IA (`fine_lavorazione` in `istruzioniTempi`,
   `fineLavorazioneDaScansione`, origine 'scansione', senza doppioni). 4: schede finite non partite; DDT emesso (non partito) = "in attesa di corriere"; "Spedito" scrive
   `documenti.partito_il` (`segnaSpedito`), "Non partito" lo toglie. 5: DDT partiti negli ultimi 30 giorni (`GIORNI_SPEDITE`), collegati alla riga via `riga_ordine_id`,
   abbinamento DDT o commessa. Profilo esterno in sola lettura. Letto all'apertura del cruscotto (`datiFlusso`), niente timer.
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
   ARROW_LOGIN + ARROW_API_KEY da developers.arrow.com, USD → EUR cambio BCE; chiave arrivata il 4/11/2026): risposte MAI in fornitori_cache (`siCache`, condizioni d'uso di Arrow).
   Würth Elektronik (Adriano 4/11/2026; `engine/wurth.ts`, test in `tests/wurth.test.ts`): Customer API (WURTH_CLIENT_ID + WURTH_CLIENT_SECRET da profile.we-online.com → API Keys,
   scadono il 5/6/2027), prezzi NOSTRI (listino per i codici mai comprati) + disponibilità, chiesti solo per i codici WE (`codiceWurth`: numerici); si ordina dal commerciale WE.
   Codifica, regole aggiunte (registro `REGISTRO_AGGIUNTE` in `engine/codifica/aggiunte.ts`, visibile in Impostazioni → Componenti; ogni aggiunta nuova va lì):
   famiglie CF film, NT termistori, BT batterie, AN antenne; case nuovi/sinonimi (`CASE_AGGIUNTI`, `IC_FAM_AGGIUNTE`, DIP); categorie DigiKey dalla più specifica.
   I componenti in archivio non cambiano codice; le aggiunte toccano solo casi che il Python lasciava "da completare" (`tools/verifica-codifica.ts` da rifare con i dati veri).
   Archivio iniziale: file componenti_casteltech.json.gz da Impostazioni → Componenti.
   Righe "NUOVO - DA VERIFICARE" (Adriano 4/11/2026; `confermaVerifica` in `engine/codifica/modifiche-mano.ts`, `verificaRiga` in `codifica-servizio.ts`,
   POST `/quotazioni/bom/:id/riga/:n/verificata`): riquadro "Codice da verificare" nella pagina della riga, "✓ Verificato, salva nell'archivio" = esito NUOVO,
   note CODICE DA VALIDARE tolte, componente subito in archivio con stato OK (solo quella riga). Il punto finale nel codice di produzione = P/N accorciato a 30 caratteri (`PROD_MAX`).
   Campi per famiglia (Adriano 4/11/2026; `engine/codifica/campi-famiglia.ts` + `public/campi-famiglia.js`, test in `tests/modifiche-mano.test.ts`): nella pagina della riga
   si vedono solo i campi di `FAMIGLIE[fam].prod` + case (tranne CN/TI/BT/AN), con l'esempio nella casella (case THT se Tecnologia T); "Mostra tutti i campi" li riapre.
   Connettori in MI/IC/senza famiglia (Adriano 4/11/2026, RJ45 HR911105A; `famigliaProposta` in `engine/codifica/famiglia-proposta.ts`, applicata in `ricalcola` alle righe
   da completare non corrette a mano): parole da connettore → CN con tipo/passo/poli da impronta e descrizione (RJ45/RJ11 standard 1,02 mm, 8/6 poli), solo se il gestionale si calcola; nota CODICE DA VALIDARE.
   Codice di produzione di Croci (suggerimento 4/11/2026; `conTht`, `ORDINE_PROD`, `calcola().prodPrima` in `engine/codifica/regole.ts`, test in `tests/codifica-aggiunte.test.ts`): THT = famiglia-THT-…,
   case IC nome+piedini (SOIC8), CN tipo MORSETTO → TI con poli prima del passo; solo codici nuovi: in `ricalcola` l'archivio si cerca anche con `prodPrima` (codice alla vecchia maniera).
   Righe da completare del 4/11/2026 (registro in `aggiunte.ts`): categorie DigiKey con switch/driver → IC, SOT-23-THIN, induttanze con decimali, quarzi Abracon ABM (`abraconAbm` in `decoder.ts`),
   USB-A/B standard (`connettoreStandard` in `famiglia-proposta.ts`), pulsanti senza case = misura LLWW.
   Formato THT a misura (Adriano 5/11/2026, clip portafusibile; `formatoThtMisura` in `regole.ts`, decoder FS, DigiKey "Fuse Holders" → FS, test in `tests/codifica-aggiunte.test.ts`):
   fusibili "5X20"/"6.3X32"/"10X38" → gestionale 5X20/6X32/1038, clip e portafusibili "CLIP5X20" → C520, letti dalla descrizione/impronta; con Tecnologia T vale per ogni famiglia
   senza case standard (tranne ID e CE che hanno la loro regola), stato OK.
   Rielabora / Aggiorna prezzi (Adriano 4/11/2026, "ogni richiesta genera costi o arrivo al limite"): "Rielabora" = `avviaElaborazione(id, { mancanti: true })` (dal 5/11/2026, LED mai cercati perché prima "non montati"): `cercaPn` dalla cache
   (anche oltre 24 h) e ai distributori SOLO i P/N mai cercati (`cacheLunga`), alternative e P/N dei passivi di prima tenuti; "Aggiorna prezzi" = `forzaPrezzi` con conferma; cambio schede = soloCache.
   `cercaVarianti` e `digikeySostituti` in cache 24 h ('varianti', 'sostituti_dk' in `fornitori_cache`). Pagina della riga: caselle con elenco (`valoriTabella` + valori
   dell'archivio per famiglia `valoriArchivioFamiglia`), "Ricalcola" resta sulla riga con `esitoRicalcolo`, riquadro "Suggerimenti" (`suggerimentiRiga` in
   `engine/codifica/valori-tabella.ts`, test in `tests/valori-tabella.test.ts`).
   Formato nuovo dalla riga (Adriano 4/11/2026; migrazione 076 `codifica_case`, `CASE_DAL_PORTALE` in `aggiunte.ts` letto da `caseLookup`, `controllaNuovoCase`/`caseDaAggiungere`
   in `valori-tabella.ts`, `aggiungiCase`/`caricaCaseDalPortale` in `codifica-servizio.ts`, POST `/quotazioni/bom/:id/riga/:n/nuovo-case`, test in `tests/case-dal-portale.test.ts`):
   case "non in tabella" → riquadro in cima alla riga con codice di 4 caratteri + S/T, vale OK per tutte le BOM, riga ricalcolata; elenco con "Togli" in Impostazioni → Componenti; tabella completa `/impostazioni/componenti/case` (+ `.xlsx`, `tabellaCase` in `valori-tabella.ts`).
   BOM quotata = pagina di acquisto (Adriano 5/11/2026; `engine/codifica/aggrega.ts`, test in `tests/bom-aggregata.test.ts`): righe con lo stesso P/N unite in `elabora`
   (`unisciPerPn`: quantità sommate, riferimenti uniti, `righeUnite`; non i non montati, le righe senza P/N, quelle aggiunte a mano), scarto e acquisto sul totale; P/N corretto
   a mano vale per tutte le righe unite, quantità no; "togli" le toglie tutte; "Salva nell'archivio" con P/N già salvato = IN DATABASE. Riquadro "senza prezzo" solo col filtro.
   Alternative anche per senza prezzo / non disponibili (`serveAlternativa`): passivi e non attivi con stesso codice di produzione = scelta da sola la più economica disponibile
   (`alternativaAutomatica`, `alternativaAutomatica: true` sulla riga, rivalutata con "Aggiorna prezzi"), attivi sempre conferma; "Cerca alternative" (POST `/quotazioni/bom/:id/alternative`)
   = prezzi dalla cache + richieste solo per le alternative. Elenco per il cliente: `alternativeDaConfermare` in `engine/alternative-cliente.ts` (stampa del preventivo).
   Ricerca su internet (Adriano 5/11/2026, "S505H-1.6-R" era "BK1-S505H-1.6-R"; `cercaComponenteSulWeb` in `lettura-ia.ts` con lo strumento web_search di Anthropic
   = `strumentoRicercaWeb` in `server/ia.ts`, 1 centesimo a ricerca in `costoIa`; `ricercaSulWeb` in `codifica-servizio.ts`, test in `tests/ricerca-internet.test.ts`):
   righe ancora senza prezzo e senza alternativa dopo `alternativeRighe` → l'IA cerca codice completo, dove si compra, criticità; esito in `RigaBom.ricercaInternet`
   (conservato finché il P/N è lo stesso, rifatto solo con "Aggiorna prezzi"), codice trovato chiesto ai distributori → alternativa `FONTI_ALTERNATIVA.INTERNET`
   (`identica` true se "stesso componente": regole di `decidiAlternativa`), nota "ricerca su internet (data): … CRITICITÀ: …" sempre; max 12 righe per elaborazione.
   Miglior prezzo di un P/N (Adriano 28/10/2026; `/quotazioni/prezzo`, `confrontaOfferte` in `engine/acquisti.ts`): P/N + pezzi → tutti gli shop collegati
   affiancati, in cima la stessa scelta della BOM (`sceltaMigliore`), colonna "In più"; usa `cercaPn` e la cache di 24 h. ⬜ LCSC: serve la chiave
   (richiesta a support@lcsc.com con i documenti dell'azienda, IP di Render da autorizzare); per ora solo il link "Cerca su LCSC".
   Componenti in comune (suggerimento di Adriano Croci "Macchine per Selea", 2/11/2026; `/quotazioni/comuni`, `engine/componenti-comuni.ts`, test in
   `tests/componenti-comuni.test.ts`): cliente → sue BOM quotate (via `preventivi.bom_id` / `pacchetti_scheda.bom_id`, o spuntate a mano) → componenti presenti in più
   schede (stesso codice di produzione, altrimenti P/N senza trattini; non montati esclusi), in cima i più usati; "Feeder fissi" N = i primi N in verde. Solo lettura.
   Modifiche a mano della BOM (suggerimenti di Federico, 2/11/2026; `engine/codifica/modifiche-mano.ts`, `modificaRigaAMano`/`aggiungiRigaBom` in `codifica-servizio.ts`,
   test in `tests/modifiche-mano.test.ts`): riga → "Modifica a mano" (POST `.../riga/:n/mano`): P/N e quantità scritti nella riga di `righe_file` (colonna "… (a mano)"
   se la BOM non l'ha) poi rielabora; scarto a mano (pezzi "10" o "5%") e nota in `righe_file[].mano`, valgono subito. "+ Aggiungi una riga" (POST `/quotazioni/bom/:id/aggiungi`):
   componente che manca o comprato altrove, `mano.aggiunta` + prezzo e "si compra da"; entra nei totali e nel costo del preventivo collegato.
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
   DDT in ingresso (Adriano 6/11/2026; migrazione 081 `ddt_ricevuti` + tipo acquisizione 'ddt_ricevuto', regole in `engine/ddt-ricevuti.ts`, letture in
   `ddt-ricevuti-servizio.ts`, pagina di controllo in `rotte/acquisizioni.ts` (`paginaDdtRicevuto`, POST `/:id/ddt-ricevuto`), elenco Acquisti → DDT ricevuti =
   `/acquisti/ddt` (`rotte/ddt-ricevuti.ts`), test in `tests/ddt-ricevuti.test.ts`): i DDT dei FORNITORI e dei CLIENTI scansionati nella cartella Drive / Da acquisire;
   l'IA risponde `ddt_ricevuto` (Casteltech destinatario) con mittente, P.IVA, numero, data, ordine citato, righe. Mittente dall'anagrafica per P.IVA o nome
   (`stessoNomeFornitore` / `risolvi`; sia fornitore sia cliente → fornitore se ha ordini a fornitore emessi). Fornitore: `abbinaDdtFornitore` incrocia con le
   righe degli ordini a fornitore emessi (`chiaviArticolo`: codice distributore o P/N, "595-TPS…" = "TPS…"; prima l'ordine citato, poi le righe con pezzi da ricevere,
   poi il più vecchio); alla conferma `documenti_righe.arrivati += quantità` (data = data del DDT). Cliente: `abbinaDdtCliente` cerca ogni riga tra `componenti_clienti`
   e `prodotti` del cliente, ordine = quello citato (rif_cliente o numero) o l'unico aperto; nessun magazzino, il DDT resta solo registrato (pagina dell'ordine:
   "Materiale arrivato dal cliente"). Anomalie `{livello, testo}` in cima alla pagina e conservate in `ddt_ricevuti.anomalie`: quelle 'errore' bloccano la conferma
   senza la spunta "Ho controllato le anomalie". "Elimina" in DDT ricevuti toglie i pezzi dagli arrivati e rimette il file da confermare.
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
   Non interessati nascosti (Adriano 2/11/2026; `STATI_ESCLUSI`/`avvisoEscluso` in `engine/crm.ts`, test in `tests/crm.test.ts`): stati "Non interessato" e "Scartato"
   fuori da elenco, ricerche, conteggi e prossime azioni (anche nel cruscotto), mai eliminati; si vedono con Stato → "Non interessati e scartati" (`FILTRO_ESCLUSI`),
   la spunta "mostra anche…" o il riquadro "Nascoste". Avviso rosso nella scheda, in "Nuova azienda" con lo stesso nome, nella ricerca che le trova; registrare un'attività chiede conferma.
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
   "Proposto da" = menu con gli utenti attivi di ufficio e produzione, già scelto chi usa il portale, obbligatorio (Federico 2/11/2026, `elencoProponenti`).
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
   X per chiudere gli avvisi in cima (Adriano 2/11/2026; `public/avvisi.js`, classe `chiudibile`): avviso servizi nascosto nel browser finché non cambia
   `chiaveAvvisoServizi` (testo + ultimo riavvio), messaggi `?msg=` tolti dall'indirizzo. GET `/api/claude/eventi-render`: avvii/arresti di Render degli ultimi 7 giorni.
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
   `/preventivi/:id/ordine`, migrazione 058 `ordini.preventivo_id` + origine 'preventivo', test `tests/ordine-da-preventivo.test.ts`; ordine unico da più preventivi dello stesso cliente = Cinzia 2/11/2026,
   azione "Crea ordine" dell'elenco → `/preventivi/ordine?p=ID&p=ID`, `creaOrdineDaPreventivi`, `controlliPiuPreventivi`): "Crea ordine" nel preventivo
   salvato → riga schede al prezzo del preventivo + una tantum come servizi se primo lotto, consegna proposta da `stimaConsegna`, numero serie 9001, preventivo →
   accettato. "Cosa manca" nella commessa (`engine/cosa-manca.ts`, `mancantiCommessa`/`ordinaMancanti` in `ordini-fornitore-servizio.ts`, `/ordini/fornitori/commessa/:id`,
   test `tests/cosa-manca.test.ts`): BOM del preventivo per la quantità quotata più vicina contro gli ordini a fornitore con `bom_id`/`commessa_id` (chiave = codice
   distributore, poi P/N), bozze dei mancanti per distributore. Solleciti incassi (`engine/solleciti.ts`, `solleciti-servizio.ts`, `/amministrazione/solleciti[/:cliente]`,
   test `tests/solleciti.test.ts`): rate scadute per cliente, livello primo/secondo/ultimo (30/60 gg), email con fatture e IBAN, "Invia con Gmail" (delega) o mailto/copia +
   "Segna come mandato"; registrato in `crm_attivita` tipo email; "incassi scaduti" del cruscotto e la scheda cliente portano qui.
   ✅ Crediti verso clienti (brief D, Adriano 31/10/2026; `engine/crediti.ts`, `/amministrazione/crediti`, test `tests/crediti.test.ts`): da incassare, scaduto
   per fasce 1–30/31–60/61–90/oltre 90 (il giorno della scadenza non è scaduto), per cliente esposizione, ritardo max e giorni medi di incasso (rate pagate negli
   ultimi 12 mesi, `giorniMediIncasso`), rate dei prossimi 14 giorni con "Segna incassata" (campo `torna`, solo pagine /amministrazione: `ritornoSicuro`);
   note di credito aperte in negativo come nel cruscotto. Calcolata all'apertura, niente controlli periodici; "Sollecito" porta ai Solleciti incassi.
   ✅ Gruppo C delle proposte (Adriano 1/11/2026; test `tests/interfaccia-moduli.test.ts`): errori accanto al campo (`engine/errori-campo.ts`: `conCampo(url, campo, modulo?)`
   aggiunge `&campo=&modulo=` ai redirect con `?msg=`; `public/errori-campo.js` in ogni pagina salva i valori del modulo all'invio e, tornando con `campo=`, li rimette,
   scrive il messaggio sotto il campo e ci porta il cursore; password mai conservate; usato in Utenti, Fasi/Parametri/Voci, Clienti, Prodotti, attività CRM: un modulo
   nuovo che rifiuta un valore usa `conCampo`). Preventivo Semplice/Completo (`engine/preventivo-semplice.ts` `CAMPI_SEMPLICE` = quantità e costi che cambiano da una
   scheda all'altra, classe `campo-semplice`, pulsanti accanto a Salva, scelta in localStorage `preventivo-vista`, all'inizio Completo; i campi nascosti contano comunque).
   Numeri e date (`public/formati.js`): nelle caselle `inputmode="decimal"` il punto diventa virgola uscendo (solo "12.5"); punto delle migliaia
   (Adriano 3/11/2026) "1.800" / "12.500.000" → 1800 (`MIGLIAIA`: non comincia per 0, quindi "0.125" resta 0,125); browser non in italiano =
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
   da riallineare il giorno del passaggio), aliquote/nature IVA con bollo 2 € oltre 77,47 €, condizioni di pagamento (giorni poi fine mese; a rate dal 3/11/2026, migrazione 064: `rate` + `ogni`,
   RiBa e bonifico 30/60, 60/90, 30/60/90 f.m., totale diviso in parti uguali con l'avanzo sull'ultima, `calcolaScadenze`, test in `tests/pagamenti-rate.test.ts`),
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
   Doppioni (Adriano 4/11/2026; `stessaFatturaEstera` in `engine/autofatture.ts`, `fatturaEsteraGiaCaricata`, migrazione 070, test in `tests/autofatture.test.ts`): stessa fattura
   (fornitore dal nome, numero senza segni, data) anche da file diverso (PDF + .eml) = quella arrivata dopo si scarta in `elabora`; nell'elenco "doppione" rosso,
   "Prepara l'autofattura" bloccato. Spunte nel riquadro fatture estere (POST `/amministrazione/fatture-estere/azioni`: "Prepara l'autofattura" = `confermaFatturaEstera` per ognuna, con gli errori
   nel messaggio; Elimina = scarta, non se l'autofattura è già preparata); "Invia allo SdI" con le spunte in Fatture, NC, Autofatture (`invia` in
   `engine/azioni-documenti.ts`: bozze del portale = `emettiDocumento` e poi invio; emessi senza `sdi_stato`), testo "Emetti e invia allo SdI", compare solo se nell'elenco
   c'è un documento da mandare (FIC = già inviati). Nell'elenco i totali delle bozze si calcolano dalle righe con l'aliquota (in `documenti` arrivano solo all'emissione).
   ⬜ Sottocartella Drive dedicata (per ora la stessa cartella degli ordini).
   Esigibilità IVA e attributi avanzati (Adriano 4/11/2026, come FIC; migrazione 071 `documenti.esigibilita_iva` + `attributi_xml`, `engine/attributi-fatturapa.ts`,
   `views/attributi-fattura.ts`, `public/attributi-fattura.js`, test in `tests/attributi-fatturapa.test.ts`): menu Esigibilità IVA in fattura/NC (Immediata predefinita, Differita,
   Split payment solo se il cliente ha la spunta: altrimenti errore); riquadro "Attributi avanzati fattura elettronica" (fattura, NC, autofattura): albero con numeri delle
   specifiche (2.1.9.3, 2.2.1(2).7), spunta + valore, ricerca, "Altri attributi" automatici; valori scritti nell'XML in ordine di schema e vincono sull'automatico;
   importi/numero/date/tipo non modificabili. Campo nuovo = una voce in `CATALOGO`. Esempio completo in `tools/fatturapa/esempi.ts` (verifica-fatturapa).
   Nota di credito da una fattura emessa (righe copiate, fattura collegata). XML controllato con lo schema ufficiale: `npx tsx tools/verifica-fatturapa.ts`
   (rifarlo a ogni modifica di fatturapa.ts). Documenti emessi non si eliminano (si stornano).
   🟡 Invio allo SdI con Invoicetronic (Adriano 28/10/2026: passaggio dal portale lunedì 2/11; `server/invoicetronic.ts`, `engine/sdi.ts`, migrazione 040):
   chiave `INVOICETRONIC_API_KEY` (ik_test_ = prova/sandbox, ik_live_ = reale; `INVOICETRONIC_URL` solo per le prove in locale). Documento emesso →
   "Invia allo SdI" (POST /send?validate=true, nome file dato da Invoicetronic, Idempotency-Key); con la chiave di prova "Prova l'invio" anche dalle bozze
   (numero di prova PROVA-<id>-<n> sempre nuovo: con numero 0 lo SdI scartava come doppione, Adriano 4/11/2026; non tocca lo stato; numero vuoto o 0 non parte mai, `numeroNonValido` in `engine/sdi.ts`). Ogni invio in `sdi_invii`; esiti dal webhook `/sdi/webhook` (prima di sessione e json, firma HMAC, doppioni in
   `sdi_eventi`, segreto in impostazioni 'invoicetronic' per ambiente; si collega da Impostazioni → Amministrazione → Invio allo SdI) o con "Aggiorna esito"
   (/update, gratis); niente controlli periodici. Stati: Inviato → inviato, Consegnato → consegnato, ImpossibilitaDiRecapito → non_consegnato (valida, avvisare
   il cliente), Scartato → scartato: "Correggi" la riporta a bozza con stesso numero e data (data bloccata, niente Elimina), si riemette e si rimanda.
   ✅ Fatture dei fornitori dallo SdI (`engine/fattura-ricevuta.ts`: XML o .p7m firmato, `registraRicevuta` in `server/invoicetronic.ts`): webhook receive.add
   o "Scarica dallo SdI" in Fatture fornitori (GET /receive?unread=true, gratis) → `documenti_ricevuti` origine 'sdi' con scadenze; fornitore per P.IVA
   (nuovo = aggiunto con nota DA VERIFICARE); doppioni con lo storico FIC (numero+data+fornitore) e copie delle nostre autofatture ignorati. Chiave di prova: solo riepilogo.
   ✅ DDT emessi dal portale (Adriano 28/10/2026; `engine/ddt.ts`, `documenti-servizio.ts`, stampa `views/stampa-documento.ts` → `/amministrazione/documenti/:id/stampa`):
   "Crea DDT" nella pagina dell'ordine (schede ancora da spedire, `riga_ordine_id` collegata: l'evasione la conta) o "+ Nuovo DDT"; trasporto in `dati_trasporto`
   (causale, a_cura, trasportatore, porto, colli, peso, aspetto, destinazione, inizio) proposto dall'ultimo DDT del cliente; prezzo non stampato (serve alla fattura).
   Emetti = numero in transazione (`controlliDdt`); DDT emesso si corregge con "Modifica DDT" (Adriano 2/11/2026: nessuna valenza fiscale; stesso numero e data, `?modifica=1`, `salvaBozza`) finché non è in una fattura già allo SdI o di FIC (`bloccoModificaDdt` in `engine/ddt.ts`, test in `tests/ddt.test.ts`); "Annulla DDT" se la merce non parte (numero usato, stato annullato; non se è in una fattura); "Fattura questo DDT".
   Stampa del DDT con il piede (aspetto, colli, peso, inizio, vettore, firme) SEMPRE in fondo alla pagina, in fondo all'ultima se sono più d'una (Adriano 4/11/2026, come FIC;
   `public/piede-ddt.js` `spazioSopraPiede`: a schermo il foglio ha le misure della stampa, si rifà l'impaginazione delle righe e si calcola lo spazio sopra il piede; test in `tests/piede-ddt.test.ts`; il PDF per email lo faceva già).
   DDT per email (Adriano 2/11/2026; `ddt-email-servizio.ts`, PDF con pdf-lib in `pdf-ddt.ts`, GET `/documenti/:id/pdf`, POST `/documenti/:id/email`): riquadro nella pagina
   del DDT emesso, indirizzo proposto = ultimo DDT mandato allo stesso cliente > email amministrativa > CRM > PEC (`destinatarioDdt`), Gmail di info@, `email_a`/`email_inviata_il`.
   ✅ PDF di cortesia di fattura e nota di credito (Adriano 31/10/2026; `stampaFattura` in `views/stampa-documento.ts`, stessa pagina `/documenti/:id/stampa`
   dei DDT, salvato in PDF dal browser): dati dell'azienda, cliente (fotografia dell'emissione), righe con IVA, riepilogo per aliquota/natura, bollo,
   lettera d'intento, pagamento con scadenze e IBAN; piede "copia di cortesia, il documento fiscale è l'XML". In bozza scritta BOZZA. Autofatture escluse.
   ✅ Registri IVA e controllo VIES (Adriano 31/10/2026; `engine/registri-iva.ts`, `registri-iva-servizio.ts`, `rotte/registri-iva.ts`, `engine/vies.ts`,
   `server/vies.ts`, migrazione 048): Amministrazione → Registri IVA per mese/trimestre/anno: vendite (fatture + NC in negativo, anche storico FIC),
   acquisti (protocollo calcolato nell'anno in ordine di DATA DI RICEZIONE, `documenti_ricevuti.ricevuto_il`, migrazione 067, Adriano 3/11/2026: SdI = arrivo in Invoicetronic, spese = loro data, storico FIC = data documento; mese e anno del registro e della liquidazione seguono la ricezione), autofatture (IVA a debito e a credito); fuori bozze, annullati, scartati. Riepilogo IVA del
   documento dal file XML (solo i blocchi DatiRiepilogo estratti da PostgreSQL: gli XML dei fornitori hanno allegati), altrimenti dalle righe, se non torna
   vincono i totali (segnalato). Split payment (EsigibilitaIVA S dall'XML, o `clienti.split_payment` senza XML) nel registro ma non a debito. Liquidazione MENSILE (Adriano 31/10/2026; `liquidazioniMensili`: credito riportato, sotto 25,82 € rinviata, versamento il 16 del mese dopo, luglio 20/8, codici 6001–6012; credito dell'anno prima in impostazioni `liquidazione_iva`; la pagina si apre su `meseDaLiquidare`); spese non elettroniche senza IVA fuori dal registro; "Da controllare" (numeri mancanti, scartate, bozze nel periodo). Excel e zip per il commercialista
   (Excel + XML, scritto a pezzi da 20). Controllo VIES (REST della Commissione, con la nostra P.IVA → numero di consultazione, `controlli_vies`; valido 90 gg;
   errori del servizio = "non verificabile", non "non valida"): pagina Amministrazione → Controllo VIES e riquadro nella bozza di fattura a cliente UE.
   ✅ Profilo Contabilità in sola lettura (Adriano 31/10/2026: il commercialista e Sonia di HTS; `engine/ruoli.ts`, migrazione 049, test in `tests/ruoli.test.ts`):
   ruolo 'contabilita' = solo GET sotto /amministrazione (`contabilitaPuo`, middleware `amministrazioneOContabilita` in `index.ts`) + Guida; menu con il solo
   pagine dell'Amministrazione in fila nella barra, senza tendine (`MENU_CONTABILITA` in `views/layout.ts`, Adriano 1/11/2026; il menu dell'ufficio non cambia),
   dopo l'accesso dritto al cruscotto `/amministrazione` (`paginaDopoAccesso`), `body.sola-lettura` nasconde i moduli POST. Utenti creati dall'ufficio in Impostazioni → Utenti.
   ✅ Profilo Esterno "vede tutto, sola lettura" (Adriano 2/11/2026; `esternoPuo` in `engine/ruoli.ts`, migrazione 062, test in `tests/esterno.test.ts`): stesso menu
   dell'ufficio, entra nel cruscotto, solo GET su tutte le pagine (in `soloUfficio`) tranne `/impostazioni`, `/dipendenti/riservata` e le pagine `…/nuovo`;
   `body.sola-lettura-tutto`: moduli visibili, caselle spente da `public/sola-lettura.js`, pulsanti che salvano e spunte nascosti in `stile.css`. Una sezione nuova
   montata con `soloUfficio` è già leggibile dall'esterno: se contiene chiavi o dati riservati va esclusa in `esternoPuo`.
   ✅ Analisi (Adriano 31/10/2026, "trend e analisi critica/di aiuto"; `/amministrazione/analisi`, `engine/analisi.ts`, `rotte/analisi.ts`, test `tests/analisi.test.ts`):
   dal 1/1 a oggi contro lo stesso periodo dell'anno prima (anni passati: anno intero), fatture emesse/ricevute anche storico FIC: fatturato, acquisti, resta dopo
   gli acquisti, peso dei primi clienti; commenti `commentiAnalisi` (critico/attenzione/bene + "Cosa fare": calo e da chi, previsione dai mesi chiusi, acquisti che
   pesano di più, dipendenza, clienti fermi/nuovi, ritardi d'incasso, scaduto > 60 gg, prezzi sotto preventivo, margine < 10 %); tabelle mesi, clienti (margine stimato
   = fatturato × margine dell'ultimo preventivo del codice, giorni di incasso), prodotti, acquisti per categoria FIC e fornitori. Non è il bilancio.
   ✅ Analisi dei prodotti e dei clienti (Adriano 5/11/2026; tasti Prodotti / Clienti in Analisi; `engine/analisi-prodotti.ts`, letture in `analisi-prodotti-servizio.ts`,
   pagine in `rotte/analisi-prodotti.ts`, test in `tests/analisi-prodotti.test.ts`): `/amministrazione/analisi/prodotti` = classifica per anno con filtro cliente e ricerca (+ Excel):
   pezzi e fatturato dalle righe delle fatture (NC in negativo, servizi fuori, stesso codice per due clienti = due prodotti), variazione, peso sul cliente e sul totale, prezzo medio,
   lotti = consegne (DDT di vendita + fatture senza DDT, come `codiciPerAnno`), lotto medio, ultima consegna, "fermo" oltre 6 mesi (`MESI_FERMO`). `/amministrazione/analisi/prodotto?codice=&cliente=`
   = scheda anno per anno (anche ordini del portale) + preventivi del prodotto + commesse con consuntivo (`consuntivoLotto`: fasi della scheda contro i tempi registrati, fasi senza tempi
   al previsto, voci e prezzo del lotto dal preventivo ricalcolato sulla quantità); link dai "Codici prodotti per anno" della scheda cliente e dalla tabella Prodotti dell'Andamento.
   `/amministrazione/analisi/clienti` = visione d'insieme (`visioneClienti`): classifica con peso, stesso periodo dell'anno prima, segnali (calo forte ≤ −30 % su almeno 2.000 €, in calo,
   in crescita, nuovo = prima vendita nell'anno, perso = anno prima sì e anno scelto no, fermo = nessuna vendita da 6+ mesi, solo anno in corso), primi 3/5, margine medio dai preventivi,
   giorni di incasso e ritardo (da `analisiClienti`), scaduto (→ Crediti). GET `/api/claude/storico` = conteggi dei documenti per tipo/anno/origine (controllo dello storico caricato).
   ✅ Punto di pareggio (Adriano 6/11/2026, dal file "Analisi CASTELTECH SRL" del commercialista; tasto in Analisi, `/amministrazione/analisi/pareggio` + `.xlsx`,
   conti in `engine/pareggio.ts`, letture in `pareggio-servizio.ts`, pagina in `rotte/pareggio.ts`, migrazione 078 `conto_economico_mensile`, test in `tests/pareggio.test.ts`):
   MEDIA mensile di ogni voce (famiglie `FAMIGLIE`: ricavi, materie prime = variabili, servizi, affitti/leasing, personale, compensi, ammortamenti, oneri, finanziari) nel periodo
   scelto (Da/a mese, `?da=AAAA-MM&a=`), pareggio = costi fissi ÷ margine di contribuzione, "fatturato ipotizzato" → utile. Mesi col bilancino del commercialista valgono così come
   sono; gli altri dal portale (fatture, ricevute per categoria `famigliaDiCategoria`, `costi_personale` con SOCIO = compensi) + stima per le voci mancanti (`stimaFamiglia`: media
   degli ULTIMI 3 mesi del bilancino `MESI_PER_STIMA`, così il leasing finito a luglio 2026 non continua nelle stime; poi bilancio ufficiale ÷ 12). Il file "Analisi CASTELTECH SRL" è di un
   consulente esterno, solo indicativo (Adriano 6/11/2026): nelle pagine si dice "bilancino", non "commercialista". Bilancino = Excel con un foglio per mese (saldi progressivi, conti a 8 cifre; `leggiBilancino`: mese = progressivo −
   mese prima, serve il mese prima) caricato da Impostazioni → Amministrazione con l'anno; bilanci ufficiali 2019–2025 dai PDF (Project Files → analisi-pareggio) in impostazioni
   'bilanci_ufficiali'. "Verifica: commercialista contro portale" segnala differenze oltre 500 € e 5 %. Non comprende le imposte sul reddito.
   ✅ Costi per categoria (Adriano 6/11/2026, punto 3: "leggere ogni singola fattura e attribuire la categoria", le SUE categorie; tasto in Analisi, `/amministrazione/analisi/costi` + `.xlsx`
   + `/costi/righe?anno=&categoria=`, regole in `engine/categorie-acquisti.ts` (35 categorie in 4 macro: rivendita, consumo, lavorazioni, gestione; `classificaRiga`: parole della
   descrizione prima, poi fornitore; `CATEGORIE_FORTI`/`DEBOLI`, fornitori generici tipo Amazon) e `engine/analisi-costi.ts` (`classificaCosti`, `costiPerAnno`, `confrontoRivendita`,
   `riassuntoCosti`), letture in `analisi-costi-servizio.ts`, migrazione 080 `categorie_acquisti_regole`, test in `tests/categorie-acquisti.test.ts` e `tests/analisi-costi.test.ts`):
   righe da `documenti_ricevuti_righe` (tabella del lavoro "storico acquisti riga per riga", migrazione 079; se manca o la fattura è solo PDF la fattura entra intera con la categoria FIC
   come indizio, `categoriaDaFic`); tre anni (anno in corso: gli anni prima fermati allo stesso giorno), peso, variazione, fornitori principali; "Comprato e rivenduto" = acquisti
   di componenti/PCB/meccanica contro pezzi fatturati × `venditaComponentiScheda`/`venditaPcbScheda` del preventivo più recente del prodotto (`riepilogo()`), costo previsto
   (`costoAcquistoScheda`), lamine comprate contro UT-LAMINA fatturate; "Riassunto, opinione e proposte" scritto dai numeri. Regole dell'ufficio (fornitore = nome maiuscolo,
   documento, riga; POST `/costi/regola`) vincono sulle automatiche; una categoria nuova = una voce in `CATEGORIE` (+ parole/fornitori). Le categorie restano calcolate in lettura.
   Niente più "senza categoria" (Adriano 6/11/2026, "in base al tipo di fattura, allo storico e a che cosa è stato acquistato"): in `classificaCosti` la categoria FIC
   aiuta anche le righe (come 'fic') e poi vale lo STORICO del fornitore (come 'storico' = la categoria che pesa di più tra le sue altre righe riconosciute); resta 'nessuna'
   solo un fornitore mai visto. Le stesse categorie in Andamento → "Acquisti per categoria" (`rotte/analisi.ts`, link alle righe) e nel Punto di pareggio per i mesi del portale
   (`mesiDalPortale` → `famigliaDiCategoriaCasteltech`: rivendita/consumo = materie, affitto/leasing = godimento, banca = finanziari, imposte = oneri, attrezzature = ammortamenti,
   resto = servizi); la famiglia `senza_categoria` non si usa più. Analisi → Prodotti: i riquadri Venduti / In calo forte / Fermi sono filtri (`?mostra=venduti|calo|fermi`,
   `RIQUADRI_REGOLE`/`filtraRiquadro`/`contaRiquadri` in `engine/analisi-prodotti.ts`, anche nell'Excel; conteggi sempre su tutta la classifica).
   ✅ Analisi degli acquisti e tasto "Analisi" nelle anagrafiche (Adriano 6/11/2026; `engine/analisi-acquisti.ts`, letture in `analisi-acquisti-servizio.ts`, pagine in
   `rotte/analisi-acquisti.ts`, test in `tests/analisi-acquisti.test.ts`): in Anagrafiche → Prodotti / Fornitori / Componenti / Materiali ogni riga ha il tasto "Analisi"
   (`linkAnalisi…` in `engine/analisi-acquisti.ts`; sparisce da solo per i profili che non aprono l'Analisi, `link-profilo`).
   `/amministrazione/analisi/fornitori` = classifica dei fornitori dell'anno (+ Excel; tasto Fornitori in `tastiAnalisi`); `/fornitore?f=f<id>` = acquisti anno per anno dalle
   fatture ricevute (NC in negativo, storico FIC dal 2019), variazione, peso sugli acquisti, ordini del portale, pagamenti (giorni medi e ritardo su 12 mesi, da pagare, scaduto),
   categorie di costo, ultime fatture; `/componente?id=` e `/materiale?id=` = `schedaArticolo` dalle righe degli ordini a fornitore emessi dal portale (pezzi, spesa, prezzo medio
   pesato netto sconto, variazione prezzo, fornitori, ultimo acquisto, min/max) + ultimo acquisto dell'anagrafica se più recente; componente anche BOM che lo usano (`bomDelComponente`,
   jsonb di `bom_analisi.righe`).
   Storico riga per riga e "dove l'ho comprato e a quanto" (Adriano 6/11/2026; migrazione 079 `documenti_ricevuti_righe` + `documenti_ricevuti.righe_lette_il`, regole in
   `engine/righe-fattura.ts`, letture/caricamento in `righe-fornitori-servizio.ts`, test in `tests/righe-fattura.test.ts`): ogni DettaglioLinee delle fatture dei fornitori
   (codice, descrizione, quantità, prezzo di listino, sconto, imponibile, IVA, P/N riconosciuto con `pnDallaRiga`: "P/N // cliente" nelle fatture scritte in FIC, "279-PN" di Mouser,
   prima parola se sembra un codice; mai valori 4.7K/100R). Storico 2019–2026 dagli XML dell'archivio (`tools/righe-fornitori-da-xml.ts` → `righe_fornitori.json.gz` in
   Project Files → archivio-fic, caricato da Impostazioni → Amministrazione → "Righe delle fatture dei fornitori", abbinato per `fic_id`, ricaricabile; 975 fatture solo PDF restano
   senza righe); le fatture dallo SdI scrivono le righe in `registraRicevuta`; "Leggi le righe dagli XML" per quelle con XML e senza righe. Abbinamento (`abbinaRighe`, in memoria):
   componenti con ogni parola della descrizione/P/N/codice contro `pn_key`, codice gestionale e di produzione; materiali con il codice MC-… o i codici del fornitore tra parentesi
   nella descrizione del materiale (`codiciFornitoreMateriale`). Schede componente/materiale = fatture + ordini del portale NON collegati a una fattura con righe (niente doppi conteggi);
   scheda fornitore: "Cosa compriamo da questo fornitore". `/amministrazione/analisi/acquisti?q=` (tasto Acquisti) = ricerca per P/N (anche senza trattini), codice o parole:
   articoli uniti (`articoliComprati`: volte, quantità, spesa, ultimo prezzo e da chi, min–max, fornitori con l'ultimo prezzo) + tutte le righe + Excel. Colonna `categoria` della riga
   libera per il thread del punto di pareggio (categorie di Adriano per riga).
   ✅ Previsione di cassa 30/60/90 giorni (Adriano 3/11/2026, dal file Excel "cash-flow-snapshot" fatto con FIC; tasti Andamento / Previsione di cassa in Analisi;
   `/amministrazione/analisi/cassa`, conti in `engine/previsione-cassa.ts`, letture in `previsione-cassa-servizio.ts`, test in `tests/previsione-cassa.test.ts`):
   incassi = rate aperte (NC in negativo) alla scadenza + ritardo medio del cliente (pesato sull'importo, incassi ultimi 12 mesi, esclusi compensati/stornati) se ha
   almeno N incassi (3, modificabile), altrimenti la media di tutti; mai prima di oggi. Fornitori alla scadenza, scaduti non pagati a oggi. Uscite fisse ogni mese:
   stipendi (vuoto = netto totale dell'ultimo mese di `costi_personale`), F24 (vuoto = media ultimi 3 F24 di `paghe_documenti`; F24 letto non pagato = uscita vera
   che sostituisce la stima del mese), IVA (vuoto = liquidazione del mese chiuso dai Registri IVA + media ultimi 3 mesi; scadenza di legge), altre 5 voci scritte.
   Saldo banca scritto a mano (impostazioni 'previsione_cassa'; la banca non è collegata). Banda ± sugli incassi = deviazione ritardo ÷ giorni medi fattura→incasso,
   max 50 % (30 % senza storico); punto più basso giorno per giorno; "Da sapere" (`rischiCassa`); Excel dei movimenti. Letta solo all'apertura (Neon).
   Riservata (`vedeCassa` in `rotte/analisi.ts`, `PERCORSO_CASSA` fuori per l'esterno): solo chi `vedePaghe`; stipendi il 10 del mese (Adriano 3/11/2026).
   ✅ Bollo addebitato al cliente (Adriano 7/11/2026, "attivalo e addebitalo al cliente"; `addebitaBollo`/`rigaBollo`/`ALIQUOTA_BOLLO` in `engine/amministrazione.ts`,
   test in `tests/bollo-addebitato.test.ts`): bollo dovuto (righe senza IVA soggette > 77,47 €) = riga virtuale "Rivalsa imposta di bollo" 2 € N1 escluso art. 15 (gruppo
   ESCLUSO15) in fondo a XML, stampa e PDF, dentro imponibile/totale/scadenze (`calcolaTotali(..., { addebita })`); NON sulle note di credito né negli acconti scalati
   (DatiBollo sì, totale no); registri IVA dalle righe la usano solo se i totali salvati la comprendono. Cruscotto: F24 del bollo tra le scadenze (`scadenzeFiscali(oggi, 35, trimestri)`).
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
   ✅ Banca (Adriano 7/11/2026, scelta "prima file, poi PSD2"; migrazione 082 `banca_movimenti` + `riba_distinte` + `documenti_scadenze.riba_distinta_id`, regole in
   `engine/banca.ts`, letture in `banca-servizio.ts`, pagine in `rotte/banca.ts` = `/amministrazione/banca`, test in `tests/banca.test.ts`): estratto conto BPER caricato
   (CBI RH `leggiCbi`, Excel/CSV `movimentiDaTabella`; chiave data|importo|descrizione|n = niente doppioni), `proponiAbbinamento`: entrate → rate emesse, uscite → rate ricevute;
   stesso importo + numero fattura (`citaNumero`) + nome (`somiglianzaNome`) + data; più rate dello stesso cliente; distinta RiBa intera; ≥ `SOGLIA_SICURA` = già spuntata.
   Conferma = rate pagate alla data del movimento con modo e conto; senza fattura = `CATEGORIE_MOVIMENTO` (`categoriaProposta`); "Annulla" riapre. RiBa: `/amministrazione/banca/anticipi`,
   file CBI (`generaRiba`: IB/14/20/30/40/50/51/70/EF, 120 caratteri) con codice SIA (impostazioni 'banca') e IBAN del cliente in `banca_appoggio`; Excel per l'anticipo con bonifico.
   Conti veri (Adriano 7/11/2026): CSV BPER "Tutti i movimenti" (`Societa';Banca;Rapporto;Contabile;Valuta;Cau.;Descrizione;Importo;Div.`) con tutti i rapporti insieme →
   `Movimento.rapporto` (`numeroConto`), `banca_movimenti.conto` = numero del rapporto; conti in impostazioni 'banca' (`conti`: nome, tipo ordinario/anticipo, saldo a una data, fido;
   `fidoAnticipi` unico per i conti tecnici), riquadro Conti con saldo di oggi (`saldoConto`) e disponibile; conto nuovo nel file = aggiunto da solo (`contoNuovo`).
   Anticipi/rientri (`MAI_FATTURA`) e conti di anticipo (`contoTecnico`) mai abbinati a fatture; giroconto = solo distinta intera. API: GET/POST `/api/claude/banca[/conti|/movimenti]`.
   Abbinamento fatto da Claude (Adriano 7/11/2026 sera, "non riesci a capirlo tu?"): GET `/api/claude/banca/dati` (movimenti, rate aperte, `ratePagateLibere` = rate già pagate
   dallo storico FIC non ancora confermate da un movimento, IBAN clienti) → analisi fuori dal portale → POST `/banca/decisioni` (confermato_da 'Claude'); rata già pagata = `gia: true`
   nel movimento: non cambia data/modo e "Annulla" non la riapre. POST `/banca/iban` = banca d'appoggio dei clienti (`salvaIbanCliente`: solo dove manca un IBAN valido).
   Fatture anticipate nell'elenco (Adriano 8/11/2026, "guardando le fatture voglio capire quelle anticipate con bonifico o RiBa"; `anticipiDelleFatture`/`segnoAnticipo` in
   `engine/anticipi.ts`, `anticipiFatture` in `banca-servizio.ts`, test in `tests/anticipi.test.ts`): Fatture → colonna "Anticipo" + filtro `?anticipo=tutte|riba|bonifico`,
   riquadro "Anticipata dalla banca" nella fattura; anche fatture già incassate (bonifico: anticipo → rientro, rientro senza numero = stesso importo o 80 % della fattura;
   fattura incassata senza rientro riconosciuto = detto così). Calcolato in lettura dai movimenti dei conti di anticipo.
   Password (Adriano 8/11/2026; `chiedePasswordRiservata` in `engine/ruoli.ts`, test in `tests/ruoli.test.ts`): Banca (`r.use` in testa a `rotteBanca`, POST `/banca/sblocca`,
   sessione `bancaSbloccata`, 15 minuti) e buste paga chiedono la password delle buste paga SOLO a ufficio e produzione; amministratore, contabilità ed esterno entrano senza.
   Novità CBI del 16/11/2026 (indirizzo strutturato nei bonifici/SDD SEPA): non tocca il portale (genera solo RiBa e legge movimenti). ⬜ Poi open banking PSD2 (servizio da scegliere).
