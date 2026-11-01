/**
 * Guida del portale (Adriano, 28/10/2026): le macro aree, cosa si fa e come, e la ricerca intelligente
 * ("ordine documenti", "dove carico il file dell'ordine") che porta all'argomento giusto.
 *
 * I testi stanno qui, nel codice, e non nel database: la guida non sveglia Neon e cambia con il portale.
 * Quando si aggiunge o si cambia una funzione del portale, aggiornare qui l'argomento della sua area.
 * Testo: frasi semplici, senza termini da programmatore; i passi sono quelli che si fanno con il mouse.
 */

export interface AreaGuida { id: string; nome: string; descrizione: string }
export interface ArgomentoGuida {
  id: string;
  area: string;
  titolo: string;
  /** parole con cui la gente lo cerca (oltre al titolo e al testo) */
  parole: string;
  /** paragrafi */
  testo: string[];
  /** passi da fare, in ordine */
  passi?: string[];
  /** pagine del portale dove si fa: [indirizzo, nome] */
  pagine: [string, string][];
}

export const AREE_GUIDA: AreaGuida[] = [
  { id: 'inizio', nome: 'Come funziona il portale', descrizione: 'Il percorso di un lavoro dal cliente alla fattura, dove vanno i file, cosa si può eliminare.' },
  { id: 'crm', nome: 'CRM', descrizione: 'Aziende, referenti, telefonate, visite e prossime azioni commerciali.' },
  { id: 'anagrafiche', nome: 'Anagrafiche', descrizione: 'Clienti, fornitori, prodotti e archivio componenti: l\'elenco ufficiale da cui si sceglie tutto il resto.' },
  { id: 'componenti', nome: 'Quotazioni (BOM e componenti)', descrizione: 'Quotazione delle BOM: codifica dei componenti, prezzi dei distributori, acquisti e scarto. Fino al 28/10/2026 si chiamava "Componenti".' },
  { id: 'preventivi', nome: 'Preventivi', descrizione: 'Calcolo del preventivo, documenti del cliente (BOM, pick and place, Gerber), stampa per il cliente.' },
  { id: 'ordini', nome: 'Ordini clienti', descrizione: 'Caricare un ordine, righe da evadere, DDT, cruscotto, Gantt della produzione.' },
  { id: 'commesse', nome: 'Commesse e schede di produzione', descrizione: 'Creare la commessa, stampare la scheda con il QR, rientro della scheda compilata.' },
  { id: 'reparto', nome: 'Tempi e reparto', descrizione: 'Tempi dal telefono con il QR, tempi scritti a mano, schede scansionate, promemoria.' },
  { id: 'amministrazione', nome: 'Amministrazione', descrizione: 'Fatture, note di credito, DDT, incassi e pagamenti, fatture dei fornitori.' },
  { id: 'impostazioni', nome: 'Impostazioni', descrizione: 'Tariffe, fasi, operatori e PIN, utenti, promemoria, copie di sicurezza, consumi dei servizi.' },
  { id: 'suggerimenti', nome: 'Suggerimenti', descrizione: 'Le idee del team per migliorare il portale.' },
  { id: 'qualita', nome: 'Qualità', descrizione: 'Non conformità e reclami, tarature, manutenzioni, verifiche ESD, documenti del sistema, formazione, audit, rischi.' },
  { id: 'dipendenti', nome: 'Dipendenti', descrizione: 'Costo del personale, buste paga riservate, nota spese con il rimborso chilometrico.' },
];

