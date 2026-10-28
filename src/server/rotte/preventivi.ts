/**
 * Pagine dei preventivi: elenco, nuovo, modifica, calcolo in tempo reale, salvataggio, duplica.
 */
import { Router } from 'express';
import { q, q1, transazione } from '../db.js';
import { salvaBackupSuDisco } from '../backup.js';
import { maiuscolo, prodottiPerCliente } from '../anagrafiche-servizio.js';
import { caricaCatalogo, caricaTariffe, type Catalogo } from '../catalogo-db.js';
import { calcola, datiDaRiga, leggiPreventivo, normalizza, salvaPreventivo, nPannelli, type DatiPreventivo } from '../preventivi-servizio.js';
import { layout, VERSIONE } from '../views/layout.js';
import { html, euro, data, num, ore, durata, raw, type Raw } from '../views/html.js';
import type { Risultato } from '../../engine/calcolo.js';
import { riepilogo } from '../../engine/riepilogo.js';
import { etichettaBreve, etichettaCompleta } from '../views/etichette.js';
import { variabiliUsate } from '../../engine/espressioni.js';
import { FILE_SINGOLA, costoBomPerPreventivo } from '../codifica-servizio.js';

const PROVENIENZE: [number, string, string][] = [
  [1, 'Cliente, da restituire', 'Materiale del cliente da restituire a fine lavoro: non passa dal magazzino (niente etichettatura, stoccaggio ed estrazione) e si aggiunge il reso in imballaggio'],
  [2, 'Nostro magazzino', 'Gestito a nostro magazzino: acquistato da noi, del cliente o misto']];
const STATI = ['da_validare', 'bozza', 'inviato', 'accettato', 'rifiutato', 'archiviato'];

