/**
 * Condizioni di vendita e di acquisto stampate sui documenti del portale (Adriano 7/11/2026, dalla proposta del 5/11:
 * "inserisci a tutti i documenti le condizioni proposte"). Un solo posto per tutti i testi, con la revisione:
 *  - preventivo: condizioni generali di fornitura complete + riquadro di approvazione specifica (seconda firma, artt. 1341-1342 c.c.);
 *  - conferma d'ordine: richiamo sopra le firme + pagina con le condizioni complete e la seconda firma (vale anche senza preventivo);
 *  - DDT: controllo al ricevimento, ESD, proprietà secondo la causale;
 *  - fattura: interessi di mora (D.Lgs. 231/2002), riserva di proprietà, richiamo alle condizioni, privacy (PDF di cortesia e Causale dell'XML);
 *  - ordine a fornitore: condizioni generali di acquisto + approvazione specifica.
 * Decisioni di Adriano (7/11/2026): garanzia 12 mesi sulla lavorazione, IPC-A-610 classe 2, Foro di Piacenza, scorta del materiale del cliente
 * come proposta, materiale del cliente coperto dalla nostra polizza ma rimborsato solo per quanto paga l'assicurazione, interessi di mora
 * scritti anche se di solito non li chiederemo, lamine del cliente.
 * Cambiare un testo = cambiare REVISIONE_CONDIZIONI (i documenti la stampano, così si sa quale versione valeva).
 */

export const REVISIONE_CONDIZIONI = '11/2026';
export const INFORMATIVA_PRIVACY = 'casteltech.net/informativa-clienti-e-fornitori.html';

/** Validità dell'offerta (Adriano 5/11/2026): montaggio 30 giorni, materiale comprato da noi (componenti, PCB) 10 giorni. */
export const VALIDITA_MONTAGGIO_GG = 30;
export const VALIDITA_MATERIALE_GG = 10;

export interface Clausola { titolo: string; testo: string }