export const ARGOMENTI_GUIDA: ArgomentoGuida[] = [
  // ── Come funziona ──
  {
    id: 'percorso', area: 'inizio', titolo: 'Il percorso di un lavoro, dal cliente alla fattura',
    parole: 'flusso logica ordine passi schema giro processo menu sezioni',
    testo: [
      'Il portale segue il lavoro come avviene in azienda. Ogni sezione del menu in alto è un pezzo del percorso, e i dati passano da una sezione all\'altra senza riscriverli.',
      'Il cliente e il prodotto si scrivono una volta sola in Anagrafiche; da lì si scelgono nei preventivi, negli ordini e nelle fatture.',
    ],
    passi: [
      'Anagrafiche: il cliente e il codice del prodotto devono esserci (se mancano si aggiungono lì).',
      'Quotazioni: la BOM del cliente si codifica e si prezza dai distributori; il costo dei componenti va nel preventivo.',
      'Preventivi: si calcola il prezzo; se il cliente manda BOM, pick and place e Gerber si parte da "Da documenti del cliente".',
      'Ordini: l\'ordine del cliente si carica in "Da acquisire" (PDF, foto o email) e l\'IA lo legge; lo confermi tu.',
      'Commesse: dal preventivo si crea la commessa e si stampa la scheda di produzione con il QR.',
      'Reparto: gli operatori segnano i tempi dal telefono inquadrando il QR, oppure sulla carta.',
      'Rientro: l\'ufficio controlla tempi, consumi e spedizioni della scheda e conferma.',
      'Amministrazione: DDT e fattura; il cruscotto mostra incassi e pagamenti in scadenza.',
    ],
    pagine: [['/anagrafiche', 'Anagrafiche'], ['/quotazioni', 'Quotazioni'], ['/preventivi', 'Preventivi'], ['/ordini', 'Ordini'], ['/commesse', 'Commesse'], ['/amministrazione', 'Amministrazione']],
  },
  {
    id: 'ricerca-unica', area: 'inizio', titolo: 'La ricerca in alto: trovare subito un cliente, un codice, una commessa o una fattura',
    parole: 'cerca ricerca casella testata barra trova numero commessa ordine fattura ddt cliente codice scorciatoia tasto slash control k ctrl',
    testo: [
      'In alto a destra, in ogni pagina dell\'ufficio, c\'è una casella di ricerca unica. Scrivi quel che hai in mano e il portale ti porta alla pagina giusta: una ragione sociale, un codice prodotto, il numero di una commessa (C2026-0012), un numero di ordine o di fattura (12/2026 o solo 12), una partita IVA, un P/N di componente.',
      'Mentre scrivi compaiono le prime voci: con le frecce e Invio apri quella evidenziata. Se il risultato è uno solo (o il numero è preciso) si apre direttamente la pagina, altrimenti l\'elenco raggruppato per tipo.',
      'Da qualsiasi punto della pagina il tasto / (barra) oppure Ctrl+K porta il cursore nella casella; Esc la chiude. Il profilo Contabilità trova solo documenti emessi e fatture dei fornitori.',
    ],
    passi: ['Premi / (o clicca la casella in alto).', 'Scrivi un pezzo di nome, codice o numero.', 'Invio sulla voce evidenziata, oppure "Tutti i risultati…" per l\'elenco completo.'],
    pagine: [['/cerca', 'Ricerca']],
  },
  {
    id: 'tasti-rapidi', area: 'inizio', titolo: 'Tasti rapidi: fare prima con la tastiera',
    parole: 'tasti rapidi scorciatoie tastiera shortcut alt n nuovo esc escape punto interrogativo elenco tasti ctrl s salva barra slash ricerca veloce',
    testo: [
      'In tutte le pagine dell\'ufficio funzionano alcuni tasti: / (barra) o Ctrl+K vanno alla ricerca in alto; Alt+N preme il pulsante "+ Nuovo…" della pagina in cui sei (nuovo preventivo in Preventivi, nuova fattura in Documenti emessi, nuovo fornitore in Anagrafiche…); Ctrl+S salva la bozza che stai scrivendo; Esc chiude tendine e finestre.',
      'Premendo ? (Shift+7 sulla tastiera italiana, fuori dalle caselle di testo) compare l\'elenco dei tasti rapidi; Esc o un clic fuori lo chiude.',
    ],
    passi: ['Apri la pagina dell\'elenco (es. Preventivi).', 'Premi Alt+N: si apre il modulo del nuovo preventivo.', 'Premi ? se non ricordi un tasto.'],
    pagine: [['/cruscotto', 'Cruscotto generale']],
  },
  {
    id: 'excel-elenchi', area: 'inizio', titolo: 'Ogni elenco in Excel e a pagine',
    parole: 'excel xlsx scaricare esportare esporta elenco tabella foglio pagine pagina successiva elenco lungo troppo lungo 100 righe filtro',
    testo: [
      'Preventivi, Commesse, Ordini clienti, Clienti, Prodotti, Fornitori, CRM e Fatture fornitori hanno il pulsante "Excel" accanto alla ricerca: scarica un foglio con le stesse righe che vedi sullo schermo, con lo stesso filtro, date e importi già formattati.',
      'Gli elenchi lunghi (preventivi, commesse, righe d\'ordine, documenti emessi e ricevuti) mostrano 100 righe per pagina; in fondo ci sono i numeri delle pagine e "‹ ›". Il filtro scritto nella casella di ricerca resta cambiando pagina. Il file Excel contiene tutte le righe, non solo la pagina.',
    ],
    passi: ['Scrivi il filtro che ti serve nella casella di ricerca dell\'elenco.', 'Clicca "Excel": il file si scarica con il nome dell\'elenco e la data di oggi.'],
    pagine: [['/preventivi', 'Preventivi'], ['/commesse', 'Commesse'], ['/ordini', 'Ordini clienti'], ['/anagrafiche/clienti', 'Clienti']],
  },
  {
    id: 'riprendi-cruscotto', area: 'inizio', titolo: 'Riprendi da dove eri',
    parole: 'riprendi riprendere dove eri ultime cose aperte lavoro lasciato bozza preventivo commessa aperta ieri cruscotto recenti ultimi',
    testo: [
      'In cima al cruscotto generale il riquadro "Riprendi da dove eri" elenca le ultime otto cose toccate negli ultimi 14 giorni e ancora aperte: bozze di fattura, DDT e ordini a fornitore, preventivi in bozza o da validare, commesse aperte, documenti del cliente caricati e non ancora trasformati in preventivo.',
      'Prima vengono le tue, poi quelle dei colleghi; accanto c\'è quando sono state toccate l\'ultima volta ("oggi 10:32", "ieri 16:05"). Un clic riapre la pagina. Se non c\'è niente di aperto il riquadro non compare.',
    ],
    passi: ['Apri il cruscotto (clic su "Portale Casteltech" in alto a sinistra).', 'Clicca la voce da riprendere.'],
    pagine: [['/cruscotto', 'Cruscotto generale']],
  },
  {
    id: 'cruscotto-generale', area: 'inizio', titolo: 'La prima pagina: il cruscotto generale',
    parole: 'cruscotto generale homepage pagina iniziale home riepilogo da fare oggi cose importanti situazione numeri chiave colpo occhio',
    testo: [
      'Dal 31/10/2026, dopo l\'accesso, l\'ufficio arriva sul cruscotto generale. Si torna lì in ogni momento cliccando "Portale Casteltech" in alto a sinistra.',
      'In alto c\'è "Da fare oggi": un pulsante per ogni cosa che aspetta qualcuno, con il numero. Rosso = urgente (fatture scartate dallo SdI, consegne in ritardo, incassi scaduti), giallo = da controllare (preventivi da validare, documenti da acquisire, pagamenti scaduti), verde = da fare (DDT da fatturare, bozze, tempi aperti dal reparto, azioni del CRM). Se la cosa è una sola, il pulsante porta direttamente lì.',
      'Sotto ci sono sei numeri chiave (fatturato dell\'anno, ordini da evadere, preventivi aperti, commesse in corso, da incassare, da pagare) e un riquadro per area: Commerciale, Ordini clienti, Produzione (con il carico delle prossime 4 settimane dal Gantt), Acquisti, Amministrazione (con gli esiti dello SdI), Promemoria e sistema (scadenze del 15 e del 16, servizi, ultimo backup, suggerimenti).',
      'I dati si leggono solo quando si apre la pagina: per vederli aggiornati basta ricaricarla. I cruscotti di dettaglio restano in Ordini clienti e in Amministrazione. Il profilo Contabilità continua ad aprirsi sul cruscotto dell\'Amministrazione, il reparto sulle pagine del telefono.',
    ],
    pagine: [['/cruscotto', 'Cruscotto generale'], ['/ordini/cruscotto', 'Cruscotto ordini'], ['/amministrazione', 'Cruscotto amministrazione']],
  },
  {
    id: 'menu-gruppi', area: 'inizio', titolo: 'Il menu in alto: gruppi e tendine',
    parole: 'menu barra tendina gruppi commerciale acquisti produzione dove trovo sezione voce spostata',
    testo: [
      'Dal 31/10/2026 il menu in alto è diviso in gruppi. Passando con il mouse sul nome del gruppo si apre la tendina con le sue pagine; cliccando il nome si va alla prima.',
      'Anagrafiche: clienti, fornitori, prodotti, componenti. Commerciale: CRM, Quotazioni, Preventivi, ordini dei clienti. Acquisti: ordini a fornitore e miglior prezzo di un P/N. Produzione: commesse e Gantt. Amministrazione: cruscotto, documenti emessi, fatture dei fornitori.',
      'Impostazioni, Suggerimenti e Guida sono a destra. Gli indirizzi delle pagine non sono cambiati: i link salvati funzionano ancora.',
      'Più avanti arriveranno anche i gruppi Qualità e Sicurezza e ambiente.',
    ],
    pagine: [['/ordini/cruscotto', 'Ordini clienti'], ['/ordini/fornitori', 'Ordini a fornitore'], ['/commesse', 'Commesse']],
  },
  {
    id: 'dove-file', area: 'inizio', titolo: 'Dove metto i file? (ordini, schede, documenti, BOM)',
    parole: 'file documenti pdf allegati salvo salvare carico caricare caricamento metto cartella drive google upload dove scansione foto email excel zip',
    testo: [
      'Ogni tipo di file ha il suo posto. Non serve salvarli in cartelle del PC: si caricano nel portale, che li legge e conserva quello che serve.',
      'Ordine del cliente (PDF, foto, email .eml): Ordini → Da acquisire, oppure nella cartella Google Drive condivisa con il portale. Il portale la controlla ogni 15 minuti (lun–ven 8–20) e sposta i file letti nella sottocartella "Acquisiti".',
      'Schede di produzione compilate e scansionate: nella stessa cartella Google Drive degli ordini. L\'IA riconosce la scheda dal numero di commessa e porta i tempi nel rientro.',
      'DDT di Casteltech in PDF: anche loro in Da acquisire o nella cartella Drive; si abbinano da soli alle righe d\'ordine del cliente.',
      'Documenti del cliente per un preventivo (BOM, pick and place, Gerber, forature, GenCAD, anche in uno zip o un\'intera cartella): Preventivi → Da documenti del cliente. Un caricamento per ogni scheda. PDF, modelli 3D e immagini restano sul Drive: il portale li elenca ma non li conserva.',
      'BOM da codificare o da prezzare: Quotazioni → Carica una BOM (Excel o CSV).',
      'File preparati da Claude (elenco clienti, fornitori, ordini, CRM, storico Fatture in Cloud): ognuno ha il suo pulsante "Carica" nella sezione indicata con il file; prima mostra un riepilogo e poi chiede conferma.',
    ],
    pagine: [['/ordini/acquisire', 'Ordini → Da acquisire'], ['/preventivi/documenti', 'Preventivi → Da documenti del cliente'], ['/quotazioni', 'Quotazioni'], ['/commesse', 'Commesse (schede scansionate)']],
  },
  {
    id: 'pulsante-gmail', area: 'inizio', titolo: 'Mandare una mail al portale con il pulsante di Gmail',
    parole: 'gmail mail email posta pulsante tasto pannello inoltrare mandare portale preventivo ordine fattura estera allegati richiesta offerta cliente versioni versione varianti dividere quantità eml aggiungere file mancanti dopo bom pth',
    testo: [
      'Quando arriva una mail con una richiesta d\'offerta, un ordine o una fattura di un fornitore estero, non serve scaricare gli allegati: aprila in Gmail e usa il pannello "Portale Casteltech" a destra (sul telefono è in fondo alla mail).',
      'Preventivo: il testo della mail e gli allegati utili (BOM, pick and place, Gerber, zip) vanno in Preventivi → Documenti del cliente e l\'analisi parte da sola. Il cliente si riconosce dall\'email del mittente se è sicuro, altrimenti lo scegli tu. Il testo della mail si legge in cima alla pagina e finisce nelle note del preventivo da validare.',
      'Ordine: la mail intera va in Ordini → Da acquisire, l\'IA la legge e prepara la proposta da confermare. Fattura estera: va in Amministrazione → Autofatture. La stessa mail mandata due volte non entra due volte.',
      'PDF, modelli 3D e immagini restano solo nell\'elenco dei file, come quando carichi una cartella (le BOM in PDF non si leggono: chiedi al cliente Excel, CSV o testo). Gli allegati che Gmail mostra come link a Google Drive (file molto grandi) non arrivano: caricali dal portale.',
      'Nel pannello ci sono le ultime mail con allegati e la casella Cerca: tocca la mail e compaiono i tasti.',
      'File arrivati con una mail successiva (es. la BOM in testo): nella mail nuova premi "Aggiungi a documenti già caricati" e scegli il pacchetto, oppure nella pagina dei documenti apri "Aggiungi file a questo pacchetto". Il pacchetto si rianalizza da solo.',
      'Se la mail chiede più versioni della stessa scheda con le quantità (es. "167pz M0929-C versione HELIOS, 90pz versione CRONOS"), nella pagina dei documenti compare "Dividi per versione": nasce un pacchetto per versione con i file comuni (Gerber, lamine) e quelli con il nome della versione, e il numero di schede già scritto per il preventivo.',
      'Il numero di schede da quotare si legge dal testo della mail (es. "167pz", "5 pcb"); se nel testo non c\'è, dall\'oggetto (es. "Ordine 5 PCB MULTI"). Se non si trova la proposta è 100: correggila in "Schede da quotare" prima di premere "Crea il preventivo da validare".',
      'Caricando una cartella dal portale, la mail del cliente salvata come file .eml (in Gmail: ⋮ → Scarica il messaggio) messa insieme agli altri file vale come quella mandata dal pannello di Gmail: testo in cima alla pagina, quantità e versioni lette dal testo, "Dividi per versione". Gli allegati della mail non si leggono: mettili nella cartella.',
      'Se la mail chiede più codici diversi (es. "Primo odp 43pz … 20149766 PCA …" e "Primo odp 131pz … 1022303 PCA …"), il portale li riconosce quando il codice è anche nell\'oggetto o nel nome di un allegato: compare "Dividi per codice", un pacchetto per codice con i file che hanno il codice nel nome (es. lo zip 20149766-1596216), la sua quantità, le previsioni (Forecast) e i cicli di lavorazione. Nel preventivo il codice e la descrizione sono quelli della mail.',
      'Dopo "Dividi per versione" ogni versione conta solo i componenti della sua BOM: quelli dell\'altra versione sono segnalati come non montati. Si leggono anche le BOM in testo a colonne e il pick and place "centri" in pollici; se le coordinate hanno un\'altra origine rispetto ai Gerber il portale le sposta da solo e lo scrive tra gli avvisi.',
      'Una BOM divisa in due file (SMD e PTH) si unisce da sola; due BOM con gli stessi riferimenti sono versioni diverse e se ne usa una sola.',
    ],
    passi: ['Nel pannello "Portale Casteltech" di Gmail tocca la mail (o cercala).', 'Premi Preventivo, Ordine o Fattura estera (o "Aggiungi a documenti già caricati").', 'Premi "Apri nel portale" e controlla quello che ha letto; con più versioni premi "Dividi per versione".'],
    pagine: [['/preventivi/documenti', 'Documenti del cliente'], ['/ordini/acquisire', 'Ordini → Da acquisire'], ['/amministrazione/fatture-estere', 'Autofatture']],
  },
  {
    id: 'eliminare', area: 'inizio', titolo: 'Cosa si può eliminare e cosa no',
    parole: 'elimina cancella cancellare togliere errore sbagliato rimuovere annullare disattiva',
    testo: [
      'In tutte le sezioni c\'è il tasto Elimina per le righe inserite per errore. Prima di eliminare il portale chiede conferma. Negli elenchi si possono spuntare più righe ed eliminarle insieme (vedi "Fare un\'operazione su più righe insieme").',
      'Quello che è già usato non si elimina, per non rovinare lo storico: un preventivo con commessa, un cliente o un prodotto usato in preventivi o ordini, le fasi e i parametri del catalogo di partenza, gli utenti che hanno lavorato. In questi casi si toglie la spunta "Attiva" (o "Attivo"): non compaiono più nelle scelte ma lo storico resta.',
      'Le fatture e le note di credito emesse non si eliminano: una fattura sbagliata si storna con una nota di credito. Si elimina solo una bozza.',
    ],
    pagine: [],
  },
  {
    id: 'azioni-elenchi', area: 'inizio', titolo: 'Fare un\'operazione su più righe insieme (caselle di spunta)',
    parole: 'spunta spuntare casella caselle selezionare selezione seleziona tutti più righe insieme elenco pulsanti azioni multiple elimina duplica senza entrare',
    testo: [
      'Negli elenchi di Preventivi, Commesse, Ordini, BOM di Quotazioni, Documenti del cliente, Da acquisire e Suggerimenti ogni riga ha una casella a sinistra: spunti le righe e premi il pulsante in alto a destra, senza aprirle una per una. La casella nell\'intestazione spunta tutto l\'elenco.',
      'I pulsanti si accendono solo quando servono: quelli che valgono per una riga sola (es. Crea commessa, Stampa scheda, Rientro, Duplica di una commessa, Conferma d\'ordine) restano spenti se ne spunti più di una.',
      'Commesse: Stampa scheda, Rientro, Duplica (nuova commessa dallo stesso preventivo con quantità, referente e scheda tecnica copiati: numero, ordine e date si scrivono e poi si salva), Elimina. Dall\'elenco si eliminano solo le commesse ancora aperte e senza tempi registrati; le altre si eliminano dalla loro pagina, dove il portale dice quanti tempi si perdono.',
      'Ordini: l\'elenco mostra le righe degli ordini. Conferma d\'ordine (righe di un solo ordine), Segna evase (consegne che i DDT non riconoscono), Stato dai DDT (toglie lo stato scritto a mano), Elimina: elimina gli ordini interi delle righe spuntate, con tutte le loro righe. Gli ordini non si duplicano: un ordine nuovo arriva sempre dal documento del cliente (Da acquisire).',
      'BOM: Excel, Elimina. Documenti del cliente: Elimina. Da acquisire: Scarta (i file già diventati ordine, DDT o fattura non hanno la casella). Suggerimenti: Segna fatto, Scarta, Elimina.',
      'Prima di eliminare o scartare il portale chiede conferma e dice quante righe sono spuntate.',
    ],
    passi: ['Apri l\'elenco (es. Commesse).', 'Spunta le righe (o tutte con la casella in alto).', 'Premi il pulsante in alto a destra e conferma.'],
    pagine: [['/preventivi', 'Preventivi'], ['/commesse', 'Commesse'], ['/ordini', 'Ordini'], ['/quotazioni/bom', 'Quotazioni → BOM'], ['/suggerimenti', 'Suggerimenti']],
  },
  {
    id: 'accesso', area: 'inizio', titolo: 'Accesso, ufficio e produzione',
    parole: 'login password entrare utente accesso ruolo telefono pin uscire',
    testo: [
      'L\'ufficio entra con email e password e vede tutto il menu. Chi lavora in produzione usa le pagine del reparto dal telefono o dal tablet, con la sigla e il PIN.',
      'Nuovi utenti dell\'ufficio: Impostazioni → Utenti. PIN degli operatori: Impostazioni → Operatori.',
    ],
    pagine: [['/impostazioni/utenti', 'Impostazioni → Utenti'], ['/impostazioni/operatori', 'Impostazioni → Operatori'], ['/r', 'Pagine del reparto']],
  },
  {
    id: 'maiuscolo-ricerca', area: 'inizio', titolo: 'Ricerche negli elenchi e scritte in MAIUSCOLO',
    parole: 'cercare trovare ricerca filtro maiuscolo minuscolo accenti trattini',
    testo: [
      'Negli elenchi delle Anagrafiche la ricerca filtra mentre scrivi: puoi scrivere più parole in qualsiasi ordine ("rossi milano"), accenti e maiuscole non contano, e nei codici trattini e punti non contano ("rs0603" trova "RS-0603-2K2").',
      'Clienti, prodotti e fornitori si salvano sempre in MAIUSCOLO, anche se li scrivi in minuscolo. Email e PEC restano in minuscolo.',
    ],
    pagine: [['/anagrafiche', 'Anagrafiche']],
  },

  // ── Anagrafiche ──
  {
    id: 'scheda-cliente', area: 'anagrafiche', titolo: 'La scheda unica del cliente',
    parole: 'scheda cliente tutto in una pagina situazione cliente riepilogo preventivi ordini aperti commesse ddt fatture incassi scaduti crm prezzi prodotti storico',
    testo: [
      'Anagrafiche → Clienti → "Scheda" (o il cliente trovato con la ricerca in alto) apre una pagina con tutto quel che riguarda quel cliente: fatturato dell\'anno e dell\'anno prima, da incassare e scaduto (con i giorni medi di incasso), ordini aperti, commesse in corso, DDT da fatturare, preventivi.',
      'Sotto, un riquadro per argomento con le ultime righe e il collegamento alla pagina completa: ordini da evadere, commesse, DDT da fatturare, incassi scaduti, ultimi documenti, preventivi, prodotti con il prezzo di listino, CRM (prossima azione, referenti, ultime attività).',
      'In alto i pulsanti per partire da lì: Dati fiscali, Prodotti, CRM, + Preventivo (con il cliente già scelto), + Fattura, + DDT.',
    ],
    pagine: [['/anagrafiche/clienti', 'Clienti']],
  },
  {
    id: 'clienti', area: 'anagrafiche', titolo: 'Aggiungere o correggere un cliente',
    parole: 'cliente clienti nuovo aggiungere ragione sociale anagrafica alias nome diverso',
    testo: [
      'Tutte le anagrafiche stanno in un\'unica sezione, con i tasti in alto Clienti / Fornitori / Prodotti / Componenti.',
      'Nei preventivi, negli ordini e nelle fatture il cliente si sceglie SOLO da questo elenco, mai scritto a mano: così lo stesso cliente non compare con nomi diversi. I nomi scritti in modo diverso nei vecchi documenti sono già collegati al cliente giusto.',
      'I dati fiscali (indirizzo, codice SDI, PEC, pagamento, IVA, lettere d\'intento) si vedono e si correggono in Impostazioni → Amministrazione.',
    ],
    passi: ['Anagrafiche → Clienti.', 'Cerca prima se c\'è già (anche con un pezzo del nome).', 'Se non c\'è, scrivilo nella riga in alto e premi Aggiungi.'],
    pagine: [['/anagrafiche/clienti', 'Anagrafiche → Clienti'], ['/impostazioni/amministrazione', 'Dati fiscali dei clienti']],
  },
  {
    id: 'prodotti', area: 'anagrafiche', titolo: 'Aggiungere un prodotto (codice della scheda)',
    parole: 'prodotto prodotti codice scheda articolo descrizione revisione nuovo senza cliente non assegnato assegnare',
    testo: [
      'Ogni prodotto appartiene a un cliente: è una regola, un codice senza cliente non si salva. Nei preventivi codice e descrizione si scelgono solo da qui.',
      'I codici rimasti senza cliente (vecchi caricamenti) sono in cima all\'elenco, in giallo, e il tasto Prodotti dice quanti sono: assegna a ognuno il suo cliente e premi Salva, oppure eliminalo se è stato inserito per errore. Finché non hanno un cliente non compaiono nei preventivi.',
      'Dall\'elenco dei clienti, il numero dei prodotti porta ai prodotti di quel cliente.',
      'Se stai facendo un preventivo e il codice non c\'è, non serve uscire: nel preventivo premi "+ Nuovo prodotto" (vedi "Prodotto nuovo dal preventivo").',
    ],
    passi: ['Anagrafiche → Prodotti.', 'Scegli il cliente, scrivi codice e descrizione nella riga in alto e premi Aggiungi.', 'Codici senza cliente: "Mostra solo i codici senza cliente", scegli il cliente di ognuno e premi Salva (o Elimina).'],
    pagine: [['/anagrafiche/prodotti', 'Anagrafiche → Prodotti']],
  },
  {
    id: 'fornitori', area: 'anagrafiche', titolo: 'Fornitori',
    parole: 'fornitore fornitori partita iva p.iva acquisti nuovo',
    testo: [
      'Un fornitore si inserisce solo con una partita IVA valida (il portale controlla la cifra di controllo; quelle estere si scrivono con la sigla del paese). Una partita IVA = un fornitore: niente doppioni.',
      'I distributori di componenti (DigiKey, Mouser, Farnell, TME) sono un\'altra cosa: servono a leggere i prezzi, vedi Quotazioni.',
    ],
    passi: ['Anagrafiche → Fornitori.', '+ Nuovo fornitore, compila e salva.'],
    pagine: [['/anagrafiche/fornitori', 'Anagrafiche → Fornitori']],
  },
  {
    id: 'archivio-componenti', area: 'anagrafiche', titolo: 'Archivio dei componenti (codici di produzione e gestionale)',
    parole: 'archivio componenti codice gestionale moka armadio excel scaricare',
    testo: [
      'Tutti i componenti già codificati, con il codice di produzione (quello dell\'armadio, es. RS-0603-2K2-1-100MW) e il codice gestionale (es. SRS-0603-2K20F-001). Si può scaricare tutto in Excel.',
      'I componenti nuovi entrano in archivio dalla codifica delle BOM (sezione Quotazioni).',
    ],
    pagine: [['/anagrafiche/componenti', 'Anagrafiche → Componenti'], ['/quotazioni', 'Quotazioni (codifica)']],
  },
  {
    id: 'prezzi-anagrafiche', area: 'anagrafiche', titolo: 'Prezzo di vendita dei prodotti e ultimo acquisto dei componenti',
    parole: 'prezzo prezzi listino scaglioni scaglione fasce range quantità vendita acquisto costo ultimo fornitore fattura anagrafica fatture in cloud fic differenza scheda componente',
    testo: [
      'In Anagrafiche → Prodotti c\'è la colonna Prezzo €: il prezzo di vendita a scheda, IVA esclusa. Passando sopra la casella si vede da dove arriva: l\'ultima fattura emessa al cliente, l\'anagrafica prodotti di Fatture in Cloud o "scritto a mano".',
      'I prezzi sono stati presi da Fatture in Cloud: per ogni codice vale il più recente tra l\'ultima fattura e l\'anagrafica di FIC (se l\'anagrafica è stata aggiornata dopo l\'ultima fattura vale quella). I casi in cui erano diversi sono in un Excel a parte da controllare.',
      'In Anagrafiche → Componenti, cercando un componente, si vede l\'ultimo prezzo d\'acquisto con fornitore, data e pezzi ordinati: viene dall\'ultimo ordine a fornitore con quel P/N o quel codice. Anche l\'Excel dell\'archivio ha queste colonne.',
      'Un prezzo si corregge scrivendolo nella casella e premendo Salva: da quel momento vale quello e un nuovo caricamento da Fatture in Cloud non lo cambia. Vuotando la casella il prodotto torna senza prezzo.',
      'Prezzi a scaglioni di quantità (facoltativi): nella casella "Scaglioni di quantità" del prodotto scrivi ad esempio 1-5=10; 6-20=8; 21+=7 (da 1 a 5 pezzi 10 €, da 6 a 20 pezzi 8 €, da 21 in su 7 €) e premi Salva. Senza scaglioni vale il Prezzo € per tutte le quantità.',
      'In una fattura, nota di credito, DDT o conferma d\'ordine scegli il codice dal menu e scrivi la quantità: il prezzo dello scaglione giusto si mette da solo. Se cambi la quantità il prezzo si aggiorna; un prezzo scritto a mano resta quello.',
      'Se nel documento scrivi a mano un prezzo diverso da quello dell\'anagrafica, sotto le righe il portale chiede "Aggiorno l\'anagrafica?": Sì cambia lo scaglione di quella quantità (o il prezzo unico, se il prodotto non ha scaglioni); No lo lascia solo in quel documento. Nell\'ordine a fornitore la stessa domanda aggiorna l\'ultimo acquisto del componente.',
    ],
    passi: ['Anagrafiche → Prodotti (scegli il cliente per vedere solo i suoi).', 'Correggi il prezzo nella casella Prezzo € (e, se servono, gli scaglioni) e premi Salva.', 'Per ricaricare i prezzi: in fondo alla pagina "Carica i prezzi da Fatture in Cloud", scegli quello preparato da Claude, "Controlla", poi "Conferma e carica".'],
    pagine: [['/anagrafiche/prodotti', 'Anagrafiche → Prodotti'], ['/anagrafiche/componenti', 'Anagrafiche → Componenti']],
  },

  // ── Preventivi ──
  {
    id: 'nuovo-preventivo', area: 'preventivi', titolo: 'Fare un nuovo preventivo',
    parole: 'preventivo offerta prezzo calcolo nuovo costo fasi ricarico spunte informazioni generali top bot tht lamina aoi visivo controllo ispezione pre-produzione minuti smd a mano giostra campionatura',
    testo: [
      'Il prezzo si calcola mentre compili. In alto scegli cliente e prodotto dall\'anagrafica, schede, schede per pannello e pannelli.',
      'Le spunte delle INFORMAZIONI GENERALI (1ª produzione, TOP, TOP+BOT, THT a onda o a mano, componenti, PCB, lamina, etichette, pulizia, lavaggio) mostrano solo le sezioni che servono e attivano fasi e costi. Le programmazioni ci sono solo con la 1ª produzione.',
      'Il riquadro dei totali mostra prezzo a scheda, costi una tantum (solo nel primo lotto), margini e ore ciclo/uomo.',
      'Un preventivo salvato conserva le tariffe e le fasi del giorno in cui è stato fatto: se poi cambi le tariffe in Impostazioni, i preventivi vecchi non cambiano.',
      'Montaggio → AOI: TOP è spuntato con il TOP, BOT solo se c\'è anche quel lato. "Visivo" toglie l\'AOI (né ispezione né programmazione) e mette il controllo visivo, 60 secondi a scheda: si usa per campionature di pochi pezzi o schede con pochissimi componenti.',
      'Montaggio → SMD → "A mano" (campionature di pochi pezzi): gli SMD si montano a mano in giostra insieme ai THT, 15 secondi a componente SMD. Nel gruppo SMD resta solo l\'attrezzaggio serigrafia (45 minuti): niente programmazioni del pick and place, attrezzaggio, avvio, serigrafia a pannello e pick and place. Il forno resta, con tempi, energia e pasta. AOI o Visivo si scelgono come sempre.',
      'Pre-produzione: ogni voce ha 5 minuti di standard, tranne "Disegno e stampa 3D" (0). Acquisto componenti e acquisto PCB contano solo se sono spuntati in Acquisti.',
    ],
    passi: ['Preventivi → + Nuovo preventivo.', 'Cliente, prodotto e revisione (se non è indicata scrivi 0), quantità.', 'Spunte delle informazioni generali.', 'Controlla fasi, materiali e altri costi.', 'Salva.'],
    pagine: [['/preventivi/nuovo', 'Nuovo preventivo'], ['/preventivi', 'Elenco preventivi']],
  },
  {
    id: 'prodotto-nuovo-preventivo', area: 'preventivi', titolo: 'Prodotto nuovo dal preventivo (codice non in anagrafica)',
    parole: 'prodotto nuovo codice manca non trovo elenco aggiungere anagrafica revisione zero descrizione scheda nuova inserire manualmente',
    testo: [
      'Scelto il cliente, il menu Codice mostra solo i codici di quel cliente.',
      'Se il prodotto è nuovo e il codice non è nell\'elenco del cliente, lo aggiungi all\'anagrafica direttamente dal preventivo, senza chiuderlo: entra in anagrafica già con il suo cliente.',
      'Servono tre cose, senza non si prosegue: codice, descrizione e revisione. Se il cliente non indica la revisione scrivi 0. Tutto viene salvato in MAIUSCOLO.',
      'Se il codice c\'è già per quel cliente (anche scritto con trattini o spazi diversi) il portale non fa un doppione: sceglie quello dell\'elenco.',
      'Nel preventivo compilato dai documenti del cliente codice, descrizione e revisione sono già proposti, letti dai file (righe in alto nella BOM, Gerber, GenCAD, nome della cartella come "EA1002-0"): sono da convalidare, controllali prima di premere "Aggiungi in anagrafica".',
      'La revisione è obbligatoria anche per salvare qualunque preventivo.',
    ],
    passi: ['Nel preventivo scegli il cliente.', 'Premi "+ Nuovo prodotto" vicino al codice.', 'Scrivi codice, descrizione e revisione (0 se non c\'è).', 'Premi "Aggiungi in anagrafica": il prodotto viene scelto nel preventivo.', 'Premi Salva.'],
    pagine: [['/preventivi/nuovo', 'Nuovo preventivo'], ['/anagrafiche/prodotti', 'Anagrafiche → Prodotti']],
  },
  {
    id: 'documenti-cliente', area: 'preventivi', titolo: 'Preventivo dai documenti del cliente (BOM, pick and place, Gerber)',
    parole: 'documenti file cliente bom pick place gerber foratura excellon gencad cad zip cartella grande pesante step troppo smd tht refori feeder controlli incongruenze disegno segnalazione va bene ignorare accettare alternative pref alt llc elemaster dissipatore viti post wave dopo onda pasta saldante grammi aperture lamina stima consumo',
    testo: [
      'Quando il cliente manda il pacchetto della scheda, caricalo tutto insieme: il portale legge BOM, pick and place, Gerber, forature e GenCAD e li incrocia.',
      'Il risultato: componenti SMD per lato, THT, feeder, refori, misure, disegno della scheda, consumi stimati (pasta, stagno, filo) e le segnalazioni da controllare (valori diversi tra BOM e pick and place, riferimenti mancanti, lati, sovrapposizioni, componenti da non montare).',
      'Le cartelle chiamate OLD, VECCHI, ARCHIVIO o BACKUP vengono ignorate.',
      'Se scegli una cartella intera non serve togliere niente: il portale guarda prima i nomi e le dimensioni e carica solo i file utili. PDF, modelli 3D (STEP, anche da 80 MB), immagini, ODB++, documenti Word e file oltre 25 MB restano sul Drive: nell\'elenco dei file compare solo il nome con il motivo. Così non esce più l\'errore "file troppo grande".',
      'Anche dentro uno zip il portale apre solo i file utili: PDF, 3D e immagini restano chiusi. Se qualcun altro sta caricando o analizzando documenti nello stesso momento, il caricamento aspetta il suo turno qualche secondo: è normale, serve a non riempire la memoria del server.',
      'Non entrano nemmeno i file di lavoro di Casteltech finiti nella cartella del cliente: le cartelle Armadi e Topografico e i pick and place o le BOM con i nostri codici di produzione (es. CC-0402-100NF-10-X7R-50V). Si legge solo quello che ha mandato il cliente.',
      '"Codifica la BOM" porta i componenti nella sezione Quotazioni per i codici e i prezzi.',
      'SMD o THT: decide prima il CAD (fori dell\'impronta), poi il pick and place, poi la BOM. Se la BOM non ha la colonna del montaggio ma molte descrizioni cominciano per "SMD" (es. "SMD RES. 4,7KOHM 0805"), le righe che non cominciano per SMD sono THT. Senza pick and place e CAD i lati non si conoscono: gli SMD vanno tutti sul TOP.',
      'Componenti da non montare: si riconoscono dalla colonna Montato/DNP, dal valore (DNP, NM) e anche dalla colonna Note ("Non Montare"). Se c\'è la BOM, i riferimenti che sono solo nel pick and place (connettori a pettine, punti di test, piazzole per i cavi) non si contano tra i componenti da montare: restano nell\'errore "non sono nella BOM" da controllare.',
      'Si leggono anche i vecchi pick and place Allegro senza separatori (la "m" dopo la rotazione = lato BOT) e i Gerber di CAM350 con i nomi attaccati (pastetop, masktop, maskbot, bot, int2). Se le piazzole si trovano per pochi componenti (coordinate di una scheda sola su un Gerber a pannello) il controllo del case non segnala errori.',
      'Nelle BOM con le alternative del cliente (colonna Pref/Alt o livelli LLC 1 e 2) le righe alternative non sono altri componenti: si conta solo il componente, con il codice della preferita, e le alternative finiscono nella colonna "Alternative del cliente" anche in Quotazioni. Dissipatori, viti, dadi, rondelle, grasso, silicone, fascette, etichette, buste, specifiche e topografici non sono componenti da montare. Le righe "POST WAVE ASSEMBLY" sono pezzi montati dopo l\'onda: tra le segnalazioni, da stimare a mano.',
      'Pasta saldante dai Gerber: sotto "Pasta saldante" c\'è anche la stima dalle aperture dello strato pasta (area delle aperture × spessore lamina 0,12 mm × 4,2 g/cm³), per lato e in totale. È un confronto: il preventivo usa ancora la regola di 1,5 g ogni 450 componenti finché Adriano non decide di cambiarla.',
      'Se una segnalazione è stata controllata e va bene così (es. un simbolo scritto in modo diverso, componente giusto), premi "Va bene": non conta più tra gli errori, non va nel preventivo da validare e i componenti non sono più rossi nelle stampe. Resta anche dopo Rianalizza; "annulla" la riapre.',
    ],
    passi: ['Preventivi → Da documenti del cliente.', 'Scegli cliente e nome della scheda, carica i file (o lo zip, o la cartella).', 'Carica e analizza, poi controlla "Da controllare".', 'Crea il preventivo da validare (vedi sotto).'],
    pagine: [['/preventivi/documenti', 'Da documenti del cliente']],
  },
  {
    id: 'preventivo-da-validare', area: 'preventivi', titolo: 'Preventivo "da validare" compilato dai documenti',
    parole: 'validare validazione automatico compilato bozza controllare preventivo documenti piazzole case 0603 0805 ipc cicli lavorazione ciclo mail onda aoi etichette',
    testo: [
      'Nella pagina dei documenti della scheda, "Crea il preventivo da validare" (scrivi quante schede) prepara il preventivo con le tariffe di oggi e i numeri letti: SMD e feeder per lato, lamine, THT a onda o a mano, stagno, pasta, item.',
      'Il preventivo resta "da validare": in alto c\'è l\'elenco delle cose da controllare (segnalazioni, lamine del cliente, THT da preparare). Quando l\'hai controllato, il primo Salva lo porta a bozza.',
      'Se il prodotto non è ancora in anagrafica, codice, descrizione e revisione letti dai file sono già scritti nel riquadro "Nuovo prodotto": controllali e premi "Aggiungi in anagrafica".',
      'Se la mail del cliente elenca i cicli di lavorazione sotto il codice (es. "SALD ONDA THT", "MTG/SALD MANUALE COMP. THT", "ISP. VISIVA AOI SMT", "APPLICAZIONE ETICHETTE"), il preventivo accende le spunte onda, THT a mano, AOI, etichette, pulizia e lavaggio; le altre lavorazioni (preformatura, colla, cablaggi, parti meccaniche, rasatura) sono in "Da controllare" da stimare a mano.',
      'Il portale controlla anche le piazzole dei componenti chip sul Gerber con la norma IPC-7351: se la BOM dice 0603 ma le piazzole sono da 0805 (o il contrario) lo segnala come errore, prima di andare in macchina.',
    ],
    passi: ['Apri i documenti della scheda.', 'Scrivi il numero di schede e premi "Crea il preventivo da validare".', 'Controlla l\'elenco giallo, correggi, Salva.'],
    pagine: [['/preventivi/documenti', 'Da documenti del cliente'], ['/preventivi', 'Elenco preventivi']],
  },
  {
    id: 'documentazione-produzione', area: 'preventivi', titolo: 'Stampare la documentazione di montaggio (TOP, BOT, THT, protezioni onda)',
    parole: 'stampa documentazione montaggio produzione disegno layout riferimenti verso polarità piedino top bot tht colori protezioni onda fori zone proteggere critici note',
    testo: [
      'Dalla pagina dei documenti della scheda, "Documentazione per la produzione" stampa un foglio per lato: SMD TOP, SMD BOT (disegno con i riferimenti e la BOM del lato) e THT (solo i THT, stesso colore per i componenti uguali).',
      'Il punto blu è il piedino 1 (dal file CAD): con la serigrafia dice il verso di montaggio. In rosso i componenti con note del cliente o segnalazioni.',
      'Per l\'onda: "Segna le protezioni" sul disegno, clic su un foro per segnarlo da proteggere, trascina per una zona, poi Salva le protezioni; il foglio "Protezioni per l\'onda" le stampa numerate.',
    ],
    passi: ['Apri i documenti della scheda.', 'Per l\'onda: Segna le protezioni, clic sui fori o trascina le zone, Salva.', 'Premi il foglio che serve e poi "Stampa / salva PDF".'],
    pagine: [['/preventivi/documenti', 'Da documenti del cliente']],
  },
  {
    id: 'stampa-preventivo', area: 'preventivi', titolo: 'Stampare o mandare il preventivo al cliente',
    parole: 'stampa pdf mandare inviare cliente offerta salvare pdf versione essenziale dettaglio macro aree fasi firma accettazione condizioni generali sconto note riga aggiungere ritocchi modificare',
    testo: [
      'Dal preventivo salvato, "Stampa" apre la pagina per il cliente con i soli prezzi, impaginata come i preventivi di Fatture in Cloud: dati di Casteltech, destinatario con i dati fiscali, riquadro verde con i prezzi, tabella, pagamento e totale.',
      'A sinistra, nel riquadro "Cosa stampare", scegli la versione: Essenziale (codice, quantità e prezzo a scheda, senza dettaglio; se ci sono costi una tantum sono compresi nel prezzo a scheda e sotto la descrizione c\'è solo "Comprensivo dei costi una tantum"), Essenziale con dettaglio (componenti, PCB, SMD, THT, materiale di consumo e spedizione, ognuno con il prezzo), Macro aree o Dettaglio per fasi.',
      'Nella versione con dettaglio gestione materiale e imballaggio non si vedono: sono già dentro SMD e THT, 70% su SMD e 30% su THT, pesati sul valore delle due aree (con SMD 10 € e THT 90 € all\'SMD va circa il 21%).',
      'Le condizioni generali di fornitura sono sulla seconda pagina, con lo spazio per la firma del cliente per accettazione (senza condizioni la firma va in fondo alla prima pagina): si tolgono con le spunte del riquadro. Il modo di pagamento è quello del cliente in anagrafica.',
      'Le note del preventivo sono interne (mail del cliente, cose da controllare, appunti dell\'ufficio): non si stampano, salvo la spunta "Stampa anche le note interne".',
      'Sotto, nel riquadro "Ritocchi per il cliente", puoi scrivere le note per il cliente, uno sconto (in % su tutto, oppure in € tolto dal totale del lotto) e righe in più con descrizione, quantità e prezzo (es. collaudo, trasporto). Premi "Aggiorna la stampa": restano salvati sul preventivo. Valgono solo nella stampa, il calcolo del preventivo non cambia. Per togliere una riga cancella la descrizione.',
      'Premi "Stampa / salva PDF" e nella finestra di stampa scegli "Salva come PDF" per mandarlo via email.',
    ],
    passi: ['Salva il preventivo e premi Stampa.', 'A sinistra scegli la versione (Essenziale, con dettaglio, macro aree, fasi).', 'Se serve: note per il cliente, sconto, righe in più → Aggiorna la stampa.', 'Stampa / salva PDF.'],
    pagine: [['/preventivi', 'Elenco preventivi']],
  },
  {
    id: 'data-consegna', area: 'preventivi', titolo: 'Data di consegna da dare al cliente',
    parole: 'data consegna quando consegniamo tempi produzione settimana capacità produttiva gantt arrivo componenti pcb materiale stima promettere',
    testo: [
      'Dal preventivo salvato, "Data di consegna" stima quando si può consegnare: scrivi le date di arrivo dei componenti e del PCB (vuote se il materiale è già in casa) e premi Calcola.',
      'Il conto: la lavorazione parte 3 giorni lavorativi dopo l\'arrivo dell\'ultimo materiale; le ore di tempo ciclo del preventivo (1° lotto) occupano le ore libere di ogni giorno secondo il Gantt degli ordini aperti; alla fine della produzione si aggiungono 5 giorni lavorativi.',
      'Si lavora per settimane: la pagina propone il numero della settimana e il venerdì di quella settimana, da scrivere nell\'offerta.',
      'È una stima: la commessa entra nel Gantt solo quando arriva l\'ordine.',
    ],
    passi: ['Salva il preventivo.', 'Premi "Data di consegna".', 'Scrivi arrivo componenti e PCB, premi Calcola.', 'Riporta al cliente la settimana proposta.'],
    pagine: [['/preventivi', 'Elenco preventivi'], ['/ordini/gantt', 'Gantt']],
  },
  {
    id: 'azioni-preventivi', area: 'preventivi', titolo: 'Stati, duplicare, eliminare, creare la commessa',
    parole: 'stato bozza inviato accettato rifiutato archiviato duplica copia prezzi attuali elimina commessa azioni multiple',
    testo: [
      'Ogni preventivo ha uno stato: bozza, inviato, accettato, rifiutato, archiviato.',
      'Nell\'elenco puoi spuntare più preventivi e: creare la commessa, duplicare, eliminare.',
      '"Duplica" copia il preventivo con le tariffe di allora; "Duplica con prezzi attuali" lo rifà con tariffe e fasi di oggi.',
      'Un preventivo che ha già una commessa non si elimina.',
    ],
    pagine: [['/preventivi', 'Elenco preventivi']],
  },
  {
    id: 'bom-preventivo', area: 'preventivi', titolo: 'Costo dei componenti dal preventivo (BOM collegata)',
    parole: 'bom costo componenti acquisti materiali collegare prezzo componenti quotare quotata quotazione documenti cliente',
    testo: [
      'Nel gruppo ACQUISTI del preventivo puoi scegliere una BOM già caricata in Quotazioni: il costo dei componenti a scheda si ricalcola sulle schede del preventivo con le offerte già lette dai distributori.',
      'Se scrivi il costo a mano, il collegamento alla BOM si toglie. Se la BOM viene eliminata, il costo salvato resta.',
      'Preventivo nato dai documenti del cliente: spuntando "Componenti" in Acquisti la BOM del cliente va da sola in Quotazioni e si quota (codici e prezzi dei distributori). Finita la quotazione il costo a scheda arriva nel preventivo; se ci sono righe da completare, codici da validare, righe senza prezzo o componenti non disponibili compare "Risolvi nella BOM quotata".',
      'Nella BOM quotata il riquadro in alto dice cosa resta da sistemare; quando hai finito premi "Torna al preventivo per la quota": il costo si ricalcola, poi Salva.',
    ],
    pagine: [['/quotazioni', 'Quotazioni → BOM caricate']],
  },

  // ── Ordini ──
  {
    id: 'carica-ordine', area: 'ordini', titolo: 'Caricare un ordine del cliente (PDF, foto, email)',
    parole: 'ordine ordini carico caricare caricamento inserire nuovo file documenti pdf foto email eml acquisire da acquisire drive cartella ia leggere salvo dove',
    testo: [
      'Gli ordini non si scrivono a mano: si carica il file e l\'IA prepara una proposta. L\'ordine nasce solo quando la confermi.',
      'Due modi: caricare il file in Ordini → Da acquisire, oppure metterlo nella cartella Google Drive condivisa con il portale (si legge da sola ogni 15 minuti, lun–ven 8–20; il pulsante "Controlla adesso la cartella" non fa aspettare).',
      'Il cliente si sceglie SOLO dall\'anagrafica: se l\'IA legge un nome che non c\'è, scegli tu il cliente giusto e premi "Salva le correzioni", così i prodotti si ricollegano. Gli ordini arrivati per email prendono il numero dal 9001 in su.',
    ],
    passi: ['Ordini → Da acquisire.', 'Scegli il file (PDF, foto, email .eml, testo) e premi Carica e leggi.', 'Apri la proposta, controlla cliente, righe, prezzi e consegne.', 'Conferma e crea l\'ordine.'],
    pagine: [['/ordini/acquisire', 'Ordini → Da acquisire']],
  },
  {
    id: 'bozze-autosalvataggio', area: 'amministrazione', titolo: 'Le bozze si salvano da sole',
    parole: 'salvataggio automatico autosave bozza salva da sola modifiche non salvate ctrl s scorciatoia perso lavoro chiudere pagina',
    testo: [
      'Nelle bozze di fattura e nota di credito, DDT, conferma d\'ordine e ordine a fornitore non serve più premere Salva a ogni modifica: due secondi dopo l\'ultima cosa scritta la bozza si salva da sola, e accanto al pulsante Salva compare "Salvato alle 10:32".',
      'Se qualcosa non va (es. data non valida) compare in rosso "Non salvato: …" con il motivo: si corregge e si risalva. Il pulsante Salva funziona come prima e ricarica la pagina con i totali aggiornati; Ctrl+S (Cmd+S sul Mac) lo preme.',
      'Chiudendo la pagina con modifiche non ancora salvate il browser chiede conferma. I documenti già emessi non cambiano: il salvataggio automatico vale solo per le bozze (e per le conferme d\'ordine ancora modificabili).',
    ],
    pagine: [['/amministrazione/documenti', 'Documenti emessi'], ['/ordini/fornitori', 'Ordini a fornitore']],
  },
  {
    id: 'fatture-differite', area: 'amministrazione', titolo: 'Fatture differite: i DDT da fatturare entro il 15',
    parole: 'differita differite TD24 DDT da fatturare entro il 15 del mese dopo fattura tutti i DDT riepilogativa mensile promemoria scadenza bolla',
    testo: [
      'I DDT di vendita e reso lavorato emessi in un mese si fatturano entro il 15 del mese dopo (fattura differita, tipo TD24: il portale lo sceglie da solo all\'emissione quando la fattura cita DDT con data precedente).',
      'Amministrazione → Fatture differite mostra tutti i DDT emessi e non ancora fatturati, raggruppati per cliente, con il termine: giallo se scade in questo mese, rosso se è già passato. "Fattura tutti i DDT" prepara una bozza con le righe di tutti i DDT del cliente; "Fattura tutti i clienti in scadenza" ne prepara una per cliente.',
      'Il cruscotto generale lo ricorda in "Da fare oggi": giallo dal 1° del mese per i DDT del mese prima, rosso dal 16 se non sono ancora fatturati. Le bozze si controllano (prezzi, pagamento) e si emettono una per una.',
    ],
    passi: ['Amministrazione → Fatture differite (o il pulsante nel cruscotto).', 'Per un cliente: "Fattura tutti i DDT"; oppure in alto "Fattura tutti i clienti in scadenza".', 'Nella bozza controlla prezzi e pagamento, poi Emetti e Invia allo SdI.'],
    pagine: [['/amministrazione/differite', 'Fatture differite'], ['/amministrazione/documenti', 'Documenti emessi']],
  },
  {
    id: 'ddt-emessi', area: 'amministrazione', titolo: 'Fare un DDT e stamparlo',
    parole: 'ddt nuovo emettere fare bolla documento trasporto spedire spedizione stampare stampa pdf corriere vettore colli peso causale reso lavorato vendita annullare fatturare',
    testo: [
      'Il DDT si fa dal portale: dalla pagina dell\'ordine con "Crea DDT" (righe con le schede ancora da spedire, quantità e riferimento all\'ordine del cliente già scritti) oppure da Amministrazione → Documenti emessi → DDT → "+ Nuovo DDT".',
      'Causale, trasporto a cura, vettore e destinazione sono proposti dall\'ultimo DDT dello stesso cliente. Il prezzo delle righe non si stampa: serve quando si fattura il DDT.',
      'Con "Emetti" il DDT prende il numero successivo e non si modifica più. Si stampa con "Stampa / PDF" (due copie: una viaggia con la merce). Le righe venute dall\'ordine lo evadono da sole.',
      'Non si può emettere senza causale, "trasporto a cura del", righe con quantità e, se il trasporto è a cura del vettore, il nome del corriere.',
      'Se la merce non parte, "Annulla DDT": il numero resta usato e il DDT resta nell\'elenco come annullato. Un DDT già messo in una fattura non si annulla.',
      'Per fatturarlo: "Fattura questo DDT" prepara la fattura con le sue righe; si possono aggiungere altri DDT dello stesso cliente.',
    ],
    passi: ['Apri l\'ordine e premi Crea DDT (oppure + Nuovo DDT e scegli il cliente).', 'Controlla quantità, colli, peso, vettore e destinazione, poi Salva.', 'Premi Emetti.', 'Premi Stampa / PDF e stampa due copie.'],
    pagine: [['/amministrazione/documenti?tipo=ddt', 'DDT'], ['/ordini', 'Ordini']],
  },
  {
    id: 'conferma-ordine', area: 'ordini', titolo: 'Conferma d\'ordine al cliente (PDF e email)',
    parole: 'conferma confermare conferme ordine pdf email gmail rispondere risposta inviare mandare cliente date consegna righe accettazione',
    testo: [
      'Dall\'ordine caricato nel portale si prepara la conferma per il cliente: il pulsante "Conferma d\'ordine" in alto nella pagina dell\'ordine copia tutte le righe con quantità, prezzi e date di consegna.',
      'Righe e date si cambiano liberamente nella conferma (non toccano l\'ordine): si aggiungono righe con "+ Riga", si tolgono con la spunta "Togli". Le consegne a programma diventano una riga per ogni consegna.',
      'Per emettere serve una data di consegna su ogni riga. Emetti dà il numero (numerazione propria delle conferme) e salva il PDF, impaginato come i preventivi. Una conferma emessa si può ancora correggere: il PDF si rifà con lo stesso numero.',
      'Invio: se l\'ordine è arrivato per email, "Invia con Gmail" risponde a quell\'email (stessa conversazione) da info@casteltech.net con il PDF allegato; destinatario, oggetto e testo si possono cambiare. Finché la delega di Gmail non è attiva il pulsante è spento: scarica il PDF con "Apri il PDF" e mandalo dalla posta.',
      'Non si può preparare la conferma se il cliente dell\'ordine non è in anagrafica. Una bozza si elimina; una conferma emessa si annulla (resta nell\'elenco e il numero non si riusa).',
    ],
    passi: ['Apri l\'ordine (Ordini → Da evadere, clic sulla riga).', 'Premi "Conferma d\'ordine".', 'Controlla righe, prezzi e date di consegna, correggi e Salva.',
      'Premi Emetti.', 'Controlla destinatario e testo, poi "Invia con Gmail" (oppure "Apri il PDF" e mandalo a mano).'],
    pagine: [['/ordini', 'Ordini da evadere']],
  },
  {
    id: 'ordini-fornitore', area: 'ordini', titolo: 'Ordini a fornitore (componenti, PCB, lavorazioni)',
    parole: 'fornitore fornitori compera comprare comprato ordinare pcb componenti distributore mouser digikey farnell tme carrello arrivo arrivata arrivati merce',
    testo: [
      'Gli ordini che Casteltech fa ai fornitori stanno in Acquisti → Ordini a fornitore (prima si facevano in Fatture in Cloud). Il fornitore si sceglie solo dall\'anagrafica: se manca si aggiunge in Anagrafiche → Fornitori.',
      '"+ Nuovo ordine" crea una bozza: si scrivono le righe (codice del fornitore o P/N, descrizione, quantità, prezzo, consegna richiesta), la vostra offerta, il pagamento e la commessa per cui si compra. Scrivendo il P/N il menu propone i componenti dell\'archivio (Anagrafiche → Componenti): scegliendone uno arrivano descrizione e ultimo prezzo d\'acquisto. Emetti dà il numero (numerazione degli ordini a fornitore) e conserva il PDF; un ordine emesso si corregge ancora (il PDF si rifà con lo stesso numero), ma il fornitore non si cambia più.',
      'Dalla BOM quotata (Quotazioni → apri la BOM → "Ordina i componenti") il portale prepara una bozza per ogni distributore scelto (DigiKey, Mouser, Farnell, TME) con le quantità già comprensive dello scarto. Il pulsante del carrello scarica codice e quantità da usare sul sito del distributore.',
      'Quando arriva la merce si scrivono i pezzi arrivati riga per riga ("Tutto arrivato" se è completo): l\'ordine risulta da ricevere, arrivato in parte o arrivato. Quando arriva la fattura dallo SdI la si collega all\'ordine nel riquadro "Fattura del fornitore" (se il totale è diverso dall\'ordine il portale lo dice).',
      'L\'elenco mostra gli ordini da completare (bozze, merce da ricevere, fattura da collegare); "Tutti" mostra anche quelli finiti. Con le spunte: Duplica (stesse righe, nuova bozza) ed Elimina (le bozze spariscono, gli ordini emessi restano come annullati e il numero non si riusa).',
      'Il giorno del passaggio da Fatture in Cloud scrivi l\'ultimo numero di FIC in Impostazioni → Amministrazione → Numerazioni (Ordini a fornitore), altrimenti il primo ordine prende il n. 1: il portale lo ricorda con un avviso.',
    ],
    passi: ['Acquisti → Ordini a fornitore.', 'Scegli il fornitore e premi "+ Nuovo ordine" (o parti dalla BOM: "Ordina i componenti").', 'Scrivi le righe.',
      'Premi Emetti, poi "Invia con Gmail" o "Apri il PDF" e mandalo dalla posta.', 'Quando arriva la merce: scrivi i pezzi arrivati; poi collega la fattura.'],
    pagine: [['/ordini/fornitori', 'Ordini a fornitore'], ['/quotazioni', 'Quotazioni (BOM)']],
  },
  {
    id: 'ddt-acquisiti', area: 'ordini', titolo: 'DDT spediti: segnare la merce consegnata',
    parole: 'ddt spedizione spedito consegnato evaso parziale bolla documento trasporto',
    testo: [
      'I DDT di Casteltech in PDF si caricano come gli ordini (Da acquisire o cartella Drive). L\'IA li riconosce e abbina ogni riga alla riga d\'ordine aperta del cliente con lo stesso codice.',
      'Alla conferma le quantità si sommano allo spedito: quando tutto è spedito la riga risulta evasa.',
    ],
    pagine: [['/ordini/acquisire', 'Ordini → Da acquisire']],
  },
  {
    id: 'righe-evadere', area: 'ordini', titolo: 'Ordini da evadere, date e ritardi',
    parole: 'evadere evaso evasi parziale consegna consegnato data lavorazione prevista ritardo arrivo materiale stato note servizio servizi programmazione attrezzature lamina una tantum ddt fattura abbinati automatico aggiornare',
    testo: [
      'Una riga è evasa quando le schede spedite con DDT arrivano alla quantità ordinata, parziale se ne è partita una parte. Lo stato scritto dall\'ufficio vince sempre.',
      'I DDT che stanno nel portale (storico di Fatture in Cloud e, dopo il 10/11, quelli fatti nel portale) si abbinano da soli: ogni riga va alla riga d\'ordine aperta dello stesso cliente con lo stesso codice (o la stessa descrizione), prima agli ordini più vecchi. Nella pagina dell\'ordine sono sotto "Abbinati in automatico". Le fatture non contano: una fattura d\'anticipo non vuol dire merce consegnata.',
      'Le righe di servizio (programmazione attrezzature, lamine, attrezzaggio, costi una tantum o di avvio produzione, trasporto, sconti, acconti, prototipazione) non sono prodotti da evadere: sono evase quando sono fatturate o quando l\'ordine non ha più schede da spedire. Il portale le riconosce dalla descrizione, anche se nell\'ordine erano scritte come schede.',
      'Se una riga risulta ancora da evadere ma è stata consegnata (codice diverso nel DDT, consegna senza DDT), apri l\'ordine e scegli "evaso" nello Stato della riga, poi Salva; se è consegnato tutto l\'ordine, premi "Segna tutto evaso" in alto.',
      'Date: lavorazione = arrivo del materiale + 3 giorni; consegna prevista = lavorazione + 5 giorni + ritardi. Le date si possono scrivere a mano nell\'ordine.',
    ],
    pagine: [['/ordini', 'Ordini da evadere'], ['/ordini?vista=evasi', 'Ordini evasi']],
  },
  {
    id: 'cruscotto-ordini', area: 'ordini', titolo: 'Cruscotto ordini, previsione e Gantt',
    parole: 'cruscotto fatturato previsione anno mese gantt pianificazione produzione carico lavoro fatture senza ordine giornaliero settimana settimanale trimestre calendario',
    testo: [
      'Il cruscotto mostra fatturato, media dei mesi chiusi, ordini da evadere per mese e previsione dell\'anno.',
      'Il Gantt parte dalla data di consegna e va all\'indietro: ogni barra è una consegna da fare, lunga quanto le ore ciclo dell\'ultimo preventivo del prodotto diviso le ore al giorno (Impostazioni → Ordini).',
      'Il Gantt è a giorni e occupa tutta la larghezza dello schermo. In alto si sceglie il periodo: 1 mese (5 settimane, quello standard), Settimana o 3 mesi; parte sempre dal lunedì della settimana in corso. Le frecce ‹ › spostano avanti o indietro di un periodo, "Oggi" riporta alla settimana attuale.',
      'Cliccando una barra o un nome si apre l\'ordine. Le lavorazioni in ritardo già finite prima del periodo restano visibili come un piccolo segno rosso sul bordo sinistro.',
      '"Fatture senza ordine" elenca le fatture in cui nessuna riga è collegata a un ordine.',
    ],
    pagine: [['/ordini/cruscotto', 'Cruscotto'], ['/ordini/gantt', 'Gantt'], ['/ordini/fatture', 'Fatture senza ordine']],
  },

  // ── Commesse ──
  {
    id: 'crea-commessa', area: 'commesse', titolo: 'Creare una commessa e stampare la scheda di produzione',
    parole: 'commessa nuova creare scheda produzione stampa qr lotto masterspec fogli tempi',
    testo: [
      'Una commessa si crea da un preventivo: apri il preventivo e premi "Crea commessa" (o spunta il preventivo nell\'elenco). Le fasi del preventivo si ricalcolano sulla quantità del lotto.',
      'La scheda di produzione si stampa in 2 fogli fronte/retro: prima pagina come la MASTERspec, fasi in una tabella compatta, fogli tempi e il QR in alto a destra che il reparto inquadra con il telefono.',
      'La scheda tecnica (programmi, lamine, paste, programma forno, note) resta sulla revisione del prodotto e si ripropone ai lotti successivi. Le segnalazioni della produzione vanno nello storico del prodotto e si stampano sulle schede successive.',
    ],
    passi: ['Apri il preventivo accettato.', 'Crea commessa, controlla quantità e dati, salva.', 'Stampa scheda di produzione.'],
    pagine: [['/preventivi', 'Preventivi'], ['/commesse', 'Commesse']],
  },
  {
    id: 'rientro', area: 'commesse', titolo: 'Rientro della scheda compilata',
    parole: 'rientro scheda compilata tempi effettivi consumi spedizioni conferma errori avvisi chiudere commessa',
    testo: [
      'Quando la scheda torna in ufficio si apre la commessa → Rientro scheda: tempi per fase, materiale impiegato, spedizioni e segnalazioni.',
      'I controlli segnano errori (bloccano la conferma) e avvisi (non la bloccano). Con errori il rientro si può salvare ma non confermare.',
      'Dopo la conferma il pulsante "Crea DDT" (nel rientro e nella pagina della commessa) prepara la bolla già compilata: cliente, codice, le schede scritte nelle spedizioni (o tutta la commessa, meno quelle già partite), prezzo e riga dell\'ordine se la commessa spedisce un ordine. Si controlla e si emette; dal DDT emesso "Fattura questo DDT" prepara la fattura. Nella pagina della commessa restano i collegamenti a DDT e fatture.',
      'I tempi già segnati dal telefono sono già dentro. Dopo la conferma la scheda stampata si compila da sola con tempi effettivi e consumi a scheda. Una commessa già rientrata si può ancora correggere.',
    ],
    passi: ['Commesse → apri la commessa → Rientro scheda.', 'Controlla e completa le righe.', 'Salva e conferma rientro.'],
    pagine: [['/commesse', 'Commesse']],
  },

  // ── Reparto e tempi ──
  {
    id: 'telefono', area: 'reparto', titolo: 'Segnare i tempi dal telefono (QR)',
    parole: 'telefono tablet cellulare qr reparto operatore pin sigla tempo apri chiudi fase pezzi scarti produzione',
    testo: [
      'L\'operatore apre il portale sul telefono, entra con la sigla e il PIN (il telefono lo ricorda per 120 giorni), inquadra il QR della scheda e sceglie la fase.',
      'Poi può aprire il tempo (adesso o a un\'ora scritta) e chiuderlo a fine lavoro con i pezzi fatti, S/P e le note; oppure scrivere direttamente il tempo totale. Dal telefono si segue una fase per volta; sulla carta resta possibile "10+12".',
      'Fase aperta per sbaglio (tasto premuto due volte, fase sbagliata)? Nella pagina "Chiudi la fase" c\'è "Aperta per sbaglio: annulla l\'apertura": la riga sparisce senza lasciare un tempo finto. Un doppio tocco su "Apri il tempo" apre la fase una volta sola.',
    ],
    passi: ['Sul telefono: portale → reparto, sigla e PIN.', 'Inquadra il QR della scheda (o scrivi il numero della commessa).', 'Scegli la fase → Apri il tempo.', 'A fine lavoro: Chiudi la fase con i pezzi.'],
    pagine: [['/r', 'Pagine del reparto'], ['/impostazioni/operatori', 'PIN degli operatori']],
  },
  {
    id: 'tempi-scritti', area: 'reparto', titolo: 'Come si scrivono i tempi (ore e minuti)',
    parole: 'tempo ore minuti formato scrivere 1.30 1:30 orologio secondi',
    testo: [
      'I tempi si scrivono come sull\'orologio (base 60): 1.30, 1,30, 1:30 e "1h 30\'" sono tutti un\'ora e mezza. Un numero da solo sono minuti (o secondi se la casella è in secondi).',
      '"1.5" viene rifiutato perché non si capisce se è un\'ora e mezza o un\'ora e 5 minuti. Uscendo dalla casella il tempo si riscrive in modo leggibile.',
    ],
    pagine: [],
  },
  {
    id: 'tempi-dimenticati', area: 'reparto', titolo: 'Aggiungere tempi dimenticati o di pre-produzione',
    parole: 'aggiungi tempi dimenticati pre-produzione programmazione dopo rientro solo totale',
    testo: [
      'Nella pagina della commessa, "Aggiungi tempi" permette di inserire velocemente i tempi per fase, anche dopo il rientro: diventano righe "solo totale" (S) in fondo al foglio tempi, già confermate se la commessa è rientrata.',
    ],
    pagine: [['/commesse', 'Commesse']],
  },
  {
    id: 'schede-scansionate', area: 'reparto', titolo: 'Schede compilate a mano: scansione e lettura',
    parole: 'scansione scansionare scanner foto scheda carta fogli tempi drive cartella lettura ia',
    testo: [
      'Metti la scansione delle schede compilate nella cartella Google Drive condivisa con il portale (la stessa degli ordini). L\'IA riconosce la scheda dal numero di commessa stampato e legge i fogli tempi.',
      'Le righe lette si aggiungono in fondo al rientro della commessa, evidenziate: l\'ufficio controlla e salva. Quelle già presenti (es. dal telefono) non si ripetono.',
      'È ancora in prova: finora provata solo con letture simulate, serve la prova con scansioni vere.',
    ],
    pagine: [['/commesse', 'Commesse → Schede scansionate']],
  },
  {
    id: 'promemoria', area: 'reparto', titolo: 'Promemoria per le fasi lasciate aperte',
    parole: 'promemoria avviso notifica fase aperta dimenticata chiusura messaggio',
    testo: [
      'Se una fase aperta dal telefono dura più del doppio del previsto (almeno 30 minuti), alle 16:30 e il giorno lavorativo dopo l\'operatore riceve un promemoria con il link per chiuderla. Per ora i messaggi compaiono solo nel portale (SMS, WhatsApp o Telegram sono da scegliere).',
      'Gli orari si cambiano in Impostazioni → Promemoria, dove si vedono anche le fasi aperte adesso.',
    ],
    pagine: [['/impostazioni/promemoria', 'Impostazioni → Promemoria']],
  },
  {
    id: 'calendario-ritardi', area: 'reparto', titolo: 'Calendario dei ritardi in Google Calendar',
    parole: 'calendario google ritardo ritardi commessa commesse consegna scaduta in ritardo gantt sovraccarico capacità promemoria info avviso anticipo',
    testo: [
      'Il portale prepara un calendario con i promemoria delle lavorazioni a rischio: consegne scadute, lavorazioni che secondo il Gantt dovevano già partire o finire, un avviso 2 giorni lavorativi prima dell\'inizio di ogni lavorazione, i giorni con più ore di lavoro che ore disponibili, le commesse aperte oltre la data di consegna o oltre le ore del preventivo.',
      'Si aggiunge una volta sola in Google Calendar di info@ come calendario "Da URL": poi si aggiorna da solo (Google lo rilegge ogni qualche ora). Idea di Federico.',
      'L\'indirizzo contiene una chiave: non va dato fuori dall\'azienda. Se serve, "Crea un indirizzo nuovo" spegne il vecchio.',
    ],
    passi: ['Impostazioni → Promemoria → Calendario dei ritardi → "Crea l\'indirizzo del calendario".', 'Copia l\'indirizzo.',
      'Google Calendar (info@) → Altri calendari → + → Da URL → incolla → Aggiungi calendario.',
      'Per vedere subito cosa contiene: "Mostra cosa c\'è adesso nel calendario".'],
    pagine: [['/impostazioni/promemoria#calendario', 'Impostazioni → Promemoria → Calendario dei ritardi']],
  },

  // ── Quotazioni (ex Componenti) ──
  {
    id: 'codifica-bom', area: 'componenti', titolo: 'Codificare una BOM e trovare i prezzi',
    parole: 'quotazioni quotazione quotare componenti bom distinta codifica codici excel csv prezzi distributori digikey mouser farnell tme reperibilità acquisto scarto ia togliere riga sbagliata pulizia intestazione ripetuta pcb circuito stampato escluso esclusi',
    testo: [
      'Carica la BOM (Excel o CSV): il portale trova da solo intestazione e colonne, riconosce i componenti dal P/N o dalla descrizione, calcola il codice di produzione e il codice gestionale, e cerca prezzi e disponibilità da DigiKey, Mouser, Farnell e TME.',
      'Le quantità da comprare includono lo scarto (passivi sotto 0,10 € +10%, sotto 1 € +5%, da 1 a 3 € un pezzo in più). Si scarica un Excel con codifica e acquisti.',
      'Le righe "Da completare" vanno sistemate a mano; poi "Salva i codici nell\'archivio".',
      'Righe che non sono componenti: le intestazioni ripetute (BOM esportate a pagine) e le righe con una sola scritta (titoli, "Note:") si tolgono da sole al caricamento. Il circuito stampato (riferimento PCB/PWB, o descrizione "PCB", "circuito stampato", "bare board") resta nell\'elenco come escluso: non si cerca dai distributori e non entra nel costo, perché il PCB si quota a parte. Il riquadro in cima alla tabella dice quante righe sono escluse e il filtro "Esclusi" le mostra.',
      'Una riga entrata per sbaglio si toglie con "togli" in fondo alla riga: sparisce dalla BOM e i totali di acquisto si ricalcolano (il file caricato non cambia).',
    ],
    passi: ['Quotazioni → Carica una BOM.', 'Controlla colonne e quantità.', 'Sistema le righe da completare.', 'Salva i codici nell\'archivio, scarica l\'Excel.'],
    pagine: [['/quotazioni', 'Quotazioni']],
  },
  {
    id: 'alternative-componenti', area: 'componenti', titolo: 'Componente non trovato: alternative e reperibilità',
    parole: 'alternativa alternative equivalente sostituto prezzo a mano manuale scrivere prezzo p/n non trovato introvabile critico reperibilità disponibile negozi distributori obsoleto due codici diversi valore descrizione kicad equivalenti',
    testo: [
      'Ogni P/N si cerca presso TUTTI i distributori collegati (DigiKey, Mouser, Farnell, TME). Se uno non lo ha ma un altro sì, va bene: nessuna segnalazione, si compra da chi lo ha al prezzo migliore.',
      'Prima si cerca chi ha tutti i pezzi che servono, poi il prezzo: un componente disponibile costa anche di più, ma si compra quello.',
      'BOM senza colonna P/N (es. KiCad): il codice si cerca nelle colonne Valore e Descrizione ("1N5819S4/SOD123" → 1N5819S4). Se nella riga ci sono due codici diversi si cercano tutti e due e si compra quello che si trova. La nota della riga dice se sono lo stesso codice (BAT54C e BAT54C,215), lo stesso componente di produttori diversi (1N5819S4 e 1N5819HW-7-F: equivalenti) oppure due componenti diversi da controllare ("codice da validare").',
      'Il portale confronta anche quello che è scritto nella BOM con quello che dice il codice: valore, case e tensione diversi (es. BOM 168K, codice RC0805FR-07162KL = 162K; BOM 1nF 630V 1206, codice da 4,7 µF 50V 1210) rendono la riga "codice da validare". Tensione più alta o tolleranza più stretta nel codice vanno bene. Le righe DNP o "Excluded from BOM" non si comprano.',
      '"Critico" solo se il componente non è disponibile da nessuna parte (non trovato o pezzi insufficienti sommando tutti). "Attenzione" solo se la quantità c\'è ma va divisa tra più distributori, o se un distributore non ha risposto (premi "Aggiorna prezzi"). Fine vita, scorte basse e simili restano come note nella riga, senza segnalazione.',
      'Per un P/N che non si trova il portale cerca da solo le alternative: varianti dello stesso P/N (confezione o suffisso diverso) e componenti con le stesse caratteristiche, cioè con lo stesso codice di produzione (es. stessa resistenza 2K2 1% 0603 100 mW di un altro produttore). Ognuna è prezzata presso tutti i distributori.',
      'La scelta è dell\'operatore: nella riga della BOM, riquadro "Alternative", "Usa questa" la fa diventare il componente da comprare (prezzo e reperibilità si ricalcolano). Nel campo "Alternativa scritta a mano" puoi scrivere un P/N tuo: si cerca presso tutti i distributori e, se si trova, si usa. "Torna al P/N della BOM" annulla la scelta.',
      'Le caratteristiche identiche si controllano solo per i componenti il cui codice dice tutto (resistenze, condensatori, induttanze, LED, quarzi…). Per integrati, connettori e simili il portale propone solo le varianti dello stesso P/N: un sostituto va scelto a mano ed è segnato "da controllare".',
      'Le alternative scritte a mano e quella scelta restano anche dopo Rielabora o Aggiorna prezzi; nell\'Excel degli acquisti la riga mostra "P/N → alternativa".',
      'Prezzo a mano: nella riga della BOM, sotto Acquisto, scrivi il prezzo €/pz (es. 0,125) e "Salva prezzo": vale al posto di quello proposto dai distributori, anche per un componente non trovato, e lo scarto si calcola su quel prezzo. Nell\'elenco compare "prezzo a mano". "Torna al prezzo proposto" lo toglie. Resta anche dopo Rielabora.',
    ],
    passi: ['Quotazioni → apri la BOM.', 'Filtro "Reperibilità" o link "N alternative: scegli" nella colonna P/N.', 'Nella riga: "Usa questa" oppure scrivi un P/N in "Alternativa scritta a mano".', 'Se la BOM è di un preventivo: "Torna al preventivo per la quota".'],
    pagine: [['/quotazioni', 'Quotazioni → BOM caricate']],
  },
  {
    id: 'miglior-prezzo', area: 'componenti', titolo: 'Miglior prezzo di un P/N tra gli shop online',
    parole: 'miglior prezzo conveniente economico confronto confrontare shop negozi online distributori digikey mouser farnell tme lcsc p/n singolo costa comprare',
    testo: [
      'Per sapere dove conviene comprare un componente: scrivi il P/N del produttore e quanti pezzi servono. Il portale chiede prezzo e disponibilità a tutti gli shop collegati (DigiKey, Mouser, Farnell, TME) e li mette uno sotto l\'altro.',
      'In cima, in verde, c\'è il più conveniente sul totale da pagare: tiene conto del minimo d\'ordine, dei multipli e degli scaglioni (a volte comprare qualche pezzo in più costa meno). Per gli altri la colonna "In più" dice quanto si spenderebbe in più. Uno shop senza pezzi sufficienti va in fondo.',
      'Le risposte restano in memoria 24 ore; "Aggiorna prezzi" le richiede di nuovo. LCSC non è ancora collegato: "Cerca su LCSC" apre il loro sito con lo stesso P/N.',
    ],
    passi: ['Quotazioni → Miglior prezzo di un P/N.', 'Scrivi P/N e pezzi, premi "Cerca il prezzo".', 'Il codice dello shop apre la pagina del prodotto per ordinarlo.'],
    pagine: [['/quotazioni/prezzo', 'Quotazioni → Miglior prezzo di un P/N']],
  },
  {
    id: 'codifica-singola', area: 'componenti', titolo: 'Codificare un solo componente',
    parole: 'codifica singolo componente p/n codice resistenza condensatore',
    testo: [
      'Per un componente solo: scrivi il P/N del produttore (o, se non c\'è, la descrizione tipo "RES 2K2 0603") e il portale dà i codici. Le resistenze sono sempre all\'1% (quelle al 5% non si comprano).',
    ],
    pagine: [['/quotazioni/codifica', 'Quotazioni → Codifica']],
  },

  // ── CRM ──
  {
    id: 'crm-aziende', area: 'crm', titolo: 'Cercare un\'azienda e registrare un contatto',
    parole: 'crm azienda contatto telefonata email visita offerta fiera nota attività prossima azione richiamare referente lead commerciale',
    testo: [
      'La ricerca trova per nome, città, referenti, telefoni, email e P.IVA. Nella scheda dell\'azienda ci sono recapiti, referenti e lo storico delle attività.',
      'Ogni attività (telefonata, email, visita, offerta, fiera, nota) può avere una prossima azione con data: quelle scadute compaiono in rosso nella prima pagina del CRM.',
      'Le aziende del CRM non sono l\'anagrafica: i clienti dell\'anagrafica entrano nel CRM da soli (con la fascia di fatturato), le altre aziende sono contatti commerciali. Un cliente in anagrafica non si elimina dal CRM.',
    ],
    passi: ['CRM → cerca l\'azienda (o scrivila in "Nuova azienda").', 'Nella scheda: Registra un\'attività con la prossima azione.'],
    pagine: [['/crm', 'CRM']],
  },

  // ── Amministrazione ──
  {
    id: 'nuova-fattura', area: 'amministrazione', titolo: 'Fare una fattura',
    parole: 'fattura fatturare emettere nuova xml fatturapa sdi elettronica ddt numero bozza iva pdf cortesia copia stampa codice menu tendina riga righe',
    testo: [
      'Il PDF per il cliente: "PDF di cortesia" sulla fattura o nota di credito emessa (in bozza "Anteprima di stampa", con la scritta BOZZA) apre la copia da stampare o salvare in PDF con "Stampa / salva PDF". La fattura valida resta l\'XML mandato allo SdI: lo dice il piede del PDF.',
      'La fattura nasce come bozza: cliente dall\'anagrafica, righe, e i DDT ancora da fatturare di quel cliente si aggiungono con un clic (solo DDT già emessi). I DDT di resi non lavorati, riparazioni in garanzia, conto visione o conto lavorazione di solito non si fatturano: stanno a parte sotto "Altri DDT senza fattura" e non contano nel numero "DDT da fatturare" del cruscotto. L\'IVA predefinita è quella del cliente (lettera d\'intento, estero…) o il 22%; all\'emissione resta scritta sulle righe, così la copia di cortesia e le note di credito future non cambiano se cambia l\'IVA del cliente.',
      'Nelle righe il Codice si sceglie dal menu, che mostra solo i prodotti di quel cliente in anagrafica: la descrizione e il prezzo per la quantità arrivano da soli. Se il prodotto non c\'è, scegli "+ Nuovo prodotto…" in fondo al menu: scrivi codice e descrizione e va subito in anagrafica. Per una riga senza codice (trasporto, servizi) scegli "— senza codice —" e scrivi la descrizione. Vale anche per note di credito e di debito, DDT e conferme d\'ordine.',
      'Con "Emetti" il portale assegna il numero, calcola la scadenza dalla condizione di pagamento, prepara l\'XML della fattura elettronica e segna i DDT come fatturati. Se ci sono errori non si emette e il numero non si consuma.',
      'Prima di emettere puoi scaricare l\'"XML di prova" (numero 0) per controllarlo. Il PDF della fattura è in preparazione.',
    ],
    passi: ['Amministrazione → + Nuova fattura.', 'Cliente, righe, DDT da fatturare.', 'Salva e controlla gli avvisi.', 'Emetti.', 'Invia allo SdI.'],
    pagine: [['/amministrazione/documenti/nuovo?tipo=fattura', 'Nuova fattura'], ['/amministrazione/documenti', 'Documenti emessi']],
  },
  {
    id: 'invio-sdi', area: 'amministrazione', titolo: 'Mandare la fattura allo SdI ed esiti',
    parole: 'sdi invio inviare mandare invoicetronic esito consegnata scartata scarto ricevuta notifica cassetto fiscale recapito agenzia entrate',
    testo: [
      'Dopo "Emetti", nella pagina della fattura (anche nota di credito o autofattura) premi "Invia allo SdI": il portale manda l\'XML a Invoicetronic, che lo passa allo SdI.',
      'L\'esito arriva da solo, di solito in pochi minuti: "Consegnata" va bene; "Non recapitata" vuol dire che la fattura è valida ma è nell\'area riservata del cliente sul sito dell\'Agenzia: avvisa il cliente. Se tarda, premi "Aggiorna esito".',
      '"Scartata" vuol dire che per lo SdI la fattura non esiste: premi "Correggi", sistema righe o dati del cliente in anagrafica, poi "Emetti" (stesso numero e stessa data) e "Rimanda allo SdI", entro 5 giorni.',
      'Con la chiave di prova di Invoicetronic il pulsante è "Prova l\'invio", anche sulle bozze: niente arriva allo SdI e gli esiti sono simulati. Chiave, crediti e collegamento degli esiti sono in Impostazioni → Amministrazione.',
      'Non si può rimandare un documento già consegnato o in attesa di esito, né mandare una bozza con la chiave reale.',
    ],
    passi: ['Emetti il documento.', 'Invia allo SdI.', 'Controlla l\'esito nel riquadro SdI.'],
    pagine: [['/amministrazione/documenti', 'Documenti emessi'], ['/impostazioni/amministrazione#sdi', 'Impostazioni → Invio allo SdI']],
  },
  {
    id: 'nota-credito', area: 'amministrazione', titolo: 'Stornare una fattura (nota di credito)',
    parole: 'nota credito storno stornare annullare fattura sbagliata errore',
    testo: ['Una fattura emessa non si elimina: si apre la fattura e si preme "Crea nota di credito". Righe e collegamento alla fattura si compilano da soli.'],
    pagine: [['/amministrazione/documenti', 'Documenti emessi']],
  },
  {
    id: 'azioni-documenti', area: 'amministrazione', titolo: 'Più documenti insieme: spunte nell\'elenco (elimina, XML, Excel, incassi)',
    parole: 'spunta spunte casella selezionare tutti elimina eliminare cancellare bozza bozze scarica xml zip excel incassate incassare incasso duplica copia annulla ddt fatturare piu insieme elenco',
    testo: [
      'In Amministrazione → Documenti emessi (Fatture, Note di credito, Autofatture, DDT) ogni riga ha una casella a sinistra: spunta i documenti (la casella in alto li spunta tutti) e usa i pulsanti in alto a destra.',
      'Elimina toglie solo le bozze: un documento emesso non si elimina mai (la numerazione non deve avere buchi). Una fattura emessa si storna con "Crea nota di credito", un DDT emesso che non è partito si annulla con "Annulla DDT" (il numero resta usato). Il portale dice quali righe spuntate non ha toccato e perché.',
      'Fatture: "Stampa / PDF" e "Duplica" (copia come bozza di oggi, senza DDT e acconti) e "Crea nota di credito" valgono per un documento alla volta; "Scarica XML" (più di uno: file zip), "Excel" e "Segna incassate" per quanti ne spunti. "Segna incassate" apre una pagina con le rate ancora aperte: scegli data e modo di pagamento (e la banca) e conferma.',
      'DDT: "Fattura i DDT" prepara una fattura con tutti i DDT emessi spuntati, se sono dello stesso cliente.',
    ],
    passi: ['Amministrazione → Documenti emessi → scegli il tipo.', 'Spunta le righe.', 'Premi il pulsante in alto a destra.'],
    pagine: [['/amministrazione/documenti?tipo=fattura', 'Fatture'], ['/amministrazione/documenti?tipo=ddt', 'DDT']],
  },
  {
    id: 'tipi-fattura', area: 'amministrazione', titolo: 'Fattura differita, acconto, nota di debito, beni ammortizzabili',
    parole: 'td24 differita td02 acconto anticipo saldo scalare td05 nota debito aumentare td26 beni ammortizzabili macchinario usato cespite tipo documento',
    testo: [
      'Fattura differita (TD24): se la fattura contiene DDT con data precedente, il portale la manda da solo come differita. Va emessa entro il 15 del mese dopo il DDT: la data limite è scritta sotto il tipo di fattura.',
      'Fattura d\'acconto (TD02): dalla pagina dell\'ordine "Fattura d\'acconto" prepara la bozza con il riferimento dell\'ordine; scrivi l\'importo dell\'anticipo ed emetti. Sulla fattura di saldo dello stesso cliente compare "Fatture d\'acconto da scalare": scegli l\'acconto e "Scala gli acconti" aggiunge la riga negativa e collega le fatture nell\'XML.',
      'Nota di debito (TD05): per aumentare l\'importo di una fattura già emessa (costi dimenticati, adeguamenti) apri la fattura e premi "Crea nota di debito"; scrivi le righe in più ed emetti. Prende il numero delle fatture.',
      'Cessione di beni ammortizzabili (TD26): quando vendi un macchinario o un\'attrezzatura dell\'azienda scegli questo tipo nel menu "Tipo di fattura" della bozza.',
    ],
    passi: ['Apri la bozza della fattura.', 'Controlla "Tipo di fattura" (TD24 è automatico).', 'Per acconto o nota di debito parti dall\'ordine o dalla fattura.', 'Emetti.'],
    pagine: [['/amministrazione/documenti?tipo=fattura', 'Fatture'], ['/ordini', 'Ordini']],
  },
  {
    id: 'pubblica-amministrazione', area: 'amministrazione', titolo: 'Fatture alla pubblica amministrazione (INFN, enti, split payment)',
    parole: 'pubblica amministrazione pa ente infn universita comune fpa12 codice ufficio univoco ipa cig cup split payment scissione pagamenti 17-ter',
    testo: [
      'Prima una volta sola: Anagrafiche → Clienti → "Dati fiscali" del cliente. Spunta "Pubblica amministrazione", scrivi il codice univoco dell\'ufficio (6 caratteri, è sull\'ordine o su indicepa.gov.it) e il codice fiscale dell\'ente; spunta "Split payment" se l\'ordine lo dice (quasi sempre).',
      'Nella fattura scrivi numero e data dell\'ordine e il CIG (10 caratteri, sull\'ordine); il CUP solo se c\'è. Senza CIG o numero d\'ordine il portale non la emette, perché la PA la rifiuterebbe.',
      'Con lo split payment l\'IVA è in fattura ma non la paga a noi: il cliente versa all\'Erario l\'IVA e a noi paga solo imponibile e bollo. Scadenza e PDF di cortesia mostrano il "netto da pagare".',
      'L\'XML parte nel formato FPA12; si manda allo SdI come le altre fatture.',
    ],
    passi: ['Dati fiscali del cliente: PA, codice ufficio, split payment.', 'Fattura: numero e data dell\'ordine, CIG.', 'Emetti e invia allo SdI.'],
    pagine: [['/anagrafiche/clienti', 'Anagrafiche → Clienti'], ['/amministrazione/documenti?tipo=fattura', 'Fatture']],
  },
  {
    id: 'ritenute-fornitori', area: 'amministrazione', titolo: 'Fatture di consulenti con ritenuta d\'acconto e cassa',
    parole: 'ritenuta acconto professionista consulente commercialista avvocato notaio cassa previdenziale rivalsa inps f24 1040 netto',
    testo: [
      'Le fatture di professionisti e consulenti arrivano dallo SdI con la ritenuta d\'acconto e a volte la cassa previdenziale o la rivalsa INPS: il portale le legge da sole.',
      'Nella fattura del fornitore vedi il totale, la ritenuta e il "netto da pagare": al fornitore si paga il netto; la ritenuta la versa Casteltech con F24 (codice tributo 1040 per i professionisti) entro il 16 del mese dopo il pagamento. Quando segni pagata la rata, il portale scrive la data dell\'F24.',
    ],
    pagine: [['/amministrazione/ricevuti', 'Fatture fornitori']],
  },
  {
    id: 'incassi-pagamenti', area: 'amministrazione', titolo: 'Incassi, pagamenti e fatture dei fornitori',
    parole: 'incasso incassato pagamento pagato scadenza scadute rata banca fornitori ricevute passive cruscotto da pagare arrivate sdi scarica xml p7m',
    testo: [
      'Il cruscotto di Amministrazione mostra fatturato e acquisti dell\'anno rispetto all\'anno prima, incassi e pagamenti aperti per urgenza (scadute, entro 7 giorni, entro 30, oltre), DDT da fatturare e bozze da finire.',
      'Ogni rata, delle fatture emesse e di quelle dei fornitori, si segna incassata o pagata con la data, il modo di pagamento (bonifico, Ri.Ba., bancomat, carta di credito, PayPal, compensato con fattura, stornato) e, se serve, la banca o il conto (es. Bper). Le fatture dei fornitori sono in "Fatture fornitori", con il filtro "Solo da pagare"; sotto il filtro il riquadro rosso "Scadute da pagare" elenca sempre, di tutti gli anni, le fatture con rate già scadute e non pagate, la più vecchia in cima.',
      "Le fatture dei fornitori arrivano da sole dallo SdI (Invoicetronic): con gli esiti collegati in Impostazioni → Amministrazione → Invio allo SdI entrano appena arrivano, oppure si prendono con \"Scarica dallo SdI\" in Fatture fornitori. Il fornitore si cerca per P.IVA (se è nuovo si aggiunge all'anagrafica con nota DA VERIFICARE), le scadenze arrivano dalla fattura; quelle già caricate da Fatture in Cloud e le copie delle nostre autofatture non si ripetono.",
    ],
    pagine: [['/amministrazione', 'Cruscotto amministrazione'], ['/amministrazione/ricevuti?da_pagare=1', 'Fatture fornitori da pagare']],
  },
  {
    id: 'impostazioni-amministrazione', area: 'amministrazione', titolo: 'Numerazioni, IVA, pagamenti e dati fiscali dei clienti',
    parole: 'numerazione sezionale aliquote iva natura bollo condizioni pagamento giorni fine mese dati fiscali sdi pec lettera intento azienda',
    testo: [
      'I dati fiscali di un cliente (indirizzo, P.IVA, codice SDI, PEC, pubblica amministrazione, split payment, IVA e pagamento predefiniti) si correggono da Anagrafiche → Clienti → "Dati fiscali".',
      'In Impostazioni → Amministrazione: dati dell\'azienda, ultimo numero usato per ogni serie (il numero si assegna solo all\'emissione), aliquote e nature IVA (bollo di 2 € oltre 77,47 €), condizioni di pagamento (es. 60 gg fine mese) e dati fiscali dei clienti con le lettere d\'intento.',
    ],
    pagine: [['/impostazioni/amministrazione', 'Impostazioni → Amministrazione']],
  },
  {
    id: 'registri-iva', area: 'amministrazione', titolo: 'Registri IVA, liquidazione e file per il commercialista',
    parole: 'registro registri iva vendite acquisti liquidazione mensile versare versamento f24 codice tributo 6001 scadenza 16 credito debito commercialista trimestre mese export excel zip xml protocollo riepilogo aliquota',
    testo: [
      'In Amministrazione → Registri IVA scegli anno e periodo (mese, trimestre o anno intero). Il portale mette insieme le fatture e le note di credito emesse (anche lo storico di Fatture in Cloud), le autofatture e le fatture dei fornitori con data nel periodo. Le note di credito sono in negativo; bozze, documenti annullati e scartati dallo SdI non entrano.',
      'Casteltech liquida l\'IVA ogni mese: la pagina si apre sul mese da versare (fino al 16 quello prima, poi il mese in corso). In alto IVA a debito, IVA a credito e quanto versare entro il 16 del mese dopo (luglio: 20 agosto; sabato e domenica si passa al lunedì) con il codice tributo dell\'F24: 6001 gennaio … 6012 dicembre.',
      'Il credito passa da un mese all\'altro; se l\'IVA del mese è sotto 25,82 € non si versa e si somma al mese dopo. In "Liquidazioni mensili" c\'è tutto l\'anno da gennaio; lì si scrive il credito IVA dell\'anno prima (dalla dichiarazione IVA). Restano al commercialista l\'acconto di dicembre (27/12, codice 6013), l\'IVA non detraibile e le compensazioni.',
      'Le spese senza fattura elettronica e senza IVA (scontrini, affitto da un privato, polizze) non entrano nel registro IVA.',
      'Sotto: il riepilogo per aliquota o natura (22 %, N3.5 lettera d\'intento, N3.2 cessioni UE…) e l\'elenco dei documenti di ogni registro. Il riepilogo di ogni fattura si legge dal suo file XML; per lo storico senza file dalle righe. Le fatture dei fornitori hanno il protocollo: progressivo nell\'anno in ordine di data.',
      'L\'IVA delle autofatture (reverse charge TD16–TD19) va sia a debito sia a credito, quindi nella liquidazione si annulla. L\'IVA delle fatture alla pubblica amministrazione in split payment è nel registro (voce "split payment") ma non va a debito: la versa l\'ente.',
      '"Da controllare" segnala numeri mancanti nella numerazione delle fatture, fatture scartate dallo SdI da rimandare, bozze con data nel periodo e documenti con il riepilogo che non torna.',
      'Per il commercialista: "Excel dei registri" (un foglio per registro, riepilogo IVA, liquidazione, cose da controllare) oppure "Pacchetto per il commercialista", uno zip con l\'Excel e tutti i file XML delle fatture emesse e ricevute del periodo. "Stampa" la stampa o la salva in PDF.',
    ],
    passi: ['Amministrazione → Registri IVA (si apre sul mese da versare).', 'Per un altro mese scegli anno e periodo e premi Mostra.', 'Guarda "Da controllare" e sistema quello che serve.', 'Scarica il pacchetto zip e mandalo al commercialista.'],
    pagine: [['/amministrazione/registri', 'Registri IVA']],
  },
  {
    id: 'accesso-contabilita', area: 'amministrazione', titolo: 'Accesso del commercialista (sola lettura)',
    parole: 'commercialista contabilita contabile consulente sonia hts utente accesso password sola lettura profilo vedere consultare',
    testo: [
      'Il commercialista e chi aiuta con la contabilità (es. Sonia di HTS) possono entrare nel portale con il profilo "Contabilità (sola lettura)": vedono tutta l\'Amministrazione (cruscotto, documenti emessi, fatture fornitori, acquisti del mese, registri IVA, controllo VIES), scaricano Excel, file XML e stampe, leggono la Guida.',
      'Non possono modificare nulla: niente bozze, emissioni, invii allo SdI, pagamenti segnati. I pulsanti che modificano non compaiono e il portale rifiuta comunque ogni modifica. Le altre sezioni (preventivi, commesse, ordini, impostazioni…) non le vedono.',
      'L\'utente lo crea l\'ufficio in Impostazioni → Utenti: nome, email, profilo "Contabilità (sola lettura)" e una password di almeno 10 caratteri da comunicare alla persona. Per bloccare l\'accesso si toglie la spunta Attivo.',
    ],
    passi: ['Impostazioni → Utenti.', 'Nell\'ultima riga scrivi nome ed email, scegli "Contabilità (sola lettura)" e una password.', 'Premi Aggiungi e manda indirizzo del portale, email e password alla persona.'],
    pagine: [['/impostazioni/utenti', 'Impostazioni → Utenti']],
  },
  {
    id: 'acquisti-mese', area: 'amministrazione', titolo: 'Acquisti per fornitore e mese (cosa ho comprato)',
    parole: 'acquisti comprato comprati spesa spese mese mensile fornitore fornitori mouser digikey anthropic online traccia riepilogo',
    testo: [
      'In Acquisti → Acquisti per fornitore e mese (o dal link in Fatture fornitori) c\'è una tabella con i fornitori sulle righe e i mesi sulle colonne: l\'imponibile delle fatture ricevute, note di credito in negativo, fornitori dal più grande.',
      'Cliccando un importo si vedono le fatture di quel fornitore in quel mese con la descrizione; per i fornitori esteri (Mouser, DigiKey, Anthropic…) anche gli articoli scritti nell\'autofattura, e l\'ordine a fornitore collegato se c\'è. Non serve più fare l\'ordine dopo la fattura solo per tenerne traccia, come si faceva in Fatture in Cloud.',
    ],
    pagine: [['/amministrazione/ricevuti/mesi', 'Acquisti per fornitore e mese']],
  },
  {
    id: 'spese-non-elettroniche', area: 'amministrazione', titolo: 'Spese senza fattura elettronica (scontrini, affitto, polizze)',
    parole: 'spesa spese scontrino scontrini ricevuta affitto canone polizza assicurazione banca bancarie imposte tasse valori bollati francobolli fattura cartacea carta senza fattura elettronica non elettronica registrare',
    testo: [
      'Le spese che non arrivano dallo SdI si registrano in Amministrazione → Spese senza fattura elettronica (o da Fatture fornitori, "+ Spesa senza fattura elettronica"): data, tipo (scontrino, affitto, polizza, spese bancarie, imposte e tasse, valori bollati, fattura cartacea, altro), a chi, totale, descrizione, se è già pagata con data e conto.',
      'Finiscono tra le fatture fornitori con la scritta "non elettronica": contano nello scadenzario, negli acquisti per mese e nell\'Analisi. Non entrano nel registro IVA: uno scontrino o un affitto da privato non danno IVA da detrarre. Solo per una "Fattura cartacea" con l\'IVA si scrive anche l\'IVA.',
      'Una spesa scritta per errore si elimina dalla stessa pagina (Elimina) o dal suo dettaglio.',
    ],
    passi: ['Amministrazione → Spese senza fattura elettronica.', 'Compila data, tipo, a chi e totale.', 'Registra la spesa.'],
    pagine: [['/amministrazione/spese', 'Spese senza fattura elettronica']],
  },
  {
    id: 'bollo-virtuale', area: 'amministrazione', titolo: 'Bollo virtuale sulle fatture: importo e scadenze',
    parole: 'bollo bolli virtuale 2 euro marca da bollo trimestre trimestrale f24 codice tributo 2521 2522 2523 2524 scadenza versare 77,47',
    testo: [
      'Sulle fatture senza IVA oltre 77,47 € (es. lettera d\'intento) c\'è il bollo da 2 €, che il portale mette da solo. Si versa con l\'F24 ogni trimestre.',
      'Amministrazione → Bollo virtuale mostra per ogni trimestre quante fatture, l\'importo, il codice tributo (2521 primo trimestre, 2522, 2523, 2524) e la scadenza: 31 maggio, 30 settembre, 30 novembre e l\'ultimo giorno di febbraio dell\'anno dopo (sabato e domenica si passa al lunedì).',
      'Se il primo trimestre è sotto 5.000 € si versa con il secondo (30 settembre); se primo e secondo insieme sono sotto 5.000 € tutti e due si versano entro il 30 novembre, ognuno con il suo codice. L\'Agenzia mette l\'importo già calcolato nel portale Fatture e corrispettivi: questa pagina serve a controllarlo.',
    ],
    passi: ['Amministrazione → Bollo virtuale.', 'Controlla l\'importo del trimestre con quello del portale dell\'Agenzia.', 'Versa con l\'F24 entro la data indicata.'],
    pagine: [['/amministrazione/bollo', 'Bollo virtuale']],
  },
  {
    id: 'lettere-intento', area: 'amministrazione', titolo: 'Lettere d\'intento e plafond',
    parole: 'lettera lettere intento dichiarazione esportatore abituale plafond n3.5 senza iva limite massimo protocollo residuo superato integrativa',
    testo: [
      'Un cliente esportatore abituale manda la lettera d\'intento con il protocollo dell\'Agenzia e l\'importo massimo (plafond) che può comprare senza IVA. Si registra in Anagrafiche → Clienti → Dati fiscali, riquadro "Lettere d\'intento": protocollo, data e plafond; il plafond si può correggere dopo.',
      'Il portale somma le fatture senza IVA per lettera d\'intento (natura N3.5) dell\'anno, dalla data della lettera, meno le note di credito. Nella bozza di fattura avvisa quanto resta con quella fattura; dall\'80 % in giallo, oltre il plafond in rosso: la parte oltre va con l\'IVA, salvo una nuova lettera.',
      'Amministrazione → Lettere d\'intento elenca tutti i clienti con lettera dell\'anno, prima quelli oltre il plafond o vicini al limite. Una lettera già citata in fatture emesse non si elimina.',
    ],
    passi: ['Anagrafiche → Clienti → Dati fiscali del cliente.', 'In "Lettere d\'intento" scrivi protocollo, data e plafond e premi Aggiungi lettera.'],
    pagine: [['/amministrazione/lettere-intento', 'Lettere d\'intento'], ['/anagrafiche/clienti', 'Clienti']],
  },
  {
    id: 'analisi', area: 'amministrazione', titolo: 'Analisi: andamento, clienti, prodotti e consigli',
    parole: 'analisi andamento trend fatturato calo crescita confronto anno prima margine margini cliente clienti prodotto prodotti concentrazione dipendenza incasso incassi giorni ritardo pagano consigli commenti previsione bilancio come sta andando azienda',
    testo: [
      'In Amministrazione → Analisi c\'è come sta andando l\'azienda, dal 1° gennaio a oggi confrontato con lo stesso periodo dell\'anno prima (per gli anni passati l\'anno intero). Usa le fatture emesse e ricevute, anche lo storico di Fatture in Cloud.',
      'In alto: fatturato, acquisti, quanto resta dopo gli acquisti (da lì si pagano personale e spese generali) e quanto pesano i primi 3 clienti. Sotto "Cosa dicono i numeri": commenti in parole semplici, prima quelli importanti (rosso), poi le cose da tenere d\'occhio (giallo) e quelle che vanno bene (verde), ognuno con cosa conviene fare.',
      'I commenti guardano: fatturato in calo o in crescita e da quali clienti viene, previsione dell\'anno con la media dei mesi chiusi, acquisti che pesano più dell\'anno prima, dipendenza da pochi clienti, clienti che non hanno ancora comprato e clienti nuovi, chi paga in ritardo, fatture scadute da oltre 60 giorni, prodotti venduti sotto il prezzo del preventivo o con margine sotto il 10 %.',
      'Tabelle: fatturato per mese con il grafico dei due anni, clienti (peso, variazione, margine stimato dal preventivo, giorni di incasso e ritardo), prodotti (schede, prezzo medio, prezzo e margine dell\'ultimo preventivo), acquisti per categoria e primi fornitori.',
      'Non è il bilancio: mancano personale, ammortamenti e banca. Il bilancio provvisorio arriva dopo prima nota e partita doppia. Il margine dei prodotti è quello del preventivo; con i tempi veri delle commesse arriverà il margine reale.',
    ],
    passi: ['Amministrazione → Analisi.', 'Leggi "Cosa dicono i numeri".', 'Per un anno passato scegli l\'anno e premi Mostra.'],
    pagine: [['/amministrazione/analisi', 'Analisi']],
  },
  {
    id: 'vies', area: 'amministrazione', titolo: 'Controllo VIES delle partite IVA europee',
    parole: 'vies partita iva europea estera ue comunitaria intracomunitaria cliente estero controllo verifica valida non imponibile art 41 consultazione',
    testo: [
      'Per fatturare senza IVA a un cliente di un altro paese dell\'Unione europea (cessioni art. 41, servizi art. 7-ter) il cliente deve essere iscritto al VIES, l\'archivio delle partite IVA europee. Se non è iscritto la fattura va con l\'IVA italiana.',
      'In Amministrazione → Controllo VIES ci sono tutti i clienti e i fornitori con partita IVA di un altro paese UE, con l\'ultimo controllo: valida, NON valida, mai controllata o da ricontrollare (valida più di 90 giorni fa). "Controlla" la verifica subito sul sito della Commissione europea; "Controlla le … da controllare" le fa tutte.',
      'Ogni controllo resta salvato con il numero di consultazione del VIES: è la prova da conservare. Nella bozza di una fattura a un cliente UE c\'è il riquadro VIES con l\'ultimo controllo e "Controlla adesso".',
      'Se il VIES risponde che il servizio del paese non è disponibile non vuol dire che la partita IVA sia sbagliata: si riprova più tardi. Le partite IVA italiane non passano dal VIES.',
    ],
    passi: ['Amministrazione → Controllo VIES.', 'Premi "Controlla" sulla riga del cliente, o scrivi una partita IVA con il prefisso del paese (es. DE811193231).'],
    pagine: [['/amministrazione/vies', 'Controllo VIES']],
  },

  // ── Impostazioni ──
  {
    id: 'tariffe-fasi', area: 'impostazioni', titolo: 'Tariffe, fasi, parametri e materiali dei preventivi',
    parole: 'tariffe costo azienda operatore ricarico fasi parametri materiali consumo voci costo formula catalogo',
    testo: [
      'Costo azienda, costo operatore e ricarico proposti nei nuovi preventivi si cambiano in Impostazioni → Tariffe (si possono cambiare anche nel singolo preventivo). Fasi, parametri, materiali di consumo e voci di costo hanno ognuno la loro pagina.',
      'I preventivi già salvati non cambiano mai: conservano la "fotografia" delle tariffe del giorno in cui sono stati fatti.',
    ],
    pagine: [['/impostazioni/tariffe', 'Tariffe'], ['/impostazioni/fasi', 'Fasi'], ['/impostazioni/materiali', 'Materiali di consumo']],
  },
  {
    id: 'operatori', area: 'impostazioni', titolo: 'Operatori, sigle e PIN',
    parole: 'operatori sigla pin dipendenti reparto produzione persone',
    testo: ['In Impostazioni → Operatori si scrivono gli operatori con la loro sigla (es. MH, NG) e si imposta il PIN per entrare dal telefono.'],
    pagine: [['/impostazioni/operatori', 'Impostazioni → Operatori']],
  },
  {
    id: 'utenti', area: 'impostazioni', titolo: 'Utenti del portale',
    parole: 'utenti nuovo utente password accesso ufficio produzione ruolo disattivare',
    testo: ['In Impostazioni → Utenti si aggiungono gli utenti con email, password e ruolo (ufficio: tutto; produzione: solo tempi e note). Chi ha già lavorato non si elimina: si toglie la spunta "Attivo".'],
    pagine: [['/impostazioni/utenti', 'Impostazioni → Utenti']],
  },
  {
    id: 'backup', area: 'impostazioni', titolo: 'Copie di sicurezza (backup)',
    parole: 'backup copia sicurezza salvataggio dati scaricare ripristino',
    testo: ['Dal lunedì al venerdì alle 20:30 il portale salva da solo una copia completa dei dati (tiene gli ultimi 30 giorni). In Impostazioni → Backup si può scaricare una copia in qualsiasi momento.',
      'Nella copia ci sono tutti i dati del portale: preventivi, commesse, anagrafiche, ordini, fatture, DDT e fatture dei fornitori, CRM, documenti dei clienti. Restano fuori solo gli accessi e la cache dei prezzi dei distributori.',
      'Se le copie occupano più di 750 MB, il portale cancella da solo le più vecchie e ne tiene sempre almeno 5.'],
    pagine: [['/impostazioni/backup', 'Impostazioni → Backup']],
  },
  {
    id: 'chiavi', area: 'impostazioni', titolo: 'Chiavi dei servizi esterni (IA, distributori, Google Drive)',
    parole: 'chiave api render ia anthropic digikey mouser tme farnell google drive account servizio configurare',
    testo: ['Le chiavi dei servizi esterni (IA, distributori, Google Drive, SdI) si inseriscono solo su Render (servizio casteltech-portale → Environment), mai nel portale né in chat. Dopo averle salvate Render riavvia il portale. In Impostazioni → Componenti si può provare se funzionano.'],
    pagine: [['/impostazioni/componenti', 'Impostazioni → Componenti']],
  },
  {
    id: 'servizi', area: 'impostazioni', titolo: 'Consumi e limiti dei servizi (credito IA, memoria, database)',
    parole: 'consumi limiti token credito esaurito finito ricarica anthropic spesa costo dollari render memoria riavvio neon database spazio ore calcolo distributori richieste giorno gmail avviso servizi',
    testo: [
      'In Impostazioni → Servizi c\'è il riquadro con quanto il portale usa dei servizi esterni e quanto manca ai limiti: IA di Anthropic (letture, token e costo del giorno e del mese, credito rimasto), Render (memoria del server e riavvii), Neon (spazio del database e ore di calcolo), DigiKey, Mouser, Farnell e TME (richieste del giorno), Google Drive, Gmail e Invoicetronic.',
      'Anthropic è prepagato e non dice quanto credito resta: scrivi nel riquadro "Credito dell\'IA" l\'importo caricato e da quale giorno, e aggiornalo dopo ogni ricarica. Il portale conta i token di ogni lettura, stima la spesa con il listino e avvisa quando ne resta meno del 20%.',
      'Quando un servizio supera l\'80% del limite, o si ferma (credito finito, tetto di spesa raggiunto, chiave non valida, il portale riavviato da Render per memoria esaurita), tutti gli utenti dell\'ufficio vedono un avviso giallo o rosso in cima alle pagine con il link al riquadro.',
      'Se un documento non viene letto per credito finito, nell\'acquisizione c\'è scritto il motivo: ricarica il credito su console.anthropic.com → Billing e premi "Rileggi con l\'IA".',
      'Facoltativo: con ANTHROPIC_ADMIN_KEY su Render il costo del mese diventa quello ufficiale di Anthropic; con NEON_API_KEY e NEON_PROJECT_ID si vedono le ore di calcolo del database.',
    ],
    pagine: [['/impostazioni/servizi', 'Impostazioni → Servizi']],
  },

  // ── Dipendenti ──
  {
    id: 'dipendenti', area: 'dipendenti', titolo: 'Costo del personale e buste paga (area riservata)',
    parole: 'dipendenti personale costo stipendi buste paga cedolini cedolino riepilogo nota contabile f24 studio paghe upa contributi inps tfr soci password riservata riservato permesso',
    testo: [
      'Dal 1/11/2026 il menu in alto ha il gruppo Dipendenti. In "Costo del personale" tutto l\'ufficio vede il costo totale di ogni mese per l\'azienda (dipendenti e soci: lordo + contributi INPS a carico dell\'azienda + TFR + enti bilaterali e assistenza sanitaria), il totale e la media dell\'anno, il confronto con gli stessi mesi dell\'anno prima, il peso sul fatturato e gli F24 delle paghe con la scadenza.',
      'I documenti dello studio paghe (cedolini, riepilogo, nota contabile, F24) si mettono nella stessa cartella Google Drive "Da acquisire" degli ordini, con il nome con cui li manda lo studio (es. "Casteltech - ced 08-2026.pdf", "Casteltech - nc 08-2026.pdf", "Casteltech - f24 del 16-09-26.pdf"): il portale li riconosce dal nome e li porta in Dipendenti, non in Ordini → Da acquisire. Si possono anche caricare dalla pagina Costo del personale.',
      'La nota contabile la legge l\'IA e diventa il costo del mese; l\'F24 dà scadenza e totale. I cedolini e i riepiloghi NON vanno all\'IA e non si aprono senza la password.',
      'Buste paga (area riservata): la apre solo l\'amministratore del portale e chi ha la sua spunta, scrivendo la password delle buste paga (diversa da quella di accesso). Dentro: costo per qualifica, netto in busta, tutti i PDF dello studio, F24 da segnare pagati, lo storico dall\'archivio. Si richiude da sola dopo 15 minuti senza aprire pagine, o con "Chiudi l\'area riservata".',
      'Lo storico 2019–2026 viene dalle note contabili della cartella 7_DIPENDENTI E SOCI (fino al 2021 dal "bilancino" del vecchio studio): file costi_personale.json.gz, si carica dall\'area riservata → Storico dall\'archivio. I mesi letti dal portale non vengono sovrascritti. L\'INAIL si paga una volta l\'anno (F24 di febbraio) e non è nei mesi.',
    ],
    passi: [
      'Prima volta (amministratore): Dipendenti → Buste paga → scegli la password delle buste paga.',
      'Per dare l\'accesso a un collega dell\'ufficio: area riservata aperta → "Chi può aprire le buste paga" → spunta → Salva i permessi.',
      'Ogni mese: metti i PDF dello studio nella cartella "Da acquisire" (o caricali da Costo del personale); il costo del mese compare da solo.',
    ],
    pagine: [['/dipendenti', 'Dipendenti → Costo del personale'], ['/dipendenti/riservata', 'Dipendenti → Buste paga']],
  },
  {
    id: 'nota-spese', area: 'dipendenti', titolo: 'Nota spese e rimborso chilometrico',
    parole: 'nota spese rimborso km chilometrico chilometri trasferta viaggio auto tariffa aci destinazione cliente pranzo parcheggio pedaggio modulo excel pagato da pagare',
    testo: [
      'Dipendenti → Nota spese funziona come il "Modulo rimborso km" in Excel: una nota al mese per persona, una riga per viaggio con data, partenza, destinazione, km di andata, altre spese (pranzo, parcheggio, pedaggi) e note.',
      'I km di andata si scrivono da soli scegliendo una destinazione dell\'elenco (Destinazioni e km); il viaggio è di andata e ritorno (km × 2), togli la spunta A/R per la sola andata. Rimborso = km × tariffa dell\'auto + altre spese.',
      'Le persone e le loro auto con la tariffa al km (tabelle ACI) stanno in Dipendenti → Persone e auto. La tariffa si copia nella nota quando la crei: cambiarla dopo non cambia le note già fatte.',
      'Sotto ogni persona c\'è il riepilogo dell\'anno: totale, pagato, da pagare (come il foglio RIEPILOGO). "Segna pagato" registra un rimborso, anche un acconto. "Stampa" prepara il modulo da firmare (anche in PDF).',
      '"Importa il modulo Excel" carica un vecchio modulo dell\'anno: destinazioni, persone con l\'auto e le note dei mesi compilati.',
    ],
    passi: [
      'Dipendenti → Nota spese → scegli persona, mese e auto → Nuova nota spese.',
      'Scrivi data e destinazione per ogni viaggio (i km arrivano dall\'elenco), le altre spese → Salva.',
      'Quando paghi: "Segna pagato" sotto la persona con data e importo.',
    ],
    pagine: [['/dipendenti/note-spese', 'Dipendenti → Nota spese'], ['/dipendenti/persone', 'Dipendenti → Persone e auto'], ['/dipendenti/note-spese/destinazioni', 'Destinazioni e km']],
  },

  // ── Suggerimenti ──
  {
    id: 'suggerimento', area: 'suggerimenti', titolo: 'Proporre un\'idea per il portale',
    parole: 'suggerimento idea proposta migliorare richiesta funzione manca',
    testo: [
      'Se manca qualcosa o un passaggio è scomodo, scrivilo in Suggerimenti: titolo, descrizione, chi lo propone, area e priorità. Poi si decide se e quando svilupparlo (da valutare, da chiarire, in programma, in sviluppo, fatto, scartato).',
      'Una volta alla settimana Claude legge i suggerimenti aperti: realizza quelli validi e li segna "Fatto" con una risposta che spiega dove trovarli; se un\'idea non è chiara scrive una domanda e la mette "Da chiarire" (in cima all\'elenco, in giallo).',
      'Per rispondere a una domanda: apri il suggerimento, scrivi la risposta in "Note e risposte" e salva. La settimana dopo Claude la rilegge.',
    ],
    passi: ['Suggerimenti → + Nuovo suggerimento.', 'Scrivi cosa dovrebbe fare il portale e perché serve.', 'Se compare una domanda, rispondi nelle note del suggerimento.'],
    pagine: [['/suggerimenti/nuovo', 'Nuovo suggerimento']],
  },
  // ── Qualità ──
  {
    id: 'qualita-sezione', area: 'qualita', titolo: 'La sezione Qualità: cosa c\'è e dove',
    parole: 'qualita iso 9001 sistema qualita cartella 5_qualita registri cruscotto scadenze',
    testo: [
      'Nel menu Qualità ci sono i registri che prima stavano nella cartella 5_QUALITA del Drive: documenti del sistema (manuale, procedure EPR, istruzioni EWI, moduli), non conformità e reclami, codifica dei difetti, strumenti e tarature, piano delle manutenzioni, verifiche ESD, formazione, audit, rischi e opportunità.',
      'Il cruscotto della Qualità mostra cosa è scaduto o scade entro un mese (tarature, manutenzioni, verifiche ESD, azioni correttive, audit, riesami dei rischi), le non conformità aperte e i difetti più frequenti.',
      'I dati vecchi del Drive si caricano dal cruscotto con "Carica i dati dal Drive" (file qualita_esempio.json.gz): si può ripetere, le righe uguali si aggiornano.',
    ],
    passi: ['Qualità → Cruscotto della qualità.', 'Clic su una scadenza per aprire la riga, oppure sui tasti in alto per il registro.', 'In ogni registro: + Nuovo per aggiungere, la ricerca filtra mentre scrivi, le spunte servono per Fatto oggi, Duplica, Elimina.'],
    pagine: [['/qualita', 'Cruscotto della qualità']],
  },
  {
    id: 'non-conformita', area: 'qualita', titolo: 'Registrare una non conformità o un reclamo del cliente',
    parole: 'non conformita nc reclamo cliente difetto azione correttiva causa rpc rapporto controllo deroga rilavorato reso',
    testo: [
      'Ogni non conformità ha un numero che si dà da solo (NC-2026-001), la data, l\'origine (reclamo del cliente, interna, fornitore, audit), il prodotto, i pezzi difettosi, il codice del difetto e cosa si è fatto del lotto.',
      'Poi si scrivono la causa, l\'azione correttiva, chi se ne occupa ed entro quando: la data compare nel cruscotto quando si avvicina. Con "Chiudi" (spunta nell\'elenco) la non conformità si chiude con la data di oggi.',
      'I codici dei difetti si scelgono da Qualità → Codifica dei difetti, così il cruscotto conta i difetti più frequenti.',
    ],
    passi: ['Qualità → Non conformità e reclami → + Nuova non conformità.', 'Compila difetto, pezzi e trattamento del lotto, poi Aggiungi.', 'Quando l\'azione è fatta: stato Chiusa (o spunta + Chiudi).'],
    pagine: [['/qualita/non_conformita', 'Non conformità e reclami']],
  },
  {
    id: 'tarature-manutenzioni', area: 'qualita', titolo: 'Tarature, manutenzioni e verifiche ESD: segnare che sono state fatte',
    parole: 'taratura tarare strumento saldatore termoigrometro manutenzione macchina forno onda pick place esd bracciali scarpe banchi scadenza fatto oggi',
    testo: [
      'Strumenti e tarature: per ogni strumento si scrive ogni quanti mesi va tarato e l\'ultima taratura; la prossima scadenza si calcola da sola.',
      'Piano delle manutenzioni e verifiche ESD: per ogni intervento si scrivono i mesi in cui va fatto (es. "1, 8" = gennaio e agosto, "1-12" = tutti i mesi) e l\'ultima volta; la scadenza è il mese previsto successivo.',
      'Quando l\'intervento è fatto: spunta le righe e premi "Fatto oggi" (o "Tarato oggi"): l\'ultima volta diventa oggi con esito positivo e la scadenza si sposta.',
    ],
    passi: ['Qualità → Strumenti e tarature (o Piano delle manutenzioni, Verifiche ESD).', 'Spunta le righe fatte → Fatto oggi.', 'Se l\'esito non è positivo, apri la riga e correggi esito e note.'],
    pagine: [['/qualita/strumenti', 'Strumenti e tarature'], ['/qualita/manutenzioni', 'Piano delle manutenzioni'], ['/qualita/esd', 'Verifiche ESD']],
  },
];