export function rottePreventivi() {
  const r = Router();

  // ── Elenco ──
  r.get('/', async (req, res) => {
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`
      SELECT id, numero, creato_il, intestazione, n_schede, totale_secondo_lotto, stato, origine,
        (tariffe->>'ricarico')::numeric AS ricarico,
        (risultato->'totali'->>'prezzoOrarioMedio')::numeric AS prezzo_orario,
        (risultato->'totali'->>'prezzoSchedaSecondoLotto')::numeric AS prezzo_scheda,
        (risultato->'totali'->>'costiUnaTantum')::numeric AS una_tantum
      FROM preventivi
      WHERE $1 = '' OR (intestazione->>'cliente') ILIKE '%'||$1||'%' OR (intestazione->>'codice') ILIKE '%'||$1||'%'
         OR (intestazione->>'descrizione') ILIKE '%'||$1||'%' OR numero ILIKE '%'||$1||'%'
      ORDER BY creato_il DESC, id DESC LIMIT 300`, [cerca]);
    const msg = String(req.query.msg ?? '');
    res.send(String(layout({
      titolo: 'Preventivi', utente: req.session.utente, attiva: 'preventivi', largo: true, avviso: msg || undefined,
      contenuto: html`
      <div class="intestazione-pagina">
        <h1>Preventivi</h1>
        <div><a class="bottone" href="/preventivi/documenti" title="Carica BOM, pick and place e Gerber del cliente: il portale li controlla e conta i componenti">Da documenti del cliente</a>
        <a class="bottone primario" href="/preventivi/nuovo">+ Nuovo preventivo</a></div>
      </div>
      <form class="cerca" method="get"><input name="q" value="${cerca}" placeholder="Cerca cliente, codice, descrizione, numero…" type="search"><button>Cerca</button></form>
      <form method="post" action="/preventivi/azioni" id="azioni-elenco">
      <div class="barra-azioni">
        <span id="n-selezionati" class="nota">Nessun preventivo selezionato</span>
        <button name="azione" value="commessa" data-serve="1" disabled title="Crea la commessa dal preventivo selezionato (uno alla volta)">Crea commessa</button>
        <button name="azione" value="duplica" data-serve="1+" disabled title="Nuovo preventivo con fasi, tariffe e prezzi attuali">Duplica</button>
        <button name="azione" value="elimina" data-serve="1+" disabled class="pericolo" title="Elimina i preventivi selezionati (non quelli già diventati commessa)">Elimina</button>
      </div>
      <div class="tabella-scorre"><table class="elenco preventivi">
        <thead><tr><th class="selezione"><input type="checkbox" id="seleziona-tutti" title="Seleziona tutti" aria-label="Seleziona tutti"></th><th>Numero</th><th>Data</th><th>Cliente</th><th>Codice</th><th title="Revisione">Rev.</th><th>Descrizione</th><th class="n">Nr. PCB</th>
          <th class="n" title="Prezzo per ora di ciclo">€/h</th><th class="n">Ricarico</th><th class="n" title="Lotti successivi">€/PCB</th>
          <th class="n" title="Lotti successivi (senza costi una tantum)">Totale</th><th class="n" title="Costi una tantum (solo primo lotto)">Una tantum</th></tr></thead>
        <tbody>${righe.map(p => html`
          <tr class="cliccabile" data-href="/preventivi/${p.id}">
            <td class="selezione"><input type="checkbox" name="ids" value="${p.id}" aria-label="Seleziona ${p.numero}"></td>
            <td class="nowrap"><a href="/preventivi/${p.id}">${p.numero}</a>${p.origine === 'vecchio_portale' ? html` <span class="etichetta" title="Importato dal vecchio portale">V</span>` : ''}${p.stato === 'da_validare' ? html` <span class="stato da_validare" title="Compilato dai documenti del cliente: da controllare e salvare">da validare</span>` : ''}</td>
            <td>${data(p.creato_il)}</td><td>${p.intestazione?.cliente}</td><td>${p.intestazione?.codice}</td><td>${p.intestazione?.revisione}</td>
            <td class="taglia">${p.intestazione?.descrizione}</td><td class="n">${num(p.n_schede, 0)}</td>
            <td class="n">${euro(p.prezzo_orario)}</td><td class="n">${p.ricarico ? num((p.ricarico - 1) * 100, 1) + '%' : ''}</td>
            <td class="n">${euro(p.prezzo_scheda)}</td><td class="n"><strong>${euro(p.totale_secondo_lotto)}</strong></td><td class="n">${euro(p.una_tantum)}</td>
          </tr>`)}
        </tbody></table></div>
      </form>
      ${righe.length ? '' : html`<p class="vuoto">Nessun preventivo${cerca ? ' trovato' : ''}.</p>`}`,
      script: 'elenco.js',
    })));
  });

  // ── Nuovo ──
  r.get('/nuovo', async (req, res) => {
    const [cat, tariffe] = await Promise.all([caricaCatalogo(), caricaTariffe()]);
    // i valori standard sono già scritti nelle caselle (modificabili), spunte comprese (es. prima produzione)
    const standard = Object.fromEntries(cat.parametri.filter(p => p.default != null && p.gruppo !== 'GENERALE' && p.gruppo !== 'PRE-PRODUZIONE').map(p => [p.codice, p.default]));
    const dati = normalizza({ tariffe, nSchedeInPCB: 1, parametri: standard }, cat);
    res.send(pagina(req.session.utente, cat, dati, calcola(cat, dati), undefined, await elencoClienti(), [], await elencoBom()));
  });

  // prodotti (prima di '/:id', altrimenti "prodotti" verrebbe letto come numero di preventivo)
  // selezionabili per il cliente scelto
  r.get('/prodotti', async (req, res) => {
    res.json(await prodottiPerCliente(Number(req.query.cliente) || 0));
  });

  // costo componenti a scheda dalla BOM scelta, ricalcolato sulle schede del preventivo
  r.get('/costo-bom', async (req, res) => {
    const x = await costoBomPerPreventivo(Number(req.query.bom) || 0, Number(req.query.schede) || 0);
    if (!x) return res.status(404).json({ errore: 'BOM non trovata (forse eliminata)' });
    res.json(x);
  });

  // ── Apri esistente (calcolato col catalogo salvato nel preventivo) ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await leggiPreventivo(Number(req.params.id));
    if (!p) return res.status(404).send('Preventivo non trovato');
    if (p.stato === 'da_validare') p.pacchetto = await q1(`SELECT id, nome FROM pacchetti_scheda WHERE preventivo_id = $1`, [p.id]);
    const cat: Catalogo = p.catalogo;
    const dati = datiDaRiga(p);
    res.send(pagina(req.session.utente, cat, dati, calcola(cat, dati), p, await elencoClienti(), dati.clienteId ? await prodottiPerCliente(dati.clienteId) : [],
      await elencoBom(dati.bomId), req.query.msg ? String(req.query.msg) : undefined));
  });

  // ── Anteprima di stampa (per il cliente: solo prezzi) ──
  r.get('/:id/stampa', async (req, res) => {
    const p = await leggiPreventivo(Number(req.params.id));
    if (!p) return res.status(404).send('Preventivo non trovato');
    const cat: Catalogo = p.catalogo;
    const dati = datiDaRiga(p);
    const vista = req.query.vista === 'macro' ? 'macro' : 'fasi';
    res.send(String(stampaPreventivo(p, cat, dati, calcola(cat, dati), vista)));
  });

  // ── Calcolo in tempo reale (non salva) ──
  r.post('/calcola', async (req, res) => {
    const cat = await catalogoPer(req.body.id, req.body.catalogoAttuale);
    const dati = normalizza(req.body.dati, cat);
    const ris = calcola(cat, dati);
    res.json({ risultato: ris, nPCB: nPannelli(dati.nSchede, dati.nSchedeInPCB), totaliHtml: String(totali(ris, dati)) });
  });

  // ── Salva ──
  r.post('/salva', async (req, res) => {
    const id = req.body.id ? Number(req.body.id) : undefined;
    const cat = await catalogoPer(id, req.body.catalogoAttuale);
    const dati = normalizza(req.body.dati, cat);
    // cliente e prodotto SOLO dalle anagrafiche: i testi si prendono dal database, non dal browser
    const cliente = dati.clienteId ? await q1<{ ragione_sociale: string }>(`SELECT ragione_sociale FROM clienti WHERE id = $1`, [dati.clienteId]) : undefined;
    if (!cliente) return res.status(400).json({ errore: 'Scegli il cliente dall\'elenco' });
    const prodotto = dati.prodottoId ? await q1<{ codice: string; descrizione: string }>(
      `SELECT codice, descrizione FROM prodotti WHERE id = $1 AND (cliente_id = $2 OR cliente_id IS NULL)`, [dati.prodottoId, dati.clienteId]) : undefined;
    if (!prodotto) return res.status(400).json({ errore: 'Scegli il codice prodotto dall\'elenco del cliente' });
    Object.assign(dati, { cliente: maiuscolo(cliente.ragione_sociale), codice: maiuscolo(prodotto.codice), descrizione: maiuscolo(prodotto.descrizione) });
    if (!dati.nSchede) return res.status(400).json({ errore: 'Indica la quantità di schede' });
    if (!(dati.tariffe.ricarico > 0)) return res.status(400).json({ errore: 'Il ricarico deve essere maggiore di zero' });
    const nuovoId = await salvaPreventivo({ id, dati, catalogo: cat, utenteId: req.session.utente!.id });
    // preventivo compilato dai documenti del cliente: salvarlo dopo il controllo lo convalida
    await q(`UPDATE preventivi SET stato = 'bozza' WHERE id = $1 AND stato = 'da_validare'`, [nuovoId]);
    res.json({ id: nuovoId });
  });

  r.post('/:id/stato', async (req, res) => {
    const stato = String(req.body.stato);
    if (STATI.includes(stato)) await q(`UPDATE preventivi SET stato = $2, aggiornato_il = now() WHERE id = $1`, [Number(req.params.id), stato]);
    res.redirect(`/preventivi/${req.params.id}`);
  });

  // duplica con catalogo, tariffe e prezzi materiali ATTUALI
  r.post('/:id/duplica', async (req, res) => {
    const id = await duplica(Number(req.params.id), req.session.utente!.id);
    if (!id) return res.status(404).send('Preventivo non trovato');
    res.redirect(`/preventivi/${id}`);
  });

  // azioni dall'elenco su uno o più preventivi spuntati
  r.post('/azioni', async (req, res) => {
    const ids = [...new Set(([] as unknown[]).concat(req.body?.ids ?? []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
    const torna = (msg: string) => res.redirect(`/preventivi?msg=${encodeURIComponent(msg)}`);
    if (!ids.length) return torna('Seleziona almeno un preventivo.');
    const azione = String(req.body?.azione ?? '');
    if (azione === 'commessa') {
      if (ids.length !== 1) return torna('La commessa si crea da un preventivo alla volta: selezionane uno solo.');
      return res.redirect(`/commesse/nuova?preventivo=${ids[0]}`);
    }
    if (azione === 'duplica') {
      const nuovi: number[] = [];
      for (const id of ids) { const n = await duplica(id, req.session.utente!.id); if (n) nuovi.push(n); }
      if (nuovi.length === 1) return res.redirect(`/preventivi/${nuovi[0]}`);
      return torna(`Creati ${nuovi.length} preventivi con fasi, tariffe e prezzi attuali.`);
    }
    if (azione === 'elimina') {
      const { eliminati, conCommessa } = await eliminaPreventivi(ids);
      return torna(`Eliminati ${eliminati} preventivi.` + (conCommessa.length ? ` Non eliminati perché già diventati commessa: ${conCommessa.join(', ')}.` : ''));
    }
    torna('Azione non riconosciuta.');
  });

  // elimina dalla pagina del preventivo
  r.post('/:id/elimina', async (req, res) => {
    const { eliminati, conCommessa } = await eliminaPreventivi([Number(req.params.id)]);
    if (!eliminati && conCommessa.length) return res.redirect(`/preventivi/${req.params.id}?msg=${encodeURIComponent('Non eliminato: il preventivo è già diventato commessa (elimina prima la commessa).')}`);
    res.redirect(`/preventivi?msg=${encodeURIComponent(eliminati ? 'Preventivo eliminato.' : 'Preventivo non trovato.')}`);
  });

  return r;
}

// ───────────────────────────── riquadro "Informazioni generali" ─────────────────────────────
/** Spunte divise per tipologia; ogni riga ha un nome (es. SMD) e le sue scelte. Il testo completo è nel title. */
const GRUPPI_SPUNTE: { titolo: string; classe: string; sotto: string; righe: { nome: string; codici: string[] }[] }[] = [
  { titolo: 'Produzione', classe: 'produzione', sotto: 'tipo di preventivo', righe: [{ nome: '', codici: ['primaProduzione', 'variazioneQuantita'] }, { nome: '', codici: ['campionatura'] }] },
  { titolo: 'Montaggio', classe: 'montaggio', sotto: 'lati e saldatura', righe: [
    { nome: 'SMD', codici: ['presenteSmd', 'doppiaFaccia'] }, { nome: 'THT', codici: ['usaOnda', 'presenteTht'] }] },
  { titolo: 'Acquisti', classe: 'acquisti', sotto: 'a carico nostro', righe: [
    { nome: '', codici: ['acquistoComponenti', 'acquistoPcb'] }, { nome: 'Lamina', codici: ['acquistoLamina', 'laminaTrattamenti'] }] },
  { titolo: 'Lavorazioni', classe: 'lavorazioni', sotto: 'in più', righe: [{ nome: '', codici: ['etichette', 'puliziaSaldature', 'lavaggioSchede', 'usaSplicing'] }] },
];
const NOME_SPUNTA: Record<string, string> = {
  doppiaFaccia: 'BOT', usaOnda: 'Ad onda', presenteTht: 'A mano', acquistoLamina: 'Standard', laminaTrattamenti: 'Trattata',
};

function riquadroSpunte(generali: Catalogo['parametri'], spunta: (cod: string) => boolean): Raw {
  const trova = (cod: string) => generali.find(p => p.codice === cod);
  const usati = new Set(GRUPPI_SPUNTE.flatMap(g => g.righe.flatMap(r => r.codici)));
  const altri = generali.filter(p => !usati.has(p.codice));
  const casella = (p: Catalogo['parametri'][0]) => html`<label class="chip" title="${etichettaCompleta(p)}">
    <input type="checkbox" data-param="${p.codice}" ${spunta(p.codice) ? raw('checked') : ''}><span>${NOME_SPUNTA[p.codice] ?? p.etichetta}</span></label>`;
  const gruppi = [...GRUPPI_SPUNTE, ...(altri.length ? [{ titolo: 'Altro', classe: 'altro', sotto: '', righe: [{ nome: '', codici: altri.map(p => p.codice) }] }] : [])];
  return html`<div class="spunte-generali">${gruppi.map(g => {
    const righe = g.righe.map(r => ({ ...r, voci: r.codici.map(trova).filter((p): p is Catalogo['parametri'][0] => !!p) })).filter(r => r.voci.length);
    return righe.length ? html`<div class="gruppo-spunte ${g.classe}">
      <div class="titolo-spunte">${g.titolo} ${g.sotto ? html`<small>${g.sotto}</small>` : ''}</div>
      ${righe.map(r => html`<div class="riga-spunte">${r.nome ? html`<span class="nome-riga">${r.nome}</span>` : ''}${r.voci.map(casella)}</div>`)}
    </div>` : '';
  })}</div>`;
}

/** Duplica con catalogo, tariffe e prezzi materiali ATTUALI. */
/** Elimina i preventivi; quelli già diventati commessa restano (la commessa li usa per la scheda e il consuntivo). */
async function eliminaPreventivi(ids: number[]): Promise<{ eliminati: number; conCommessa: string[] }> {
  const conCommessa = (await q<{ numero: string }>(`SELECT DISTINCT p.numero FROM preventivi p JOIN commesse c ON c.preventivo_id = p.id WHERE p.id = ANY($1)`, [ids])).map(x => x.numero);
  const eliminabili = (await q<{ id: number }>(`SELECT id FROM preventivi p WHERE id = ANY($1) AND NOT EXISTS (SELECT 1 FROM commesse c WHERE c.preventivo_id = p.id)`, [ids])).map(x => x.id);
  if (eliminabili.length) {
    await salvaBackupSuDisco('prima-di-eliminare-preventivi').catch(() => null);
    await transazione(async c => {
      await c.query(`UPDATE analisi_commesse SET nuovo_preventivo_id = NULL WHERE nuovo_preventivo_id = ANY($1)`, [eliminabili]);
      await c.query(`DELETE FROM preventivi WHERE id = ANY($1)`, [eliminabili]);
    });
  }
  return { eliminati: eliminabili.length, conCommessa };
}

async function duplica(id: number, utenteId: number): Promise<number | null> {
  const p = await leggiPreventivo(id);
  if (!p) return null;
  const cat = await caricaCatalogo();
  const dati = normalizza({ ...datiDaRiga(p), prezziMateriali: undefined, tariffe: await caricaTariffe() }, cat);
  return salvaPreventivo({ dati, catalogo: cat, utenteId });
}

/** BOM elaborate che si possono collegare a un preventivo (più quella già collegata, anche se in elaborazione). */
const elencoBom = (collegata?: number | null) => q<{ id: number; nome: string; creato_il: string }>(`SELECT id, nome, creato_il FROM bom_analisi
  WHERE file_nome IS DISTINCT FROM $1 AND (stato = 'pronta' OR id = $2) ORDER BY creato_il DESC LIMIT 200`, [FILE_SINGOLA, collegata ?? null]);
type VoceBom = Awaited<ReturnType<typeof elencoBom>>[number];

const elencoClienti = () => q<{ id: number; ragione_sociale: string }>(`SELECT id, ragione_sociale FROM clienti ORDER BY ragione_sociale`);

async function catalogoPer(id: unknown, attuale: unknown): Promise<Catalogo> {
  if (id && !attuale) {
    const p = await leggiPreventivo(Number(id));
    if (p) return p.catalogo;
  }
  return caricaCatalogo();
}

// ───────────────────────────── pagina del preventivo ─────────────────────────────

function pagina(utente: any, cat: Catalogo, d: DatiPreventivo, ris: Risultato, salvato?: any, clienti: { id: number; ragione_sociale: string }[] = [], prodotti: any[] = [], bom: VoceBom[] = [], avviso?: string): string {
  const gruppi = [...new Set(cat.parametri.map(p => p.gruppo))].filter(g => g !== 'GENERALE' && g !== 'LATI' && g !== 'INFORMAZIONI GENERALI');
  const generali = cat.parametri.filter(p => p.gruppo === 'INFORMAZIONI GENERALI');
  // campi e sezioni che contano solo con una spunta delle informazioni generali: nascosti se la spunta è tolta
  const spunta = (cod: string) => !!(d.parametri[cod] ?? cat.parametri.find(p => p.codice === cod)?.default);
  // regola: "a b" = servono a E b; "a|b" = basta a O b
  const LAMINA = 'acquistoLamina|laminaTrattamenti', ONDA = 'usaOnda', SMD = 'presenteSmd';
  const DIPENDE: Record<string, string> = {
    oreAcquistoLamine: LAMINA, nLamine: LAMINA, prezzoLamina: LAMINA, prezzoVenditaLamina: LAMINA,
    costoLaminaTrattata: LAMINA, prezzoVenditaLaminaTrattata: LAMINA,
    oreAcquistoPcb: 'acquistoPcb', costoPcbScheda: 'acquistoPcb',
    oreAcquistoComponenti: 'acquistoComponenti', costoComponentiScheda: 'acquistoComponenti',
    oreProgArmadi: SMD, oreFilePeP: SMD, oreProgPeP: SMD, oreProgSerigrafia: SMD, oreProgAOI: SMD,
    preriscaldamentoForno: SMD, potenzaFornoKw: SMD, crema: SMD,
    oreProgOnda: ONDA, tempoTransitoOnda: ONDA, cadenzaOnda: ONDA, minPrepCarrelli: ONDA, preriscaldamentoOnda: ONDA,
    potenzaOndaKw: ONDA, stagno: ONDA, stagnoPerSaldature: ONDA, scorieSaldatrice: ONDA,
    targhette: 'etichette', costoEtichetta: 'etichette',
    tempoPulizia: 'puliziaSaldature', costoLiquidoPulizia: 'puliziaSaldature',
    tempoLavaggio: 'lavaggioSchede', costoLiquidoLavaggio: 'lavaggioSchede', costoAvvioLavaggio: 'lavaggioSchede',
  };
  const GRUPPO_DIPENDE: Record<string, string> = {
    PROGRAMMAZIONI: 'primaProduzione', THT: 'presenteTht|usaOnda', 'SMD TOP': SMD, 'SMD BOT': SMD, FORNO: SMD, AOI: SMD,
  };
  const esiste = (flag: string) => generali.some(p => p.codice === flag);
  // tiene solo le spunte presenti nel catalogo del preventivo (i preventivi vecchi non le hanno)
  const regola = (r?: string) => (r ?? '').split(' ').map(g => g.split('|').filter(esiste).join('|')).filter(Boolean).join(' ');
  const vale = (r: string) => r.split(' ').every(g => g.split('|').some(spunta));
  const dipende = (r?: string) => { const x = regola(r); return x ? html` data-dipende="${x}"${vale(x) ? '' : raw(' hidden')}` : ''; };
  const conLati = cat.parametri.some(p => p.codice === 'doppiaFaccia');
  // preventivi salvati prima del 24/10/2026: Solo TOP / TOP + BOT come scelta a pallini
  const latiRadio = cat.parametri.some(p => p.codice === 'doppiaFaccia' && p.gruppo === 'LATI');
  const doppia = !!d.parametri.doppiaFaccia;
  const valore = (cod: string) => d.parametri[cod] ?? '';
  // campi che valgono solo per il lato BOT: nascosti (e svuotati) se il preventivo è "Solo TOP"
  const info = (p: Catalogo['parametri'][0]) => p.suggerimento ? html` <span class="info" aria-label="${p.suggerimento}">ⓘ</span>` : '';
  const soloBot = (p: Catalogo['parametri'][0]) => conLati && (p.gruppo === 'SMD BOT' || /LatoB$/.test(p.codice));
  // gestione materiale: etichettatura, stoccaggio ed estrazione non servono se il materiale del cliente va restituito
  // 1 = del cliente, da restituire; qualsiasi altro valore (anche 3 e 4 dei preventivi salvati prima) = gestito a magazzino
  const provenienza = Number(d.parametri.provenienzaMateriale ?? 1) === 1 ? 1 : 2;
  const soloMagazzino = (p: Catalogo['parametri'][0]) => ['oreEtichettaturaMateriale', 'oreStoccaggioMateriale', 'oreEstrazioneMateriale', 'tempoEtichettaturaItem', 'tempoStoccaggioItem', 'tempoEstrazioneItem'].includes(p.codice);
  const sceltaProvenienza = () => html`
    <div class="scelta-lati scelta-provenienza" role="radiogroup" aria-label="Provenienza del materiale">
      ${PROVENIENZE.map(([v, testo, spiega]) => html`<label class="spunta" title="${spiega}"><input type="radio" name="provenienza" data-param="provenienzaMateriale" value="${v}" ${provenienza === v ? raw('checked') : ''}> ${testo}</label>`)}
      <span class="info" title="Tempo = numero item × tempo per item, a ogni lotto">ⓘ</span>
    </div>`;
  // costo componenti: si può prendere da una BOM caricata in Componenti (scelta qui sopra il campo)
  const sceltaBom = () => html`
    <label class="largo scelta-bom"${dipende(DIPENDE.costoComponentiScheda)} title="Il costo componenti a scheda si calcola dal preventivo materiali della BOM, sulle schede di questo preventivo">BOM caricata
      <select data-id="bomId" id="sel-bom">
        <option value="">— nessuna: costo scritto a mano —</option>
        ${bom.map(b => html`<option value="${b.id}" ${b.id === d.bomId ? raw('selected') : ''}>${b.nome} (${data(b.creato_il)})</option>`)}
      </select>
      <output id="esito-bom" class="nota">${d.bomId && !bom.some(b => b.id === d.bomId) ? 'La BOM collegata è stata eliminata: il costo resta quello salvato.' : ''}</output>
      <small class="nota"><a href="/componenti/bom" target="_blank" rel="noopener">Carica una BOM</a><span id="apri-bom" ${d.bomId && bom.some(b => b.id === d.bomId) ? '' : raw('hidden')}> · <a href="/componenti/bom/${d.bomId ?? ''}" target="_blank" rel="noopener">apri la BOM collegata</a></span></small></label>`;
  const campoParametro = (p: Catalogo['parametri'][0]) => p.codice === 'costoComponentiScheda' ? html`${sceltaBom()}${campoBase(p)}` : campoBase(p);
  const campoBase = (p: Catalogo['parametri'][0]) => p.codice === 'provenienzaMateriale' ? sceltaProvenienza()
    : p.tipo === 'si_no'
    ? html`<label class="spunta ${soloBot(p) ? 'solo-bot' : ''}" title="${etichettaCompleta(p)}"><input type="checkbox" data-param="${p.codice}" ${valore(p.codice) ? raw('checked') : ''}> ${etichettaBreve(p)}</label>`
    : p.tipo === 'durata'
    ? html`<label class="${soloBot(p) ? 'solo-bot' : ''} ${soloMagazzino(p) ? 'solo-magazzino' : ''} ${soloUT(p.codice) ? 'campo-ut' : ''}"${dipende(DIPENDE[p.codice])} title="${etichettaCompleta(p)}${soloUT(p.codice) ? ' — costo una tantum (solo 1° lotto)' : ''}">${etichettaBreve(p)}${info(p)}
        <input inputmode="text" data-param="${p.codice}" data-tipo="durata" value="${d.parametri[p.codice] == null ? '' : durata(d.parametri[p.codice])}" placeholder="${p.default != null ? durata(p.default) : '0:00'}"></label>`
    : html`<label class="${soloBot(p) ? 'solo-bot' : ''} ${soloMagazzino(p) ? 'solo-magazzino' : ''} ${soloUT(p.codice) ? 'campo-ut' : ''}"${dipende(DIPENDE[p.codice])} title="${etichettaCompleta(p)}${soloUT(p.codice) ? ' — costo una tantum (solo 1° lotto)' : ''}">${etichettaBreve(p)}${info(p)}
        <input inputmode="decimal" data-param="${p.codice}" value="${valore(p.codice)}" placeholder="${p.default ?? ''}"></label>`;
  // campi che alimentano SOLO costi una tantum (letti dalle formule): evidenziati in ambra
  const usate = (formule: string[]) => new Set(formule.flatMap(f => { try { return variabiliUsate(f); } catch { return []; } }));
  const inUT = usate([...cat.fasi.filter(f => f.unaTantum).map(f => f.formulaSecondi), ...cat.voci.filter(v => v.unaTantum).flatMap(v => [v.formulaEuro, v.formulaPrezzo ?? ''])]);
  const inRic = usate([...cat.fasi.filter(f => !f.unaTantum).map(f => f.formulaSecondi), ...cat.voci.filter(v => !v.unaTantum).map(v => v.formulaEuro)]);
  const soloUT = (cod: string) => inUT.has(cod) && !inRic.has(cod) && !generali.some(p => p.codice === cod);
  const gruppoUT = (g: string) => { const ps = cat.parametri.filter(p => p.gruppo === g); return ps.length > 0 && ps.every(p => soloUT(p.codice)); };
  const compilati = (g: string) => cat.parametri.filter(p => p.gruppo === g && p.codice !== 'provenienzaMateriale' && d.parametri[p.codice]).length;

  return String(layout({
    titolo: salvato ? `Preventivo ${salvato.numero}` : 'Nuovo preventivo', utente, attiva: 'preventivi', script: 'preventivo.js', avviso,
    contenuto: html`
    <form id="preventivo" data-id="${salvato?.id ?? ''}" autocomplete="off" class="${conLati && !doppia ? 'solo-top' : ''} ${provenienza === 1 ? 'materiale-da-restituire' : ''}">
    <div class="intestazione-pagina">
      <h1>${salvato ? html`Preventivo ${salvato.numero} <span class="stato ${salvato.stato}">${salvato.stato.replace('_', ' ')}</span>` : 'Nuovo preventivo'}</h1>
      <div class="azioni">
        <span id="stato-salvataggio" class="nota"></span>
        ${salvato ? html`<a class="bottone" href="/preventivi/${salvato.id}/stampa" target="_blank" rel="noopener" title="Anteprima di stampa e PDF (salva prima le modifiche)">Stampa</a>` : ''}
        <button type="button" id="salva" class="primario">Salva</button>
      </div>
    </div>
    ${salvato?.stato === 'da_validare' ? html`
      <div class="avviso da-validare"><strong>Preventivo da validare.</strong> L'ha compilato il portale dai documenti del cliente${salvato.pacchetto
        ? html` (<a href="/preventivi/documenti/${salvato.pacchetto.id}">${salvato.pacchetto.nome}</a>)` : ''}: controlla i valori, completa quello che manca
        e premi <b>Salva</b>, così diventa una bozza normale.
        <ul>${String(salvato.note ?? '').split('\n').filter(r => r.startsWith('Da controllare:')).flatMap(r => r.replace(/^Da controllare: /, '').replace(/\.$/, '').split('; ')).map(x => html`<li>${x}</li>`)}</ul></div>` : ''}
    ${salvato?.origine === 'vecchio_portale' && salvato.dati_vecchio_portale ? html`
      <p class="avviso info">Importato dal vecchio portale. Lì il totale 1° lotto era ${euro(salvato.dati_vecchio_portale.totalePrimoLotto)};
      qui è ricalcolato con le fasi e le regole nuove.</p>` : ''}

    <div class="griglia-preventivo">
    <section class="colonna-dati">
      <fieldset class="blocco">
        <legend>Prodotto</legend>
        <div class="riga-campi">
          <label class="largo">Cliente
            <select data-id="clienteId" id="sel-cliente" required>
              <option value="">— scegli dall'elenco —</option>
              ${clienti.map(c => html`<option value="${c.id}" ${c.id === d.clienteId ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}
            </select></label>
          <label>Codice
            <select data-id="prodottoId" id="sel-prodotto" required>
              <option value="">${d.clienteId ? '— scegli il codice —' : '— prima scegli il cliente —'}</option>
              ${prodotti.map(x => html`<option value="${x.id}" data-descrizione="${x.descrizione}" ${x.id === d.prodottoId ? raw('selected') : ''}>${x.codice}${x.da_assegnare ? ' (non assegnato)' : ''}</option>`)}
            </select></label>
          <label class="stretto">Rev. <input data-campo="revisione" value="${d.revisione}" class="maiuscolo" maxlength="20"></label>
        </div>
        <label>Descrizione <input id="descrizione" value="${d.descrizione}" readonly tabindex="-1" class="sola-lettura"></label>
        ${!d.clienteId && d.cliente ? html`<p class="nota">Nel preventivo originale: <strong>${d.cliente}</strong> ${d.codice} — non presente nelle anagrafiche. Per salvarlo scegli cliente e codice dall'elenco.</p>` : ''}
        <div class="riga-campi">
          <label>Schede <input inputmode="numeric" data-campo="nSchede" value="${d.nSchede || ''}" required></label>
          <label>Schede per pannello <input inputmode="numeric" data-campo="nSchedeInPCB" value="${d.nSchedeInPCB}"></label>
          <label>Pannelli <output id="nPCB">${nPannelli(d.nSchede, d.nSchedeInPCB)}</output></label>
        </div>
      </fieldset>

      <fieldset class="blocco">
        <legend>Tariffe e ricarico</legend>
        <div class="riga-campi">
          <label>Costo azienda <span class="unita">€/h</span><input inputmode="decimal" data-tariffa="costoAziendaH" value="${d.tariffe.costoAziendaH}"></label>
          <label>Operatore produz. <span class="unita">€/h</span><input inputmode="decimal" data-tariffa="costoOperatoreProduzioneH" value="${d.tariffe.costoOperatoreProduzioneH}"></label>
          <label>Ufficio <span class="unita">€/h</span><input inputmode="decimal" data-tariffa="costoOperatoreUfficioH" value="${d.tariffe.costoOperatoreUfficioH}"></label>
          <label>Ricarico <input inputmode="decimal" data-tariffa="ricarico" value="${d.tariffe.ricarico}"></label>
        </div>
      </fieldset>

      ${latiRadio || generali.length ? html`
      <fieldset class="blocco">
        <legend>${generali.length ? 'Informazioni generali' : 'Lati da montare'}</legend>
        ${latiRadio ? html`<div class="scelta-lati" role="radiogroup" aria-label="Lati da montare">
          <label class="spunta"><input type="radio" name="lati" value="0" ${!doppia ? raw('checked') : ''}> Solo TOP</label>
          <label class="spunta"><input type="radio" name="lati" value="1" ${doppia ? raw('checked') : ''}> TOP + BOT</label>
          <span class="info" title="Con TOP + BOT raddoppiano i tempi indicati &quot;a lato&quot; e si attivano le fasi BOT">ⓘ</span>
        </div>` : ''}
        ${generali.length ? riquadroSpunte(generali, spunta) : ''}
      </fieldset>` : ''}

      ${gruppi.map(g => html`
      <details class="blocco ${conLati && g === 'SMD BOT' ? 'solo-bot' : ''} ${gruppoUT(g) ? 'gruppo-ut' : ''}"${dipende(GRUPPO_DIPENDE[g])} ${compilati(g) || g.startsWith('SMD TOP') || g === 'PRE-PRODUZIONE' || g === 'GESTIONE MATERIALE' || g === 'PROGRAMMAZIONI' || g === 'THT' ? raw('open') : ''}>
        <summary>${g} ${compilati(g) ? html`<span class="conta">${compilati(g)}</span>` : ''}${gruppoUT(g) ? html` <span class="etichetta ut">una tantum</span>` : ''}</summary>
        <div class="campi-parametri">${cat.parametri.filter(p => p.gruppo === g).map(campoParametro)}</div>
      </details>`)}

      <details class="blocco">
        <summary>Prezzi materiali di consumo (di questo preventivo)</summary>
        <div class="campi-parametri">${cat.materiali.map(m => html`
          <label>${m.descrizione} <span class="unita">€/${m.um}</span>
          <input inputmode="decimal" data-materiale="${m.codice}" value="${d.prezziMateriali[m.codice] ?? m.costo}"></label>`)}</div>
      </details>

      <fieldset class="blocco">
        <legend>Note</legend>
        <textarea data-campo="note" rows="3">${d.note}</textarea>
      </fieldset>
    </section>

    <section class="colonna-risultati">
      <div class="totali" id="totali">${totali(ris, d)}</div>
      <label class="target">Prezzo target cliente a scheda <span class="unita">€</span>
        <input inputmode="decimal" data-campo="prezzoTargetScheda" value="${d.prezzoTargetScheda ?? ''}">
        <output id="diff-target"></output></label>

      <p class="legenda-ut"><span class="campione"></span> In ambra i costi una tantum (solo 1° lotto)</p>
      <h2>Fasi <label class="spunta piccola"><input type="checkbox" id="mostra-tutte"> mostra anche le fasi a zero</label></h2>
      <div class="tabella-scorre"><table class="fasi" id="tabella-fasi">
        <thead><tr><th>N.</th><th>Fase</th><th class="n" title="Persone">Pers.</th><th class="n" title="Tempo ciclo: impegno della fase">Ciclo</th><th class="n" title="Tempo uomo = ciclo × persone">Uomo</th><th class="n">Costo</th><th class="n">Prezzo</th></tr></thead>
        <tbody>
        ${[...new Set(cat.fasi.map(f => f.gruppo))].map(g => {
          const delGruppo = ris.fasi.filter(x => x.gruppo === g);
          const somma = (k: 'secondiCiclo' | 'secondiUomo' | 'costo' | 'prezzo') => delGruppo.reduce((a, x) => a + x[k], 0);
          const tuttoUT = cat.fasi.filter(f => f.gruppo === g).every(f => f.unaTantum);
          return html`<tr class="riga-gruppo ${somma('secondiCiclo') ? '' : 'gruppo-vuoto'} ${tuttoUT ? 'una-tantum' : ''}" data-gruppo="${g}">
            <td colspan="3">${g}</td><td class="n" data-v="ciclo">${ore(somma('secondiCiclo'))}</td><td class="n" data-v="uomo">${ore(somma('secondiUomo'))}</td>
            <td class="n" data-v="costo">${euro(somma('costo'))}</td><td class="n" data-v="prezzo">${euro(somma('prezzo'))}</td></tr>
          ${cat.fasi.filter(f => f.gruppo === g).map(f => {
          const x = ris.fasi.find(y => y.codice === f.codice)!;
          return html`<tr data-fase="${f.codice}" class="${x.secondiCiclo ? '' : 'zero'} ${f.unaTantum ? 'una-tantum' : ''}">
            <td>${f.numero}</td><td>${f.nome}${f.unaTantum ? html` <span class="etichetta ut" title="Solo primo lotto">1° lotto</span>` : ''}${f.tariffa === 'ufficio' ? html` <span class="etichetta">ufficio</span>` : ''}</td>
            <td class="n"><input class="persone" inputmode="decimal" data-persone="${f.codice}" value="${d.personeFase[f.codice] ?? f.persone}"></td>
            <td class="n" data-v="ciclo">${ore(x.secondiCiclo)}</td><td class="n" data-v="uomo">${ore(x.secondiUomo)}</td>
            <td class="n" data-v="costo">${euro(x.costo)}</td><td class="n" data-v="prezzo">${euro(x.prezzo)}</td></tr>`;
          })}`;
        })}
        </tbody></table></div>

      <h2>Altri costi</h2>
      <table class="fasi" id="tabella-voci">
        <thead><tr><th>Voce</th><th class="n">Costo</th><th class="n">Prezzo</th></tr></thead>
        <tbody>${ris.voci.map(v => html`<tr data-voce="${v.codice}" class="${v.unaTantum ? 'una-tantum' : ''}"><td>${v.nome}${v.unaTantum ? html` <span class="etichetta ut">1° lotto</span>` : ''}</td>
          <td class="n" data-v="costo">${euro(v.costo)}</td><td class="n" data-v="prezzo">${euro(v.prezzo)}</td></tr>`)}</tbody>
      </table>

      ${salvato ? html`
      <div class="azioni-secondarie">
        <label>Stato <select name="stato" form="stato-preventivo">${STATI.map(s => html`<option ${s === salvato.stato ? raw('selected') : ''}>${s}</option>`)}</select></label>
        <button form="stato-preventivo">Aggiorna stato</button>
        <a class="bottone primario" href="/commesse/nuova?preventivo=${salvato.id}">Crea commessa</a>
        <button form="duplica-preventivo" title="Nuovo preventivo con fasi, tariffe e prezzi attuali">Duplica con prezzi attuali</button>
        <button form="elimina-preventivo" class="pericolo" title="Elimina il preventivo inserito per errore"
          data-conferma="${`Eliminare il preventivo ${salvato.numero}? Non si può annullare (prima viene salvato un backup).`}">Elimina</button>
      </div>` : ''}
    </section>
    </div>
    </form>
    ${salvato ? html`<form method="post" action="/preventivi/${salvato.id}/stato" id="stato-preventivo"></form>
    <form method="post" action="/preventivi/${salvato.id}/duplica" id="duplica-preventivo"></form>
    <form method="post" action="/preventivi/${salvato.id}/elimina" id="elimina-preventivo"></form>` : ''}
`,
  }));
}

export function totali(ris: Risultato, _d?: DatiPreventivo): Raw {
  const r = riepilogo(ris);
  return html`
    <div class="totale principale"><span title="Prezzo a scheda dei lotti, senza costi una tantum">Prezzo scheda</span><strong>${euro(r.prezzoScheda)}</strong>
      <small>Lotto: ${euro(r.prezzoLotto)}</small></div>
    <div class="totale ut"><span title="Costi una tantum (solo 1° lotto)">Una tantum</span><strong>${euro(r.unaTantum)}</strong>
      <small title="Pre-produzione e programmazioni">Interni: ${euro(r.unaTantumInterni)}</small>
      <small title="Lamine, attrezzaggio PCB">Acquisti: ${euro(r.unaTantumAcquisti)}</small></div>
    <div class="totale ut"><span title="Prezzo a scheda del 1° lotto, con i costi una tantum">Prezzo scheda+una tantum</span><strong>${euro(r.prezzoSchedaConUnaTantum)}</strong>
      <small>Lotto: ${euro(r.prezzoLottoConUnaTantum)}</small></div>
    <div class="totale"><span title="Margine a scheda dei lotti, senza una tantum">Margine scheda</span><strong>${euro(r.margineScheda)}</strong><small>Lotto: ${euro(r.margineLotto)}</small></div>
    <div class="totale ut"><span>Margine una tantum</span><strong>${euro(r.margineUnaTantum)}</strong></div>
    <div class="totale"><span title="Ore ciclo del lotto, senza una tantum">Ore ciclo</span><strong>${ore(r.oreCicloSec)}</strong>
      <small>${euro(r.prezzoOraCiclo)}/h ciclo</small><small>1° lotto: ${ore(r.oreCicloPrimoLottoSec)}</small></div>
    <div class="totale"><span title="Ore uomo del lotto, senza una tantum">Ore uomo</span><strong>${ore(r.oreUomoSec)}</strong>
      <small>${euro(r.prezzoOraUomo)}/h uomo</small><small>1° lotto: ${ore(r.oreUomoPrimoLottoSec)}</small></div>`;
}

// ───────────────────────────── stampa del preventivo (per il cliente) ─────────────────────────────

function stampaPreventivo(p: any, cat: Catalogo, d: DatiPreventivo, ris: Risultato, vista: 'fasi' | 'macro'): Raw {
  const r = riepilogo(ris);
  const i = p.intestazione ?? {};
  const somma = (xs: { prezzo: number }[]) => xs.reduce((a, x) => a + x.prezzo, 0);
  const v = (cod: string) => d.parametri[cod] ?? cat.parametri.find(x => x.codice === cod)?.default;
  const scelte = cat.parametri.filter(x => x.gruppo === 'INFORMAZIONI GENERALI' && v(x.codice)).map(x => x.etichetta);
  const doppia = !!v('doppiaFaccia');
  const fasiRic = ris.fasi.filter(f => !f.unaTantum && f.prezzo > 0);
  // energia insieme al materiale di consumo
  const vociRic = ris.voci.filter(x => !x.unaTantum && x.prezzo > 0).map(x => (x.gruppo === 'ENERGIA' ? { ...x, gruppo: 'MATERIALE DI CONSUMO' } : x));
  // una tantum per il cliente: documentazione, programmazione attrezzature (tutto il resto delle fasi una tantum),
  // lamine, attrezzaggio PCB; con il BOT si dice che sono raddoppiati
  const fasiUTtutte = ris.fasi.filter(f => f.unaTantum && f.prezzo > 0);
  const doc = fasiUTtutte.filter(f => f.codice === 'prepDocumentazione');
  const altre = fasiUTtutte.filter(f => f.codice !== 'prepDocumentazione');
  const perLato = doppia ? ' — TOP e BOT (×2)' : '';
  const nLamine = Number(v('nLamine')) > 0 ? Number(v('nLamine')) : (doppia ? 2 : 1);
  const righeUT: { nome: string; prezzo: number }[] = [
    ...(doc.length ? [{ nome: `Preparazione documentazione${perLato}`, prezzo: somma(doc) }] : []),
    ...(altre.length ? [{ nome: `Programmazione attrezzature di produzione${perLato}`, prezzo: somma(altre) }] : []),
    ...ris.voci.filter(x => x.unaTantum && x.prezzo > 0).map(x => ({
      nome: x.codice === 'laminaSerigrafica' ? (nLamine > 1 ? `Lamine serigrafiche (${nLamine}${doppia && nLamine === 2 ? ': TOP e BOT' : ''})` : 'Lamina serigrafica')
        : x.codice === 'attrezzaggioPCB' ? 'Attrezzaggio PCB' : x.nome,
      prezzo: x.prezzo })),
  ];
  const gruppiDi = <T extends { gruppo: string }>(xs: T[]) => [...new Set(xs.map(x => x.gruppo))].map(g => ({ g, righe: xs.filter(x => x.gruppo === g) }));
  const SIGLE: Record<string, string> = { 'COSTI UNA TANTUM': 'Acquisti (lamine, attrezzature)' };
  const nomeGruppo = (g: string) => SIGLE[g] ?? (g.charAt(0) + g.slice(1).toLowerCase()).replace(/\b(smd|tht|aoi|pcb|bot|top)\b/gi, x => x.toUpperCase());
  const tabella = (titolo: string, fasi: typeof fasiRic, voci: typeof vociRic, totale: number) => html`
    <h3>${titolo}</h3>
    <table class="prezzi">
      <thead><tr><th>${vista === 'fasi' ? 'Lavorazione' : 'Area'}</th><th class="n">Prezzo</th></tr></thead>
      <tbody>
      ${vista === 'fasi'
        ? [...gruppiDi(fasi), ...gruppiDi(voci)].map(({ g, righe }) => html`
          <tr class="gruppo"><td>${nomeGruppo(g)}</td><td class="n">${euro(somma(righe))}</td></tr>
          ${righe.map(x => html`<tr><td class="rientro">${x.nome}</td><td class="n">${euro(x.prezzo)}</td></tr>`)}`)
        : [...gruppiDi(fasi), ...gruppiDi(voci)].map(({ g, righe }) => html`<tr><td>${nomeGruppo(g)}</td><td class="n">${euro(somma(righe))}</td></tr>`)}
      </tbody>
      <tfoot><tr><td>Totale</td><td class="n">${euro(totale)}</td></tr></tfoot>
    </table>`;
  return html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Preventivo ${p.numero} · ${i.codice}</title>
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa.css?v=${VERSIONE}"></head>
<body>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button>
  <a href="?vista=fasi" class="${vista === 'fasi' ? 'attiva' : ''}">Dettaglio per fasi</a>
  <a href="?vista=macro" class="${vista === 'macro' ? 'attiva' : ''}">Solo macro aree</a>
  <a href="/preventivi/${p.id}">← torna al preventivo</a></div>
<section class="pagina preventivo-stampa">
  <div class="testata-stampa">
    <img src="/static/logo-casteltech.png" alt="Casteltech" class="logo">
    <div class="titolo-stampa">PREVENTIVO<br><span>${p.numero} del ${data(p.creato_il)}</span></div>
    <div class="qr"></div>
  </div>
  <table class="griglia"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
    <tr><td><div class="etic">CLIENTE</div><div class="val">${i.cliente}</div></td><td><div class="etic">DESCRIZIONE</div><div class="val">${i.descrizione}</div></td>
      <td><div class="etic">CODICE / REV.</div><div class="val">${i.codice}${i.revisione ? ` rev. ${i.revisione}` : ''}</div></td>
      <td><div class="etic">QUANTITÀ</div><div class="val">${num(d.nSchede, 0)} schede${d.nSchedeInPCB > 1 ? ` (${num(nPannelli(d.nSchede, d.nSchedeInPCB), 0)} pannelli)` : ''}</div></td></tr>
  </table>
  ${scelte.length ? html`<p class="scelte">${scelte.join(' · ')}</p>` : ''}

  <div class="riepilogo-stampa">
    <div><span>Prezzo a scheda</span><strong>${euro(r.prezzoScheda)}</strong></div>
    ${r.unaTantum > 0 ? html`<div><span>Prezzo a scheda con una tantum</span><strong>${euro(r.prezzoSchedaConUnaTantum)}</strong></div>` : ''}
  </div>

  ${tabella(`Produzione: lotto di ${num(d.nSchede, 0)} schede`, fasiRic, vociRic, r.prezzoLotto)}
  ${r.unaTantum > 0 ? html`
    <h3>Costi una tantum (solo primo lotto)</h3>
    <table class="prezzi">
      <thead><tr><th>Voce</th><th class="n">Prezzo</th></tr></thead>
      <tbody>${righeUT.map(x => html`<tr><td>${x.nome}</td><td class="n">${euro(x.prezzo)}</td></tr>`)}</tbody>
      <tfoot><tr><td>Totale una tantum</td><td class="n">${euro(r.unaTantum)}</td></tr></tfoot>
    </table>
    <table class="prezzi totale-generale"><tr><td>Totale (produzione + una tantum)</td><td class="n">${euro(r.prezzoLottoConUnaTantum)}</td></tr></table>` : ''}
  ${d.note ? html`<h3>Note</h3><p class="note-stampa">${d.note}</p>` : ''}
  <p class="piede">Prezzi IVA esclusa.</p>
</section>
<script src="/static/stampa.js?v=${VERSIONE}" defer></script>
</body></html>`;
}
