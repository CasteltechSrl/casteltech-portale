/**
 * Pagine delle macchine nel menu Produzione (Adriano 12/11/2026): Stoccaggio componenti (armadi), Pick & Place, AOI.
 * Per ora sono pagine di attesa: spiegano cosa mostreranno quando le macchine saranno collegate con le loro API.
 * Nessun dato inventato e nessuna lettura del database. Una macchina nuova = una voce in PAGINE_MACCHINE
 * (+ la voce nel menu Produzione in views/layout.ts). Test in tests/macchine.test.ts.
 */
export interface PaginaMacchina {
  /** parte finale dell'indirizzo: /produzione/<chiave> */
  chiave: string;
  titolo: string;
  /** cosa è, in una frase */
  cosa: string;
  /** cosa mostrerà quando arriveranno le API */
  mostrera: string[];
}

export const PAGINE_MACCHINE: PaginaMacchina[] = [
  {
    chiave: 'stoccaggio', titolo: 'Stoccaggio componenti',
    cosa: 'Gli armadi dove si stoccano bobine, vassoi e materiale per la produzione.',
    mostrera: [
      'Dove si trova ogni componente: armadio e posizione, con il codice di produzione e il codice gestionale.',
      'Quante bobine e quanti pezzi ci sono di ogni codice, e il materiale dei clienti in conto lavoro tenuto a parte.',
      'Il materiale da prelevare per una commessa, partendo dalla BOM, e cosa manca.',
      'Entrate e uscite dagli armadi, con data e chi le ha fatte.',
    ],
  },
  {
    chiave: 'pick-place', titolo: 'Pick & Place',
    cosa: 'Le macchine di montaggio SMD della linea: Essemtec Fox, iPulse M1 e iPulse M4s.',
    mostrera: [
      'Lo stato di ogni macchina (in lavoro, ferma, in attrezzaggio) e la commessa che sta montando.',
      'Schede e componenti montati, velocità e tempo di ciclo reale, da confrontare con il preventivo.',
      'Scarti dei componenti per feeder (prese sbagliate) e fermi macchina con la causa.',
      'I tempi della fase SMD presi dalla macchina, senza scriverli a mano.',
    ],
  },
  {
    chiave: 'aoi', titolo: 'AOI',
    cosa: 'Il controllo ottico automatico delle schede dopo il montaggio.',
    mostrera: [
      'Le schede controllate per commessa: buone, con difetti e falsi allarmi.',
      'I difetti più frequenti per componente e per tipo (mancante, spostato, ruotato, cortocircuito, saldatura).',
      'Le immagini dei difetti confermati, da collegare alle non conformità della Qualità.',
      'L\'andamento dei difetti nel tempo, per prodotto e per lotto.',
    ],
  },
];

export const paginaMacchina = (chiave: string) => PAGINE_MACCHINE.find(p => p.chiave === chiave);
