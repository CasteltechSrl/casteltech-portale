/**
 * Dati DEMO per il video promozionale (aziende, codici e numeri INVENTATI, nessun dato reale).
 * Si lancia su un database VUOTO di prova, mai su quello vero:
 *   DATABASE_URL=postgres://postgres@localhost:5433/demo npx tsx video-promo/dati-demo/semina.ts
 * Prima avviare una volta il portale sullo stesso database (crea tabelle, catalogo e utente).
 * "Oggi" per i dati = OGGI_DEMO (le date si spostano da sole se si cambia).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, q1, pool } from '../../src/server/db.js';
import { caricaCatalogo, caricaTariffe } from '../../src/server/catalogo-db.js';
import { salvaPreventivo, normalizza } from '../../src/server/preventivi-servizio.js';
import { salvaCommessa } from '../../src/server/commesse-servizio.js';
import { caricaMovimenti, salvaConti } from '../../src/server/banca-servizio.js';

const qui = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(qui, 'dati-demo.json'), 'utf8'));
const OGGI = new Date(D.oggi + 'T12:00:00Z');

// numeri casuali ripetibili (stesso video a ogni rigenerazione)
let seme = 20261112;
const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
const tra = (a: number, b: number) => a + Math.floor(caso() * (b - a + 1));
const scegli = <T>(v: T[]) => v[Math.floor(caso() * v.length)];
const giorno = (d: Date) => d.toISOString().slice(0, 10);
const piuGiorni = (d: Date | string, n: number) => { const x = new Date(typeof d === 'string' ? d + 'T12:00:00Z' : d); x.setUTCDate(x.getUTCDate() + n); return x; };
const tondo = (x: number) => Math.round(x * 100) / 100;

/** P.IVA italiana inventata ma con la cifra di controllo giusta. */
function piva(base: string) {
  const c = base.padStart(10, '0').slice(0, 10).split('').map(Number);
  let s = 0;
  c.forEach((n, i) => { if (i % 2 === 0) s += n; else { const d = n * 2; s += d > 9 ? d - 9 : d; } });
  return c.join('') + ((10 - (s % 10)) % 10);
}

