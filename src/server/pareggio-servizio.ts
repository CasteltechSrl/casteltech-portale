/**
 * Letture e caricamenti per Analisi → Punto di pareggio (Adriano 6/11/2026). Regole in `engine/pareggio.ts`.
 * - bilancino mensile del commercialista (Excel con un foglio per mese: conto, descrizione, saldo progressivo) → `conto_economico_mensile`;
 * - bilanci ufficiali (file JSON preparato dai PDF depositati) → impostazioni 'bilanci_ufficiali';
 * - mesi del portale: fatture emesse, fatture ricevute con le categorie di Casteltech (`classificaCosti`, le stesse di Analisi → Costi per
 *   categoria, Adriano 6/11/2026: niente più "fatture senza categoria"), costo del personale (totali del mese, come in Dipendenti).
 * Tutto letto solo all'apertura della pagina (Neon).
 */
import ExcelJS from 'exceljs';
import { q, q1, transazione } from './db.js';
import { classificaCosti, famigliaDiCategoriaCasteltech } from '../engine/analisi-costi.js';
import { categoria as categoriaCosto } from '../engine/categorie-acquisti.js';
import { regoleCategorie, righeCosti } from './analisi-costi-servizio.js';
import {
  chiaveMese, leggiBilancino, leggiBilanciUfficiali, mesiDelPeriodo, type BilancioUfficiale, type FoglioBilancino, type MesePortale, type Periodo,
  type RigaFoglio, type VoceMese, type VocePortale,
} from '../engine/pareggio.js';

const STATI_OK = `stato NOT IN ('bozza', 'annullato', 'scartato')`;

export async function vociCommercialista(): Promise<VoceMese[]> {
  return q<VoceMese>(`SELECT anno, mese, conto, descrizione, importo::float AS importo, progressivo::float AS progressivo FROM conto_economico_mensile ORDER BY anno, mese, conto`);
}

export async function bilanciUfficiali(): Promise<BilancioUfficiale[]> {
  const r = await q1<{ valore: unknown }>(`SELECT valore FROM impostazioni WHERE chiave = 'bilanci_ufficiali'`);
  return leggiBilanciUfficiali(r?.valore).bilanci;
}

/** I mesi del periodo letti dal portale: ricavi dalle fatture, acquisti dalle fatture ricevute (categorie di Casteltech), personale dalle buste paga. */
export async function mesiDalPortale(periodo: Periodo): Promise<MesePortale[]> {
  const mesi = mesiDelPeriodo(periodo);
  if (!mesi.length) return [];
  const da = `${periodo.da}-01`, a = `${periodo.a}-01`;
  const anni = [...new Set(mesi.map(m => m.anno))];
  const [fatture, righeRicevute, regole, personale] = await Promise.all([
    q<{ mese: string; importo: number }>(`SELECT to_char(data, 'YYYY-MM') AS mese, sum(CASE WHEN tipo = 'nota_credito' THEN -imponibile ELSE imponibile END)::float AS importo
      FROM documenti WHERE tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND numero IS NOT NULL AND data >= $1::date AND data < ($2::date + interval '1 month') GROUP BY 1`, [da, a]),
    righeCosti(anni), regoleCategorie(),
    q<{ mese: string; socio: boolean; importo: number }>(`SELECT to_char(make_date(anno, mese, 1), 'YYYY-MM') AS mese, qualifica IN ('SOCIO', 'AMMINISTRATORE', 'SOCI E COLLABORATORI') AS socio,
        sum(lordo + contributi + tfr + altri)::float AS importo
      FROM costi_personale WHERE make_date(anno, mese, 1) BETWEEN $1::date AND $2::date GROUP BY 1, 2`, [da, a]),
  ]);
  const out = new Map<string, VocePortale[]>(mesi.map(m => [chiaveMese(m.anno, m.mese), []]));
  const metti = (mese: string, v: VocePortale) => { const l = out.get(mese); if (l && v.importo) l.push(v); };
  for (const f of fatture) metti(f.mese, { famiglia: 'ricavi', voce: 'Fatture emesse meno note di credito (portale)', importo: f.importo });
  for (const p of personale) metti(p.mese, p.socio ? { famiglia: 'compensi', voce: 'Compenso amministratore e contributi (note contabili)', importo: p.importo }
    : { famiglia: 'personale', voce: 'Stipendi, contributi e TFR (note contabili)', importo: p.importo });
  // fatture ricevute: una voce per categoria di Casteltech e mese (righe o fatture intere, come in Costi per categoria)
  const ricevute = new Map<string, number>();
  for (const r of classificaCosti(righeRicevute, regole)) {
    const mese = r.data.slice(0, 7);
    if (!out.has(mese)) continue;
    const k = `${mese}|${r.categoria}`;
    ricevute.set(k, (ricevute.get(k) ?? 0) + r.importo);
  }
  for (const [k, importo] of ricevute) {
    const [mese, codice] = k.split('|');
    metti(mese, { famiglia: famigliaDiCategoriaCasteltech(codice), voce: `${categoriaCosto(codice).nome} (fatture ricevute)`, importo: Math.round(importo * 100) / 100 });
  }
  return [...out].map(([k, voci]) => ({ anno: Number(k.slice(0, 4)), mese: Number(k.slice(5, 7)), voci }));
}

/** Ultimo mese con dati nel portale o dal commercialista (per il periodo proposto). */
export async function ultimoMeseConDati(): Promise<string | null> {
  const r = await q1<{ ultimo: string | null }>(`SELECT greatest(
      (SELECT max(to_char(make_date(anno, mese, 1), 'YYYY-MM')) FROM conto_economico_mensile),
      (SELECT max(to_char(data, 'YYYY-MM')) FROM documenti WHERE tipo = 'fattura' AND ${STATI_OK} AND numero IS NOT NULL AND data <= current_date)) AS ultimo`);
  return r?.ultimo ?? null;
}