/** Condizioni generali di fornitura (vendita e conto lavoro): preventivo e conferma d'ordine. */
export const CLAUSOLE_FORNITURA: Clausola[] = [
  { titolo: 'Oggetto e prezzi', testo: 'Prezzi in euro, IVA esclusa, franco nostro stabilimento salvo spedizione indicata. Il prezzo del montaggio vale '
    + `${VALIDITA_MONTAGGIO_GG} giorni dalla data del preventivo. I prezzi di componenti e PCB acquistati da noi valgono ${VALIDITA_MATERIALE_GG} giorni, perché seguono `
    + 'prezzi e disponibilità del mercato: dopo questo termine li riconfermiamo prima di accettare l\'ordine.' },
  { titolo: 'Ordine e conferma', testo: 'Il contratto si conclude con la nostra conferma d\'ordine scritta o con l\'inizio della lavorazione. Le presenti condizioni '
    + 'si applicano a ogni fornitura; condizioni diverse scritte nell\'ordine del cliente valgono solo se le accettiamo espressamente per iscritto. '
    + 'Modifiche a quantità, BOM, documentazione o revisione dopo l\'ordine comportano una nuova quotazione.' },
  { titolo: 'Tempi di consegna', testo: 'I tempi sono stimati in settimane lavorative ("circa") e non sono termini essenziali: la data che vale è quella '
    + 'della conferma d\'ordine. Materiale del cliente (conto lavoro): le settimane contano dal giorno in cui abbiamo ricevuto tutto il materiale '
    + 'e la documentazione completa e corretta. Materiale acquistato da noi: le settimane contano dalla conferma d\'ordine e comprendono '
    + 'l\'arrivo del materiale nei tempi dichiarati dai distributori al momento dell\'acquisto. Un ritardo non dovuto a nostro dolo o colpa grave '
    + 'non dà diritto a penali, risarcimenti o annullamento dell\'ordine.' },
  { titolo: 'Cosa sposta la consegna', testo: 'Materiale incompleto, non conforme o arrivato in ritardo, ritardi dei distributori, modifiche alla BOM o alla '
    + 'documentazione dopo l\'ordine, conferme del cliente non ancora arrivate (codici alternativi, dubbi sulla documentazione) spostano la '
    + 'consegna dello stesso tempo. Eventi fuori dal nostro controllo (blocco delle forniture o dei trasporti, guasti gravi, calamità, '
    + 'provvedimenti delle autorità) sospendono i termini per tutta la loro durata. Comunichiamo subito la nuova data.' },
  { titolo: 'Codici alternativi', testo: 'Se un componente della BOM non è disponibile o ha un equivalente più conveniente, proponiamo un codice alternativo '
    + 'con le stesse caratteristiche, elencato nel foglio in fondo al preventivo insieme ai componenti con problemi di acquisto (non trovati o con disponibilità da verificare). '
    + 'Il codice alternativo lo acquistiamo solo dopo la conferma scritta del cliente; i componenti non quotati restano esclusi dal prezzo.' },
  { titolo: 'Materiale del cliente (conto lavoro)', testo: 'Deve arrivare completo, identificato con il codice della BOM, in confezioni adatte alle macchine '
    + '(bobine, tubi, vassoi) e con la scorta per l\'attrezzaggio e gli sfridi: per i componenti SMD almeno il 5% in più, minimo 10 pezzi per codice, '
    + '1-2 pezzi per i componenti costosi. Resta di proprietà del cliente e lo custodiamo in area protetta ESD con la normale diligenza. '
    + 'È compreso nella nostra polizza assicurativa: salvo dolo o colpa grave, in caso di danno o perdita mentre è presso di noi (furto, incendio, '
    + 'allagamento, altri eventi) rimborsiamo al cliente soltanto l\'importo che l\'assicurazione ci riconosce per quel materiale, senza altri risarcimenti. '
    + 'Non rispondiamo di componenti difettosi, non conformi, contraffatti o non più saldabili (ossidati, MSL scaduto) forniti dal cliente: '
    + 'se ce ne accorgiamo lo segnaliamo e sospendiamo la lavorazione in attesa di istruzioni. Riconfezionamento, componenti sfusi, codici mancanti '
    + 'e ricerche di materiale si addebitano a ore. Le rimanenze tornano al cliente con l\'ultima consegna; dopo 6 mesi senza istruzioni possiamo '
    + 'renderle a spese del cliente.' },
  { titolo: 'Documentazione e standard di lavorazione', testo: 'Lavoriamo secondo la documentazione del cliente (BOM, file di montaggio, Gerber, note) '
    + 'e secondo IPC-A-610 classe 2 (classe 3 solo se richiesta per iscritto e quotata a parte), con processi IPC J-STD-001 e riparazioni IPC-7711/7721. '
    + 'Progetto, scelta dei componenti, funzionalità e idoneità del circuito all\'uso finale sono responsabilità del cliente; errori o mancanze '
    + 'nella documentazione sono a suo carico, anche come ore di lavoro.' },
  { titolo: 'Controlli e collaudo', testo: 'Il prezzo comprende i controlli indicati nel preventivo (ispezione visiva, AOI). Il collaudo funzionale è compreso '
    + 'solo se indicato, con procedura, attrezzature e limiti di accettazione forniti dal cliente.' },
  { titolo: 'Garanzia e reclami', testo: 'Garantiamo la lavorazione (saldature, montaggio, lavorazioni meccaniche) per 12 mesi dalla consegna. Difetti visibili: '
    + 'segnalazione scritta entro 8 giorni dal ricevimento; difetti nascosti: entro 8 giorni dalla scoperta. A nostra scelta ripariamo o rifacciamo '
    + 'la lavorazione nel nostro stabilimento, con il trasporto a nostro carico se il difetto è nostro. Componenti e PCB acquistati da noi sono coperti '
    + 'dalla garanzia del produttore o del distributore, che trasferiamo al cliente. La garanzia non copre difetti di progetto o di documentazione, '
    + 'materiale del cliente, uso improprio, interventi di terzi, danni da scariche elettrostatiche (ESD) o da conservazione fuori dall\'imballo protettivo, usura.' },
  { titolo: 'Limitazione di responsabilità', testo: 'Salvo dolo o colpa grave, il nostro risarcimento per ogni fornitura è limitato al prezzo della lavorazione '
    + 'contestata e non comprende danni indiretti (fermi di produzione, mancato guadagno, richiami, danni a prodotti del cliente o di terzi). '
    + 'Il cliente assicura il prodotto finito e il suo impiego.' },
  { titolo: 'Pagamento e proprietà', testo: 'Alle condizioni indicate nel preventivo o nella conferma d\'ordine. Oltre la scadenza decorrono senza bisogno di '
    + 'sollecito gli interessi di mora del D.Lgs. 231/2002 e l\'indennizzo di 40 € per fattura (art. 6); in caso di ritardo possiamo sospendere '
    + 'lavorazioni e consegne in corso e chiedere il pagamento anticipato dei lotti successivi. Le schede con materiale acquistato da noi restano '
    + 'di nostra proprietà fino al saldo (art. 1523 c.c.); sul materiale del cliente in conto lavoro possiamo trattenere la merce fino al pagamento '
    + 'delle lavorazioni (art. 2756 c.c.). I costi una tantum si fatturano con il primo lotto.' },
  { titolo: 'Riservatezza e lamine', testo: 'Documentazione e dati del cliente restano suoi: li usiamo solo per la lavorazione e non li diffondiamo. '
    + 'Le lamine serigrafiche pagate dal cliente sono di sua proprietà: le custodiamo presso di noi per i lotti successivi e le consegniamo su sua richiesta scritta.' },
  { titolo: 'Dati personali', testo: `I dati dei referenti del cliente sono trattati per la gestione del rapporto commerciale; informativa completa su ${INFORMATIVA_PRIVACY}.` },
  { titolo: 'Legge e foro', testo: 'Si applica la legge italiana. Per ogni controversia è competente in via esclusiva il Foro di Piacenza.' },
];