// ── Ricerca intelligente ──

const PAROLE_VUOTE = new Set(('il lo la i gli le un uno una di a da in con su per tra fra e o ed del dello della dei degli delle al allo alla ai agli alle '
  + 'dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sulla sui come dove quando cosa che chi si non mi ci ti vi ne '
  + 'faccio fare fa posso puo può devo deve voglio vorrei serve servono è e\' sono ho ha hanno questo questa quello quella mio mia').split(' '));

/** minuscolo, senza accenti, solo lettere e numeri (il "+" di "ordine+documenti" separa come uno spazio) */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const parole = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Radice della parola italiana: "ordine", "ordini", "ordinare" → "ordin"; "caricare", "caricamento", "carico" → "caric". */
export function radice(p: string): string {
  if (p.length <= 3 || /\d/.test(p)) return p;
  for (const s of ['amenti', 'amento', 'azioni', 'azione', 'ando', 'endo', 'are', 'ere', 'ire', 'ato', 'ata', 'ati', 'ate', 'ito', 'ita', 'iti'])
    if (p.endsWith(s) && p.length - s.length >= 4) return p.slice(0, -s.length);
  const senzaVocale = p.replace(/[aeiouhy]+$/, '');
  return senzaVocale.length >= 3 ? senzaVocale : p;
}

