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
  { id: 'impostazioni', nome: 'Impostazioni', descrizione: 'Tariffe, fasi, operatori e PIN, utenti, promemoria, copie di sicurezza.' },
  { id: 'suggerimenti', nome: 'Suggerimenti', descrizione: 'Le idee del team per migliorare il portale.' },
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
    id: 'eliminare', area: 'inizio', titolo: 'Cosa si può eliminare e cosa no',
    parole: 'elimina cancella cancellare togliere errore sbagliato rimuovere annullare disattiva',
    testo: [
      'In tutte le sezioni c\'è il tasto Elimina per le righe inserite per errore. Prima di eliminare il portale chiede conferma.',
      'Quello che è già usato non si elimina, per non rovinare lo storico: un preventivo con commessa, un cliente o un prodotto usato in preventivi o ordini, le fasi e i parametri del catalogo di partenza, gli utenti che hanno lavorato. In questi casi si toglie la spunta "Attiva" (o "Attivo"): non compaiono più nelle scelte ma lo storico resta.',
      'Le fatture e le note di credito emesse non si eliminano: una fattura sbagliata si storna con una nota di credito. Si elimina solo una bozza.',
    ],
    pagine: [],
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
    parole: 'prodotto prodotti codice scheda articolo descrizione revisione nuovo',
    testo: [
      'Ogni prodotto appartiene a un cliente. Nei preventivi codice e descrizione si scelgono solo da qui.',
      'Dall\'elenco dei clienti, il numero dei prodotti porta ai prodotti di quel cliente.',
      'Se stai facendo un preventivo e il codice non c\'è, non serve uscire: nel preventivo premi "+ Nuovo prodotto" (vedi "Prodotto nuovo dal preventivo").',
    ],
    passi: ['Anagrafiche → Prodotti.', 'Scegli il cliente, scrivi codice e descrizione nella riga in alto e premi Aggiungi.'],
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

  // ── Preventivi ──
  {
    id: 'nuovo-preventivo', area: 'preventivi', titolo: 'Fare un nuovo preventivo',
    parole: 'preventivo offerta prezzo calcolo nuovo costo fasi ricarico spunte informazioni generali top bot tht lamina aoi visivo controllo ispezione pre-produzione minuti',
    testo: [
      'Il prezzo si calcola mentre compili. In alto scegli cliente e prodotto dall\'anagrafica, schede, schede per pannello e pannelli.',
      'Le spunte delle INFORMAZIONI GENERALI (1ª produzione, TOP, TOP+BOT, THT a onda o a mano, componenti, PCB, lamina, etichette, pulizia, lavaggio) mostrano solo le sezioni che servono e attivano fasi e costi. Le programmazioni ci sono solo con la 1ª produzione.',
      'Il riquadro dei totali mostra prezzo a scheda, costi una tantum (solo nel primo lotto), margini e ore ciclo/uomo.',
      'Un preventivo salvato conserva le tariffe e le fasi del giorno in cui è stato fatto: se poi cambi le tariffe in Impostazioni, i preventivi vecchi non cambiano.',
      'Montaggio → AOI: TOP è spuntato con il TOP, BOT solo se c\'è anche quel lato. "Visivo" toglie l\'AOI (né ispezione né programmazione) e mette il controllo visivo, 60 secondi a scheda: si usa per campionature di pochi pezzi o schede con pochissimi componenti.',
      'Pre-produzione: ogni voce ha 5 minuti di standard, tranne "Disegno e stampa 3D" (0). Acquisto componenti e acquisto PCB contano solo se sono spuntati in Acquisti.',
    ],
    passi: ['Preventivi → + Nuovo preventivo.', 'Cliente, prodotto e revisione (se non è indicata scrivi 0), quantità.', 'Spunte delle informazioni generali.', 'Controlla fasi, materiali e altri costi.', 'Salva.'],
    pagine: [['/preventivi/nuovo', 'Nuovo preventivo'], ['/preventivi', 'Elenco preventivi']],
  },
  {
    id: 'prodotto-nuovo-preventivo', area: 'preventivi', titolo: 'Prodotto nuovo dal preventivo (codice non in anagrafica)',
    parole: 'prodotto nuovo codice manca non trovo elenco aggiungere anagrafica revisione zero descrizione scheda nuova inserire manualmente',
    testo: [
      'Se il prodotto è nuovo e il codice non è nell\'elenco del cliente, lo aggiungi all\'anagrafica direttamente dal preventivo, senza chiuderlo.',
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
    parole: 'documenti file cliente bom pick place gerber foratura excellon gencad cad zip cartella smd tht refori feeder controlli incongruenze disegno segnalazione va bene ignorare accettare',
    testo: [
      'Quando il cliente manda il pacchetto della scheda, caricalo tutto insieme: il portale legge BOM, pick and place, Gerber, forature e GenCAD e li incrocia.',
      'Il risultato: componenti SMD per lato, THT, feeder, refori, misure, disegno della scheda, consumi stimati (pasta, stagno, filo) e le segnalazioni da controllare (valori diversi tra BOM e pick and place, riferimenti mancanti, lati, sovrapposizioni, componenti da non montare).',
      'Le cartelle chiamate OLD, VECCHI, ARCHIVIO o BACKUP vengono ignorate. PDF, 3D e immagini restano sul Drive.',
      '"Codifica la BOM" porta i componenti nella sezione Quotazioni per i codici e i prezzi.',
      'Se una segnalazione è stata controllata e va bene così (es. un simbolo scritto in modo diverso, componente giusto), premi "Va bene": non conta più tra gli errori, non va nel preventivo da validare e i componenti non sono più rossi nelle stampe. Resta anche dopo Rianalizza; "annulla" la riapre.',
    ],
    passi: ['Preventivi → Da documenti del cliente.', 'Scegli cliente e nome della scheda, carica i file (o lo zip, o la cartella).', 'Carica e analizza, poi controlla "Da controllare".', 'Crea il preventivo da validare (vedi sotto).'],
    pagine: [['/preventivi/documenti', 'Da documenti del cliente']],
  },
  {
    id: 'preventivo-da-validare', area: 'preventivi', titolo: 'Preventivo "da validare" compilato dai documenti',
    parole: 'validare validazione automatico compilato bozza controllare preventivo documenti piazzole case 0603 0805 ipc',
    testo: [
      'Nella pagina dei documenti della scheda, "Crea il preventivo da validare" (scrivi quante schede) prepara il preventivo con le tariffe di oggi e i numeri letti: SMD e feeder per lato, lamine, THT a onda o a mano, stagno, pasta, item.',
      'Il preventivo resta "da validare": in alto c\'è l\'elenco delle cose da controllare (segnalazioni, lamine del cliente, THT da preparare). Quando l\'hai controllato, il primo Salva lo porta a bozza.',
      'Se il prodotto non è ancora in anagrafica, codice, descrizione e revisione letti dai file sono già scritti nel riquadro "Nuovo prodotto": controllali e premi "Aggiungi in anagrafica".',
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
    parole: 'stampa pdf mandare inviare cliente offerta salvare pdf macro aree dettaglio fasi',
    testo: [
      'Dal preventivo salvato, "Stampa / salva PDF" apre la pagina per il cliente con i soli prezzi. Si può scegliere il dettaglio per fasi o solo le macro aree. Dalla finestra di stampa scegli "Salva come PDF" per mandarlo via email.',
    ],
    pagine: [['/preventivi', 'Elenco preventivi']],
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
    parole: 'cruscotto fatturato previsione anno mese gantt pianificazione produzione carico lavoro fatture senza ordine',
    testo: [
      'Il cruscotto mostra fatturato, media dei mesi chiusi, ordini da evadere per mese e previsione dell\'anno.',
      'Il Gantt parte dalla data di consegna e va all\'indietro: ogni barra è una consegna da fare, lunga quanto le ore ciclo dell\'ultimo preventivo del prodotto diviso le ore al giorno (Impostazioni → Ordini).',
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

  // ── Quotazioni (ex Componenti) ──
  {
    id: 'codifica-bom', area: 'componenti', titolo: 'Codificare una BOM e trovare i prezzi',
    parole: 'quotazioni quotazione quotare componenti bom distinta codifica codici excel csv prezzi distributori digikey mouser farnell tme reperibilità acquisto scarto ia',
    testo: [
      'Carica la BOM (Excel o CSV): il portale trova da solo intestazione e colonne, riconosce i componenti dal P/N o dalla descrizione, calcola il codice di produzione e il codice gestionale, e cerca prezzi e disponibilità da DigiKey, Mouser, Farnell e TME.',
      'Le quantità da comprare includono lo scarto (passivi sotto 0,10 € +10%, sotto 1 € +5%, da 1 a 3 € un pezzo in più). Si scarica un Excel con codifica e acquisti.',
      'Le righe "Da completare" vanno sistemate a mano; poi "Salva i codici nell\'archivio".',
    ],
    passi: ['Quotazioni → Carica una BOM.', 'Controlla colonne e quantità.', 'Sistema le righe da completare.', 'Salva i codici nell\'archivio, scarica l\'Excel.'],
    pagine: [['/quotazioni', 'Quotazioni']],
  },
  {
    id: 'alternative-componenti', area: 'componenti', titolo: 'Componente non trovato: alternative e reperibilità',
    parole: 'alternativa alternative equivalente sostituto prezzo a mano manuale scrivere prezzo p/n non trovato introvabile critico reperibilità disponibile negozi distributori obsoleto',
    testo: [
      'Ogni P/N si cerca presso TUTTI i distributori collegati (DigiKey, Mouser, Farnell, TME). Se uno non lo ha ma un altro sì, va bene: nessuna segnalazione, si compra da chi lo ha al prezzo migliore.',
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
    parole: 'fattura fatturare emettere nuova xml fatturapa sdi elettronica ddt numero bozza iva',
    testo: [
      'La fattura nasce come bozza: cliente dall\'anagrafica, righe, e i DDT ancora da fatturare di quel cliente si aggiungono con un clic. L\'IVA predefinita è quella del cliente (lettera d\'intento, estero…) o il 22%.',
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
    ],
    nonSiPuo: ['Rimandare allo SdI un documento già consegnato o in attesa di esito.', 'Mandare allo SdI una bozza con la chiave reale.'],
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
    id: 'incassi-pagamenti', area: 'amministrazione', titolo: 'Incassi, pagamenti e fatture dei fornitori',
    parole: 'incasso incassato pagamento pagato scadenza scadute rata banca fornitori ricevute passive cruscotto da pagare',
    testo: [
      'Il cruscotto di Amministrazione mostra fatturato e acquisti dell\'anno rispetto all\'anno prima, incassi e pagamenti aperti per urgenza (scadute, entro 7 giorni, entro 30, oltre), DDT da fatturare e bozze da finire.',
      'Ogni rata, delle fatture emesse e di quelle dei fornitori, si segna incassata o pagata con data e conto. Le fatture dei fornitori sono in "Fatture fornitori", con il filtro "solo da pagare".',
    ],
    pagine: [['/amministrazione', 'Cruscotto amministrazione'], ['/amministrazione/ricevuti?da_pagare=1', 'Fatture fornitori da pagare']],
  },
  {
    id: 'impostazioni-amministrazione', area: 'amministrazione', titolo: 'Numerazioni, IVA, pagamenti e dati fiscali dei clienti',
    parole: 'numerazione sezionale aliquote iva natura bollo condizioni pagamento giorni fine mese dati fiscali sdi pec lettera intento azienda',
    testo: [
      'In Impostazioni → Amministrazione: dati dell\'azienda, ultimo numero usato per ogni serie (il numero si assegna solo all\'emissione), aliquote e nature IVA (bollo di 2 € oltre 77,47 €), condizioni di pagamento (es. 60 gg fine mese) e dati fiscali dei clienti con le lettere d\'intento.',
    ],
    pagine: [['/impostazioni/amministrazione', 'Impostazioni → Amministrazione']],
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
    testo: ['Dal lunedì al venerdì alle 20:30 il portale salva da solo una copia completa dei dati (tiene gli ultimi 30 giorni). In Impostazioni → Backup si può scaricare una copia in qualsiasi momento.'],
    pagine: [['/impostazioni/backup', 'Impostazioni → Backup']],
  },
  {
    id: 'chiavi', area: 'impostazioni', titolo: 'Chiavi dei servizi esterni (IA, distributori, Google Drive)',
    parole: 'chiave api render ia anthropic digikey mouser tme farnell google drive account servizio configurare',
    testo: ['Le chiavi dei servizi esterni (IA, distributori, Google Drive, SdI) si inseriscono solo su Render (servizio casteltech-portale → Environment), mai nel portale né in chat. Dopo averle salvate Render riavvia il portale. In Impostazioni → Componenti si può provare se funzionano.'],
    pagine: [['/impostazioni/componenti', 'Impostazioni → Componenti']],
  },

  // ── Suggerimenti ──
  {
    id: 'suggerimento', area: 'suggerimenti', titolo: 'Proporre un\'idea per il portale',
    parole: 'suggerimento idea proposta migliorare richiesta funzione manca',
    testo: [
      'Se manca qualcosa o un passaggio è scomodo, scrivilo in Suggerimenti: titolo, descrizione, chi lo propone, area e priorità. Poi si decide se e quando svilupparlo (da valutare, in programma, in sviluppo, fatto, scartato).',
    ],
    passi: ['Suggerimenti → + Nuovo suggerimento.', 'Scrivi cosa dovrebbe fare il portale e perché serve.'],
    pagine: [['/suggerimenti/nuovo', 'Nuovo suggerimento']],
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