async function main() {
  const utente = (await q1<{ id: number }>(`SELECT id FROM utenti ORDER BY id LIMIT 1`))!.id;

  // ── Clienti e prodotti ──
  const clienti: { id: number; nome: string; prodotti: { id: number; codice: string; descrizione: string; prezzo: number; smd: number; tht: number; bot: number }[]; peso: number }[] = [];
  for (const [i, c] of D.clienti.entries()) {
    const id = (await q1<{ id: number }>(`INSERT INTO clienti (ragione_sociale, partita_iva, indirizzo, cap, comune, provincia, nazione, codice_sdi,
        email_amministrazione, email_preventivi, condizione_pagamento) VALUES ($1,$2,$3,$4,$5,$6,'IT','ABC1234',$7,$7,$8) RETURNING id`,
      [c.nome, piva(String(1234560 + i * 7919)), c.indirizzo, c.cap, c.comune, c.provincia, c.email, c.pagamento ?? null]))!.id;
    const prodotti = [];
    for (const p of c.prodotti) {
      const pid = (await q1<{ id: number }>(`INSERT INTO prodotti (cliente_id, codice, descrizione, prezzo_vendita, prezzo_fonte, prezzo_data)
        VALUES ($1,$2,$3,$4,'manuale',$5) RETURNING id`, [id, p.codice, p.descrizione, p.prezzo, D.oggi]))!.id;
      prodotti.push({ id: pid, ...p });
    }
    clienti.push({ id, nome: c.nome, prodotti, peso: c.peso });
  }

  // ── Fornitori ──
  const fornitori: { id: number; nome: string; categoria: string; quota: number }[] = [];
  for (const [i, f] of D.fornitori.entries()) {
    const id = (await q1<{ id: number }>(`INSERT INTO fornitori_anagrafica (ragione_sociale, partita_iva, comune, provincia, paese, email)
      VALUES ($1,$2,$3,$4,'IT',$5) RETURNING id`, [f.nome, 'IT' + piva(String(7654320 + i * 104729)), f.comune, f.provincia, f.email]))!.id;
    fornitori.push({ id, nome: f.nome, categoria: f.categoria, quota: f.quota });
  }

  // ── Fatture emesse 2025 → oggi, con DDT e scadenze (crescita nel 2026) ──
  const intest = (c: any) => ({ ragione_sociale: c.nome });
  let nFt: Record<number, number> = {}, nDdt: Record<number, number> = {};
  const inizio = new Date(Date.UTC(2025, 0, 1));
  const pesoTot = clienti.reduce((s, c) => s + c.peso, 0);
  for (let m = new Date(inizio); m <= OGGI; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const anno = m.getUTCFullYear(), mese = m.getUTCMonth();
    const crescita = anno === 2026 ? 1.22 + mese * 0.012 : 1 + mese * 0.01;
    const obiettivo = D.fatturatoMese2025 * crescita * (0.85 + caso() * 0.3);
    let fatto = 0;
    while (fatto < obiettivo) {
      let r = caso() * pesoTot, cl = clienti[0];
      for (const c of clienti) { r -= c.peso; if (r <= 0) { cl = c; break; } }
      const p = scegli(cl.prodotti);
      const qta = scegli([50, 100, 100, 150, 200, 250, 300, 500]);
      const imp = tondo(qta * p.prezzo);
      const ultimoGiorno = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
      let g = tra(3, ultimoGiorno);
      let data = new Date(Date.UTC(anno, mese, g, 12));
      if (data > piuGiorni(OGGI, -1)) { if (fatto > 0) break; data = piuGiorni(OGGI, -2); }
      nFt[anno] = (nFt[anno] ?? 0) + 1;
      let dDdt = piuGiorni(data, -tra(0, 6));
      if (dDdt.getUTCFullYear() !== anno) dDdt = data;
      nDdt[anno] = (nDdt[anno] ?? 0) + 1;
      const ddt = (await q1<{ id: number }>(`INSERT INTO documenti (tipo, anno, numero, data, stato, cliente_id, intestatario, imponibile, imposta, totale,
          creato_da, dati_trasporto, partito_il, causale) VALUES ('ddt',$1,$2,$3::date,'emesso',$4,$5,$6,0,$6,$7,$8,$3::timestamptz,'Vendita') RETURNING id`,
        [dDdt.getUTCFullYear(), nDdt[anno], giorno(dDdt), cl.id, intest(cl), imp, utente,
          { causale: 'Vendita', a_cura: 'Mittente', trasportatore: 'TRASPORTI RAPIDI S.R.L.', porto: 'Franco', colli: Math.ceil(qta / 100), aspetto: 'Scatole' }]))!.id;
      await q(`INSERT INTO documenti_righe (documento_id, posizione, prodotto_id, codice, descrizione, quantita, um, prezzo, aliquota_iva)
        VALUES ($1,1,$2,$3,$4,$5,'pz',$6,'IVA22')`, [ddt, p.id, p.codice, p.descrizione, qta, p.prezzo]);
      const iva = tondo(imp * 0.22);
      const ft = (await q1<{ id: number }>(`INSERT INTO documenti (tipo, tipo_sdi, anno, numero, data, stato, cliente_id, intestatario, imponibile, imposta, totale,
          creato_da, sdi_stato, inviato_il, condizione_pagamento) VALUES ('fattura','TD24',$1,$2,$3::date,'consegnato',$4,$5,$6,$7,$8,$9,'consegnato',$3::timestamptz,'BB_60FM') RETURNING id`,
        [anno, nFt[anno], giorno(data), cl.id, intest(cl), imp, iva, tondo(imp + iva), utente]))!.id;
      await q(`INSERT INTO documenti_righe (documento_id, posizione, prodotto_id, codice, descrizione, quantita, um, prezzo, aliquota_iva, ddt_id)
        VALUES ($1,1,$2,$3,$4,$5,'pz',$6,'IVA22',$7)`, [ft, p.id, p.codice, p.descrizione, qta, p.prezzo, ddt]);
      await q(`UPDATE documenti SET fattura_id = $1 WHERE id = $2`, [ft, ddt]);
      const scad = new Date(Date.UTC(anno, mese + 3, 0, 12));
      const pagata = scad < piuGiorni(OGGI, -3) ? giorno(piuGiorni(scad, tra(0, 4))) : null;
      await q(`INSERT INTO documenti_scadenze (documento_id, data, importo, modalita, pagata_il, modo, conto) VALUES ($1,$2,$3,'MP05',$4,$5,$6)`,
        [ft, giorno(scad), tondo(imp + iva), pagata, pagata ? 'Bonifico' : null, pagata ? 'Banca principale' : null]);
      fatto += imp;
    }
  }
  for (const [anno, n] of Object.entries(nFt))
    await q(`INSERT INTO numerazioni (tipo, sezionale, anno, ultimo_numero) VALUES ('fattura','',$1,$2) ON CONFLICT DO NOTHING`, [anno, n]).catch(() => {});

  // ── Fatture dei fornitori (costi ~ 60% del fatturato) ──
  for (let m = new Date(inizio); m <= OGGI; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const anno = m.getUTCFullYear(), mese = m.getUTCMonth();
    const vendite = Number((await q1<{ t: string }>(`SELECT coalesce(sum(imponibile),0) t FROM documenti WHERE tipo='fattura' AND anno=$1 AND extract(month from data)=$2`, [anno, mese + 1]))!.t);
    for (const f of fornitori) {
      const imp = tondo(vendite * f.quota * (0.8 + caso() * 0.4));
      if (imp < 50) continue;
      const data = new Date(Date.UTC(anno, mese, tra(2, 26), 12));
      if (data > OGGI) continue;
      const iva = tondo(imp * 0.22);
      const id = (await q1<{ id: number }>(`INSERT INTO documenti_ricevuti (tipo, tipo_sdi, numero, data, fornitore_id, intestatario, descrizione, categoria,
          imponibile, imposta, totale, elettronica, origine, ricevuto_il) VALUES ('fattura','TD01',$1,$2::date,$3,$4,$5,$6,$7,$8,$9,true,'sdi',$2::date) RETURNING id`,
        [`${tra(100, 999)}/${anno}`, giorno(data), f.id, { ragione_sociale: f.nome }, f.categoria, f.categoria, imp, iva, tondo(imp + iva)]))!.id;
      const scad = new Date(Date.UTC(anno, mese + 2, 0, 12));
      const pagata = scad < OGGI ? giorno(scad) : null;
      await q(`INSERT INTO documenti_ricevuti_scadenze (documento_id, data, importo, pagata_il, modo) VALUES ($1,$2,$3,$4,$5)`,
        [id, giorno(scad), tondo(imp + iva), pagata, pagata ? 'Bonifico' : null]).catch(() => {});
    }
  }

  // ── Preventivi (motore di calcolo vero), ordini aperti e commesse ──
  const [cat, tariffe] = await Promise.all([caricaCatalogo(), caricaTariffe()]);
  const standard = Object.fromEntries(cat.parametri.filter(p => p.default != null && p.gruppo !== 'GENERALE' && p.gruppo !== 'PRE-PRODUZIONE').map(p => [p.codice, p.default]));
  const prevPer = new Map<number, number>();
  for (const c of clienti) for (const p of c.prodotti) {
    const parametri: Record<string, number> = { ...standard, qtSmd: p.smd, qtFeeder: Math.round(p.smd * 0.45), nItemMateriale: Math.round(p.smd * 0.45) + 6,
      qtTht: p.tht, qtTipolTht: Math.max(1, Math.round(p.tht / 3)), qtPthdaPreparare: Math.round(p.tht / 2), qntCompMontaggio: p.tht,
      usaOnda: p.tht > 0 && !p.bot ? 1 : 0, presenteTht: p.tht > 0 && p.bot ? 1 : 0, qntPuntiSaldaturaMano: p.bot ? p.tht * 2 : 0,
      doppiaFaccia: p.bot ? 1 : 0, qtSmdLatoB: p.bot, qtFeederLatoB: Math.round(p.bot * 0.5), aoiBot: p.bot ? 1 : 0, etichette: 1 };
    const dati = normalizza({ tariffe, nSchedeInPCB: 4, nSchede: 200, parametri, clienteId: c.id, prodottoId: p.id, cliente: c.nome, codice: p.codice,
      revisione: 'B', descrizione: p.descrizione }, cat);
    const id = await salvaPreventivo({ dati, catalogo: cat, utenteId: utente, creatoIl: giorno(piuGiorni(OGGI, -tra(20, 200))) + 'T09:00:00Z' });
    await q(`UPDATE preventivi SET stato = $2 WHERE id = $1`, [id, scegli(['accettato', 'accettato', 'inviato'])]);
    prevPer.set(p.id, id);
  }
  // qualche preventivo nuovo in bozza / inviato degli ultimi giorni
  for (const n of D.preventiviRecenti) {
    const c = clienti[n.cliente], p = c.prodotti[n.prodotto];
    const dati = normalizza({ tariffe, nSchedeInPCB: 2, nSchede: n.schede, parametri: { ...standard, qtSmd: p.smd, qtFeeder: Math.round(p.smd * 0.45), primaProduzione: 1 },
      clienteId: c.id, prodottoId: p.id, cliente: c.nome, codice: p.codice, revisione: 'C', descrizione: p.descrizione }, cat);
    const id = await salvaPreventivo({ dati, catalogo: cat, utenteId: utente, creatoIl: giorno(piuGiorni(OGGI, -n.giorniFa)) + 'T10:00:00Z' });
    await q(`UPDATE preventivi SET stato = $2 WHERE id = $1`, [id, n.stato]);
  }

  // ordini aperti con consegne nelle prossime settimane
  let numOrd = 120;
  for (const o of D.ordiniAperti) {
    const c = clienti[o.cliente];
    const dataOrd = giorno(piuGiorni(OGGI, -o.giorniFa));
    const oid = (await q1<{ id: number }>(`INSERT INTO ordini (anno, numero, data_ordine, cliente_id, cliente_nome, rif_cliente, data_ordine_cliente, origine)
      VALUES (2026,$1,$2,$3,$4,$5,$2,'email') RETURNING id`, [++numOrd, dataOrd, c.id, c.nome, o.rif]))!.id;
    for (const [i, r] of o.righe.entries()) {
      const p = c.prodotti[r.prodotto];
      const consegna = giorno(piuGiorni(OGGI, r.consegnaTra));
      const rid = (await q1<{ id: number }>(`INSERT INTO ordini_righe (ordine_id, chiave, posizione, prodotto_id, codice, descrizione, tipo, quantita, prezzo,
          consegna_richiesta, arrivo_materiale, preventivo_id) VALUES ($1,$2,$3,$4,$5,$6,'scheda',$7,$8,$9,$10,$11) RETURNING id`,
        [oid, `d${oid}-${i}`, i + 1, p.id, p.codice, p.descrizione, r.quantita, p.prezzo, consegna, giorno(piuGiorni(OGGI, r.consegnaTra - 12)), prevPer.get(p.id)]))!.id;
      if (r.commessa) {
        const ris = await salvaCommessa({ preventivoId: prevPer.get(p.id)!, utenteId: utente, dati: {
          numero: '', ordineCliente: o.rif, referenteCliente: '', dataOrdine: dataOrd, dataConsegna: consegna, quantita: r.quantita,
          primoLotto: false, segnalazioni: '', scheda: {} as any, stato: r.commessa } });
        await q(`UPDATE ordini_righe SET commessa_id = $1 WHERE id = $2`, [ris.id, rid]);
        await q(`UPDATE commesse SET stato = $2 WHERE id = $1`, [ris.id, r.commessa]);
        if (r.fasiFatte) {
          const fasi = await q<{ fase_codice: string; ciclo_previsto_sec: number }>(`SELECT fase_codice, ciclo_previsto_sec FROM commesse_fasi WHERE commessa_id=$1 ORDER BY ordine`, [ris.id]);
          for (const [k, f] of fasi.slice(0, r.fasiFatte).entries()) {
            const min = Math.max(10, Math.round(Number(f.ciclo_previsto_sec) / 60 * 0.92));
            await q(`INSERT INTO rilevazioni (commessa_id, fase_codice, operatore_nome, data, durata_min, persone, pezzi, origine, aperta_il, chiusa_il)
              VALUES ($1,$2,$3,$4,$5,1,$6,'tablet',$7,$8)`, [ris.id, f.fase_codice, scegli(['MR', 'LB', 'GF', 'SA']), giorno(piuGiorni(OGGI, -(r.fasiFatte - k))),
              min, r.quantita, piuGiorni(OGGI, -(r.fasiFatte - k)), piuGiorni(OGGI, -(r.fasiFatte - k))]);
          }
        }
      }
    }
  }

  // due turni: 16 ore di lavoro al giorno nel Gantt
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('pianificazione', '{"oreGiorno": 16}') ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore`);

  // ── CRM ──
  for (const a of D.crm) {
    const cid = a.cliente != null ? clienti[a.cliente].id : null;
    const id = (await q1<{ id: number }>(`INSERT INTO crm_aziende (ragione_sociale, cliente_id, stato, priorita, responsabile, settore, citta, provincia, paese,
        telefono, email, prossima_azione, data_prossima_azione, ultimo_contatto) VALUES ($1,$2,$3,$4,'ADRIANO',$5,$6,$7,'Italia',$8,$9,$10,$11,$12) RETURNING id`,
      [a.nome, cid, a.stato, a.priorita, a.settore, a.citta, a.provincia, a.telefono, a.email, a.prossima, giorno(piuGiorni(OGGI, a.tra)), giorno(piuGiorni(OGGI, -a.ultimo))]))!.id;
    await q(`INSERT INTO crm_attivita (azienda_id, data, tipo, descrizione, utente_id) VALUES ($1,$2,$3,$4,$5)`,
      [id, giorno(piuGiorni(OGGI, -a.ultimo)), a.tipo, a.attivita, utente]);
  }

  // ── Azienda finta (intestazioni), cassa e banca ──
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('azienda', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1`, [JSON.stringify(D.azienda)]);
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('previsione_cassa', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1`,
    [JSON.stringify({ ...D.cassa, dataSaldo: D.oggi })]);
  // movimenti della banca che corrispondono a fatture ancora aperte: il portale propone l'abbinamento da solo
  const aperte = await q<{ numero: number; anno: number; importo: string; nome: string }>(`SELECT d.numero, d.anno, s.importo, c.ragione_sociale nome FROM documenti_scadenze s
    JOIN documenti d ON d.id = s.documento_id JOIN clienti c ON c.id = d.cliente_id WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' ORDER BY s.data, d.numero LIMIT 5`);
  const fornAperte = await q<{ numero: string; importo: string; nome: string }>(`SELECT d.numero, s.importo, d.intestatario->>'ragione_sociale' nome FROM documenti_ricevuti_scadenze s
    JOIN documenti_ricevuti d ON d.id = s.documento_id WHERE s.pagata_il IS NULL ORDER BY s.data LIMIT 3`);
  const movimenti = [
    ...aperte.map((a, i) => ({ data: giorno(piuGiorni(OGGI, -1 - i)), valuta: null, importo: Number(a.importo), causale: '48',
      descrizione: `BONIFICO A VOSTRO FAVORE DA ${a.nome} CAUSALE SALDO FATTURA N. ${a.numero}/${a.anno}` })),
    ...fornAperte.map((f, i) => ({ data: giorno(piuGiorni(OGGI, -2 - i)), valuta: null, importo: -Number(f.importo), causale: '26',
      descrizione: `BONIFICO A FAVORE DI ${f.nome} SALDO FT ${f.numero}` })),
  ];
  await salvaConti([{ numero: '12345678', nome: 'CONTO CORRENTE PRINCIPALE', tipo: 'ordinario', saldoData: D.oggi, saldo: D.cassa.saldo, fido: null }]);
  await caricaMovimenti(movimenti, '12345678', 'estratto-conto-demo.csv');

  console.log(`Fatto: ${clienti.length} clienti, ${fornitori.length} fornitori, fatture e ordini demo caricati.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
