/**
 * Sigle degli operatori da scrivere nella colonna OPERATORE del foglio tempi (Adriano, 25/10/2026).
 * Si gestiscono in Impostazioni → Operatori, una riga per persona: "AG = Adriano Gambi" oppure solo il nome
 * (la sigla si propone da sola: iniziali di nome e cognome, senza doppioni).
 */
export interface Operatore { sigla: string; nome: string }

const pulisci = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Sigla di 1–2 caratteri non ancora usata. */
export function proponiSigla(nome: string, usate: Set<string>): string {
  const parole = pulisci(nome).toUpperCase().split(' ').filter(Boolean);
  const lettere = parole.join('');
  const candidati = [
    (parole[0]?.[0] ?? '') + (parole[parole.length - 1]?.[0] ?? ''),      // iniziali nome + cognome
    (parole[0]?.[0] ?? '') + (parole[parole.length - 1]?.[1] ?? ''),      // iniziale + 2ª lettera del cognome
    (parole[0]?.slice(0, 2) ?? ''),                                         // prime due lettere del nome
    ...[...lettere].map(c => (parole[0]?.[0] ?? '') + c),
  ].filter(s => s.length === 2);
  for (const s of candidati) if (!usate.has(s)) return s;
  for (let i = 0; i < 26 * 26; i++) { const s = String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)); if (!usate.has(s)) return s; }
  return '?';
}

/** Legge il testo del pannello: "SIGLA = Nome" oppure "Nome". */
export function leggiOperatori(testo: string): Operatore[] {
  const righe = String(testo ?? '').split(/\r?\n/).map(pulisci).filter(Boolean);
  const out: Operatore[] = [];
  const usate = new Set<string>();
  const conSigla = righe.map(r => { const m = r.match(/^([A-Za-z0-9]{1,2})\s*[=:\-–]\s*(.+)$/); return m ? { sigla: m[1].toUpperCase(), nome: pulisci(m[2]) } : { sigla: '', nome: r }; });
  for (const o of conSigla) if (o.sigla && !usate.has(o.sigla)) usate.add(o.sigla); else if (o.sigla) o.sigla = '';
  for (const o of conSigla) out.push({ sigla: o.sigla || proponiSigla(o.nome, usate), nome: o.nome }), usate.add(out[out.length - 1].sigla);
  return out;
}
