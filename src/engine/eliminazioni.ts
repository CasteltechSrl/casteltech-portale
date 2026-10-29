/**
 * Regole del tasto "Elimina" (Adriano, 26/10/2026: pulizia delle righe inserite per errore in tutte le sezioni).
 * Qui solo le decisioni (si può eliminare? perché no?), senza database: le pagine le usano e i test le controllano.
 */

/** Tabelle del catalogo (Impostazioni → Fasi, Parametri, Materiali di consumo, Voci di costo). */
export type TabellaCatalogo = 'fasi' | 'parametri' | 'materiali' | 'voci_costo';

/** I nomi con cui una riga del catalogo compare nelle formule. */
export function nomiNelleFormule(tabella: TabellaCatalogo, codice: string): string[] {
  switch (tabella) {
    case 'parametri': return [codice];
    case 'materiali': return [`prezzo_${codice}`, `qta_${codice}`];
    case 'fasi': return [`ore_${codice}`];
    case 'voci_costo': return [];
  }
}

/** true se la formula usa il nome (parola intera: "nPCB" non vale per "nPCBx"). */
export function formulaUsa(formula: string | null | undefined, nome: string): boolean {
  if (!formula) return false;
  const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${esc}($|[^A-Za-z0-9_])`).test(formula);
}

/**
 * Si può eliminare una riga del catalogo? Solo le righe aggiunte a mano e non usate:
 * quelle del catalogo iniziale servono al programma (spunte, migrazioni) e si spengono con "Attiva".
 * Restituisce il motivo del no, oppure null se si può.
 */
export function motivoCatalogoNonEliminabile(opz: {
  tabella: TabellaCatalogo; codice: string; iniziale: boolean;
  formule: { codice: string; formula: string | null }[];   // tutte le formule di fasi e voci (codice della riga che la contiene)
  usataInCommesse?: boolean;                                // solo fasi: tempi o segnalazioni già registrati
}): string | null {
  const { tabella, codice } = opz;
  if (opz.iniziale) return `${codice} fa parte del catalogo di partenza e il programma lo usa: non si elimina, togli la spunta "Attiva"${tabella === 'materiali' ? ' o lascialo com\'è' : ''}.`;
  if (opz.usataInCommesse) return `${codice} ha già tempi o segnalazioni nelle commesse: non si elimina, togli la spunta "Attiva".`;
  const nomi = nomiNelleFormule(tabella, codice);
  const dove = [...new Set(opz.formule.filter(f => f.codice !== codice && nomi.some(n => formulaUsa(f.formula, n))).map(f => f.codice))];
  if (dove.length) return `${codice} è usato nelle formule di ${dove.join(', ')}: prima toglilo da lì.`;
  return null;
}

/** Testo della richiesta di conferma prima di eliminare un ordine. */
export function confermaEliminaOrdine(o: { numero: number; anno: number; origine: string; righe: number; conDocumenti: boolean }): string {
  const righe = `${o.righe} rig${o.righe === 1 ? 'a' : 'he'}`;
  let t = `Eliminare l'ordine ${o.numero}/${o.anno} con ${righe}? Non si può annullare (prima viene salvato un backup).`;
  if (o.conDocumenti) t += '\n\nI DDT e le fatture collegate restano, ma finiscono tra le fatture senza ordine.';
  if (['fic', 'ordine_cliente', 'foglio'].includes(o.origine))
    t += '\n\nAttenzione: l\'ordine viene dal file di Impostazioni → Ordini; se ricarichi lo stesso file torna nell\'elenco.';
  if (o.origine === 'email') t += '\n\nIl documento letto dall\'IA torna in Ordini → Da acquisire, da correggere e confermare di nuovo (oppure da scartare).';
  return t;
}

/** Testo della richiesta di conferma prima di eliminare una commessa. */
export function confermaEliminaCommessa(c: { numero: string; stato: string; tempi: number }): string {
  let t = `Eliminare la commessa ${c.numero}? Spariscono anche le sue fasi, i tempi registrati (anche dal telefono), le segnalazioni scritte su questa commessa e il rientro.`;
  if (c.tempi) t += `\n\nHa già ${c.tempi} temp${c.tempi === 1 ? 'o registrato' : 'i registrati'}.`;
  if (c.stato !== 'aperta') t += `\n\nLa commessa è già ${c.stato.replace('_', ' ')}.`;
  return t + '\n\nIl preventivo resta. Non si può annullare (prima viene salvato un backup).';
}

/**
 * Elimina dall'elenco delle commesse (Adriano, 29/10/2026: spunte e pulsanti come nei preventivi): vanno via insieme solo
 * le commesse create per errore, cioè ancora aperte e senza tempi registrati. Le altre si eliminano una per volta dalla
 * loro pagina, dove la conferma dice quanti tempi si perdono.
 */
export function commesseEliminabiliDallElenco<T extends { stato: string; tempi: number }>(commesse: T[]): { si: T[]; no: T[] } {
  const si: T[] = [], no: T[] = [];
  for (const c of commesse) (c.stato === 'aperta' && !c.tempi ? si : no).push(c);
  return { si, no };
}
