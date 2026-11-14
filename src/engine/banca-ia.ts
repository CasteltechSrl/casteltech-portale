/**
 * Abbinamento della banca con l'IA (Adriano 14/11/2026: "far girare un motore AI per capire cosa sono e abbinarli").
 * Le regole di `engine/banca.ts` restano le prime: l'IA guarda solo i movimenti che le regole non sanno abbinare o registrare da sole,
 * con le fatture candidate (aperte e già segnate pagate ma non collegate) e propone fatture o categoria. Qui: istruzioni, testo della
 * richiesta e controllo della risposta (fatture che esistono, direzione giusta, somma uguale al centesimo, categoria dell'elenco).
 * La proposta non cambia nulla: diventa abbinamento solo con "Conferma".
 */
import { CATEGORIE_MOVIMENTO, type Movimento, type RataAperta } from './banca.js';

export interface PropostaIa {
  rate: { tipo: 'emessa' | 'ricevuta'; id: number; gia?: boolean }[];
  categoria: string | null;
  motivo: string;
  sicura: boolean;
  il: string;
}

export const ISTRUZIONI_BANCA_IA = `Sei l'assistente amministrativo di Casteltech S.r.l. (assemblaggio di schede elettroniche, Piacenza).
Ricevi movimenti del conto BPER non ancora abbinati e un elenco di fatture candidate. Per ogni movimento decidi se è l'incasso/pagamento
di una o più fatture dell'elenco oppure, se non c'è fattura, la sua categoria.
Regole del titolare:
- "COMMISSIONI ..." = Commissioni e spese bancarie. "EMOLUMENTI" / busta paga = Stipendi.
- F24: di solito rate dell'Agenzia delle Entrate (Imposte e rate Agenzia Entrate); quello pagato intorno al 16 del mese (dal 10 al 20) = Contributi dipendenti (F24).
- Un bonifico "DISPOSIZIONE a favore di <persona> ... FPR/fattura" è il pagamento della fattura di un libero professionista (es. Federico Cetani), non uno stipendio:
  abbinalo alla sua fattura se è nell'elenco.
- Anticipo fatture: la banca anticipa le fatture sul conto tecnico e le "presta" al conto principale ("ANTICIPO SU DOCUMENTI ft. ..." = Anticipo fatture);
  quando il cliente paga, il conto principale restituisce la somma ("RIENTRO ANTICIPO ..." = Rientro anticipo). Questi due non sono mai una fattura.
  Il bonifico del cliente che arriva lo stesso giorno è invece l'incasso della fattura.
- Distinte di bonifici senza nomi: prova le fatture dei fornitori in scadenza vicino alla data che fanno esattamente il totale; se non tornano, categoria.
- Fatture con "già pagata il" sono state segnate pagate prima: il movimento le conferma (usa l'id con :gia).
- La somma delle fatture scelte deve essere ESATTAMENTE l'importo del movimento (al centesimo). Entrate solo con fatture emesse (E), uscite solo con fatture dei fornitori (R).
- Nel dubbio non abbinare: proponi la categoria e spiega.
Categorie possibili: ${CATEGORIE_MOVIMENTO.filter(c => c !== 'Incasso fattura' && c !== 'Pagamento fattura').join('; ')}.
Rispondi SOLO con un array JSON, un elemento per movimento:
[{"id": 123, "fatture": ["E45", "R12:gia"], "categoria": null, "motivo": "frase breve in italiano", "sicura": true}]
Con fatture metti "categoria": null; senza fatture "fatture": [] e la categoria. "sicura" = true solo se non ci sono dubbi.`;

const euro = (n: number) => n.toFixed(2);

/** Testo della richiesta: movimenti e fatture candidate in righe compatte. */
export function richiestaIa(movimenti: (Movimento & { id: number; conto: string })[], rate: RataAperta[], contoDi: (n: string) => string): string {
  const righeMov = movimenti.map(m => `${m.id} | ${m.data} | ${contoDi(m.conto)} | ${euro(m.importo)} | ${m.descrizione.replace(/\s+/g, ' ').slice(0, 300)}`);
  const righeRate = rate.map(r => `${r.tipo === 'emessa' ? 'E' : 'R'}${r.id}${r.gia ? ':gia' : ''} | ${r.tipo === 'emessa' ? 'fattura emessa' : 'fattura fornitore'} ${r.numero || 's.n.'} del ${r.dataDoc}`
    + ` | ${r.controparte} | ${euro(r.importo)} | scadenza ${r.scadenza}${r.gia && r.pagataIl ? ` | già pagata il ${r.pagataIl}` : ''}`);
  return `MOVIMENTI (id | data | conto | importo | descrizione):\n${righeMov.join('\n')}\n\nFATTURE CANDIDATE (codice | documento | controparte | importo | scadenza):\n${righeRate.join('\n') || '(nessuna)'}`;
}

/** Legge la risposta dell'IA e tiene solo le proposte valide. Movimenti, rate e oggi servono al controllo. */
export function leggiRispostaIa(testo: string, movimenti: (Movimento & { id: number })[], rate: RataAperta[], oggi: string): Map<number, PropostaIa> {
  const esito = new Map<number, PropostaIa>();
  const inizio = testo.indexOf('['), fine = testo.lastIndexOf(']');
  if (inizio < 0 || fine <= inizio) return esito;
  let dati: unknown;
  try { dati = JSON.parse(testo.slice(inizio, fine + 1)); } catch { return esito; }
  if (!Array.isArray(dati)) return esito;
  const perId = new Map(movimenti.map(m => [m.id, m]));
  const perCodice = new Map(rate.map(r => [`${r.tipo === 'emessa' ? 'E' : 'R'}${r.id}${r.gia ? ':gia' : ''}`, r]));
  const categorie = CATEGORIE_MOVIMENTO.filter(c => c !== 'Incasso fattura' && c !== 'Pagamento fattura') as readonly string[];
  for (const x of dati as any[]) {
    const m = perId.get(Number(x?.id));
    if (!m || esito.has(m.id)) continue;
    const motivo = String(x?.motivo ?? '').trim().slice(0, 300);
    const codici: string[] = Array.isArray(x?.fatture) ? x.fatture.map((c: unknown) => String(c).trim().toUpperCase().replace(':GIA', ':gia')) : [];
    const scelte = codici.map(c => perCodice.get(c));
    const tipo = m.importo > 0 ? 'emessa' : 'ricevuta';
    const valide = codici.length > 0 && scelte.every(r => r && r.tipo === tipo) && new Set(codici).size === codici.length
      && Math.abs(scelte.reduce((s, r) => s + r!.importo, 0) - Math.abs(m.importo)) < 0.005;
    if (valide) {
      esito.set(m.id, { rate: scelte.map(r => ({ tipo: r!.tipo, id: r!.id, ...(r!.gia ? { gia: true } : {}) })), categoria: null, motivo, sicura: x?.sicura === true, il: oggi });
      continue;
    }
    const categoria = String(x?.categoria ?? '').trim();
    if (categorie.includes(categoria))
      esito.set(m.id, { rate: [], categoria, motivo: codici.length ? `${motivo} (le fatture proposte non tornano con l'importo)` : motivo,
        sicura: x?.sicura === true && !codici.length, il: oggi });
  }
  return esito;
}