/** Parole che vogliono dire la stessa cosa: cercarne una trova anche le altre. */
const SINONIMI: string[][] = [
  ['documento', 'file', 'allegato', 'pdf', 'pacchetto'],
  ['caricare', 'carico', 'importare', 'acquisire', 'salvare', 'mettere', 'inserire', 'upload'],
  ['eliminare', 'cancellare', 'togliere', 'rimuovere'],
  ['ordine', 'commissione'],
  ['bolla', 'ddt', 'spedizione', 'trasporto'],
  ['tempo', 'ore', 'minuti', 'tempi'],
  ['telefono', 'cellulare', 'tablet', 'smartphone'],
  ['fattura', 'fatturare', 'fatturazione'],
  ['stampare', 'stampa', 'pdf'],
  ['prezzo', 'costo', 'quotazione'],
  ['preventivo', 'offerta'],
  ['bom', 'distinta', 'componenti'],
  ['cliente', 'clienti', 'committente'],
  ['scansione', 'scanner', 'scansionare', 'foto'],
  ['nota', 'storno', 'stornare'],
  ['utente', 'password', 'accesso', 'login'],
  ['backup', 'copia'],
];
const GRUPPI = new Map<string, Set<string>>();
for (const g of SINONIMI) {
  const r = new Set(g.map(p => radice(norm(p))));
  for (const x of r) GRUPPI.set(x, new Set([...(GRUPPI.get(x) ?? []), ...r]));
}