/** Testo unico di una clausola ("Titolo. testo"), come si stampava prima. */
export const testoClausola = (c: Clausola) => `${c.titolo}. ${c.testo}`;
/** Condizioni generali stampate nella seconda pagina del preventivo (e nella pagina in coda alla conferma d'ordine). */
export const CONDIZIONI_GENERALI = CLAUSOLE_FORNITURA.map(testoClausola);

/**
 * Clausole "vessatorie" (art. 1341 c. 2 c.c.) che valgono solo con una firma a parte: tempi non essenziali e niente penali, rimborso del
 * materiale del cliente limitato all'assicurazione, garanzia e termini di reclamo, limitazione di responsabilità, sospensione delle forniture
 * e riserva di proprietà, foro esclusivo. Numeri = posizione in CLAUSOLE_FORNITURA (da 1).
 */
export const VESSATORIE_FORNITURA = [3, 6, 9, 10, 11, 14];

/** Frase del riquadro con la seconda firma: elenca numero e titolo di ogni clausola (la Cassazione non vuole il solo richiamo cumulativo). */
export function approvazioneSpecifica(clausole: Clausola[], numeri: number[], chi = 'Il cliente'): string {
  return `${chi} dichiara di aver letto e di approvare espressamente, ai sensi degli artt. 1341 e 1342 c.c., le clausole: `
    + numeri.map(n => `${n} «${clausole[n - 1]?.titolo ?? ''}»`).join(', ') + '.';
}
export const APPROVAZIONE_FORNITURA = approvazioneSpecifica(CLAUSOLE_FORNITURA, VESSATORIE_FORNITURA);

/** Prima firma: preventivo e condizioni insieme. */
export const ACCETTAZIONE_PREVENTIVO = 'Il cliente dichiara di aver letto e accettato il preventivo e le presenti condizioni generali di fornitura.';

/** Richiamo sopra le firme della conferma d'ordine: le nostre condizioni prevalgono su quelle dell'ordine del cliente ("battaglia dei moduli"). */
export function notaConfermaOrdine(): string {
  return `Fornitura regolata dalle Condizioni generali di fornitura Casteltech rev. ${REVISIONE_CONDIZIONI} riportate in fondo a questa conferma, `
    + 'che prevalgono su condizioni diverse dell\'ordine del cliente salvo nostra accettazione scritta. In mancanza di osservazioni scritte entro '
    + '3 giorni lavorativi dal ricevimento la conferma si intende accettata. Date di consegna indicative, dal ricevimento completo di materiale e documentazione. '
    + 'Oltre la scadenza interessi di mora D.Lgs. 231/2002; schede con materiale fornito da noi di nostra proprietà fino al saldo (art. 1523 c.c.).';
}

/** Natura del DDT per la frase sulla proprietà: vendita (materiale nostro), conto lavoro (schede del cliente lavorate), altro (resi, riparazioni, visione). */
export type NaturaDdt = 'vendita' | 'conto_lavoro' | 'altro';
export function naturaDdt(causale: string | null | undefined): NaturaDdt {
  const c = String(causale ?? '').toUpperCase();
  if (/NON LAVORAT|GARANZIA|VISIONE|RIPARAZ|CAMPION|PRESTITO|SOSTITUZ/.test(c)) return 'altro';
  if (/VENDITA/.test(c)) return 'vendita';
  if (/LAVORAT|C\/LAVOR|CONTO LAVOR/.test(c)) return 'conto_lavoro';
  return 'altro';
}
/** Righe stampate sopra il piede del DDT: controllo al ricevimento, ESD, proprietà secondo la causale. */
export function noteDdt(causale: string | null | undefined): string[] {
  const natura = naturaDdt(causale);
  return [
    'Controllare la merce al ricevimento: danni o ammanchi visibili vanno annotati sul documento del vettore e segnalati per iscritto entro 8 giorni, '
      + `i difetti nascosti entro 8 giorni dalla scoperta (Condizioni generali di fornitura Casteltech rev. ${REVISIONE_CONDIZIONI}). `
      + 'Salvo resa diversa indicata, la merce viaggia a rischio del destinatario dalla consegna al vettore.',
    'Schede e componenti sono sensibili alle scariche elettrostatiche (ESD): conservarli nell\'imballo protettivo e maneggiarli con protezioni ESD.'
      + (natura === 'vendita' ? ' Merce di proprietà di Casteltech fino al completo pagamento (art. 1523 c.c.).'
        : natura === 'conto_lavoro' ? ' Materiale del cliente lavorato in conto lavorazione.' : ''),
  ];
}

