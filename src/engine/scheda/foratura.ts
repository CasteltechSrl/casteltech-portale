/**
 * Lettura dei file di foratura (Excellon / NC Drill): punte, fori metallizzati e non, posizione dei fori.
 * Provato con PADS (Univac), KiCad (THS), Altium (Corticale) e Allegro (Corticale, Selea: misure solo nei commenti "Holesize").
 * Nessun accesso al database.
 */

export interface Punta { codice: string; diametro: number; metallizzata: boolean | null; fori: number; funzione?: 'via' | 'componente' }
export interface Foratura {
  punte: Punta[];
  fori: { x: number; y: number; d: number; metallizzato: boolean | null }[];
  metallizzataFile: boolean | null;   // dal nome o dall'intestazione del file (null = non si sa)
  avvisi: string[];
}

/** Il testo è un file di foratura? */
export function sembraForatura(testo: string): boolean {
  const t = testo.slice(0, 8000);
  if (/%FS[LTD]?[AI]?X\d/.test(t)) return false; // è un Gerber (es. disegno delle forature)
  return (/^M48\s*$/m.test(t) || /Holesize\s+\d+\.\s*=/.test(t)) && /^(T\d+|X[+-]?[\d.]+)/m.test(testo);
}

/** Metallizzato dal nome del file o dai commenti: NPTH / NonPlated / Non_Plated → no; PTH / Plated → sì. */
export function metallizzataDaTesto(s: string): boolean | null {
  const t = s.toUpperCase().replace(/[\s_-]+/g, '');
  if (/NPTH|NONPLATED|NOTPLATED|NONMETALL/.test(t)) return false;
  if (/PTH|PLATED|METALL/.test(t)) return true;
  return null;
}