// ── Caricamento del bilancino del commercialista ──

const testo = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && 'result' in v) return testo((v as { result: unknown }).result);
  if (typeof v === 'object' && v !== null && 'richText' in v) return (v as { richText: { text: string }[] }).richText.map(t => t.text).join('');
  return String(v).trim();
};
const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object' && v !== null && 'result' in v) return numero((v as { result: unknown }).result);
  const t = testo(v).replace(/\./g, '').replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

/** I fogli dell'Excel come righe (conto a 8 cifre, descrizione, saldo): in una riga possono esserci i costi a sinistra e i ricavi a destra. */
export async function fogliDaExcel(file: Buffer): Promise<FoglioBilancino[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  const fogli: FoglioBilancino[] = [];
  wb.eachSheet(ws => {
    const righe: RigaFoglio[] = [];
    ws.eachRow(r => {
      const celle: unknown[] = [];
      r.eachCell({ includeEmpty: true }, c => { celle.push(c.value); });
      for (let i = 0; i < celle.length; i++) {
        const conto = testo(celle[i]);
        if (!/^\d{8}$/.test(conto)) continue;
        let descrizione = '', saldo: number | null = null;
        for (let j = i + 1; j < celle.length && j <= i + 4; j++) {
          const n = numero(celle[j]);
          if (n != null && descrizione) { saldo = n; i = j; break; }
          const t = testo(celle[j]);
          if (t && !descrizione && n == null) descrizione = t;
        }
        if (saldo != null) righe.push({ conto, descrizione, saldo });
      }
    });
    fogli.push({ nome: ws.name, righe });
  });
  return fogli;
}

export interface EsitoBilancino { anteprima: boolean; anno: number; mesi: string[]; conti: number; avvisi: string[]; ricavi: Record<string, number>; costi: Record<string, number> }

/** Legge l'Excel e, con conferma, scrive i mesi (ricaricare lo stesso mese lo sostituisce). */
export async function caricaBilancino(file: Buffer, anno: number, opz: { anteprima: boolean }): Promise<EsitoBilancino> {
  const fogli = await fogliDaExcel(file);
  const gia = (await vociCommercialista()).filter(v => v.anno === anno);
  const { voci, mesi, avvisi } = leggiBilancino(fogli, anno, gia);
  const ricavi: Record<string, number> = {}, costi: Record<string, number> = {};
  for (const m of mesi) {
    const k = chiaveMese(anno, m);
    ricavi[k] = r2(voci.filter(v => v.mese === m && v.conto.startsWith('8')).reduce((s, v) => s + v.importo, 0));
    costi[k] = r2(voci.filter(v => v.mese === m && v.conto.startsWith('7')).reduce((s, v) => s + v.importo, 0));
  }
  const esito: EsitoBilancino = { anteprima: opz.anteprima, anno, mesi: mesi.map(m => chiaveMese(anno, m)), conti: new Set(voci.map(v => v.conto)).size, avvisi, ricavi, costi };
  if (opz.anteprima || !voci.length) return esito;
  await transazione(async c => {
    for (const m of mesi) await c.query(`DELETE FROM conto_economico_mensile WHERE anno = $1 AND mese = $2`, [anno, m]);
    for (const v of voci) {
      await c.query(`INSERT INTO conto_economico_mensile (anno, mese, conto, descrizione, importo, progressivo) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (anno, mese, conto) DO UPDATE SET descrizione = $4, importo = $5, progressivo = $6, caricato_il = now()`,
      [v.anno, v.mese, v.conto, v.descrizione, v.importo, v.progressivo]);
    }
  });
  return esito;
}

/** Toglie i mesi del commercialista di un anno (per ricaricare da capo). */
export async function eliminaBilancino(anno: number): Promise<number> {
  const r = await q<{ n: number }>(`WITH d AS (DELETE FROM conto_economico_mensile WHERE anno = $1 RETURNING 1) SELECT count(*)::int AS n FROM d`, [anno]);
  return r[0]?.n ?? 0;
}

export async function mesiCaricati(): Promise<{ anno: number; mesi: number[]; caricato_il: string }[]> {
  const r = await q<{ anno: number; mese: number; caricato_il: string }>(`SELECT anno, mese, to_char(max(caricato_il), 'YYYY-MM-DD') AS caricato_il
    FROM conto_economico_mensile GROUP BY anno, mese ORDER BY anno, mese`);
  const out = new Map<number, { anno: number; mesi: number[]; caricato_il: string }>();
  for (const x of r) { const a = out.get(x.anno) ?? { anno: x.anno, mesi: [], caricato_il: x.caricato_il }; a.mesi.push(x.mese); if (x.caricato_il > a.caricato_il) a.caricato_il = x.caricato_il; out.set(x.anno, a); }
  return [...out.values()];
}

// ── Bilanci ufficiali ──

export async function caricaBilanciUfficiali(righe: unknown, opz: { anteprima: boolean }): Promise<{ anteprima: boolean; anni: number[]; errori: string[] }> {
  const { bilanci, errori } = leggiBilanciUfficiali(righe);
  if (!opz.anteprima && bilanci.length) {
    const attuali = await bilanciUfficiali();
    const uniti = new Map(attuali.map(b => [b.anno, b]));
    for (const b of bilanci) uniti.set(b.anno, b);
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('bilanci_ufficiali', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`,
      [JSON.stringify([...uniti.values()].sort((x, y) => x.anno - y.anno))]);
  }
  return { anteprima: opz.anteprima, anni: bilanci.map(b => b.anno), errori };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