/** Le radici equivalenti alla parola cercata (lei compresa). */
const varianti = (p: string) => GRUPPI.get(radice(p)) ?? new Set([radice(p)]);
const combacia = (cercata: string, testo: string) => testo === cercata || (cercata.length >= 4 && testo.startsWith(cercata));

export interface RisultatoGuida { argomento: ArgomentoGuida; area: AreaGuida; punti: number }

const indice = ARGOMENTI_GUIDA.map(a => ({
  a,
  titolo: parole(a.titolo).filter(p => !PAROLE_VUOTE.has(p)).map(radice),
  chiavi: parole(`${a.parole} ${AREE_GUIDA.find(x => x.id === a.area)?.nome ?? ''}`).map(radice),
  testo: parole([...a.testo, ...(a.passi ?? []), ...a.pagine.map(p => p[1])].join(' ')).map(radice),
}));

/**
 * Cerca nella guida. Ogni parola della domanda (o i suoi sinonimi) vale di più nel titolo, poi nelle parole chiave, poi nel testo;
 * gli argomenti che contengono TUTTE le parole cercate vengono prima. "ordine+documenti" = "ordine documenti".
 */
export function cercaGuida(domanda: string, quanti = 8): RisultatoGuida[] {
  const cercate = [...new Set(parole(domanda).filter(p => !PAROLE_VUOTE.has(p)))];
  if (!cercate.length) return [];
  const risultati: RisultatoGuida[] = [];
  for (const x of indice) {
    let punti = 0, trovate = 0;
    const titoloTrovato = new Set<string>();
    for (const p of cercate) {
      const v = [...varianti(p)];
      const uguale = (t: string) => v.some(r => combacia(r, t));
      x.titolo.filter(uguale).forEach(t => titoloTrovato.add(t));
      const qui = (x.titolo.some(uguale) ? 5 : 0) + (x.chiavi.some(uguale) ? 3 : 0) + (x.testo.some(uguale) ? 1 : 0);
      if (qui) { punti += qui + Math.min(x.testo.filter(uguale).length, 4) * 0.25; trovate++; }
    }
    if (!trovate) continue;
    if (trovate === cercate.length) punti += 4 * cercate.length; // tutte le parole: più in alto
    punti += 4 * titoloTrovato.size / Math.max(x.titolo.length, 1); // a parità, il titolo che parla proprio di quello
    risultati.push({ argomento: x.a, area: AREE_GUIDA.find(a => a.id === x.a.area)!, punti });
  }
  return risultati.sort((a, b) => b.punti - a.punti).slice(0, quanti);
}

/** Indirizzo dell'argomento nella guida. */
export const indirizzoArgomento = (a: ArgomentoGuida) => `/guida/${a.area}#${a.id}`;

/** Testo dell'argomento per l'IA (domande alla guida). */
export const testoArgomento = (a: ArgomentoGuida) =>
  [`[${a.id}] ${a.titolo}`, ...a.testo, ...(a.passi ?? []).map((p, i) => `${i + 1}. ${p}`),
    a.pagine.length ? `Pagine: ${a.pagine.map(([h, t]) => `${t} (${h})`).join(', ')}` : ''].filter(Boolean).join('\n');
