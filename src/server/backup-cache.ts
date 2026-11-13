/**
 * Copia delle righe dell'ultimo backup sul disco di Render, per non rileggere ogni volta tutto il database da Neon
 * (Adriano 13/11/2026: Neon avvisa "82 % dei 5 GB di traffico del mese" già il 13; ogni backup portava da Neon a Render
 * 110–180 MB di testo, e nel mese ce ne sono ~20 tra serali e "prima di eliminare").
 *
 * Come funziona: per ogni tabella il database manda solo l'impronta (md5) di ogni riga, ~60 byte invece della riga intera;
 * le righe con un'impronta già vista nell'ultimo backup si prendono da qui, le altre (nuove o cambiate) si leggono da Neon.
 * Il file di backup che esce è IDENTICO a prima (stesso formato, stesso ripristino).
 *
 * Sul disco, per tabella: `<tabella>.dat` = righe compresse una dopo l'altra, `<tabella>.idx` = una riga di testo
 * "md5 inizio lunghezza" per riga. Ogni backup riscrive i file con le sole righe di oggi (`.nuovo`, poi rinominati se tutto è
 * andato bene): la copia non cresce. Un errore del disco spegne la copia per quel backup, il backup continua leggendo da Neon.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/** Impronta del testo di una riga: la stessa di md5(testo) di PostgreSQL. */
export const impronta = (testo: string) => createHash('md5').update(testo, 'utf8').digest('hex');

/** Nome di file sicuro per una tabella. */
const nomeFile = (tabella: string) => tabella.replace(/[^a-zA-Z0-9_]/g, '_');

export class CacheRighe {
  private tabella = '';
  private indice = new Map<string, [number, number]>();
  private fdVecchio: number | null = null;
  private fdNuovo: number | null = null;
  private posNuovo = 0;
  private righeIndice: string[] = [];
  private scritte = new Set<string>();
  /** Copia spenta per un errore del disco: si legge tutto dal database, come prima. */
  spenta = false;
  /** Righe prese dalla copia / lette dal database (per il registro e le prove). */
  prese = 0;
  lette = 0;

  constructor(private cartella: string) {
    try { mkdirSync(cartella, { recursive: true }); } catch { this.spenta = true; }
  }

  private chiudiTabella() {
    if (this.fdVecchio != null) { try { closeSync(this.fdVecchio); } catch { /* già chiuso */ } this.fdVecchio = null; }
    if (this.fdNuovo != null) {
      try {
        closeSync(this.fdNuovo);
        writeFileSync(join(this.cartella, `${nomeFile(this.tabella)}.idx.nuovo`), this.righeIndice.join('\n'));
      } catch { this.spenta = true; }
      this.fdNuovo = null;
    }
    this.indice = new Map(); this.righeIndice = []; this.posNuovo = 0;
  }

  /** Comincia una tabella: carica l'indice dell'ultimo backup e apre il file nuovo. */
  apri(tabella: string) {
    this.chiudiTabella();
    this.tabella = tabella;
    if (this.spenta) return;
    const base = join(this.cartella, nomeFile(tabella));
    try {
      if (existsSync(`${base}.idx`) && existsSync(`${base}.dat`)) {
        for (const r of readFileSync(`${base}.idx`, 'utf8').split('\n')) {
          const [h, da, n] = r.split(' ');
          if (h && da && n) this.indice.set(h, [Number(da), Number(n)]);
        }
        this.fdVecchio = openSync(`${base}.dat`, 'r');
      }
    } catch { this.indice = new Map(); this.fdVecchio = null; }
    try {
      this.fdNuovo = openSync(`${base}.dat.nuovo`, 'w');
      this.scritte.add(tabella);
    } catch { this.spenta = true; }
  }

  /** Testo della riga con questa impronta nell'ultimo backup (null = non c'è o il file è rovinato). */
  leggi(h: string): string | null {
    const pos = this.indice.get(h);
    if (!pos || this.fdVecchio == null) return null;
    try {
      const buf = Buffer.alloc(pos[1]);
      if (readSync(this.fdVecchio, buf, 0, pos[1], pos[0]) !== pos[1]) return null;
      const testo = inflateRawSync(buf).toString('utf8');
      return impronta(testo) === h ? testo : null;   // controllo: mai una riga sbagliata nel backup
    } catch { return null; }
  }

  /** Mette la riga nella copia per il prossimo backup. */
  scrivi(h: string, testo: string) {
    if (this.spenta || this.fdNuovo == null) return;
    try {
      const buf = deflateRawSync(Buffer.from(testo, 'utf8'));
      writeSync(this.fdNuovo, buf, 0, buf.length, this.posNuovo);
      this.righeIndice.push(`${h} ${this.posNuovo} ${buf.length}`);
      this.posNuovo += buf.length;
    } catch { this.spenta = true; }
  }

  /** Backup riuscito: i file nuovi prendono il posto dei vecchi; le tabelle che non ci sono più si tolgono. */
  conferma() {
    this.chiudiTabella();
    if (this.spenta) { this.annulla(); return; }
    try {
      for (const t of this.scritte) {
        const base = join(this.cartella, nomeFile(t));
        renameSync(`${base}.dat.nuovo`, `${base}.dat`);
        renameSync(`${base}.idx.nuovo`, `${base}.idx`);
      }
      const tenere = new Set([...this.scritte].map(nomeFile));
      for (const f of readdirSync(this.cartella)) if (!tenere.has(f.replace(/\.(dat|idx)(\.nuovo)?$/, ''))) unlinkSync(join(this.cartella, f));
    } catch { /* al prossimo backup si rifà: le righe mancanti si leggono dal database */ }
  }

  /** Backup non riuscito: si tolgono i file nuovi, resta la copia di prima. */
  annulla() {
    this.chiudiTabella();
    try { for (const f of readdirSync(this.cartella)) if (f.endsWith('.nuovo')) unlinkSync(join(this.cartella, f)); } catch { /* niente */ }
  }
}
