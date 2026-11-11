/**
 * Controlli settimanali (proposta della revisione, Adriano 1/11/2026 "applica i suggerimenti"): una pagina sola, Amministrazione → Controlli,
 * con le cose lasciate a metà che nessun cruscotto mostra insieme. Si apre quando si vuole (nessun controllo automatico: Neon);
 * da fare una volta la settimana, es. il lunedì. Le regole sono qui, le letture in `server/controlli-servizio.ts`.
 * Un controllo nuovo = una voce in `elencoControlli` (+ la sua lettura).
 */

export type LivelloControllo = 'urgente' | 'controllare' | 'normale';
export interface VoceControllo { testo: string; link?: string; dettaglio?: string }
export interface Controllo { chiave: string; titolo: string; livello: LivelloControllo; spiegazione: string; righe: VoceControllo[] }

export interface DatiControlli {
  oggi: string;                                                                                            // aaaa-mm-gg
  ddtDaFatturare: { id: number; numero: string; data: string; cliente: string; righe?: number; senzaPrezzo?: number }[]; // DDT emessi senza fattura (causali da fatturare)
  ddtSenzaCausale?: { id: number; numero: string; data: string; cliente: string }[];                       // DDT emessi senza causale del trasporto
  ordiniSenzaConsegna: { id: number; numero: string; cliente: string; righe: number }[];                   // righe aperte senza data di consegna
  prodottiSenzaPrezzo: { id: number; codice: string; cliente: string; clienteId: number | null }[];        // usati in ordini aperti, prezzo vuoto in anagrafica
  clientiSenzaRecapitoSdi: { id: number; nome: string; fatture: number }[];                               // fatturati negli ultimi 12 mesi, né codice SDI né PEC
  fattureFornitoriSenzaScadenza: { id: number; numero: string; data: string; fornitore: string; totale: number }[];
  preventiviFermi: { id: number; numero: string; cliente: string; aggiornato: string }[];                  // bozze ferme da oltre 30 giorni
  commesseOltreConsegna: { id: number; numero: string; cliente: string; consegna: string }[];              // aperte con consegna passata
  tempiApertiVecchi: { id: number; commessa: string; commessaId: number; fase: string; sigla: string; data: string }[]; // fasi aperte dal telefono da oltre 2 giorni
  lamineNonFatturate?: { data: string; fornitore: string; descrizione: string; pezzi: number; giorni: number }[]; // lamine comprate da oltre 30 gg senza fattura
  serviziNonFatturati?: { ordineId: number; ordine: string; cliente: string; descrizione: string; importo: number }[]; // servizi d'ordine evasi (schede consegnate) mai fatturati
}

export const GIORNI_DDT_URGENTE = 20;
export const GIORNI_PREVENTIVO_FERMO = 30;
export const GIORNI_TEMPO_APERTO = 2;

