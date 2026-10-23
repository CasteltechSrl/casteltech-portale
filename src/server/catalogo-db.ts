/**
 * Lettura/scrittura del catalogo (fasi, parametri, voci, materiali, tariffe) dal database,
 * e primo riempimento dal catalogo iniziale.
 */
import bcrypt from 'bcryptjs';
import { q, q1, transazione } from './db.js';
import { FASI, PARAMETRI, VOCI, MATERIALI, type FaseCatalogo, type ParametroDef, type MaterialeDef } from '../catalogo/iniziale.js';
import type { Tariffe, VoceDef } from '../engine/calcolo.js';

export interface Catalogo {
  fasi: FaseCatalogo[];
  voci: VoceDef[];
  parametri: ParametroDef[];
  materiali: MaterialeDef[];
}

export const TARIFFE_INIZIALI: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1.25 };

export async function caricaCatalogo(): Promise<Catalogo> {
  const [fasi, voci, parametri, materiali] = await Promise.all([
    q(`SELECT * FROM fasi WHERE attiva ORDER BY ordine, numero`),
    q(`SELECT * FROM voci_costo WHERE attiva ORDER BY ordine`),
    q(`SELECT * FROM parametri WHERE attivo ORDER BY ordine`),
    q(`SELECT * FROM materiali ORDER BY descrizione`),
  ]);
  return {
    fasi: fasi.map(f => ({
      codice: f.codice, numero: f.numero, nome: f.nome, gruppo: f.gruppo, formulaSecondi: f.formula_secondi,
      persone: Number(f.persone_default), tariffa: f.tariffa, unaTantum: f.una_tantum, scala: f.scala,
    })),
    voci: voci.map(v => ({ codice: v.codice, nome: v.nome, gruppo: v.gruppo, formulaEuro: v.formula_euro, unaTantum: v.una_tantum })),
    parametri: parametri.map(p => ({
      codice: p.codice, etichetta: p.etichetta, unita: p.unita, gruppo: p.gruppo,
      default: p.valore_default ?? undefined, suggerimento: p.suggerimento ?? undefined, tipo: p.tipo,
    })),
    materiali: materiali.map(m => ({ codice: m.codice, descrizione: m.descrizione, costo: Number(m.costo), um: m.um, quantita: m.quantita ?? undefined })),
  };
}

export async function caricaTariffe(): Promise<Tariffe> {
  const r = await q1<{ valore: Tariffe }>(`SELECT valore FROM impostazioni WHERE chiave = 'tariffe'`);
  return { ...TARIFFE_INIZIALI, ...(r?.valore ?? {}) };
}

export { controllaFormula, VARIABILI_SISTEMA } from '../catalogo/controlli.js';

/** Al primo avvio: riempie il catalogo e crea l'amministratore. Non tocca nulla se i dati ci sono già. */
export async function primoAvvio() {
  const n = await q1<{ n: number }>('SELECT count(*)::int AS n FROM fasi');
  if (!n?.n) {
    await transazione(async c => {
      for (const [i, p] of PARAMETRI.entries())
        await c.query(`INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [p.codice, p.etichetta, p.unita, p.gruppo, p.default ?? null, p.suggerimento ?? null, p.tipo ?? 'numero', i * 10]);
      for (const [i, f] of FASI.entries())
        await c.query(`INSERT INTO fasi (codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [f.codice, f.numero, f.nome, f.gruppo, f.formulaSecondi, f.persone, f.tariffa, f.unaTantum, f.scala, i * 10]);
      for (const [i, v] of VOCI.entries())
        await c.query(`INSERT INTO voci_costo (codice, nome, gruppo, formula_euro, una_tantum, ordine) VALUES ($1,$2,$3,$4,$5,$6)`,
          [v.codice, v.nome, v.gruppo, v.formulaEuro, v.unaTantum, i * 10]);
      for (const m of MATERIALI)
        await c.query(`INSERT INTO materiali (codice, descrizione, costo, um, quantita) VALUES ($1,$2,$3,$4,$5)`,
          [m.codice, m.descrizione, m.costo, m.um, m.quantita ?? null]);
      await c.query(`INSERT INTO impostazioni (chiave, valore) VALUES ('tariffe', $1) ON CONFLICT DO NOTHING`, [JSON.stringify(TARIFFE_INIZIALI)]);
    });
    console.log('Catalogo iniziale caricato');
  }
  const email = process.env.ADMIN_EMAIL, pwd = process.env.ADMIN_PASSWORD;
  const ufficio = await q1<{ n: number }>(`SELECT count(*)::int AS n FROM utenti WHERE ruolo = 'ufficio'`);
  if (!ufficio?.n && email && pwd) {
    await q(`INSERT INTO utenti (nome, email, password_hash, ruolo) VALUES ($1, lower($2), $3, 'ufficio')`,
      [process.env.ADMIN_NOME ?? 'Amministratore', email, await bcrypt.hash(pwd, 12)]);
    console.log(`Creato utente ufficio ${email}`);
  }
}
