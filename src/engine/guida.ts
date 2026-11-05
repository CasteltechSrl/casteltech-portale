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
      'In tutte le pagine dell\'ufficio funzionano alcuni tasti: / (barra) o Ctrl+K vanno alla ricerca in alto; Alt+N preme il pulsante "+ Nuovo…" della pagina in cui sei (nuovo preventivo in Preventivi, nuovo DDT o nuova fattura nella pagina DDT o Fatture dell\'Amministrazione, nuovo fornitore in Anagrafiche…); Ctrl+S salva la bozza che stai scrivendo; Esc chiude tendine e finestre.',
      'Premendo ? (Shift+7 sulla tastiera italiana, fuori dalle caselle di testo) compare l\'elenco dei tasti rapidi; Esc o un clic fuori lo chiude.',
    ],
    passi: ['Apri la pagina dell\'elenco (es. Preventivi).', 'Premi Alt+N: si apre il modulo del nuovo preventivo.', 'Premi ? se non ricordi un tasto.'],
    pagine: [['/cruscotto', 'Cruscotto generale']],
  },
  {
    id: 'ordinare-elenchi', area: 'inizio', titolo: 'Mettere in ordine un elenco cliccando le colonne',
    parole: 'ordinare ordinamento colonna colonne intestazione crescente decrescente alfabetico freccia mostra tutte',
    testo: [
      'In tutti gli elenchi (ordini, fatture, DDT, conferme, acquisti, preventivi, commesse, clienti, prodotti, CRM…) si può decidere l\'ordine delle righe cliccando il nome della colonna in alto: il primo clic ordina in crescente (A→Z, dalla data più vecchia, dal numero più piccolo), il secondo in decrescente, il terzo torna all\'ordine di partenza. La freccia ▲ o ▼ accanto al nome dice come è ordinato.',
      'Le date, i numeri di documento (es. 61/2026) e gli importi in euro si ordinano per valore, non come testo; le celle vuote vanno sempre in fondo. L\'ordine scelto resta tornando sulla pagina, su quel computer.',
      'Negli elenchi a pagine da 100 il clic ordina la pagina che vedi: per ordinare tutte le righe premi prima "Mostra tutte" in fondo all\'elenco. Le righe dei documenti in modifica (fattura, DDT, rientro) non si riordinano, perché lì l\'ordine delle righe conta.',
    ],
    passi: ['Apri l\'elenco (es. Ordini clienti).', 'Clicca "Cliente" in cima alla colonna: righe dalla A alla Z.', 'Clicca di nuovo: dalla Z alla A.'],
    pagine: [['/ordini', 'Ordini clienti']],
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
    id: 'errori-accanto-campo', area: 'inizio', titolo: 'Quando un modulo non si salva: l\'errore compare sotto il campo',
    parole: 'errore campo modulo non salvato rosso messaggio valori persi riscrivere password email codice duplicato esiste già',
    testo: [
      'Se un dato non va bene (password troppo corta, codice già esistente, prezzo scritto male, cliente mancante…), la pagina torna con il messaggio in cima e, in più, il messaggio in rosso sotto la casella sbagliata, con il cursore già lì.',
      'Quello che avevi scritto nelle altre caselle del modulo resta al suo posto: correggi solo il campo segnato e premi di nuovo Salva o Aggiungi. Le password non vengono conservate: si riscrivono.',
      'Funziona in Impostazioni → Utenti, Fasi/Parametri/Voci, Anagrafiche → Clienti e Prodotti e nelle attività del CRM; le bozze di fattura, DDT e ordini hanno già il salvataggio automatico.',
    ],
    pagine: [['/anagrafiche/prodotti', 'Anagrafiche → Prodotti'], ['/impostazioni/utenti', 'Impostazioni → Utenti']],
  },
  {
    id: 'numeri-date-uniformi', area: 'inizio', titolo: 'Numeri con la virgola e date gg/mm/aaaa',
    parole: 'numeri virgola punto decimali date formato gg/mm/aaaa giorno mese anno browser lingua italiano inglese mm/dd scrittura uniforme',
    testo: [
      'I numeri si scrivono con la virgola (12,50) ma il portale accetta anche il punto: uscendo dalla casella il punto diventa virgola, così si legge sempre allo stesso modo. Le migliaia non vanno separate (scrivi 1500, non 1.500).',
      'Le date si scelgono dal calendario della casella e si leggono gg/mm/aaaa. La casella la disegna il browser nella SUA lingua: se il browser è in inglese mostra mese/giorno/anno e sotto la prima data della pagina compare una nota. Per vedere gg/mm/aaaa basta mettere l\'italiano nella lingua del browser (Chrome: Impostazioni → Lingue).',
    ],
    pagine: [['/cruscotto', 'Cruscotto generale']],
  },
  {
    id: 'preventivo-semplice', area: 'preventivi', titolo: 'Preventivo: vista Semplice o Completo',
    parole: 'preventivo semplice completo vista campi nascosti avanzati troppi campi pochi campi quantità veloce federico pulsante',
    testo: [
      'In alto nel preventivo, accanto a Salva, ci sono i pulsanti Semplice e Completo. In Semplice restano solo i campi che cambiano davvero da una scheda all\'altra: componenti SMD e feeder per lato, componenti THT (tipologie, da preparare, in giostra, punti a mano), numero item, collaudo, montaggio meccanico, cablaggio, firmware, costi di componenti e PCB, lamine, attrezzature PCB, spedizioni. Ogni gruppo dice quanti campi avanzati sono nascosti.',
      'I campi nascosti valgono comunque: il calcolo usa sempre tutti i valori (i tempi standard restano quelli del catalogo o del preventivo). Completo mostra tutto come prima. Il browser ricorda la vista scelta per i prossimi preventivi; all\'inizio è Completo.',
      'Le spunte delle Informazioni generali, i prezzi dei materiali di consumo e le tariffe restano visibili solo in Completo (materiali) o sempre (spunte, tariffe).',
    ],
    passi: ['Apri un preventivo.', 'Premi Semplice: compila quantità e costi.', 'Se serve un tempo particolare, premi Completo e cercalo nel suo gruppo.'],
    pagine: [['/preventivi/nuovo', 'Nuovo preventivo']],
  },
  {
    id: 'ordine-da-preventivo', area: 'preventivi', titolo: 'Il cliente ha confermato: creare l\'ordine dal preventivo',
    parole: 'ordine dal preventivo crea ordine cliente conferma confermato accettato righe quantità prezzo consegna proposta una tantum unico più preventivi unire insieme stesso cliente',
    testo: [
      'Quando il cliente conferma un preventivo non serve riscrivere l\'ordine: nel preventivo salvato il pulsante "Crea ordine" apre l\'ordine cliente già compilato con la riga delle schede (codice, descrizione, quantità e prezzo a scheda del preventivo, o quello scritto a mano nella stampa) e, se è il primo lotto, una riga di servizio per ogni costo una tantum (programmazioni, lamine…).',
      'La consegna richiesta è proposta dal portale come nella pagina "Data di consegna" (carico del Gantt e ore ciclo del preventivo), ma si può cambiare. Si scrivono il numero e la data dell\'ordine del cliente, si correggono righe e prezzi se serve e si preme "Crea l\'ordine".',
      'L\'ordine nasce in Ordini clienti con origine "preventivo" e numero della serie 9001 (come quelli letti dalle email), entra nel Gantt e nel cruscotto; il preventivo passa ad "accettato". Da lì si fanno conferma d\'ordine, commessa e DDT come sempre.',
      'Un ordine unico da più preventivi (dal 2/11/2026): quando il cliente manda un solo ordine per più schede quotate a parte, nell\'elenco Preventivi spunta i preventivi e premi "Crea ordine" in alto a destra. Le righe di tutti i preventivi finiscono nello stesso ordine; la consegna proposta è la più lontana. Si possono unire solo preventivi dello stesso cliente; tutti passano ad "accettato".',
    ],
    passi: ['Apri il preventivo confermato dal cliente (o spunta più preventivi nell\'elenco e premi "Crea ordine").', 'Premi "Crea ordine" accanto a "Crea commessa".', 'Controlla righe, prezzi e consegna, scrivi il numero d\'ordine del cliente, poi "Crea l\'ordine".'],
    pagine: [['/preventivi', 'Preventivi'], ['/ordini', 'Ordini clienti']],
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
    id: 'moduli-sito', area: 'inizio', titolo: 'Richieste dal sito casteltech.net (Contatti e Richiedi un preventivo)',
    parole: 'sito web casteltech.net modulo contatti richiesta preventivo internet visitatore form messaggio richiedi',
    testo: [
      'Il sito casteltech.net è fatto di pagine semplici ospitate su Render insieme al portale (non più WordPress). I due moduli del sito li riceve il portale.',
      'Contatti: il messaggio arriva per email a info@casteltech.net con oggetto "Sito casteltech.net – Contatto". Premendo "Rispondi" la risposta va a chi ha scritto.',
      'Richiedi un preventivo: nasce un pacchetto in Preventivi → Documenti del cliente con nome "SITO – AZIENDA", con il testo della richiesta (quantità, componenti, note) in cima alla pagina e i file utili allegati (BOM, Gerber, pick and place, zip). L\'analisi parte da sola. Arriva anche un\'email a info@ con il link al pacchetto.',
      'Il cliente si collega da solo se l\'email è di un cliente in anagrafica, altrimenti lo scegli tu. Contro i robot il portale scarta i moduli compilati in pochi secondi e oltre 5 invii all\'ora dallo stesso indirizzo.',
      'Per cambiare un testo o una foto del sito chiedi a Claude: le pagine sono nella cartella sito/ del programma.',
    ],
    passi: ['Apri Preventivi → Documenti del cliente.', 'Apri il pacchetto "SITO – …" e controlla testo e file.', 'Scegli il cliente (o aggiungilo) e prosegui come per una richiesta arrivata via email.'],
    pagine: [['/preventivi/documenti', 'Documenti del cliente']],
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
    parole: 'scheda cliente tutto in una pagina situazione cliente riepilogo preventivi ordini aperti commesse ddt fatture incassi scaduti crm prezzi prodotti storico codici diversi per anno quanti codici pezzi consegnati',
    testo: [
      'Anagrafiche → Clienti → "Scheda" (o il cliente trovato con la ricerca in alto) apre una pagina con tutto quel che riguarda quel cliente: fatturato dell\'anno e dell\'anno prima, da incassare e scaduto (con i giorni medi di incasso), ordini aperti, commesse in corso, DDT da fatturare, preventivi.',
      'Sotto, un riquadro per argomento con le ultime righe e il collegamento alla pagina completa: ordini da evadere, commesse, DDT da fatturare, incassi scaduti, ultimi documenti, preventivi, prodotti con il prezzo di listino, CRM (prossima azione, referenti, ultime attività).',
      'In alto i pulsanti per partire da lì: Dati fiscali, Prodotti, CRM, + Preventivo (con il cliente già scelto), + Fattura, + DDT.',
      'In fondo, "Codici prodotti per anno": quanti codici diversi abbiamo fatto per quel cliente in ognuno degli ultimi 3 anni e i pezzi consegnati di ogni codice, una colonna per anno ("Tutti gli anni" allarga la tabella). Contano i DDT di vendita o reso lavorato e le fatture senza DDT; fuori lamine, programmazioni, trasporti, resi di materiale non lavorato e garanzie.',
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
    id: 'sede-operativa', area: 'anagrafiche', titolo: 'Sede operativa diversa dalla sede legale (indirizzo di spedizione)',
    parole: 'sede operativa legale spedizione indirizzo di spedizione consegna destinazione magazzino stabilimento seconda sede ddt luogo',
    testo: [
      'Alcuni clienti hanno la sede legale in un posto e la sede operativa (dove si consegna la merce) in un altro, per esempio ELEXES: legale a Vertova, operativa a Stezzano.',
      'L\'indirizzo dei dati fiscali è la sede legale: va in fattura e nell\'intestazione del DDT. Con la spunta "Sede operativa diversa dalla sede legale" compaiono i campi della seconda sede (presso, indirizzo, CAP, comune, provincia, nazione, note per la consegna).',
      'La sede operativa diventa il luogo di destinazione proposto nei DDT nuovi di quel cliente; si può sempre cambiare nel singolo DDT. Senza spunta il cliente ha una sola sede.',
      'In Fatture in Cloud era il campo "Indirizzo di spedizione": le sedi di FIC si caricano una volta da Impostazioni → Amministrazione → Sedi operative dei clienti.',
    ],
    passi: ['Anagrafiche → Clienti → Dati fiscali del cliente.', 'Spunta "Sede operativa diversa dalla sede legale".', 'Scrivi indirizzo, CAP, comune e provincia della sede operativa → Salva.'],
    pagine: [['/anagrafiche/clienti', 'Anagrafiche → Clienti']],
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
    id: 'archivio-componenti', area: 'anagrafiche', titolo: 'Archivio dei componenti: elenco, ricerca e aggiungere un componente',
    parole: 'archivio componenti componente codice gestionale moka armadio excel scaricare elenco disponibili tutti famiglia aggiungere nuovo manca inserire',
    testo: [
      'Tutti i componenti già codificati, con il codice di produzione (quello dell\'armadio, es. RS-0603-2K2-1-100MW) e il codice gestionale (es. SRS-0603-2K20F-001). Aprendo la pagina si vede l\'elenco di tutto l\'archivio, a pagine da 100, in ordine di codice gestionale; il menu "Tutte le famiglie" mostra una famiglia sola (es. RS resistenze). Si può scaricare tutto in Excel.',
      'La ricerca (P/N, codici o descrizione, poi Invio) trova il componente; "Mostra tutti" torna all\'elenco completo.',
      'Se un componente manca, "+ Aggiungi componente": si scrive il P/N (o la descrizione, se non c\'è il P/N) e il portale lo codifica come in Quotazioni → Codifica un P/N (codice di produzione, codice gestionale con il primo numero libero, prezzi dai distributori). Si controlla e si preme "Salva nell\'archivio": si torna all\'archivio con il componente nuovo. Se il P/N è già in archivio, il portale lo mostra senza creare doppioni.',
      'I componenti nuovi entrano in archivio anche dalla codifica delle BOM (sezione Quotazioni). Non è un magazzino: l\'archivio dice come si codifica un componente, non quanti pezzi ci sono.',
    ],
    passi: ['Anagrafiche → Componenti.', 'Cerca il P/N; se non c\'è, compila "+ Aggiungi componente" (in fondo alla pagina) e premi Codifica e aggiungi.', 'Controlla codici e prezzi, poi premi Salva nell\'archivio.'],
    pagine: [['/anagrafiche/componenti', 'Anagrafiche → Componenti'], ['/quotazioni', 'Quotazioni (codifica)']],
  },
  {
    id: 'codifica-bom-senza-prezzi', area: 'componenti', titolo: 'Codifica componenti: codificare una BOM senza cercare i prezzi',
    parole: 'codifica codificare componenti bom distinta senza prezzi codice produzione gestionale moka armadio veloce distributori foglio excel google sheets fogli',
    testo: [
      'Produzione → Codifica componenti serve quando di una BOM vuoi solo i codici: per ogni riga il codice di produzione (armadio) e il codice gestionale (Moka), senza preventivo dei materiali.',
      'Se il file Excel ha più fogli, il portale legge quello che si chiama "BOM" (se non c\'è, il primo foglio con dati).',
      'La codifica è la stessa di Quotazioni (archivio, decodifica del P/N, colonne della BOM, IA), ma il portale non chiede prezzi e disponibilità ai distributori: è più veloce e non consuma le richieste di DigiKey, Mouser e gli altri. Per questo non ci sono totali, acquisti, reperibilità né alternative.',
      'Il risultato si scarica con "Scarica Excel" (anche dall\'elenco, colonna Excel). Per averlo in Google Sheets: carica il file nel Drive e aprilo con Fogli Google.',
      '"Salva … codici nell\'archivio" mette i componenti nuovi in Anagrafiche → Componenti. Le righe da completare si sistemano con "modifica", come in Quotazioni.',
      'Se poi servono anche i prezzi, nella BOM apri "Cerca anche i prezzi", scrivi le schede e premi Cerca i prezzi: la BOM passa a Quotazioni e si rielabora con i distributori. Una BOM solo codificata non si può collegare a un preventivo finché non ha i prezzi.',
    ],
    passi: ['Produzione → Codifica componenti.', 'Scegli il file (Excel o CSV) e premi Carica e codifica.', 'Controlla i codici, premi Salva … codici nell\'archivio e Scarica Excel.'],
    pagine: [['/produzione/codifica-componenti', 'Produzione → Codifica componenti'], ['/anagrafiche/componenti', 'Anagrafiche → Componenti']],
  },
  {
    id: 'componenti-clienti', area: 'anagrafiche', titolo: 'Componenti dei clienti (materiale in conto lavoro)',
    parole: 'componenti clienti cliente conto lavoro materiale codici selea idea caricare elenco excel csv restituire reso ddt',
    testo: [
      'Il materiale che i clienti ci mandano in conto lavoro, con i LORO codici: ogni codice ha il suo cliente, tutto in maiuscolo.',
      'Si caricano dall\'elenco del cliente (Excel o CSV): scegli il cliente, il file, "Controlla il file" mostra quanti codici sono nuovi o da aggiornare, poi "Conferma e carica". Ricaricando, i codici nuovi si aggiungono e le descrizioni si aggiornano; nulla viene tolto.',
      'Un codice si aggiunge anche a mano ("+ Aggiungi componente del cliente"), si corregge (Salva) e si elimina solo se non è in nessun DDT.',
      'Nel DDT, scegliendo "Componente cliente" nella riga, si cerca tra i codici del cliente del DDT: codice e descrizione arrivano da qui.',
    ],
    passi: ['Anagrafiche → Componenti clienti.', 'In "Carica l\'elenco di un cliente" scegli cliente e file, poi Controlla il file.', 'Conferma e carica.'],
    pagine: [['/anagrafiche/componenti-clienti', 'Anagrafiche → Componenti clienti']],
  },
  {
    id: 'materiali-consumo', area: 'anagrafiche', titolo: 'Materiali di consumo (lamine, pasta saldante, stagno, Kapton, punte)',
    parole: 'materiali materiale consumo consumabili lamina lamine stencil serigrafica pasta saldante crema stagno barre verghe filo kapton nastro punta punte saldatore weller ugello flussante flux alcol isopropilico coating pluriboll buste guanti codice nostro mc acquistare comprare',
    testo: [
      'Quello che si compra per la produzione e non va sulla scheda del cliente: lamine serigrafiche, pasta saldante, barre e filo di stagno, Kapton, punte dei saldatori, flussanti, prodotti di pulizia, coating, buste antistatiche, guanti ESD.',
      'Ogni materiale ha un codice NOSTRO dato dal portale: MC-categoria-numero (es. MC-LAM-001 lamina 0,12, MC-PAS-001 pasta saldante, MC-PUN-001 punta Weller). Il codice del fornitore o del produttore si scrive nella descrizione, tra parentesi. Le punte Weller hanno un solo codice: il modello si scrive nella descrizione della riga dell\'ordine.',
      'L\'elenco iniziale viene dagli acquisti 2022–2026 delle fatture dei fornitori di Fatture in Cloud. Gli ultimi prezzi si caricano dal file materiali_prezzi.json.gz ("Carica gli ultimi prezzi d\'acquisto"); poi si aggiornano dagli ordini quando scrivi un prezzo diverso e rispondi Sì alla domanda.',
      'Nell\'ordine a fornitore si richiamano scrivendo una parola nel Codice ("lamina", "pasta", "filo 0,7", "kapton 12"): scelto il materiale arrivano codice, descrizione e ultimo prezzo; la descrizione si può completare (per quale prodotto è la lamina, il modello della punta).',
      'Un materiale si aggiunge qui ("+ Aggiungi materiale") o dall\'ordine ("+ Nuovo materiale" nel menu del Codice, oppure "Aggiungi ai materiali" nel riquadro "Righe non in anagrafica"). Si elimina solo se non è in nessun ordine; altrimenti si toglie la spunta "Attivo" e non compare più negli ordini.',
    ],
    passi: ['Anagrafiche → Materiali di consumo.', 'Filtra per categoria o cerca.', 'Correggi descrizione o unità e premi Salva; "+ Aggiungi materiale" per uno nuovo.'],
    pagine: [['/anagrafiche/materiali', 'Anagrafiche → Materiali di consumo'], ['/ordini/fornitori', 'Ordini a fornitore']],
  },
  {
    id: 'servizi-una-tantum', area: 'anagrafiche', titolo: 'Servizi una tantum (lamina, documentazione, programmazione, attrezzaggio PCB)',
    parole: 'servizi servizio una tantum costi primo lotto avvio produzione lamina lamine vendute venduto venduta quante programmazione attrezzature attrezzaggio pcb documentazione ut codice casteltech tutti i clienti',
    testo: [
      'I costi una tantum uguali per tutti i clienti hanno un codice Casteltech che vale per qualunque cliente: UT-LAMINA (lamina serigrafica), UT-DOCUMENTAZIONE (preparazione della documentazione), UT-PROGRAMMAZIONE (programmazione attrezzature), UT-ATTREZZAGGIO-PCB. Stanno in Anagrafiche → Servizi una tantum, non tra i Prodotti (che hanno sempre il loro cliente).',
      'Nelle righe di ordini, conferme d\'ordine, DDT e fatture si scelgono in fondo al menu Codice, nel gruppo "Servizi una tantum": arriva la descrizione (che si può completare, es. "LAMINA SERIGRAFICA CON TRATTAMENTI TOP") e il prezzo proposto se la casella è vuota.',
      'Negli ordini letti da e-mail e PDF la riga di servizio che cita un servizio solo ("LAMINA SERIGRAFICA", "PROGRAMMAZIONE ATTREZZATURE") prende il codice da sola; se ne unisce più di uno lo scegli tu nel menu.',
      'Nella pagina c\'è il venduto per anno (pezzi ed euro): conta le righe con il codice UT e, per le fatture di prima (anche Fatture in Cloud), quelle che nella descrizione citano un servizio solo. Così sai per esempio quante lamine hai venduto.',
      'Un servizio nuovo per tutti (es. UT-COLLAUDO) si aggiunge con "+ Aggiungi servizio una tantum". Si elimina solo se non è in nessun documento; altrimenti si toglie la spunta "Attivo".',
    ],
    passi: ['Anagrafiche → Servizi una tantum.', 'Correggi descrizione o prezzo proposto e premi Salva.', 'Nel documento: menu Codice → gruppo "Servizi una tantum".'],
    pagine: [['/anagrafiche/servizi', 'Anagrafiche → Servizi una tantum']],
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
      'I riquadri in alto sono su due righe, uno per tipo di informazione. Prima riga (a quanto vendiamo): "Prezzo a scheda" senza e con le una tantum (e i totali del lotto); "Vendita a scheda per voce" con il montaggio (la scheda senza una tantum, componenti e PCB), i componenti e il PCB; "Una tantum" con vendita, interni e acquisti. Seconda riga: "Costi a scheda" di produzione (fasi, consumo, energia, spedizione) e di acquisto (componenti, PCB), più il costo delle una tantum; "Margini" a scheda, del lotto e delle una tantum; "Ore del lotto" ciclo e uomo con il prezzo all\'ora.',
      'Il pulsante Salva c\'è in alto e anche in fondo alla pagina, accanto a Stato, Crea ordine e Crea commessa: fanno la stessa cosa.',
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
    id: 'punti-saldatura', area: 'preventivi', titolo: 'Punti di saldatura THT e stagno nel preventivo',
    parole: 'punti saldatura mano tht piedini pin reofori refori fori gerber foratura stagno filo saldatrice onda grammi conta contare calcolare',
    testo: [
      'Nel preventivo, sezione THT, il pulsante "Conta i punti dai componenti" conta i piedini dei componenti THT montati: dai documenti del cliente (file CAD, poi impronta e descrizione: DIP8 = 8, TO-220 = 3, PinHeader 2x05 = 10, morsetto 3 poli = 3, assiali e radiali = 2) o, se non ci sono, dalla BOM collegata (righe THT × quantità).',
      'I piedini si confrontano con i fori metallizzati del Gerber: i fori senza componente (non montati, fissaggi da 3 mm in su, test point) non sono punti di saldatura e il portale lo scrive. Se di un THT non si capiscono i piedini si usano i fori che restano; senza fori si contano 2 piedini a pezzo, scritto in rosso da controllare.',
      'Con la spunta "THT a mano" compila "Punti di saldatura a mano" e "Stagno in filo" (0,125 g a punto); con "THT onda" scrive i punti nello stagno della saldatrice a reofori: i grammi a reoforo (0,02 g) sono in Impostazioni → materiale "Stagno saldatrice (a reoforo)", le scorie le aggiunge il calcolo. Senza spunte usa quella proposta dai documenti.',
      'Se scrivi i punti di saldatura a mano, lo stagno in filo si aggiorna da solo (se era vuoto o calcolato dal portale).',
      'Nel preventivo "da validare" creato dai documenti questi valori sono già scritti.',
    ],
    passi: ['Apri il preventivo, sezione THT.', 'Metti la spunta THT a mano o THT onda.', 'Premi "Conta i punti dai componenti", controlla il testo sotto e Salva.'],
    pagine: [['/preventivi', 'Elenco preventivi'], ['/preventivi/documenti', 'Da documenti del cliente']],
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
    parole: 'stampa pdf mandare inviare email mail preventivi@ invia per email inviato cliente offerta salvare pdf versione essenziale dettaglio macro aree fasi firma accettazione condizioni generali sconto note riga aggiungere ritocchi modificare vecchia versione aggiornata riquadro verde una tantum tempi di consegna settimane circa arrivo del materiale montaggio conto lavoro dettaglio costi una tantum voci nascondere validità scadenza 30 giorni 10 giorni codici alternativi alternative da confermare foglio componenti non trovati non quotati problemi di acquisto pagina componenti',
    testo: [
      'Dal preventivo salvato, "Stampa" apre la pagina per il cliente con i soli prezzi, impaginata come i preventivi di Fatture in Cloud: dati di Casteltech, destinatario con i dati fiscali, tabella, riquadro verde con i prezzi, pagamento e totale.',
      'Il riquadro verde sta sotto le righe e sopra il totale: mostra solo il prezzo a scheda senza i costi una tantum e il prezzo a scheda con i costi una tantum (una tantum divise sulle schede del primo lotto). Senza costi una tantum c\'è un solo prezzo. Nel riquadro "Ritocchi per il cliente" i due prezzi a scheda si possono riscrivere a mano (es. 174,63 → 174 per le cifre alte): premi "Aggiorna la stampa" e righe, costi una tantum e totale cambiano di conseguenza (5 schede a 174 € e 201 € con le una tantum = 1.005 €). Vuoto = prezzo calcolato. Il calcolo del preventivo non cambia; "Crea ordine" usa i prezzi della stampa.',
      'La stampa mostra sempre l\'ultima versione SALVATA del preventivo (in alto c\'è l\'ora del salvataggio). Se premi Stampa con modifiche non salvate, il portale prima salva e poi apre la stampa; se la stampa era già aperta in un\'altra scheda del browser, tornandoci si aggiorna da sola.',
      'A sinistra, nel riquadro "Cosa stampare", scegli la versione: Essenziale (codice, quantità e prezzo a scheda, senza dettaglio; se ci sono costi una tantum sono compresi nel prezzo a scheda e sotto la descrizione c\'è solo "Comprensivo dei costi una tantum"), Essenziale con dettaglio (componenti, PCB, SMD, THT, materiale di consumo e spedizione, ognuno con il prezzo), Macro aree o Dettaglio per fasi.',
      'Nella versione con dettaglio gestione materiale e imballaggio non si vedono: sono già dentro SMD e THT, 70% su SMD e 30% su THT, pesati sul valore delle due aree (con SMD 10 € e THT 90 € all\'SMD va circa il 21%).',
      'Le condizioni generali di fornitura sono sulla seconda pagina, con lo spazio per la firma del cliente per accettazione (senza condizioni la firma va in fondo alla prima pagina): si tolgono con le spunte del riquadro. Con la spunta "Dettaglio dei costi una tantum" (nelle versioni con dettaglio, macro aree e fasi) sotto la riga COSTI UNA TANTUM si vedono le voci (preparazione documentazione, programmazione, lamina…) con il loro prezzo; togliendola resta solo la riga con il totale. La scelta vale anche per il PDF mandato per email. Il modo di pagamento è quello del cliente in anagrafica.',
      'Le note del preventivo sono interne (mail del cliente, cose da controllare, appunti dell\'ufficio): non si stampano, salvo la spunta "Stampa anche le note interne".',
      'Sotto, nel riquadro "Ritocchi per il cliente", puoi scrivere le note per il cliente, uno sconto (in % su tutto, oppure in € tolto dal totale del lotto) e righe in più con descrizione, quantità e prezzo (es. collaudo, trasporto). Premi "Aggiorna la stampa": restano salvati sul preventivo. Valgono solo nella stampa, il calcolo del preventivo non cambia. Per togliere una riga cancella la descrizione.',
      'Tempi di consegna (obbligatori): prima di stampare o mandare il preventivo scegli a sinistra, in "Tempi di consegna", chi compra il materiale e le settimane, poi premi "Aggiorna la stampa". Materiale del cliente (conto lavoro): "Circa 3 settimane dall\'arrivo di tutto il materiale del cliente". Materiale comprato da noi: "Circa 6 settimane dalla conferma d\'ordine: circa 4 settimane per l\'arrivo del materiale e circa 2 settimane per il montaggio". Si propone "comprato da noi" se nel preventivo c\'è la spunta Componenti. La frase si stampa sopra la modalità di pagamento, anche nel PDF dell\'email; finché manca, "Stampa / salva PDF" e "Invia con Gmail" non partono.',
      'Per mandarlo al cliente dal portale: nella stampa premi "Invia per email" (in alto) oppure, dal preventivo, il pulsante "Invia per email". In fondo al riquadro a sinistra c\'è l\'email già pronta: indirizzo (chi ha mandato la richiesta da Gmail, poi l\'"Email per i preventivi" del cliente in Anagrafiche → Clienti → Dati fiscali, poi l\'ultimo indirizzo usato per lo stesso cliente, il CRM o l\'email amministrativa; gli indirizzi @casteltech.net non vengono mai proposti, così una richiesta inoltrata da info@ va comunque al cliente), oggetto e testo, tutti modificabili. Parte da preventivi@casteltech.net (se in Gmail di info@ non è ancora attivo come "Invia messaggio come", parte da info@) con allegato il PDF uguale alla stampa: stessa versione, condizioni, firma, dettaglio delle una tantum e ritocchi salvati. Il link "PDF" fa vedere prima l\'allegato.',
      'Validità dell\'offerta: accanto ai tempi di consegna si stampa sempre "Montaggio: 30 giorni (fino al …)"; se vendiamo noi componenti o PCB anche "Componenti e PCB: 10 giorni (fino al …), poi prezzi da riconfermare". Le condizioni generali della seconda pagina spiegano validità, ordine, da quando contano le settimane di consegna (conto lavoro: da quando abbiamo tutto il materiale; materiale nostro: dalla conferma d\'ordine) e cosa le sposta.',
      'Ultima pagina "Componenti: alternative da confermare e problemi di acquisto" (con la BOM quotata collegata e i componenti comprati da noi): 1) codici alternativi da confermare, cioè le righe in cui si compra un codice diverso da quello della BOM (alternativa scelta o compatibile proposto dal portale), con riferimenti, codice della BOM, codice proposto, descrizione, quantità e le caselle Sì / No per il cliente; 2) componenti non trovati o con problemi di acquisto: codice non indicato o non trovato presso i distributori (non quotato, in rosso), non disponibile nella quantità, disponibilità da riconfermare, componente a fine vita. Sotto le righe del preventivo una frase rimanda al foglio. Lo stesso codice ripetuto nella BOM è una riga sola; le righe con prezzo scritto a mano nella BOM non compaiono. La spunta "Pagina componenti (alternative e problemi di acquisto)" nel riquadro "Cosa stampare" è sempre attiva: toglierla esclude la pagina e la frase, anche nel PDF dell\'email.',
      'Dopo l\'invio il preventivo resta segnato "Inviato" con data e indirizzo (nella stampa, nel preventivo e nella colonna "Inviato" dell\'elenco) e, se era in bozza, passa a "inviato". Si può mandare di nuovo. Se l\'hai mandato da fuori del portale (posta, a mano), "Segna come inviato" lo segna lo stesso. Nessun segno = ancora da inviare.',
      'Senza email: "Stampa / salva PDF" e nella finestra di stampa scegli "Salva come PDF".',
    ],
    passi: ['Salva il preventivo e premi Stampa.', 'A sinistra scegli la versione (Essenziale, con dettaglio, macro aree, fasi).', 'Se serve: note per il cliente, sconto, righe in più → Aggiorna la stampa.', 'In fondo a sinistra controlla indirizzo, oggetto e testo e premi "Invia con Gmail" (oppure Stampa / salva PDF).'],
    pagine: [['/preventivi', 'Elenco preventivi']],
  },
  {
    id: 'documenti-inviati', area: 'amministrazione', titolo: 'Quali documenti sono già stati inviati (segno "Inviato")',
    parole: 'inviato inviata inviati spedito mandato email mail da inviare non inviato segno icona busta segna come inviato preventivi conferme ddt fatture note di credito autofatture ordini fornitore',
    testo: [
      'Preventivi, conferme d\'ordine, DDT, fatture, note di credito, autofatture e ordini a fornitore hanno negli elenchi la colonna "Inviato" e nella pagina del documento un riquadro con l\'invio. Nessun segno = ancora da inviare.',
      '✉ verde "Inviato 04/11/2026" = mandato per email dal portale (passando il mouse: a chi e a che ora). ✓ = segnato inviato a mano (mandato da fuori del portale) oppure "Da FIC" per i documenti fatti in Fatture in Cloud, inviati da lì.',
      'Fatture, note di credito e autofatture hanno un segno a parte per lo SdI (⇪): blu "SdI consegnata" o "SdI accettata", giallo "SdI in coda" o "non recapitata", rosso "SdI scartata". L\'email al cliente (copia di cortesia) e l\'invio allo SdI sono due cose diverse: la fattura vale solo con lo SdI. Nella pagina della fattura emessa e non ancora partita c\'è scritto "Non ancora inviata allo SdI".',
      'Documento mandato da fuori del portale (posta normale, PEC, consegnato a mano): nella sua pagina scrivi, se vuoi, a chi o come e premi "Segna come inviato". Il segno messo a mano si toglie con "Togli il segno"; quello di un\'email partita dal portale resta.',
    ],
    passi: ['Apri l\'elenco (Preventivi, Conferme d\'ordine, DDT, Fatture, Ordini a fornitore): guarda la colonna "Inviato".', 'Senza segno: apri il documento e mandalo per email, oppure "Segna come inviato" se è già partito da fuori.'],
    pagine: [['/preventivi', 'Preventivi'], ['/ordini/conferme', 'Conferme d\'ordine'], ['/amministrazione/documenti?tipo=ddt', 'DDT'], ['/amministrazione/documenti?tipo=fattura', 'Fatture'], ['/ordini/fornitori', 'Ordini a fornitore']],
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
    parole: 'stato bozza inviato accettato rifiutato archiviato duplica copia prezzi attuali elimina commessa azioni multiple elenco colonne totale a scheda una tantum pcb',
    testo: [
      'Ogni preventivo ha uno stato: bozza, inviato, accettato, rifiutato, archiviato.',
      'Colonne dei prezzi nell\'elenco: "€/PCB" e "Totale" sono il prezzo a scheda e il totale del lotto SENZA le una tantum (lotti successivi); "Una tantum" sono i costi del solo primo lotto; "€/PCB con u.t." (dal 5/11/2026) è il prezzo a scheda del primo lotto, cioè (totale + una tantum) ÷ nr. PCB. Se nei ritocchi della stampa hai scritto a mano il prezzo a scheda con le una tantum, l\'elenco mostra quello con un asterisco. Le stesse colonne sono anche nell\'Excel.',
      'Nell\'elenco puoi spuntare più preventivi e: creare la commessa, duplicare, eliminare.',
      '"Duplica" copia il preventivo con le tariffe di allora; "Duplica con prezzi attuali" lo rifà con tariffe e fasi di oggi.',
      'Un preventivo che ha già una commessa non si elimina.',
    ],
    pagine: [['/preventivi', 'Elenco preventivi']],
  },
  {
    id: 'bom-preventivo', area: 'preventivi', titolo: 'Costo dei componenti dal preventivo (BOM collegata)',
    parole: 'bom costo componenti acquisti materiali collegare prezzo componenti quotare quotata quotazione documenti cliente critico critici non quotato disponibile note senza prezzo evidenziati filtro codici uguali ripetuti uniti aggregati alternative equivalenti cerca alternative',
    testo: [
      'Nel gruppo ACQUISTI del preventivo puoi scegliere una BOM già caricata in Quotazioni: il costo dei componenti a scheda si ricalcola sulle schede del preventivo con le offerte già lette dai distributori.',
      'Se scrivi il costo a mano, il collegamento alla BOM si toglie. Se la BOM viene eliminata, il costo salvato resta.',
      'Preventivo nato dai documenti del cliente: spuntando "Componenti" in Acquisti la BOM del cliente va da sola in Quotazioni e si quota (codici e prezzi dei distributori). Finita la quotazione il costo a scheda arriva nel preventivo; se ci sono righe da completare, codici da validare, righe senza prezzo o componenti non disponibili compare "Risolvi nella BOM quotata".',
      'Nella BOM quotata il riquadro in alto dice cosa resta da sistemare; quando hai finito premi "Torna al preventivo per la quota": il costo si ricalcola, poi Salva.',
      'Componenti senza prezzo: premi il filtro "Senza prezzo" della BOM quotata (o il link nel riquadro giallo in alto): compare il riquadro rosso con SOLO le righe senza prezzo o non disponibili (riga, P/N, riferimenti, quantità a scheda); in ogni riga scrivi il prezzo €/pz e premi Salva, senza aprire la riga: la riga esce dal riquadro. Nella tabella completa quelle righe sono in rosso.',
      'Schede per cui comprare: la casella "Schede per cui comprare i componenti" sopra la tabella (anche più quantità, es. 1, 5) e "Ricalcola gli acquisti" rifanno quantità e scarti senza richieste ai distributori. Un componente "non montato" per sbaglio (es. LED con "590 nm" letto come NM): premi Rielabora, che cerca ai distributori solo i codici mai cercati prima.',
      'Ricerca su internet (5/11/2026): per le righe che restano senza prezzo e senza alternativa (codice incompleto, scritto male, componente obsoleto) il portale fa cercare all\'IA su internet il codice completo del produttore, dove si compra e le criticità. Se il codice completo lo vende un distributore collegato diventa l\'alternativa (passivi e altri non attivi da soli, attivi con "Confermo"); in ogni caso nelle note della riga compare "ricerca su internet: …" con cosa è stato trovato e la CRITICITÀ (obsoleto, tempi lunghi, solo a bobina…). Si fa alla prima elaborazione, con "Aggiorna prezzi" e con "Cerca alternative" (non con Rielabora), al massimo 12 righe per volta; ogni riga costa qualche centesimo di IA (token + ricerche, contati in Impostazioni → Servizi).',
      'Codici uguali: le righe della BOM con lo stesso P/N diventano una riga sola (quantità a scheda sommata, riferimenti uniti, "+N righe" sotto il numero), così acquisto e scarto si calcolano sul totale. Un prezzo scritto a mano vale per tutte. Una BOM caricata prima: premi "Rielabora" (ai distributori chiede solo i codici mai cercati).',
      'Alternative per i componenti senza prezzo o non disponibili: nel riquadro "Senza prezzo" premi "Cerca alternative". Resistenze, condensatori, induttanze e gli altri componenti non attivi con le stesse caratteristiche si comprano da soli (il più economico disponibile, segnato "→ codice equivalente" nella colonna P/N); per gli attivi o se non è sicuramente uguale serve la conferma in "Codici compatibili da verificare". Tutte le alternative finiscono nella stampa del preventivo per la conferma del cliente.',
      'Componenti non disponibili (critici): quando il costo arriva dalla BOM, ogni componente che non si trova in nessuno degli shop collegati viene scritto da solo nelle note del preventivo, una riga per componente: "P/N (riferimenti): componente non quotato perché attualmente non disponibile". Le note restano modificabili. Se nella BOM scrivi un prezzo a mano per quel componente, non è più critico: tornando al preventivo con "Torna al preventivo per la quota" la sua riga sparisce dalle note (poi Salva). Queste righe si stampano SEMPRE nelle note della stampa e del PDF per il cliente (le altre note interne solo con la spunta "Stampa anche le note interne del preventivo"); nella stampa valgono i componenti ancora non disponibili nella BOM collegata, quindi un prezzo scritto a mano nella BOM li toglie anche da lì.',
    ],
    pagine: [['/quotazioni', 'Quotazioni → BOM caricate']],
  },

  // ── Ordini ──
  {
    id: 'carica-ordine', area: 'ordini', titolo: 'Caricare un ordine del cliente (PDF, foto, email)',
    parole: 'ordine ordini carico caricare caricamento inserire nuovo file documenti pdf foto email eml acquisire da acquisire drive cartella ia leggere salvo dove',
    testo: [
      'Gli ordini non si scrivono a mano: si carica il file e l\'IA prepara una proposta. L\'ordine nasce solo quando la confermi. Nel menu Commerciale la pagina si chiama "Ordini da e-mail e PDF".',
      'Due modi: caricare il file in Ordini → Da acquisire, oppure metterlo nella cartella Google Drive condivisa con il portale (si legge da sola ogni 15 minuti, lun–ven 8–20; il pulsante "Controlla adesso la cartella" non fa aspettare).',
      'Il cliente si sceglie SOLO dall\'anagrafica: se l\'IA legge un nome che non c\'è, scegli tu il cliente giusto e premi "Salva le correzioni", così i prodotti si ricollegano. Gli ordini arrivati per email prendono il numero dal 9001 in su.',
      'Ordine senza colonna codice (per esempio Control Systems: "Saldatura SMD ns. scheda M0929-C Vers. CRONOS"): il portale cerca nella descrizione i codici dei prodotti del cliente e collega la riga da solo. Se non trova niente, scegli il prodotto dal menu "Prodotto in anagrafica" e premi "Salva le correzioni". Le spese una tantum diventano righe di servizio. Stesso codice su più righe con la fase (Saldatura SMD, Ripresa PTH): i DDT si abbinano alla riga della stessa fase.',
      'Codice nuovo che compare solo con l\'ordine: sotto il menu della riga "+ Nuovo prodotto" propone codice (es. M0929-C CRONOS da "M0929-C Vers. CRONOS") e descrizione; correggili e premi "Aggiungi in anagrafica": il prodotto va nell\'anagrafica del cliente e si collega alla riga. Lo stesso nella pagina dell\'ordine.',
      'Ordine già creato da correggere: nella pagina dell\'ordine codice (solo dall\'anagrafica), descrizione, quantità, prezzo e consegna si cambiano nelle righe; l\'ultima riga vuota aggiunge una riga mancante; poi Salva. La commessa si crea dal preventivo: nella colonna Commessa più righe possono puntare alla stessa (es. Saldatura SMD e Ripresa PTH della stessa versione).',
      'Conti dell\'ordine: il portale fa quantità × prezzo di ogni riga e confronta la somma con il totale merce scritto nell\'ordine (e con l\'importo della riga, se c\'è). Se non tornano, in cima alle righe compare l\'elenco giallo con la differenza e le righe da guardare sono evidenziate: correggi o chiedi al cliente. Per confermare lo stesso serve la spunta "Ho controllato". Se il totale non è stato letto, scrivilo nella casella "Totale merce nell\'ordine".',
    ],
    passi: ['Ordini → Da acquisire.', 'Scegli il file (PDF, foto, email .eml, testo) e premi Carica e leggi.', 'Apri la proposta, controlla cliente, righe, prezzi e consegne.', 'Conferma e crea l\'ordine.'],
    pagine: [['/ordini/acquisire', 'Ordini da e-mail e PDF']],
  },
  {
    id: 'pre-produzione', area: 'commesse', titolo: 'Pre-produzione della commessa: controllo completo, cosa fare e cosa non fare, checklist e via libera',
    parole: 'pre-produzione preproduzione scheda pre produzione via libera checklist verifica finale chi conferma data cosa fare cosa non fare materiale in casa magazzino bom offerte gerber documentazione tecnica segnalazioni preanalisi commessa prima di produrre',
    testo: [
      'Nella pagina della commessa il pulsante "Pre-produzione" apre una pagina sola con tutto quello che serve prima di produrre: 1) cliente, ordine nel portale e conferma d\'ordine, preventivo con prezzo a scheda e lavorazioni, ore previste, programmi e lamine della scheda tecnica; 2) i file del cliente (pacchetto dei Documenti dei clienti collegato al preventivo: Gerber, BOM, pick and place da scaricare, disegno della scheda, fogli SMD TOP/BOT, THT e protezioni per l\'onda); 3) tutte le segnalazioni: preanalisi dei documenti (con "Va bene" già dato), note del cliente, note del preventivo, storico del prodotto dalle commesse precedenti, note di montaggio.',
      '4) La BOM quotata collegata al preventivo con le offerte usate (distributore, codice, prezzo, totale per la quantità quotata più vicina alla commessa) e lo stato del materiale riga per riga: "dal cliente" (conto lavoro: riga segnata nella BOM o codice in Anagrafiche → Componenti clienti), "arrivato / in parte / ordinato / da ordinare" dagli ordini a fornitore collegati alla BOM o alla commessa (come in "Cosa manca"), "senza prezzo". Il portale non ha un magazzino: il materiale che c\'è già (scorte, avanzi) lo spunti tu nella colonna "In casa", e resta scritto chi l\'ha spuntato.',
      '5) "Cosa fare" e "cosa non fare": il portale propone un elenco dalle lavorazioni del preventivo, dalle note del cliente, dallo storico e dalle segnalazioni aperte; l\'ufficio scrive il suo nelle due caselle. 6) Checklist finale: le voci dipendono dalle lavorazioni (onda, saldatura a mano, AOI, lavaggio, componenti o PCB comprati da noi o del cliente…); ogni spunta prende il nome di chi la conferma e la data. "Via libera alla produzione" si dà solo con tutte le voci confermate: resta scritto chi e quando, e la commessa aperta passa "in produzione". Se dopo si toglie una voce, il via libera decade.',
    ],
    passi: ['Crea la commessa dal preventivo e premi "Pre-produzione".', 'Leggi le sei sezioni; chiudi le segnalazioni con "Va bene" nei documenti, ordina quello che manca con "Cosa manca".', 'Scrivi cosa fare e cosa non fare, spunta la checklist e premi "Salva".', 'Con tutto confermato premi "Via libera alla produzione", poi stampa la scheda di produzione.'],
    pagine: [['/commesse', 'Commesse'], ['/preventivi/documenti', 'Documenti dei clienti'], ['/ordini/fornitori', 'Ordini a fornitore']],
  },
  {
    id: 'cosa-manca', area: 'commesse', titolo: 'Cosa manca per la commessa: componenti da ordinare',
    parole: 'cosa manca commessa componenti mancanti da ordinare ordinati arrivati bom bozza materiale acquisti',
    testo: [
      'Nella pagina della commessa il pulsante "Cosa manca" confronta i componenti della BOM quotata collegata al preventivo (per la quantità di schede della commessa) con gli ordini a fornitore già fatti per quella BOM o per la commessa: per ogni componente vedi quanti ne servono, quanti sono ordinati, quanti arrivati e lo stato (da ordinare, ordinato, in parte, arrivato).',
      'Con "Crea le bozze con i componenti mancanti" nasce una bozza di ordine a fornitore per ogni distributore (con il fornitore dell\'anagrafica proposto), con le sole quantità che mancano, collegata alla BOM e alla commessa: la controlli, la emetti e la mandi come gli altri ordini a fornitore.',
      'Se la commessa non ha una BOM quotata, la pagina lo dice: si collega dal preventivo (gruppo ACQUISTI o spunta Componenti). Le righe della BOM senza prezzo non si possono controllare e sono elencate a parte.',
    ],
    passi: ['Apri la commessa e premi "Cosa manca".', 'Guarda le righe rosse (da ordinare) e quelle in parte.', 'Spunta i distributori e premi "Crea le bozze con i componenti mancanti".'],
    pagine: [['/commesse', 'Commesse'], ['/ordini/fornitori', 'Ordini a fornitore']],
  },
  {
    id: 'avviso-margine-fattura', area: 'amministrazione', titolo: 'Fattura: avviso se il prezzo è sotto il preventivo o il margine è basso',
    parole: 'fattura prezzo basso sotto preventivo margine basso riga gialla avviso prezzo sbagliato controllo prezzi guadagno 10%',
    testo: [
      'Nella bozza di fattura ogni riga con un codice prodotto viene confrontata con l\'ultimo preventivo salvato di quel codice per lo stesso cliente. Se il prezzo scritto (tolto lo sconto) è sotto il prezzo a scheda del preventivo di oltre l\'1 %, la riga diventa gialla con "sotto il preventivo"; se il prezzo è in linea ma il margine del preventivo è sotto il 10 %, "margine basso".',
      'Sopra la tabella c\'è il riepilogo con i numeri del preventivo (es. "lì 5,54 € a scheda, qui 5,00 €, −10 %"). È solo un avviso: la fattura si emette comunque. Senza un preventivo di quel codice non compare niente.',
    ],
    pagine: [['/amministrazione/documenti?tipo=fattura', 'Fatture']],
  },
  {
    id: 'controlli-settimanali', area: 'amministrazione', titolo: 'Controlli settimanali: le cose lasciate a metà',
    parole: 'controlli settimanali lunedì cose a metà ddt vecchi non fatturati ordini senza data consegna prodotti senza prezzo clienti senza codice sdi pec fatture fornitori senza scadenza preventivi fermi bozze commesse oltre consegna fasi aperte',
    testo: [
      'Amministrazione → Controlli settimanali raccoglie in una pagina sola, dalle più urgenti, le cose che nessun cruscotto mostra insieme: commesse aperte oltre la data di consegna; DDT da fatturare da più di 20 giorni; fasi aperte dal telefono da più di 2 giorni; ordini con righe senza data di consegna; prodotti in ordine senza prezzo in anagrafica; clienti fatturati nell\'ultimo anno senza codice destinatario né PEC; fatture fornitori senza scadenza di pagamento; preventivi in bozza fermi da più di 30 giorni.',
      'Ogni riga porta alla pagina dove si sistema (commessa, DDT, ordine, prodotto, dati fiscali del cliente, fattura del fornitore, preventivo). La pagina si calcola quando la apri: niente controlli automatici. Il link sta anche nel riquadro Amministrazione del cruscotto generale.',
    ],
    passi: ['Il lunedì apri Amministrazione → Controlli settimanali.', 'Parti dalle sezioni urgenti (rosse).', 'Sistema ogni riga dalla sua pagina; ricarica per vedere cosa resta.'],
    pagine: [['/amministrazione/controlli', 'Controlli settimanali']],
  },
  {
    id: 'crediti-clienti', area: 'amministrazione', titolo: 'Crediti verso clienti: da incassare, scaduto per fasce, giorni medi di incasso',
    parole: 'crediti credito clienti da incassare scaduto scadute fasce 30 60 90 esposizione giorni medi incasso pagano ritardo prossime scadenze 14 giorni incassata',
    testo: [
      'Amministrazione → Crediti verso clienti mostra quanto c\'è da incassare dalle fatture emesse (anche lo storico di Fatture in Cloud), quanto è già scaduto e da quanto: fino a 30 giorni, 31–60, 61–90, oltre 90. Le note di credito aperte tolgono dal credito del cliente.',
      'La tabella per cliente dà l\'esposizione (tutto ciò che deve ancora pagare), lo scaduto per fascia, il ritardo più lungo e i giorni medi di incasso (dalla data della fattura al pagamento, sulle rate pagate negli ultimi 12 mesi): serve a capire chi paga puntuale e chi no.',
      'In fondo le rate che scadono nei prossimi 14 giorni, con "Segna incassata" sulla riga (data e modo di pagamento). I conti si fanno quando si apre la pagina, nessun controllo automatico. Per chi ha scaduto c\'è "Sollecito", che porta a Solleciti incassi: il portale prepara l\'email, non la manda mai da solo.',
    ],
    passi: ['Apri Amministrazione → Crediti verso clienti.', 'Guarda le fasce e i clienti in cima (più scaduto).', 'Per un cliente in ritardo premi "Sollecito"; quando arriva un pagamento premi "Segna incassata".'],
    pagine: [['/amministrazione/crediti', 'Crediti verso clienti'], ['/amministrazione/solleciti', 'Solleciti incassi']],
  },
  {
    id: 'solleciti-incassi', area: 'amministrazione', titolo: 'Solleciti incassi: email al cliente per le fatture scadute',
    parole: 'sollecito solleciti incassi pagamento fatture scadute scaduto email cliente gmail iban ritardo ultimo avviso crm',
    testo: [
      'Amministrazione → Solleciti incassi elenca le rate scadute e non incassate delle fatture emesse, un gruppo per cliente, con il totale, il ritardo massimo e il livello: primo sollecito sotto i 30 giorni, secondo fino a 60, poi ultimo avviso. Ci si arriva anche dal pulsante rosso "incassi scaduti" del cruscotto e dalla scheda del cliente.',
      '"Prepara il sollecito" scrive l\'email: elenco delle fatture con data, scadenza, giorni di ritardo e importo, totale scaduto, IBAN dell\'azienda (da Impostazioni → Amministrazione). Il destinatario proposto è l\'email amministrativa del cliente (Dati fiscali). Si corregge tutto prima di mandarla.',
      'Con Gmail attivo (delega di Google Workspace per info@) il pulsante "Invia con Gmail" la manda e la registra nel CRM del cliente come attività email. Finché la delega non c\'è: "Apri nella posta" o "Copia il testo", poi "Segna come mandato" per registrarla nel CRM. Una rata incassata si segna dalla fattura e sparisce dall\'elenco.',
    ],
    passi: ['Apri Amministrazione → Solleciti incassi.', 'Premi "Prepara il sollecito" sul cliente.', 'Controlla destinatario e testo, poi "Invia con Gmail" (o "Apri nella posta" e "Segna come mandato").'],
    pagine: [['/amministrazione/solleciti', 'Solleciti incassi'], ['/amministrazione', 'Cruscotto amministrazione']],
  },
  {
    id: 'bozze-autosalvataggio', area: 'amministrazione', titolo: 'Le bozze si salvano da sole',
    parole: 'salvataggio automatico autosave bozza salva da sola modifiche non salvate ctrl s scorciatoia perso lavoro chiudere pagina',
    testo: [
      'Nelle bozze di fattura e nota di credito, DDT, conferma d\'ordine e ordine a fornitore non serve più premere Salva a ogni modifica: due secondi dopo l\'ultima cosa scritta la bozza si salva da sola, e accanto al pulsante Salva compare "Salvato alle 10:32".',
      'Se qualcosa non va (es. data non valida) compare in rosso "Non salvato: …" con il motivo: si corregge e si risalva. Il pulsante Salva funziona come prima e ricarica la pagina con i totali aggiornati; Ctrl+S (Cmd+S sul Mac) lo preme.',
      'Chiudendo la pagina con modifiche non ancora salvate il browser chiede conferma. I documenti già emessi non cambiano: il salvataggio automatico vale solo per le bozze (e per le conferme d\'ordine ancora modificabili).',
    ],
    pagine: [['/amministrazione/documenti?tipo=ddt', 'DDT'], ['/ordini/fornitori', 'Ordini a fornitore']],
  },
  {
    id: 'fatture-differite', area: 'amministrazione', titolo: 'Fatture differite: i DDT da fatturare entro il 15',
    parole: 'differita differite TD24 DDT da fatturare entro il 15 del mese dopo fattura tutti i DDT riepilogativa mensile promemoria scadenza bolla già fatturato anticipo proforma valore zero',
    testo: [
      'I DDT di vendita e reso lavorato emessi in un mese si fatturano entro il 15 del mese dopo (fattura differita, tipo TD24: il portale lo sceglie da solo all\'emissione quando la fattura cita DDT con data precedente).',
      'Amministrazione → Fatture differite mostra tutti i DDT emessi e non ancora fatturati, raggruppati per cliente, con il termine: giallo se scade in questo mese, rosso se è già passato. "Fattura tutti i DDT" prepara una bozza con le righe di tutti i DDT del cliente; "Fattura tutti i clienti in scadenza" ne prepara una per cliente.',
      'Il cruscotto generale lo ricorda in "Da fare oggi": giallo dal 1° del mese per i DDT del mese prima, rosso dal 16 se non sono ancora fatturati. Le bozze si controllano (prezzi, pagamento) e si emettono una per una.',
      'Non sono "da fatturare": i DDT di reso non lavorato, garanzia, conto visione, conto lavorazione, campioni, prestito, reso riparato e completamento fornitura, e i DDT dello storico di Fatture in Cloud a valore zero (merce già fatturata con anticipo o proforma).',
      'Un DDT già fatturato in altro modo (anticipo, proforma, fattura di Fatture in Cloud senza collegamento) si toglie dall\'elenco con "Già fatturato": nella pagina del DDT, o spuntando più DDT in Amministrazione → DDT. Si rimette con "Rimetti tra i da fatturare" nella pagina del DDT.',
    ],
    passi: ['Amministrazione → Fatture differite (o il pulsante nel cruscotto).', 'Per un cliente: "Fattura tutti i DDT"; oppure in alto "Fattura tutti i clienti in scadenza".', 'Nella bozza controlla prezzi e pagamento, poi Emetti e Invia allo SdI.'],
    pagine: [['/amministrazione/differite', 'Fatture differite'], ['/amministrazione/documenti?tipo=ddt', 'DDT']],
  },
  {
    id: 'ddt-emessi', area: 'amministrazione', titolo: 'Fare un DDT, stamparlo e mandarlo per email',
    parole: 'ddt nuovo emettere fare bolla unità misura um pz nr kg testo documento trasporto spedire spedizione stampare stampa pdf corriere vettore colli peso causale reso lavorato vendita annullare fatturare email mail inviare mandare gmail componente componenti conto lavoro restituire libero modificare correggere cambiare sbagliato errore togliere cancellare eliminare riga tipo',
    testo: [
      'Il DDT si fa dal portale: dalla pagina dell\'ordine con "Crea DDT" (righe con le schede ancora da spedire, quantità e riferimento all\'ordine del cliente già scritti) oppure da Amministrazione → DDT → "+ Nuovo DDT".',
      'Causale, trasporto a cura, vettore e destinazione sono proposti dall\'ultimo DDT dello stesso cliente. Il prezzo delle righe non si stampa: serve quando si fattura il DDT.',
      'Causale del trasporto: clic sulla casella (o freccia giù) = elenco di tutte le causali, anche se una è già scritta; scrivendo l\'elenco si filtra; si può anche scrivere una causale che non c\'è. Lo stesso vale per tutte le caselle del portale con un elenco (banca o conto, operatori, unità di misura, destinazioni…).',
      'Per email: l\'indirizzo proposto è l\'"Email per fatture e DDT" del cliente (Anagrafiche → Clienti → Dati fiscali), altrimenti l\'ultimo indirizzo usato per un DDT dello stesso cliente.',
      'Nella stampa del DDT (e nel PDF mandato per email) il riquadro con aspetto dei beni, colli, peso, inizio del trasporto, vettore e firme sta sempre in fondo alla pagina, come nei DDT di Fatture in Cloud; se le righe sono tante, in fondo all\'ultima pagina.',
      'Causale, trasporto a cura, vettore e destinazione sono proposti dall\'ultimo DDT dello stesso cliente. Se il cliente ha una sede operativa diversa dalla sede legale (Anagrafiche → Clienti → Dati fiscali), il luogo di destinazione proposto è la sede operativa; nell\'intestazione resta la sede legale. Il prezzo delle righe non si stampa: serve quando si fattura il DDT.',
      'Con "Emetti" il DDT prende il numero successivo. Si stampa con "Stampa / PDF" (due copie: una viaggia con la merce). Le righe venute dall\'ordine lo evadono da sole.',
      'Non si può emettere senza causale, "trasporto a cura del", righe con quantità e, se il trasporto è a cura del vettore, il nome del corriere.',
      'Un DDT emesso si corregge con "Modifica DDT" (righe, quantità, trasporto, destinazione): numero e data restano gli stessi. Non si modifica più quando è in una fattura già mandata allo SdI (o fatta in Fatture in Cloud). Se il DDT è in una fattura non ancora mandata, correggi anche la fattura. Se lo avevi già mandato per email, rimandalo.',
      'Se la merce non parte, "Annulla DDT": il numero resta usato e il DDT resta nell\'elenco come annullato. Un DDT già messo in una fattura non si annulla.',
      'Per fatturarlo: "Fattura questo DDT" prepara la fattura con le sue righe; si possono aggiungere altri DDT dello stesso cliente.',
      'Ogni riga del DDT ha a sinistra la colonna "Tipo" (non si stampa): Prodotto (i codici del cliente, come prima), Componente nostro (archivio Componenti: si cerca per P/N, codice gestionale o codice di produzione; sul DDT va il codice gestionale e in descrizione il P/N con il codice di produzione tra parentesi), Componente cliente (i codici del materiale in conto lavoro del cliente del DDT, Anagrafiche → Componenti clienti: per restituirlo non montato) oppure Libero (codice e descrizione scritti a mano, senza anagrafica). Nel Codice compaiono solo i codici del tipo scelto: scrivi una parte del codice e clicca la voce nell\'elenco (o frecce e Invio). Se il codice non c\'è, in fondo all\'elenco "+ Nuovo…": il componente del cliente si aggiunge subito, il componente nostro si codifica in Anagrafiche → Componenti. La ✕ in fondo alla riga la toglie (poi Salva).',
      'Per mandarlo al cliente: nella pagina del DDT emesso (o nella sua stampa) premi "✉ Invia per email", che porta al riquadro "Invia il DDT per email". L\'indirizzo proposto è l\'"Email per fatture e DDT" del cliente (Anagrafiche → Clienti → Dati fiscali), altrimenti quello a cui è stato mandato l\'ultimo DDT dello stesso cliente, poi quello del CRM, poi la PEC; oggetto e testo si possono cambiare. "Invia con Gmail" lo manda da amministrazione@casteltech.net (o da info@ finché l\'indirizzo non è attivo in Gmail) con il PDF del DDT allegato e resta scritto a chi e quando è partito.',
    ],
    passi: ['Apri l\'ordine e premi Crea DDT (oppure + Nuovo DDT e scegli il cliente).', 'Controlla quantità, colli, peso, vettore e destinazione, poi Salva.', 'Premi Emetti.', 'Premi Stampa / PDF e stampa due copie.', 'Se serve, in fondo alla pagina controlla l\'indirizzo e premi Invia con Gmail.'],
    pagine: [['/amministrazione/documenti?tipo=ddt', 'DDT'], ['/ordini', 'Ordini']],
  },
  {
    id: 'conferma-ordine', area: 'ordini', titolo: 'Conferma d\'ordine al cliente (PDF e email)',
    parole: 'conferma confermare conferme ordine pdf email gmail rispondere risposta inviare mandare cliente date consegna righe accettazione aggiornare riprendere correggere',
    testo: [
      'Dall\'ordine caricato nel portale si prepara la conferma per il cliente: il pulsante "Conferma d\'ordine" in alto nella pagina dell\'ordine copia tutte le righe con quantità, prezzi e date di consegna.',
      'Righe e date si cambiano liberamente nella conferma (non toccano l\'ordine): si aggiungono righe con "+ Riga", si tolgono con la spunta "Togli". Le consegne a programma diventano una riga per ogni consegna.',
      'Per emettere serve una data di consegna su ogni riga. Emetti dà il numero (la serie continua quella degli "Ordini" di Fatture in Cloud: 74 al 23/10/2026) e salva il PDF, impaginato come i preventivi. Una conferma emessa si può ancora correggere: il PDF si rifà con lo stesso numero.',
      'Invio: se l\'ordine è arrivato per email, "Invia con Gmail" risponde a quell\'email (stessa conversazione) da ordini@casteltech.net (o da info@ finché l\'indirizzo non è attivo in Gmail) con il PDF allegato; destinatario, oggetto e testo si possono cambiare. Finché la delega di Gmail non è attiva il pulsante è spento: scarica il PDF con "Apri il PDF" e mandalo dalla posta.',
      'Ordine corretto dopo la conferma (codice, quantità, prezzo, consegna o una riga in più): apri la conferma e premi "Riprendi le righe dall\'ordine". Le righe tornano uguali all\'ordine; se è già emessa resta lo stesso numero, poi rimandala con "Invia con Gmail".',
      'Non si può preparare la conferma se il cliente dell\'ordine non è in anagrafica. Una bozza si elimina; una conferma emessa si annulla (resta nell\'elenco e il numero non si riusa).',
      'Tutte le conferme (bozze in cima, poi per numero) stanno in Commerciale → Conferme d\'ordine, con cliente, ordine, stato e data di invio. Spuntando le righe: "Apri il PDF", "Duplica" (nuova bozza con le stesse righe, prende il numero successivo all\'emissione) e "Annulla / Elimina" (le bozze si eliminano, le emesse si annullano). Per cambiare il numero di una conferma emessa: Duplica, poi annulla quella vecchia ed emetti la copia.',
    ],
    passi: ['Apri l\'ordine (Ordini → Da evadere, clic sulla riga).', 'Premi "Conferma d\'ordine".', 'Controlla righe, prezzi e date di consegna, correggi e Salva.',
      'Premi Emetti.', 'Controlla destinatario e testo, poi "Invia con Gmail" (oppure "Apri il PDF" e mandalo a mano).'],
    pagine: [['/ordini/conferme', 'Conferme d\'ordine'], ['/ordini', 'Ordini da evadere']],
  },
  {
    id: 'ordini-fornitore', area: 'ordini', titolo: 'Ordini a fornitore (componenti, PCB, lavorazioni)',
    parole: 'fornitore fornitori compera comprare comprato ordinare pcb componenti materiali consumo lamina pasta stagno distributore mouser digikey farnell tme carrello arrivo arrivata arrivati merce decimali prezzo unitario pdf firma accettazione conferma',
    testo: [
      'Gli ordini che Casteltech fa ai fornitori stanno in Acquisti → Ordini a fornitore (prima si facevano in Fatture in Cloud). Il fornitore si sceglie solo dall\'anagrafica: se manca si aggiunge in Anagrafiche → Fornitori.',
      '"+ Nuovo ordine" crea una bozza: si scrivono le righe (codice del fornitore o P/N, descrizione, quantità, prezzo, consegna richiesta), la vostra offerta, il pagamento e la commessa per cui si compra. Nel Codice scrivi una parola ("lamina", "pasta", "kapton") o il P/N: il menu propone i materiali di consumo (Anagrafiche → Materiali di consumo, codici MC-…) e i componenti dell\'archivio (Anagrafiche → Componenti); scegliendone uno arrivano descrizione e ultimo prezzo d\'acquisto, e la descrizione si può completare per questo ordine. In fondo al menu "+ Nuovo materiale" lo aggiunge in anagrafica con un codice nostro, "Riga libera" lascia la riga come scritta e sotto le righe il riquadro "Righe non in anagrafica" propone "Aggiungi ai materiali" (il codice del fornitore passa nella descrizione e la riga prende il codice nostro). Emetti dà il numero (numerazione degli ordini a fornitore) e conserva il PDF; un ordine emesso si corregge ancora (il PDF si rifà con lo stesso numero), ma il fornitore non si cambia più.',
      'Nel PDF dell\'ordine il prezzo unitario mostra i decimali che ha (di regola due, fino a quattro: 0,0045 €), mentre importi e totale sono sempre a due decimali. Pagamento, totale e firme stanno sempre in fondo al foglio, nell\'ultima pagina se le righe sono tante; sopra le firme c\'è la nota che l\'ordine si considera confermato con la firma del documento, con la conferma d\'ordine del fornitore o con una email, e che una conferma si chiede sempre. Lo stesso vale per i prezzi unitari di preventivi, conferme d\'ordine e fatture.',
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
      'Se il DDT spedisce più schede di quante ne restano sulla riga d\'ordine: se il cliente ha un\'altra riga dello stesso codice in consegna entro 60 giorni, la quantità si divide tra le righe (prima si riempie la più vecchia); altrimenti resta tutta sulla stessa riga, che risulta evasa (più PCB per pannello, ordine variato di qualche scheda). Prima di confermare si può sempre cambiare la riga d\'ordine a mano.',
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
      'Una barra è rossa (in ritardo) se doveva già cominciare o se la lavorazione finisce dopo la data di consegna richiesta (per esempio perché il materiale arriva tardi): nell\'elenco sotto il Gantt c\'è scritto "finisce dopo la consegna".',
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
    id: 'fasi-di-oggi', area: 'reparto', titolo: 'Le tue fasi di oggi e la prossima fase (telefono)',
    parole: 'telefono reparto fasi di oggi mie fasi riapri riaprire fase chiusa prossima fase successiva apri adesso commesse recenti senza qr giornata ore',
    testo: [
      'Nella prima pagina del telefono, sotto le fasi aperte, c\'è "Le tue fasi di oggi": commessa, fase, orari, tempo e pezzi di tutto quello che hai aperto o chiuso oggi, con il totale delle ore. Una fase chiusa si riapre con il tasto Riapri (stessa commessa e fase, ora attuale) senza inquadrare di nuovo il QR.',
      'Sotto ci sono "Le tue commesse degli ultimi giorni": un tocco e sei nella commessa, anche senza scheda sotto mano.',
      'Quando chiudi una fase, la pagina della commessa propone la "Prossima fase": la prima delle fasi previste dopo quella chiusa che nessuno ha ancora fatto né tiene aperta (se dopo non c\'è più niente, la prima saltata). "Apri adesso" la apre all\'ora attuale; altrimenti scegli un\'altra fase dall\'elenco come sempre.',
    ],
    passi: ['Apri /r sul telefono.', 'Chiudi la fase: in alto compare la prossima.', 'Premi "Apri adesso" oppure scegli un\'altra fase.'],
    pagine: [['/r', 'Reparto (telefono)']],
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
    parole: 'quotazioni quotazione quotare componenti bom distinta verificare verifica verificato da verificare approvare confermare codifica codici famiglie nuove famiglia film termistore ntc batteria antenna case excel csv prezzi distributori digikey mouser farnell tme arrow würth wurth we elektronik reperibilità acquisto scarto ia togliere riga sbagliata pulizia intestazione ripetuta pcb circuito stampato escluso esclusi',
    testo: [
      'Carica la BOM (Excel o CSV): il portale trova da solo intestazione e colonne, riconosce i componenti dal P/N o dalla descrizione, calcola il codice di produzione e il codice gestionale, e cerca prezzi e disponibilità da DigiKey, Mouser, Farnell e TME.',
      'Le quantità da comprare includono lo scarto (passivi sotto 0,10 € +10%, sotto 1 € +5%, da 1 a 3 € un pezzo in più). Si scarica un Excel con codifica e acquisti.',
      'Le righe "Da completare" vanno sistemate a mano; poi "Salva i codici nell\'archivio".',
      'Correggere una riga (pagina della riga, "modifica"): scelte Famiglia e Tecnologia si vedono solo i campi che entrano nei codici di quella famiglia, ognuno con un esempio nella casella (es. LED: Case 0805, Tensione 2V, Corrente 20MA, Colore GIALLO; con Tecnologia T il case di esempio diventa quello THT, es. TO-92). Sopra i campi la frase "Per questa famiglia servono: …"; "Mostra tutti i campi" fa vedere anche gli altri. Codice gestionale vuoto su un connettore messo in MI (es. RJ45 THT): scegli la famiglia CN · Connettori con Tipo (RJ45), Passo e Poli, premi Ricalcola e poi "Salva i codici nell\'archivio"; il codice di produzione già in archivio non cambia. Dal 4/11/2026 il portale lo fa da solo: un connettore riconosciuto (RJ45, USB, header, morsetto, impronta "Connector_…") finito in MI, IC o senza famiglia passa a CN, con passo e poli letti dall\'impronta o standard (RJ45: 1,02 mm e 8 poli), e la riga resta "da validare" con il motivo nelle note.',
      'Rielabora e Aggiorna prezzi (4/11/2026): nella BOM "Rielabora" rifà la codifica con le regole nuove e l\'archivio aggiornato usando i prezzi già letti; ai distributori chiede SOLO i codici mai cercati prima (5/11/2026, es. un LED prima letto come "non montato"), quindi di norma non costa e non consuma il limite del giorno (Farnell 1.000 richieste); "Aggiorna prezzi" rilegge prezzi e disponibilità di tutte le righe da tutti i distributori e chiede conferma. Anche cambiare le schede da produrre usa i prezzi già letti. Le varianti e i sostituti di un P/N si chiedono al massimo una volta ogni 24 ore.',
      'Pagina della riga (4/11/2026): le caselle che usano una tabella (case, tipo dei connettori, colore dei LED, tolleranza) aprono l\'elenco dei valori: prima quelli già usati nell\'archivio per la stessa famiglia (con quante volte), poi quelli della tabella; scrivendo l\'elenco si filtra. "Ricalcola" resta sulla pagina e dice il risultato (codici calcolati) o cosa manca ancora; in BOM si torna con "← Torna alla BOM". Se c\'è un problema compare il riquadro giallo "Suggerimenti" (case simili, case già usati, campi da compilare con un esempio). Le correzioni fatte con "Ricalcola" restano anche quando la BOM si rielabora (Rielabora, schede cambiate, riga aggiunta), finché il P/N della riga è lo stesso.',
      'Codice di produzione (regole di Adriano Croci, 4/11/2026): i componenti THT hanno "THT" subito dopo la famiglia (IC-THT-DIP8-NE555P, CE-THT-D8X11.5-…); il case degli integrati si scrive nome e piedini (IC-SOIC8-…, IC-TSSOP14-…); morsetti e terminali vanno nella famiglia TI con i poli prima del passo (TI-THT-MORSETTO-2-508-…). Vale solo per i codici nuovi: i componenti già in archivio tengono il loro codice e vengono ritrovati anche con il codice scritto alla vecchia maniera. Il codice gestionale non cambia.',
      'Componenti THT a misura (5/11/2026): per fusibili, clip e portafusibili il formato è la misura in mm: scrivi 5X20 o 6.3X32 (clip o portafusibile: CLIP5X20) nella casella Case/Formato. Il portale la legge da solo dalla descrizione o dall\'impronta ("Clip portafusibile 5x20 mm"). Per qualsiasi altro componente THT senza un formato standard scrivi la misura allo stesso modo (es. 12X12) con Tecnologia T: il codice esce senza verifica (gestionale a 4 caratteri: 5X20, 6X32, 1038, clip C520).',
      'Formato nuovo (4/11/2026): se il case della riga non è in tabella (es. "2SMD" di un pulsante), in cima alla pagina della riga compare il riquadro "Aggiungi il formato alla tabella": controlla il formato, scrivi il codice di 4 lettere o cifre che entra nel codice gestionale (proposto dal portale; per un formato uguale a uno già in tabella usa il suo codice, es. T236), scegli S (SMD) o T (THT) e premi "Aggiungi alla tabella e ricalcola". Da quel momento vale per tutte le BOM (per quelle già caricate premi "Rielabora"). L\'elenco dei formati aggiunti, con il tasto "Togli", è in Impostazioni → Componenti; i componenti già in archivio non cambiano codice.',
      'Tabella dei case (4/11/2026): Impostazioni → Componenti → "Tabella dei case" elenca tutti i formati che la codifica conosce (case, codice di 4 caratteri del gestionale, SMD o THT, OK o da verificare, nota, da dove viene), compresi quelli aggiunti dalla riga BOM e la regola degli integrati (SOIC + piedini = SOnn). Si cerca mentre si scrive (es. SOT23, 0805, THT), si ordina cliccando le colonne e si scarica con "Excel".',
      'Righe che il portale ora completa da solo (4/11/2026): integrati che DigiKey mette tra "Power Distribution Switches / Load Drivers" o "LED Drivers" (prima finivano tra gli interruttori), case SOT-23-THIN di Texas (come SOT-23-6), induttanze con le misure decimali di DigiKey (5,7×5,2 → 0505), quarzi Abracon ABM (case dalla serie: ABM8G = 3225, ABM3B = 5032, ABM10 = 2520…, frequenza dal P/N), prese USB-A/USB-B senza passo (standard 4 poli, 2,5 mm), pulsanti senza case (misura in mm). Per applicarle a una BOM già caricata premi "Rielabora"; i valori standard restano "da validare" con il motivo nelle note.',
      'Righe "NUOVO - DA VERIFICARE" (dal 4/11/2026): il portale ha calcolato i codici ma non è sicuro di tutto (case simile a uno già in tabella, es. PDIP-18 come DIP; valori standard usati; codice da validare). Clicca la scritta gialla (o "modifica") e si apre la riga con il riquadro "Codice da verificare": controlla famiglia e campi con il datasheet, correggi e premi Ricalcola se serve, poi "✓ Verificato, salva nell\'archivio". La riga diventa NUOVO e il componente entra subito in Anagrafiche → Componenti: le prossime BOM con lo stesso P/N lo trovano già "in archivio". Il punto finale nel codice di produzione (es. TB-18PDIP-500MA-50V-NPN-ULN28.) non è un errore: il codice ha al massimo 30 caratteri e il punto dice che il P/N è stato accorciato.',
      'Righe che non sono componenti: le intestazioni ripetute (BOM esportate a pagine) e le righe con una sola scritta (titoli, "Note:") si tolgono da sole al caricamento. Il circuito stampato (riferimento PCB/PWB, o descrizione "PCB", "circuito stampato", "bare board") resta nell\'elenco come escluso: non si cerca dai distributori e non entra nel costo, perché il PCB si quota a parte. Il riquadro in cima alla tabella dice quante righe sono escluse e il filtro "Esclusi" le mostra.',
      'Una riga entrata per sbaglio si toglie con "togli" in fondo alla riga: sparisce dalla BOM e i totali di acquisto si ricalcolano (il file caricato non cambia).',
      'Famiglie aggiunte l\'1/11/2026: CF condensatori film (MKP/MKT, codice come i ceramici; per i THT il formato è il passo, P150 = 15 mm), NT termistori NTC/PTC (come le resistenze), BT batterie e portabatterie, AN antenne. Anche case nuovi (TO-252, SC-70, TSOT-23, SOT-563, TO-247, WSON, BGA, DIP…) e categorie DigiKey lette meglio (gli oscillatori non finiscono più tra i quarzi, i varistori tra i TVS, i trimmer tra le resistenze). I componenti già in archivio non cambiano codice. L\'elenco di tutto quello che è stato aggiunto, con data e motivo, è in Impostazioni → Componenti → "Regole aggiunte alla codifica".',
    ],
    passi: ['Quotazioni → Carica una BOM.', 'Controlla colonne e quantità.', 'Sistema le righe da completare.', 'Salva i codici nell\'archivio, scarica l\'Excel.'],
    pagine: [['/quotazioni', 'Quotazioni']],
  },
  {
    id: 'bom-modifiche-mano', area: 'componenti', titolo: 'Correggere a mano una riga della BOM o aggiungerne una',
    parole: 'modifica a mano correggere p/n sbagliato quantità scarto nota commento aggiungere riga aggiunta togliere componente comprato altrove magazzino altro fornitore manca nella bom',
    testo: [
      'Se nella BOM del cliente il P/N o la quantità sono sbagliati: apri la riga ("modifica") e usa il riquadro "Modifica a mano". La BOM si rielabora con il P/N giusto (codici e prezzi) e la correzione resta anche con "Aggiorna prezzi"; nelle note si vede com\'era nella BOM.',
      'Nello stesso riquadro lo scarto: scrivi i pezzi in più per lotto (es. 10) o la percentuale (es. 5%) al posto di quello standard; vuoto = di nuovo quello standard. La nota è un commento dell\'ufficio e si vede nella colonna Note della BOM.',
      'Componenti che mancano nella BOM o che si comprano altrove (magazzino, altro fornitore): sotto la tabella "+ Aggiungi una riga" con P/N o descrizione, pezzi a scheda, prezzo (facoltativo: se c\'è vale quello) e da chi si compra. La riga entra nei totali e quindi nel costo componenti del preventivo collegato alla BOM.',
      'Una riga che non serve si toglie con "togli" in fondo alla riga.',
    ],
    passi: ['Quotazioni → apri la BOM.', 'Riga sbagliata: "modifica" → Modifica a mano → Salva.', 'Riga che manca: "+ Aggiungi una riga" sotto la tabella.'],
    pagine: [['/quotazioni/bom', 'Quotazioni → BOM']],
  },
  {
    id: 'componenti-in-comune', area: 'componenti', titolo: 'Componenti in comune tra le schede di un cliente (feeder fissi)',
    parole: 'componenti in comune comuni stessi feeder fissi cambio macchina cambi fox ipulse selea cliente schede bom confronto attrezzaggio',
    testo: [
      'Per non cambiare i feeder tra una produzione e l\'altra dello stesso cliente (es. Selea), Quotazioni → Componenti in comune mette in fila i componenti che compaiono in più schede del cliente.',
      'Si usano le BOM quotate collegate al cliente (da un preventivo o dai documenti del cliente); si possono anche spuntare a mano. Stesso componente = stesso codice di produzione, altrimenti stesso P/N. I componenti non montati non contano.',
      'In cima quelli presenti in più schede, poi quelli con più pezzi. Scrivendo il numero dei feeder fissi i primi N diventano verdi: sono la proposta di componenti da lasciare sempre su FOX e iPulse.',
      'È solo una consultazione: BOM, archivio e preventivi non cambiano.',
    ],
    passi: ['Quotazioni → Componenti in comune.', 'Scegli il cliente (o spunta le BOM).', 'Scrivi quanti feeder si possono lasciare fissi.', 'Mostra i componenti.'],
    pagine: [['/quotazioni/comuni', 'Componenti in comune']],
  },
  {
    id: 'alternative-componenti', area: 'componenti', titolo: 'Componente non trovato: alternative e reperibilità',
    parole: 'alternativa alternative equivalente compatibile compatibili verificare confermo sostituto prezzo a mano manuale scrivere prezzo p/n non trovato introvabile critico reperibilità disponibile negozi distributori obsoleto due codici diversi valore descrizione kicad equivalenti',
    testo: [
      'Ogni P/N si cerca presso TUTTI i distributori collegati (DigiKey, Mouser, Farnell, TME, Arrow quando ha le chiavi, Würth Elektronik con i NOSTRI prezzi ma solo per i codici WE), tutti insieme: nessuno si ferma al primo. Se un distributore sbaglia su un P/N si riprova e si passa al successivo; si ferma solo con chiavi sbagliate, limite di richieste finito o tre errori di fila. Se uno non lo ha ma un altro sì, va bene: nessuna segnalazione, si compra da chi lo ha al prezzo migliore.',
      'Prima si cerca chi ha tutti i pezzi che servono, poi il prezzo: un componente disponibile costa anche di più, ma si compra quello.',
      'BOM senza colonna P/N (es. KiCad): il codice si cerca nelle colonne Valore e Descrizione ("1N5819S4/SOD123" → 1N5819S4). Se nella riga ci sono due codici diversi si cercano tutti e due e si compra quello che si trova. La nota della riga dice se sono lo stesso codice (BAT54C e BAT54C,215), lo stesso componente di produttori diversi (1N5819S4 e 1N5819HW-7-F: equivalenti) oppure due componenti diversi da controllare ("codice da validare").',
      'Il portale confronta anche quello che è scritto nella BOM con quello che dice il codice: valore, case e tensione diversi (es. BOM 168K, codice RC0805FR-07162KL = 162K; BOM 1nF 630V 1206, codice da 4,7 µF 50V 1210) rendono la riga "codice da validare". Tensione più alta o tolleranza più stretta nel codice vanno bene. Le righe DNP o "Excluded from BOM" non si comprano.',
      '"Critico" solo se il componente non è disponibile da nessuna parte (non trovato o pezzi insufficienti sommando tutti). "Attenzione" solo se la quantità c\'è ma va divisa tra più distributori, o se un distributore non ha risposto (premi "Aggiorna prezzi"). Fine vita, scorte basse e simili restano come note nella riga, senza segnalazione.',
      'Per un P/N che non si trova il portale cerca da solo le alternative: varianti dello stesso P/N (confezione o suffisso diverso) e componenti con le stesse caratteristiche, cioè con lo stesso codice di produzione (es. stessa resistenza 2K2 1% 0603 100 mW di un altro produttore). Ognuna è prezzata presso tutti i distributori.',
      'Compatibile da verificare (dall\'1/11/2026): se il P/N esatto non si trova da nessuna parte, la riga prende comunque il prezzo di un componente compatibile al 100% almeno in teoria, scelto in quest\'ordine: lo stesso P/N con un\'altra confezione o suffisso (cercato presso tutti i distributori), un componente con lo stesso codice di produzione, un sostituto "diretto" indicato da DigiKey (Direct, Parametric Equivalent, consigliato dal produttore), un equivalente pin-to-pin proposto dall\'IA che i distributori vendono davvero. I sostituti solo "simili" o "upgrade" e quelli con caratteristiche diverse non si usano mai per il prezzo: restano nell\'elenco delle alternative.',
      'Il compatibile è sempre indicato: nella colonna P/N "→ codice COMPATIBILE DA VERIFICARE", reperibilità "attenzione", e in cima alla BOM la sezione "Codici compatibili da verificare" con tutti i codici insieme (P/N della BOM, compatibile, come è stato trovato, prezzo). Controllato il datasheet, "Confermo" lo rende la scelta definitiva; "altre" apre tutte le alternative della riga; nella riga "Non va bene" lo toglie.',
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
      'Le risposte restano in memoria 24 ore (quelle di Arrow no: per le sue condizioni d\'uso si chiedono ogni volta); "Aggiorna prezzi" le richiede di nuovo. LCSC non è ancora collegato: "Cerca su LCSC" apre il loro sito con lo stesso P/N.',
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
    parole: 'crm azienda contatto telefonata email visita offerta fiera nota attività prossima azione richiamare referente lead commerciale dati mancanti completare partita iva sito telefono ricerca online non interessato interessata scartato scartata nascoste nascondere ricontattare',
    testo: [
      'La ricerca trova per nome, città, referenti, telefoni, email e P.IVA. Nella scheda dell\'azienda ci sono recapiti, referenti e lo storico delle attività.',
      'Ogni attività (telefonata, email, visita, offerta, fiera, nota) può avere una prossima azione con data: quelle scadute compaiono in rosso nella prima pagina del CRM.',
      'Le aziende del CRM non sono l\'anagrafica: i clienti dell\'anagrafica entrano nel CRM da soli (con la fascia di fatturato), le altre aziende sono contatti commerciali. Un cliente in anagrafica non si elimina dal CRM.',
      'Dati mancanti (P.IVA, email, telefono, sito): Claude li cerca sul sito di ogni azienda e prepara il file crm_completamento.json.gz, da caricare in Impostazioni → CRM → "Dati mancanti cercati online". Riempie solo i campi vuoti; nelle note dell\'azienda resta scritto da dove viene il dato ("Ricerca online del …") e i casi dubbi come "Da verificare", da controllare a mano.',
      'Aziende non interessate: quando lo stato diventa "Non interessato" (o "Scartato") l\'azienda sparisce dall\'elenco, dalle ricerche e dalle prossime azioni, così si vedono solo quelle su cui ha senso puntare. Non viene eliminata: se qualcuno la riscrive in "Nuova azienda" o apre la sua scheda compare l\'avviso rosso "non ricontattare", e registrare un\'attività chiede conferma.',
      'Per vederle: filtro Stato → "Non interessati e scartati", la spunta "mostra anche non interessati e scartati" o il riquadro "Nascoste" in prima pagina. Per rimetterne una negli elenchi basta cambiarle lo stato (es. "Da ricontattare").',
    ],
    passi: ['CRM → cerca l\'azienda (o scrivila in "Nuova azienda").', 'Nella scheda: Registra un\'attività con la prossima azione.'],
    pagine: [['/crm', 'CRM']],
  },

  // ── Amministrazione ──
  {
    id: 'nuova-fattura', area: 'amministrazione', titolo: 'Fare una fattura',
    parole: 'fattura fatturare emettere nuova xml fatturapa sdi elettronica ddt numero bozza iva pdf cortesia copia stampa codice menu tendina riga righe unità misura um pz nr kg metri testo email mail mandare inviare gmail cliente amministrazione@',
    testo: [
      'Mandare la copia di cortesia al cliente: nella fattura o nota di credito emessa premi "✉ Invia per email" (anche dalla pagina del PDF di cortesia). In fondo c\'è l\'email pronta: indirizzo (l\'"Email per fatture e DDT" del cliente in Anagrafiche → Clienti → Dati fiscali, poi l\'ultimo indirizzo usato per lo stesso cliente, poi il CRM), oggetto e testo con totale, scadenze e IBAN, tutti modificabili. "Invia con Gmail" la manda da amministrazione@casteltech.net (o da info@ finché l\'indirizzo non è attivo in Gmail) con allegato il PDF di cortesia; nell\'elenco compare il segno ✉ con la data, separato da quello dello SdI. La fattura vera resta quella che il cliente riceve dallo SdI.',
      'Il PDF per il cliente: "PDF di cortesia" sulla fattura o nota di credito emessa (in bozza "Anteprima di stampa", con la scritta BOZZA) apre la copia da stampare o salvare in PDF con "Stampa / salva PDF". La fattura valida resta l\'XML mandato allo SdI: lo dice il piede del PDF.',
      'La fattura nasce come bozza: cliente dall\'anagrafica, righe, e i DDT ancora da fatturare di quel cliente si aggiungono con un clic (solo DDT già emessi). I DDT di resi non lavorati, riparazioni in garanzia, conto visione o conto lavorazione di solito non si fatturano: stanno a parte sotto "Altri DDT senza fattura" e non contano nel numero "DDT da fatturare" del cruscotto. L\'IVA predefinita è quella del cliente (lettera d\'intento, estero…) o il 22%; all\'emissione resta scritta sulle righe, così la copia di cortesia e le note di credito future non cambiano se cambia l\'IVA del cliente.',
      'Nelle righe il Codice si sceglie dal menu, che mostra solo i prodotti di quel cliente in anagrafica: la descrizione e il prezzo per la quantità arrivano da soli. Se il prodotto non c\'è, scegli "+ Nuovo prodotto…" in fondo al menu: scrivi codice e descrizione e va subito in anagrafica. Per una riga senza codice (trasporto, servizi) scegli "— senza codice —" e scrivi la descrizione. Vale anche per note di credito e di debito, DDT e conferme d\'ordine.',
      'L\'unità di misura (U.M.) si sceglie dal menu a tendina: PZ (pezzi), NR (numero), poi le unità internazionali KG, G, T, M, CM, MM, M2, M3, L, ML, H (ore), MIN; sulle righe nuove è già scelto PZ. Vale per fatture, note di credito e DDT. Un valore vecchio scritto in un altro modo ("pz.", "mt") viene riconosciuto; se non si riconosce resta com\'era.',
      'La spunta "Testo" in fondo alla riga la rende una riga di sola descrizione (es. "Rif. vostra mail del…"): niente quantità né prezzo.',
      'Con "Emetti" il portale assegna il numero, calcola la scadenza dalla condizione di pagamento, prepara l\'XML della fattura elettronica e segna i DDT come fatturati. Se ci sono errori non si emette e il numero non si consuma.',
      'Prima di emettere puoi scaricare l\'"XML di prova" (numero 0) per controllarlo. La copia di cortesia in PDF si stampa o si manda per email dalla pagina della fattura emessa ("✉ Invia per email").',
    ],
    passi: ['Amministrazione → + Nuova fattura.', 'Cliente, righe, DDT da fatturare.', 'Salva e controlla gli avvisi.', 'Emetti.', 'Invia allo SdI.'],
    pagine: [['/amministrazione/documenti/nuovo?tipo=fattura', 'Nuova fattura'], ['/amministrazione/documenti?tipo=fattura', 'Fatture']],
  },
  {
    id: 'invio-sdi', area: 'amministrazione', titolo: 'Mandare la fattura allo SdI ed esiti',
    parole: 'sdi invio inviare mandare invoicetronic esito consegnata scartata scarto ricevuta notifica cassetto fiscale recapito agenzia entrate',
    testo: [
      'Dopo "Emetti", nella pagina della fattura (anche nota di credito o autofattura) premi "Invia allo SdI": il portale manda l\'XML a Invoicetronic, che lo passa allo SdI.',
      'L\'esito arriva da solo, di solito in pochi minuti: "Consegnata" va bene; "Non recapitata" vuol dire che la fattura è valida ma è nell\'area riservata del cliente sul sito dell\'Agenzia: avvisa il cliente. Se tarda, premi "Aggiorna esito".',
      '"Scartata" vuol dire che per lo SdI la fattura non esiste: premi "Correggi", sistema righe o dati del cliente in anagrafica, poi "Emetti" (stesso numero e stessa data) e "Rimanda allo SdI", entro 5 giorni.',
      'Con la chiave di prova di Invoicetronic il pulsante è "Prova l\'invio", anche sulle bozze: la bozza parte con un numero di prova sempre nuovo (PROVA-…), niente arriva allo SdI e gli esiti sono simulati. Chiave, crediti e collegamento degli esiti sono in Impostazioni → Amministrazione.',
      'Non si può rimandare un documento già consegnato o in attesa di esito, né mandare una bozza con la chiave reale: allo SdI va solo un documento con il suo numero progressivo (mai vuoto o 0).',
      'Più documenti insieme: nell\'elenco (Fatture, Note di credito, Autofatture) spunta le righe e premi "Emetti e invia allo SdI" in alto a destra: le bozze si emettono e partono, quelli già emessi e non ancora inviati partono, il messaggio dice quali sono rimasti fuori e perché. Con la chiave di prova le bozze spuntate non si emettono (prenderebbero il numero vero): si provano una per una con "Prova l\'invio".',
    ],
    passi: ['Emetti il documento.', 'Invia allo SdI.', 'Controlla l\'esito nel riquadro SdI.'],
    pagine: [['/amministrazione/documenti?tipo=fattura', 'Fatture'], ['/impostazioni/amministrazione#sdi', 'Impostazioni → Invio allo SdI']],
  },
  {
    id: 'autofatture-estere', area: 'amministrazione', titolo: 'Autofatture dalle fatture dei fornitori esteri',
    parole: 'autofattura autofatture fattura estera estero fornitore mouser digikey anthropic reverse charge td17 td18 td19 doppione doppia due volte caricata errore eliminare elimina scartare spunta inviare sdi',
    testo: [
      'La fattura del fornitore estero (PDF o mail .eml) si carica in Amministrazione → Autofatture, riquadro "Fatture dei fornitori esteri", o arriva dalla cartella Drive: l\'IA legge fornitore, numero, data e righe. Si controlla, si preme "Prepara l\'autofattura" e nasce la bozza da emettere e mandare allo SdI.',
      'La stessa fattura non entra due volte: se arriva di nuovo (stesso fornitore, numero e data, anche come file diverso, es. prima il PDF e poi la mail) il portale non la carica e lo scrive nel messaggio. Se due copie sono già nell\'elenco, la seconda ha la scritta rossa "doppione" e non si può preparare l\'autofattura finché non se ne elimina una.',
      'Più fatture insieme: spunta le righe nel riquadro e premi "Prepara l\'autofattura" (nasce una bozza per ognuna; quelle con errori o dubbi restano e il messaggio dice cosa sistemare aprendole) oppure "Elimina" per quelle caricate per errore. Una fattura che ha già preparato l\'autofattura non si elimina da lì.',
      'Nell\'elenco delle autofatture le spunte servono per scaricare XML ed Excel, "Emetti e invia allo SdI" ed "Elimina" (solo le bozze senza numero: un\'autofattura emessa o inviata allo SdI non si elimina mai). "Emetti e invia allo SdI" compare quando nell\'elenco c\'è un\'autofattura del portale non ancora inviata: le bozze spuntate prendono il numero e partono, quelle già emesse partono e basta; una bozza con errori resta bozza e il messaggio dice cosa manca. Quelle di Fatture in Cloud sono già state mandate da lì.',
    ],
    passi: ['Amministrazione → Autofatture.', 'Carica la fattura estera e aprila.', 'Controlla fornitore e righe, poi "Prepara l\'autofattura".', 'Emetti la bozza e Invia allo SdI.'],
    pagine: [['/amministrazione/documenti?tipo=autofattura', 'Autofatture']],
  },
  {
    id: 'nota-credito', area: 'amministrazione', titolo: 'Stornare una fattura (nota di credito)',
    parole: 'nota credito storno stornare annullare fattura sbagliata errore compensazione compensato da incassare',
    testo: ['Una fattura emessa non si elimina: si apre la fattura e si preme "Crea nota di credito". Righe e collegamento alla fattura si compilano da soli.',
      'La nota di credito aperta toglie dal "da incassare" del cliente (cruscotti e scheda del cliente): fattura da 1.000 € e nota da 200 € = il cliente deve 800 €. Quando la fattura risulta tutta incassata, la nota di credito si chiude da sola con modo "Compensato con fattura" e la scritta "Compensazione con fattura n. …".'],
    pagine: [['/amministrazione/documenti?tipo=fattura', 'Fatture']],
  },
  {
    id: 'azioni-documenti', area: 'amministrazione', titolo: 'Più documenti insieme: spunte nell\'elenco (elimina, XML, Excel, incassi)',
    parole: 'spunta spunte casella selezionare tutti elimina eliminare cancellare bozza bozze scarica xml zip excel incassate incassare incasso duplica copia annulla ddt fatturare piu insieme elenco',
    testo: [
      'In Amministrazione → DDT, Fatture, Autofatture e Note di credito (voci del menu Amministrazione, in quest\'ordine) ogni riga ha una casella a sinistra: spunta i documenti (la casella in alto li spunta tutti) e usa i pulsanti in alto a destra.',
      'Elimina toglie solo le bozze: un documento emesso non si elimina mai (la numerazione non deve avere buchi). Una fattura emessa si storna con "Crea nota di credito", un DDT emesso che non è partito si annulla con "Annulla DDT" (il numero resta usato). Il portale dice quali righe spuntate non ha toccato e perché.',
      'Fatture: "Stampa / PDF" e "Duplica" (copia come bozza di oggi, senza DDT e acconti) e "Crea nota di credito" valgono per un documento alla volta; "Scarica XML" (più di uno: file zip), "Excel" e "Segna incassate" per quanti ne spunti. "Segna incassate" apre una pagina con le rate ancora aperte: scegli data e modo di pagamento (e la banca) e conferma.',
      'DDT: "Fattura i DDT" prepara una fattura con tutti i DDT emessi spuntati, se sono dello stesso cliente.',
    ],
    passi: ['Amministrazione → DDT, Fatture, Autofatture o Note di credito.', 'Spunta le righe.', 'Premi il pulsante in alto a destra.'],
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
    id: 'attributi-fattura', area: 'amministrazione', titolo: 'Esigibilità IVA e attributi avanzati della fattura elettronica',
    parole: 'esigibilita iva immediata differita split payment scissione attributi avanzati fattura elettronica xml campi fatturapa contratto convenzione ricezione trasporto vettore periodo altri dati gestionali riferimento amministrazione iban abi cab bic art73 sal fattura principale',
    testo: [
      'Nella bozza di fattura e di nota di credito c\'è il menu "Esigibilità IVA": Immediata è quella giusta quasi sempre ed è già scelta. Differita = l\'IVA diventa dovuta quando il cliente paga (art. 6 c. 5 DPR 633/72, es. alcuni enti pubblici): sceglila solo se il commercialista lo dice. Split payment vale solo per i clienti con la spunta "Split payment" nei Dati fiscali (pubblica amministrazione): se non coincide il portale non emette.',
      'Sotto le righe c\'è il riquadro "Attributi avanzati fattura elettronica" (anche nelle note di credito e nelle autofatture), come in Fatture in Cloud: l\'elenco dei campi dell\'XML con il numero delle specifiche (es. 2.1.9.3 CausaleTrasporto, 2.2.1(2).7 DataInizioPeriodo della riga 2). Si usa quando un cliente chiede un dato in più: contratto o convenzione, numero di riga dell\'ordine (NumItem), dati del trasporto e del corriere, periodo di una riga, "altri dati gestionali", riferimento amministrazione, dati della banca.',
      'Spunta il campo e scrivi il valore (date come gg/mm/aaaa): finisce nell\'XML al posto giusto e vince sul valore automatico, che si vede in grigio nella casella. Con la ricerca trovi un campo per nome o numero. In cima al riquadro ci sono gli "Altri attributi" che il portale mette da solo (tipo documento, DDT, ordine, esigibilità).',
      'Importi, aliquote, numero, data e tipo del documento non si cambiano da qui: li calcola il portale. Se un blocco nuovo non è completo (es. contratto senza IdDocumento) o un valore non va bene, lo trovi tra i "Da sistemare prima di emettere". Nel documento emesso "Attributi della fattura elettronica" mostra cosa è finito nell\'XML.',
    ],
    passi: ['Apri la bozza della fattura.', 'Controlla "Esigibilità IVA" (di solito Immediata).', 'Se il cliente chiede un dato in più apri "Attributi avanzati", spunta il campo e scrivi il valore.', 'Salva ed emetti.'],
    pagine: [['/amministrazione/documenti?tipo=fattura', 'Fatture']],
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
    parole: 'numerazione sezionale aliquote iva natura bollo condizioni pagamento giorni fine mese rate rateale rateizzato scaglioni 30/60/90 riba bonifico dati fiscali sdi pec lettera intento azienda',
    testo: [
      'I dati fiscali di un cliente (indirizzo, P.IVA, codice SDI, PEC, pubblica amministrazione, split payment, IVA e pagamento predefiniti) si correggono da Anagrafiche → Clienti → "Dati fiscali".',
      'In Impostazioni → Amministrazione: dati dell\'azienda, ultimo numero usato per ogni serie (il numero si assegna solo all\'emissione), aliquote e nature IVA (bollo di 2 € oltre 77,47 €), condizioni di pagamento (es. 60 gg fine mese) e dati fiscali dei clienti con le lettere d\'intento.',
      'Pagamenti a rate: ci sono già RiBa e bonifico 30/60, 60/90 e 30/60/90 giorni fine mese. Il totale della fattura si divide in 2 o 3 rate uguali (i centesimi che avanzano vanno sull\'ultima), ognuna con la sua scadenza: nell\'XML, nella copia di cortesia e tra gli incassi da segnare. Le stesse condizioni si scelgono per i clienti (Dati fiscali) e negli ordini a fornitore.',
      'Per una rateizzazione diversa aggiungi una riga in Condizioni di pagamento: "Giorni" = prima rata, "Rate" = quante, "Ogni" = giorni tra una rata e l\'altra (es. 30/60/90 = giorni 30, rate 3, ogni 30). Senza la spunta "Fine mese" le scadenze sono a data fattura.',
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
      'Sotto: il riepilogo per aliquota o natura (22 %, N3.5 lettera d\'intento, N3.2 cessioni UE…) e l\'elenco dei documenti di ogni registro. Il riepilogo di ogni fattura si legge dal suo file XML; per lo storico senza file dalle righe. Le fatture dei fornitori hanno il protocollo: progressivo nell\'anno in ordine di data di ricezione (colonna "Ricevuta il"); anche il mese della liquidazione segue la ricezione. Per lo storico di Fatture in Cloud vale la data del documento.',
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
      'Dal 3/11/2026 vedono anche le buste paga (Dipendenti → Buste paga, con la password delle buste paga) e la Previsione di cassa.',
      'Non possono modificare nulla: niente bozze, emissioni, invii allo SdI, pagamenti segnati. I pulsanti che modificano non compaiono e il portale rifiuta comunque ogni modifica. Le altre sezioni (preventivi, commesse, ordini, impostazioni…) non le vedono.',
      'Dopo l\'accesso entrano direttamente nel cruscotto dell\'Amministrazione. In alto, al posto della tendina, hanno tutte le pagine in fila (Cruscotto, DDT, Fatture, Autofatture, Note di credito, Fatture fornitori, Registri IVA…); il menu dell\'ufficio resta com\'è.',
      'L\'utente lo crea l\'ufficio in Impostazioni → Utenti: nome, email, profilo "Contabilità (sola lettura)" e una password di almeno 10 caratteri da comunicare alla persona. Per bloccare l\'accesso si toglie la spunta Attivo.',
    ],
    passi: ['Impostazioni → Utenti.', 'Nell\'ultima riga scrivi nome ed email, scegli "Contabilità (sola lettura)" e una password.', 'Premi Aggiungi e manda indirizzo del portale, email e password alla persona.'],
    pagine: [['/impostazioni/utenti', 'Impostazioni → Utenti']],
  },
  {
    id: 'accesso-esterni', area: 'amministrazione', titolo: 'Accesso per esterni: vede tutto, non modifica nulla',
    parole: 'esterno esterni consulente ospite visitatore revisore auditor socio banca utente accesso password sola lettura profilo vedere tutto consultare',
    testo: [
      'Per chi da fuori deve vedere il portale senza toccare nulla (consulenti, revisori, auditor, ospiti) c\'è il profilo "Esterno (vede tutto, sola lettura)": stesso menu dell\'ufficio, entra nel cruscotto generale e apre tutte le pagine (anagrafiche, preventivi, commesse, ordini, acquisti, amministrazione, qualità, dipendenti, suggerimenti), scarica Excel e stampe e usa la ricerca in alto.',
      'Non può modificare nulla: le caselle sono spente, i pulsanti Salva, Elimina, Emetti, Invia… e le spunte degli elenchi non compaiono, e il portale rifiuta comunque ogni modifica. In alto c\'è la scritta "sola lettura".',
      'Restano fuori le Impostazioni (chiavi dei servizi, utenti, backup) e l\'area riservata delle buste paga; il costo del personale per mese invece si vede, come per l\'ufficio.',
      'L\'utente lo crea l\'ufficio in Impostazioni → Utenti con il profilo "Esterno (vede tutto, sola lettura)" e una password di almeno 10 caratteri. Per chiudere l\'accesso si toglie la spunta Attivo.',
    ],
    passi: ['Impostazioni → Utenti.', 'Nell\'ultima riga scrivi nome ed email, scegli "Esterno (vede tutto, sola lettura)" e una password.', 'Premi Aggiungi e manda indirizzo del portale, email e password alla persona.', 'Finito il lavoro, togli la spunta Attivo.'],
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
    id: 'previsione-cassa', area: 'amministrazione', titolo: 'Previsione di cassa a 30, 60 e 90 giorni',
    parole: 'previsione cassa liquidità soldi saldo banca conto flusso cash flow 30 60 90 giorni incassi pagamenti stipendi f24 iva tredicesima pagare faccio basta bastano mancano scoperto rosso runway',
    testo: [
      'In Amministrazione → Analisi → Previsione di cassa vedi quanti soldi entrano ed escono nei prossimi 90 giorni, divisi in tre finestre da 30 giorni, e quanta cassa resta alla fine di ognuna.',
      'È riservata: dai totali si ricavano gli stipendi, quindi la vedono solo l\'amministratore, la contabilità e chi ha il permesso delle buste paga.',
      'Incassi: le rate aperte delle fatture ai clienti, spostate del ritardo medio con cui quel cliente paga (giorni dopo la scadenza, ultimi 12 mesi). Se il cliente ha meno di 3 incassi si usa il ritardo medio di tutti. Le rate già scadute si contano come incassate oggi, ma la pagina lo segnala. Le note di credito aperte tolgono.',
      'Uscite: le rate aperte delle fatture dei fornitori alla scadenza (quelle già scadute e non segnate pagate vanno a oggi), più le uscite fisse di ogni mese: stipendi netti, F24 delle paghe, IVA e quelle che scrivete voi (affitto, leasing, finanziamenti, carta di credito). Se non scrivete nulla, stipendi, F24 e IVA sono stimati dai dati del portale (segnati "stima"). Un F24 vero letto dalla cartella o l\'IVA del mese chiuso dai Registri IVA prendono il posto della stima.',
      'Il saldo della banca il portale non lo legge ancora: scrivetelo nel riquadro "Saldo della banca e uscite fisse", la previsione parte da lì. Senza saldo vedete solo quanto entra ed esce.',
      'Scenario basso e alto: incassi più o meno di quanto variano di solito i ritardi dei clienti. "Punto più basso" è il giorno in cui la cassa scende di più. In "Da sapere" ci sono gli avvisi: cassa sotto zero, saldo vecchio, rate scadute, clienti che pesano troppo o pagano lenti, fornitori scaduti non segnati, tredicesima.',
      'Non ci sono le fatture che emetterete o riceverete da oggi in poi: oltre i 30 giorni gli incassi sono prudenti. Il pulsante Excel scarica tutti i movimenti.',
    ],
    passi: ['Amministrazione → Analisi → Previsione di cassa.', 'Apri "Saldo della banca e uscite fisse", scrivi il saldo di oggi e le uscite che mancano, premi Salva e ricalcola.', 'Leggi "Da sapere" e il punto più basso.'],
    pagine: [['/amministrazione/analisi/cassa', 'Previsione di cassa'], ['/amministrazione/crediti', 'Crediti verso clienti']],
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
    id: 'utenti', area: 'impostazioni', titolo: 'Utenti del portale e ruoli (amministratore)',
    parole: 'utenti nuovo utente password accesso ufficio produzione ruolo ruoli disattivare amministratore admin permessi cambiare profilo',
    testo: ['In Impostazioni → Utenti si aggiungono gli utenti con email, password e ruolo. Ruoli: Amministratore (tutto, più è l\'unico che sceglie i ruoli e vede stipendi, buste paga e previsione di cassa), Ufficio (tutto il resto), Produzione (solo tempi e note), Contabilità (sola lettura dell\'Amministrazione e delle buste paga), Esterno (vede tutto, non modifica nulla).',
      'Solo l\'amministratore sceglie o cambia il ruolo degli utenti e modifica gli utenti amministratori. Chi è nell\'ufficio può aggiungere utenti della produzione e correggere nome, email e password degli altri. Nessuno può cambiarsi il ruolo da solo e resta sempre almeno un amministratore attivo. Un ruolo cambiato vale dal prossimo accesso di quella persona.',
      'Chi ha già lavorato non si elimina: si toglie la spunta "Attivo". Togliendo "Attivo", cambiando il ruolo o la password, la persona esce subito da tutti i telefoni e computer dove era entrata (chi lascia l\'azienda non può più entrare, nemmeno con una pagina già aperta).',
      'Password: almeno 10 caratteri e non facili da indovinare (niente soli numeri, sequenze di tasti, "password", "casteltech", il proprio nome o l\'email). Dopo 8 tentativi sbagliati dallo stesso posto, o 20 sulla stessa email, l\'accesso si blocca per qualche minuto.',
      'Reparto: cambiando o togliendo il PIN di un operatore (Impostazioni → Operatori), o togliendolo dall\'elenco, il suo telefono esce subito e deve rientrare.'],
    pagine: [['/impostazioni/utenti', 'Impostazioni → Utenti']],
  },
  {
    id: 'registro', area: 'impostazioni', titolo: 'Registro: chi ha cambiato cosa e quando',
    parole: 'registro modifiche chi ha cambiato cosa quando storico attività eliminazioni eliminato cancellato accessi entrato log controllo',
    testo: ['In Impostazioni → Registro c\'è l\'elenco di tutto quello che è stato salvato, eliminato, annullato o scartato nel portale, con chi e quando, più gli accessi e gli accessi non riusciti (email o password sbagliate).',
      'Si filtra per tipo (modifiche, eliminazioni, accessi), persona, date e testo; il clic sulle righe toccate apre la pagina. Non contiene i valori scritti (password, importi, stipendi): solo sezione, azione e numero della riga. Le bozze che si salvano da sole compaiono una volta ogni 10 minuti. Si scrive da solo dal 4/11/2026.'],
    pagine: [['/impostazioni/registro', 'Impostazioni → Registro']],
  },
  {
    id: 'backup', area: 'impostazioni', titolo: 'Copie di sicurezza (backup)',
    parole: 'backup copia sicurezza salvataggio dati scaricare ripristino drive google pc cartella',
    testo: ['Dal lunedì al venerdì alle 18:00 il portale salva da solo una copia completa dei dati (tiene gli ultimi 30 giorni). In Impostazioni → Backup si può scaricare una copia in qualsiasi momento.',
      'Nella copia ci sono tutti i dati del portale: preventivi, commesse, anagrafiche, ordini, fatture, DDT e fatture dei fornitori, CRM, documenti dei clienti. Restano fuori solo gli accessi e la cache dei prezzi dei distributori.',
      'Se le copie occupano più di 750 MB, il portale cancella da solo le più vecchie e ne tiene sempre almeno 5.',
      'Copia su Google Drive: in Impostazioni → Backup premi "Installa sul PC" e apri il file scaricato sul PC dell\'ufficio (doppio clic, poi "Esegui" se Windows lo chiede). Da quel momento ogni sera alle 18:30 il PC salva le copie nuove nella cartella 16_Backup\\Portale_Render di Google Drive (se il PC è già spento, la mattina dopo appena lo accendi). Sul PC restano gli ultimi 60 giorni più la prima copia di ogni mese.',
      'Nella stessa pagina vedi quando il PC ha preso l\'ultima copia. Se smette (PC cambiato, file reinstallato altrove), premi "Reinstalla sul PC" e riapri il file nuovo: quello vecchio smette di funzionare.'],
    pagine: [['/impostazioni/backup', 'Impostazioni → Backup']],
  },
  {
    id: 'chiavi', area: 'impostazioni', titolo: 'Chiavi dei servizi esterni (IA, distributori, Google Drive)',
    parole: 'chiave api render ia anthropic digikey mouser tme farnell google drive account servizio configurare',
    testo: ['Le chiavi dei servizi esterni (IA, distributori, Google Drive, SdI) si inseriscono solo su Render (servizio casteltech-portale → Environment), mai nel portale né in chat. Dopo averle salvate Render riavvia il portale. In Impostazioni → Componenti si può provare se funzionano.'],
    pagine: [['/impostazioni/componenti', 'Impostazioni → Componenti']],
  },
  {
    id: 'mittenti-email', area: 'impostazioni', titolo: 'Da chi partono le email del portale (amministrazione@, ordini@, acquisti@…)',
    parole: 'email mail mittente indirizzo alias amministrazione ordini preventivi acquisti produzione info gmail invia messaggio come inviare partire da chi',
    testo: [
      'Le email mandate dal portale partono dall\'indirizzo della funzione, legato alla casella info@casteltech.net: DDT, fatture, note di credito e solleciti da amministrazione@; conferme d\'ordine da ordini@; ordini a fornitore da acquisti@; preventivi da preventivi@ e avvisi di produzione da produzione@ (quando il portale li manderà). Le risposte arrivano comunque nella casella di info@.',
      'Un indirizzo funziona solo se è aggiunto nel Gmail di info@: ⚙ Impostazioni → Visualizza tutte le impostazioni → Account → "Invia messaggio come" → Aggiungi un altro indirizzo email. Finché non c\'è, l\'email parte da info@ e nella pagina accanto a "Invia con Gmail" c\'è scritto.',
      'In Impostazioni → Servizi, riquadro "Da chi partono le email", si vede quali indirizzi sono attivi; "Ricontrolla in Gmail" rilegge l\'elenco subito (altrimenti il portale lo rilegge da solo ogni ora).',
    ],
    passi: ['Entra in Gmail come info@casteltech.net.', 'Impostazioni → Account → "Invia messaggio come" → Aggiungi un altro indirizzo email, uno per funzione.', 'In Impostazioni → Servizi premi "Ricontrolla in Gmail".'],
    pagine: [['/impostazioni/servizi', 'Impostazioni → Servizi']],
  },
  {
    id: 'servizi', area: 'impostazioni', titolo: 'Consumi e limiti dei servizi (credito IA, memoria, database)',
    parole: 'consumi limiti token credito esaurito finito ricarica anthropic spesa costo dollari render memoria riavvio neon database spazio ore calcolo distributori richieste giorno gmail chiudi x avviso servizi',
    testo: [
      'In Impostazioni → Servizi c\'è il riquadro con quanto il portale usa dei servizi esterni e quanto manca ai limiti: IA di Anthropic (letture, token e costo del giorno e del mese, credito rimasto), Render (memoria del server e riavvii), Neon (spazio del database e ore di calcolo), DigiKey, Mouser, Farnell e TME (richieste del giorno), Google Drive, Gmail e Invoicetronic.',
      'Anthropic è prepagato e non dice quanto credito resta: scrivi nel riquadro "Credito dell\'IA" l\'importo caricato e da quale giorno, e aggiornalo dopo ogni ricarica. Il portale conta i token di ogni lettura, stima la spesa con il listino e avvisa quando ne resta meno del 20%.',
      'Quando un servizio supera l\'80% del limite, o si ferma (credito finito, tetto di spesa raggiunto, chiave non valida, il portale riavviato da Render per memoria esaurita; i riavvii regolari, per esempio dopo aver cambiato una variabile su Render, non contano), tutti gli utenti dell\'ufficio vedono un avviso giallo o rosso in cima alle pagine con il link al riquadro.',
      'Letto l\'avviso, la X a destra lo chiude: in quel browser non si vede più finché non nasce un problema nuovo (un altro servizio al limite o un altro riavvio), e allora ricompare. Anche i messaggi gialli dopo un salvataggio ("Salvato.", "DDT corretto…") si chiudono con la X.',
      'Se un documento non viene letto per credito finito, nell\'acquisizione c\'è scritto il motivo: ricarica il credito su console.anthropic.com → Billing e premi "Rileggi con l\'IA".',
      'Facoltativo: con ANTHROPIC_ADMIN_KEY su Render il costo del mese diventa quello ufficiale di Anthropic; con NEON_API_KEY e NEON_PROJECT_ID si vedono le ore di calcolo del database.',
    ],
    pagine: [['/impostazioni/servizi', 'Impostazioni → Servizi']],
  },

  // ── Dipendenti ──
  {
    id: 'dipendenti', area: 'dipendenti', titolo: 'Costo del personale e buste paga (area riservata)',
    parole: 'dipendenti personale costo stipendi buste paga cedolini cedolino riepilogo nota contabile f24 studio paghe upa contributi inps tfr soci password riservata riservato permesso netto lordo irpef ore persona voci storico',
    testo: [
      'Dal 1/11/2026 il menu in alto ha il gruppo Dipendenti. In "Costo del personale" tutto l\'ufficio vede il costo totale di ogni mese per l\'azienda (dipendenti e soci: lordo + contributi INPS a carico dell\'azienda + TFR + enti bilaterali e assistenza sanitaria), il totale e la media dell\'anno, il confronto con gli stessi mesi dell\'anno prima, il peso sul fatturato e gli F24 delle paghe con la scadenza.',
      'I documenti dello studio paghe (cedolini, riepilogo, nota contabile, F24) si mettono nella stessa cartella Google Drive "Da acquisire" degli ordini, con il nome con cui li manda lo studio (es. "Casteltech - ced 08-2026.pdf", "Casteltech - nc 08-2026.pdf", "Casteltech - f24 del 16-09-26.pdf"): il portale li riconosce dal nome e li porta in Dipendenti, non in Ordini → Da acquisire. Si possono anche caricare dalla pagina Costo del personale.',
      'La nota contabile la legge l\'IA e diventa il costo del mese; l\'F24 dà scadenza e totale. I cedolini e i riepiloghi NON vanno all\'IA e non si aprono senza la password.',
      'Le buste paga diventano dati (dal 1/11/2026): ogni cedolino arrivato si legge da solo nel portale, senza IA, e dà per ogni persona e mese ore lavorate, paga oraria, lordo, contributi, IRPEF, addizionali, ritenute, netto e tutte le voci (straordinari, ferie non godute, tredicesima…). Nell\'area riservata: tabella dell\'anno con il netto di ogni persona mese per mese, clic sul nome = tutte le sue buste paga anno per anno con i totali, clic sull\'importo = il cedolino con le voci. Un cedolino rifatto dallo studio sostituisce quello di prima; "!" vuol dire che qualcosa non torna e va guardato sul PDF.',
      'Buste paga (area riservata): la aprono l\'amministratore del portale, la contabilità (il commercialista, in sola lettura) e chi dell\'ufficio ha la spunta dell\'amministratore, scrivendo la password delle buste paga (diversa da quella di accesso). Le stesse persone vedono la Previsione di cassa, dove ci sono gli stipendi netti. Dentro: costo per qualifica, netto in busta, tutti i PDF dello studio, F24 da segnare pagati, lo storico dall\'archivio. Si richiude da sola dopo 15 minuti senza aprire pagine, o con "Chiudi l\'area riservata".',
      'Lo storico 2019–2026 viene dalle note contabili della cartella 7_DIPENDENTI E SOCI (fino al 2021 dal "bilancino" del vecchio studio): file costi_personale.json.gz, si carica dall\'area riservata → Storico dall\'archivio. Le buste paga dell\'archivio (cartella 3_Buste paga, aprile 2019 – settembre 2026) sono nel file cedolini.json.gz, che si carica nello stesso punto. I mesi letti dal portale non vengono sovrascritti. L\'INAIL si paga una volta l\'anno (F24 di febbraio) e non è nei mesi.',
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
      'Se manca qualcosa o un passaggio è scomodo, scrivilo in Suggerimenti: titolo, descrizione, chi lo propone (si sceglie dal menu degli utenti, è già scelto chi sta usando il portale ed è obbligatorio), area e priorità. Poi si decide se e quando svilupparlo (da valutare, da chiarire, in programma, in sviluppo, fatto, scartato).',
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