/** Nota della fattura (PDF di cortesia e Causale dell'XML): mora, riserva di proprietà, condizioni, privacy. Non sulle note di credito. */
export function notaFattura(): string {
  return 'Pagamento alle scadenze indicate. In caso di ritardo decorrono di diritto, senza bisogno di sollecito, gli interessi di mora '
    + 'del D.Lgs. 231/2002 e l\'indennizzo forfettario di 40 € (art. 6). Merce venduta di nostra proprietà fino al completo pagamento (art. 1523 c.c.). '
    + `Fornitura regolata dalle Condizioni generali di fornitura Casteltech rev. ${REVISIONE_CONDIZIONI}. Informativa privacy: ${INFORMATIVA_PRIVACY}.`;
}

/** Condizioni generali di acquisto: ordine a fornitore (Adriano 7/11/2026; la nota di conferma del 5/11 resta sopra le firme). */
export const CLAUSOLE_ACQUISTO: Clausola[] = [
  { titolo: 'Condizioni applicabili', testo: 'L\'ordine è regolato da queste condizioni; vostre condizioni generali di vendita si applicano solo se le accettiamo '
    + 'per iscritto. Vi chiediamo conferma scritta di prezzi, quantità e date.' },
  { titolo: 'Consegna', testo: 'Alla data indicata, franco nostro stabilimento salvo resa diversa. Ritardi da comunicare subito; dopo 15 giorni di ritardo '
    + 'possiamo annullare le righe non consegnate senza penali né costi. Consegne parziali o anticipate solo se concordate.' },
  { titolo: 'Conformità del materiale', testo: 'Componenti nuovi, originali, acquistati da filiera autorizzata dal produttore, con tracciabilità di lotto e '
    + 'date code, conformi a RoHS e REACH; su richiesta certificato di conformità o di origine. Imballo e livello MSL a norma, con protezione ESD. '
    + 'Materiale contraffatto, riconfezionato, usato o con MSL scaduto viene respinto a vostre spese.' },
  { titolo: 'Garanzia', testo: '12 mesi dalla consegna. Il materiale non conforme viene sostituito o accreditato, a nostra scelta, entro 10 giorni con il '
    + 'trasporto a vostro carico; se il difetto non era riconoscibile al ricevimento sono a vostro carico anche i costi di smontaggio dalle schede già montate.' },
  { titolo: 'Prezzi e pagamento', testo: 'Prezzi fissi come da ordine, IVA esclusa. Pagamento alle condizioni indicate dopo il ricevimento della merce e della '
    + 'fattura corretta, che deve citare il nostro numero d\'ordine.' },
  { titolo: 'Riservatezza', testo: 'Disegni, BOM, file e codici dei nostri clienti sono riservati e vanno usati solo per questa fornitura.' },
  { titolo: 'Dati personali', testo: `I dati dei referenti sono trattati per la gestione del rapporto commerciale; informativa su ${INFORMATIVA_PRIVACY}.` },
  { titolo: 'Legge e foro', testo: 'Si applica la legge italiana. Per ogni controversia è competente in via esclusiva il Foro di Piacenza.' },
];
export const VESSATORIE_ACQUISTO = [2, 4, 8];
export const APPROVAZIONE_ACQUISTO = approvazioneSpecifica(CLAUSOLE_ACQUISTO, VESSATORIE_ACQUISTO, 'Il fornitore');

/** Pagina delle condizioni da aggiungere in coda a un PDF (conferma d'ordine, ordine a fornitore). */
export interface PaginaCondizioni { titolo: string; clausole: Clausola[]; approvazione: string; firma: string }
export const PAGINA_FORNITURA: PaginaCondizioni = {
  titolo: 'CONDIZIONI GENERALI DI FORNITURA', clausole: CLAUSOLE_FORNITURA, approvazione: APPROVAZIONE_FORNITURA, firma: 'Per approvazione specifica del cliente',
};
export const PAGINA_ACQUISTO: PaginaCondizioni = {
  titolo: 'CONDIZIONI GENERALI DI ACQUISTO', clausole: CLAUSOLE_ACQUISTO, approvazione: APPROVAZIONE_ACQUISTO, firma: 'Per approvazione specifica del fornitore',
};