export function leggiForatura(nomeFile: string, testo: string): Foratura {
  const righe = testo.replace(/\r/g, '').split('\n');
  const avvisi: string[] = [];
  const intestazione = righe.slice(0, 80).join('\n');
  let metallizzataFile = metallizzataDaTesto(nomeFile);
  const tipo = /TYPE\s*=\s*(NON_PLATED|PLATED)|FileFunction,(NonPlated|Plated)|Contents:.*?(Non-Plated|Plated)/i.exec(intestazione);
  if (tipo) metallizzataFile = metallizzataDaTesto(tipo[1] ?? tipo[2] ?? tipo[3]);

  // unità e formato
  let pollici = /^\s*(INCH|M72)\b/m.test(intestazione) || /MILS/i.test(intestazione) && !/^\s*METRIC/m.test(intestazione);
  if (/^\s*(METRIC|M71)\b/m.test(intestazione)) pollici = false;
  const fattore = () => pollici ? 25.4 : 1;
  const lz = /,\s*LZ\b/i.test(intestazione) || (/Holesize/.test(intestazione) && !/,\s*TZ\b/i.test(intestazione));
  let intere = pollici ? 2 : 3, decimali = pollici ? 4 : 3;
  const ff = /FILE_FORMAT\s*=\s*(\d)\s*:\s*(\d)/i.exec(intestazione) ?? /Format\s*:\s*(\d)\.(\d)/i.exec(intestazione);
  if (ff) { intere = Number(ff[1]); decimali = Number(ff[2]); }
  if (lz && !ff) { // Allegro e simili: la cifra più lunga dice quanti decimali (zeri finali tolti)
    const lunghe = [...testo.matchAll(/[XY][+-]?(\d+)/g)].reduce((m, x) => Math.max(m, x[1].length), 0);
    if (lunghe > intere + decimali) decimali = lunghe - intere;
  }
  const valore = (s: string) => {
    if (s.includes('.')) return Number(s) * fattore();
    const segno = s.startsWith('-') ? -1 : 1, cifre = s.replace(/^[+-]/, '');
    return segno * Number(lz ? cifre.padEnd(intere + decimali, '0') : cifre) / 10 ** decimali * fattore();
  };

  // punte dai commenti Allegro: ";   Holesize 3. = 12.000000 Tolerance = … PLATED MILS Quantity = 342"
  const punte = new Map<string, Punta>();
  const quantitaDichiarate = new Map<string, number>();
  for (const r of righe) {
    const m = /Holesize\s+(\d+)\.\s*=\s*([\d.]+).*?\b(NON_PLATED|PLATED)\b\s*(MILS|MM|INCH)?(?:.*?Quantity\s*=\s*(\d+))?/i.exec(r);
    if (m) {
      const unita = (m[4] ?? '').toUpperCase(), d = Number(m[2]) * (unita === 'MILS' ? 0.0254 : unita === 'INCH' ? 25.4 : unita === 'MM' ? 1 : fattore());
      punte.set(String(Number(m[1])), { codice: `T${m[1]}`, diametro: d, metallizzata: m[3].toUpperCase() === 'PLATED', fori: 0 });
      if (m[5]) quantitaDichiarate.set(String(Number(m[1])), Number(m[5]));
    }
  }
  // punte dall'intestazione: T01C0.300, T1F00S00C0.0118; il commento KiCad prima della punta dice Plated/NonPlated
  let commentoPrima = '';
  let inIntestazione = /^M48/m.test(intestazione);
  const fori: Foratura['fori'] = [];
  let attuale: Punta | null = null, x = 0, y = 0, selezioniT = false, chiaveAttuale = '';
  for (const r0 of righe) {
    const r = r0.trim();
    if (!r) continue;
    if (r.startsWith(';')) { commentoPrima = r; continue; }
    if (r === '%' || r === 'M95') { inIntestazione = false; continue; }
    if (/^(METRIC|M71)/.test(r)) { pollici = false; const m = /,\s*(\d+)\.(\d+)/.exec(r); if (m) { intere = m[1].length; decimali = m[2].length; } continue; }
    if (/^(INCH|M72)/.test(r)) { pollici = true; const m = /,\s*(\d+)\.(\d+)/.exec(r); if (m) { intere = m[1].length; decimali = m[2].length; } continue; }
    const def = /^T(\d+)(?:[FS]\d+)*C([\d.]+)/.exec(r);
    if (def) {
      const n = String(Number(def[1]));
      const metall = metallizzataDaTesto(commentoPrima) ?? punte.get(n)?.metallizzata ?? metallizzataFile;
      const funzione = /ViaDrill/i.test(commentoPrima) ? 'via' as const : /ComponentDrill/i.test(commentoPrima) ? 'componente' as const : undefined;
      punte.set(n, { codice: `T${def[1]}`, diametro: Number(def[2]) * fattore(), metallizzata: metall, fori: punte.get(n)?.fori ?? 0, ...(funzione ? { funzione } : {}) });
      if (!inIntestazione) attuale = punte.get(n)!;
      continue;
    }
    const sel = /^T(\d+)$/.exec(r);
    if (sel) {
      const n = String(Number(sel[1]));
      selezioniT = true;
      attuale = n === '0' ? null : (punte.get(n) ?? null);
      if (n !== '0' && !attuale) { avvisi.push(`Punta T${sel[1]} senza misura.`); attuale = { codice: `T${sel[1]}`, diametro: 0, metallizzata: metallizzataFile, fori: 0 }; punte.set(n, attuale); }
      continue;
    }
    // Allegro senza "T": i fori sono in fila nell'ordine dei commenti "Holesize", tanti quanti la "Quantity" di ciascuno
    const cx = /X([+-]?[\d.]+)/.exec(r), cy = /Y([+-]?[\d.]+)/.exec(r);
    if ((cx || cy) && !selezioniT && quantitaDichiarate.size && !inIntestazione) {
      const chiavi = [...punte.keys()];
      if (!attuale) { chiaveAttuale = chiavi[0]; attuale = punte.get(chiaveAttuale)!; }
      while (attuale && attuale.fori >= (quantitaDichiarate.get(chiaveAttuale) ?? Infinity)) {
        chiaveAttuale = chiavi[chiavi.indexOf(chiaveAttuale) + 1] ?? ''; attuale = punte.get(chiaveAttuale) ?? null;
      }
    }
    if ((cx || cy) && attuale && !/^G0?0|^G9[0-3]|^M15|^G85/.test(r)) {
      if (cx) x = valore(cx[1]);
      if (cy) y = valore(cy[1]);
      attuale.fori++;
      fori.push({ x, y, d: attuale.diametro, metallizzato: attuale.metallizzata });
    }
  }
  // file senza indicazione: tutto metallizzato salvo i fori grandi senza rame (non si può sapere dal file)
  // Allegro: la quantità scritta nei commenti è quella giusta (le righe di coordinate a volte valgono più fori)
  for (const [k, n] of quantitaDichiarate) { const p = punte.get(k); if (p) p.fori = n; }
  return { punte: [...punte.values()].filter(p => p.fori > 0), fori, metallizzataFile, avvisi };
}

/**
 * Refori per il calcolo dello stagno: fori metallizzati da almeno 0,7 mm (sotto sono vias); se il file dice via/componente (KiCad) vale quello.
 * Sull'esempio Univac EA1002-0 dà 85, come i piedini THT contati sul file CAD.
 */
export const DIAMETRO_MIN_REFORO = 0.7;
export function contaRefori(f: Foratura[]): { refori: number; vias: number; nonMetallizzati: number } {
  let refori = 0, vias = 0, nonMetallizzati = 0;
  for (const file of f) for (const p of file.punte) {
    if (p.metallizzata === false) nonMetallizzati += p.fori;
    else if (p.funzione) { if (p.funzione === 'componente') refori += p.fori; else vias += p.fori; }
    else if (p.diametro >= DIAMETRO_MIN_REFORO - 1e-6) refori += p.fori;
    else vias += p.fori;
  }
  return { refori, vias, nonMetallizzati };
}