export const giorniTra = (da: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${da}T12:00:00Z`)) / 86_400_000);
const dataIt = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const euroIt = (n: number) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
const ORDINE: Record<LivelloControllo, number> = { urgente: 0, controllare: 1, normale: 2 };

/** I controlli con almeno una riga, dai più urgenti. */
export function elencoControlli(d: DatiControlli): Controllo[] {
  const ddtVecchi = d.ddtDaFatturare.filter(x => giorniTra(x.data, d.oggi) >= GIORNI_DDT_URGENTE);
  const controlli: Controllo[] = [
    {
      chiave: 'commesse-oltre-consegna', titolo: 'Commesse aperte oltre la data di consegna', livello: 'urgente',
      spiegazione: 'La consegna scritta sulla commessa è passata e la commessa non è rientrata: avvisare il cliente o chiudere la commessa.',
      righe: d.commesseOltreConsegna.map(c => ({ testo: `${c.numero} · ${c.cliente}`, dettaglio: `consegna ${dataIt(c.consegna)}, ${giorniTra(c.consegna, d.oggi)} gg fa`, link: `/commesse/${c.id}` })),
    },
    {
      chiave: 'ddt-vecchi', titolo: `DDT da fatturare da più di ${GIORNI_DDT_URGENTE} giorni`, livello: 'urgente',
      spiegazione: 'DDT emessi e mai messi in una fattura. Fatture differite li raggruppa per cliente.',
      righe: ddtVecchi.map(x => ({ testo: `DDT n. ${x.numero} del ${dataIt(x.data)} · ${x.cliente}`, dettaglio: `${giorniTra(x.data, d.oggi)} gg`, link: `/amministrazione/documenti/${x.id}` })),
    },
    {
      // Adriano 11/11/2026: "per capire se i prezzi sono stati inseriti devo entrare in ogni singolo documento"
      chiave: 'ddt-senza-prezzi', titolo: 'DDT da fatturare con righe senza prezzo', livello: 'urgente',
      spiegazione: 'DDT di vendita o reso lavorato non ancora fatturati con righe a prezzo zero: la fattura uscirebbe a zero. Scrivere i prezzi nel DDT (o nella bozza della fattura); se il DDT non si fattura, segnarlo "Non fatturare" in Fatture differite.',
      righe: d.ddtDaFatturare.filter(x => (x.senzaPrezzo ?? 0) > 0).map(x => ({ testo: `DDT n. ${x.numero} del ${dataIt(x.data)} · ${x.cliente}`,
        dettaglio: x.senzaPrezzo === x.righe ? 'tutte le righe senza prezzo' : `${x.senzaPrezzo} ${x.senzaPrezzo === 1 ? 'riga' : 'righe'} su ${x.righe} senza prezzo`, link: `/amministrazione/documenti/${x.id}` })),
    },
    {
      chiave: 'ddt-senza-causale', titolo: 'DDT emessi senza causale del trasporto', livello: 'controllare',
      spiegazione: 'Senza causale il portale non sa se il DDT va fatturato (vendita, reso lavorato) o no (reso non lavorato, garanzia, conto visione): lo considera da fatturare. Scriverla con "Modifica DDT".',
      righe: (d.ddtSenzaCausale ?? []).map(x => ({ testo: `DDT n. ${x.numero} del ${dataIt(x.data)} · ${x.cliente}`, link: `/amministrazione/documenti/${x.id}` })),
    },
    {
      chiave: 'servizi-non-fatturati', titolo: 'Servizi degli ordini mai fatturati con le schede già consegnate', livello: 'urgente',
      spiegazione: 'Lamine, programmazioni e una tantum che non viaggiano con il DDT: le schede sono tutte partite ma il servizio non è in nessuna fattura. Aggiungerlo dalla bozza della fattura ("Servizi degli ordini non ancora fatturati") o segnare la riga evasa nell\'ordine se è già stato pagato altrove.',
      righe: (d.serviziNonFatturati ?? []).map(x => ({ testo: `${x.ordine} · ${x.cliente}`, dettaglio: `${x.descrizione} · ${euroIt(x.importo)}`, link: `/ordini/${x.ordineId}` })),
    },
    {
      chiave: 'lamine-da-fatturare', titolo: 'Lamine comprate da più di un mese e non ancora fatturate', livello: 'urgente',
      spiegazione: 'Ogni lamina si compra per un prodotto e va in fattura (a parte o dentro i costi una tantum). Aggiungerla nella bozza della fattura del cliente; se è dentro un\'altra riga segnarla in Analisi → Costi → Lamine; se non si fattura (a nostro carico, accordo) segnarla lì "da non fatturare".',
      righe: (d.lamineNonFatturate ?? []).map(l => ({ testo: `${l.pezzi === 1 ? '1 lamina' : `${l.pezzi} lamine`} · ${l.fornitore}`, dettaglio: `${l.descrizione.slice(0, 80)} · comprata il ${dataIt(l.data)}, ${l.giorni} gg fa`, link: `/amministrazione/analisi/costi/lamine?anno=${l.data.slice(0, 4)}` })),
    },
    {
      chiave: 'tempi-aperti', titolo: `Fasi aperte dal telefono da più di ${GIORNI_TEMPO_APERTO} giorni`, livello: 'controllare',
      spiegazione: 'Qualcuno ha aperto il tempo e non l\'ha chiuso: chiuderlo dal Rientro o dalla pagina della commessa, altrimenti i tempi della commessa sono sbagliati.',
      righe: d.tempiApertiVecchi.map(t => ({ testo: `${t.commessa} · fase ${t.fase} · ${t.sigla}`, dettaglio: `aperta il ${dataIt(t.data)}`, link: `/commesse/${t.commessaId}` })),
    },
    {
      chiave: 'ordini-senza-consegna', titolo: 'Ordini con righe senza data di consegna', livello: 'controllare',
      spiegazione: 'Senza data il Gantt e il calendario dei ritardi non li vedono: scrivere la consegna richiesta nella pagina dell\'ordine.',
      righe: d.ordiniSenzaConsegna.map(o => ({ testo: `${o.numero} · ${o.cliente}`, dettaglio: o.righe === 1 ? '1 riga' : `${o.righe} righe`, link: `/ordini/${o.id}` })),
    },
    {
      chiave: 'prodotti-senza-prezzo', titolo: 'Prodotti in ordine senza prezzo in anagrafica', livello: 'controllare',
      spiegazione: 'Fatture e DDT non possono proporre il prezzo: scriverlo in Anagrafiche → Prodotti (colonna Prezzo €) o dal preventivo.',
      righe: d.prodottiSenzaPrezzo.map(p => ({ testo: `${p.codice} · ${p.cliente}`, link: p.clienteId ? `/anagrafiche/prodotti?cliente=${p.clienteId}` : '/anagrafiche/prodotti' })),
    },
    {
      chiave: 'clienti-senza-sdi', titolo: 'Clienti fatturati senza codice destinatario né PEC', livello: 'controllare',
      spiegazione: 'Lo SdI consegna la fattura solo con codice destinatario o PEC (i privati e gli esteri hanno 0000000 / XXXXXXX): completare i Dati fiscali del cliente.',
      righe: d.clientiSenzaRecapitoSdi.map(c => ({ testo: c.nome, dettaglio: c.fatture === 1 ? '1 fattura in 12 mesi' : `${c.fatture} fatture in 12 mesi`, link: `/anagrafiche/clienti/${c.id}/fiscali` })),
    },
    {
      chiave: 'fornitori-senza-scadenza', titolo: 'Fatture fornitori senza scadenza di pagamento', livello: 'controllare',
      spiegazione: 'Senza scadenza non entrano tra i pagamenti da fare né tra gli scaduti: aggiungere la rata dalla pagina della fattura.',
      righe: d.fattureFornitoriSenzaScadenza.map(f => ({ testo: `${f.fornitore} · n. ${f.numero} del ${dataIt(f.data)}`, dettaglio: euroIt(f.totale), link: `/amministrazione/ricevuti/${f.id}` })),
    },
    {
      chiave: 'preventivi-fermi', titolo: `Preventivi in bozza fermi da più di ${GIORNI_PREVENTIVO_FERMO} giorni`, livello: 'normale',
      spiegazione: 'Mandarli al cliente (stato "inviato"), segnarli rifiutati o eliminarli, così l\'elenco resta pulito.',
      righe: d.preventiviFermi.map(p => ({ testo: `${p.numero} · ${p.cliente}`, dettaglio: `fermo da ${giorniTra(p.aggiornato, d.oggi)} gg`, link: `/preventivi/${p.id}` })),
    },
  ];
  return controlli.filter(c => c.righe.length).sort((a, b) => ORDINE[a.livello] - ORDINE[b.livello]);
}

export function riepilogoControlli(controlli: Controllo[]): { totale: number; urgenti: number; daControllare: number } {
  return {
    totale: controlli.reduce((s, c) => s + c.righe.length, 0),
    urgenti: controlli.filter(c => c.livello === 'urgente').reduce((s, c) => s + c.righe.length, 0),
    daControllare: controlli.filter(c => c.livello === 'controllare').reduce((s, c) => s + c.righe.length, 0),
  };
}
