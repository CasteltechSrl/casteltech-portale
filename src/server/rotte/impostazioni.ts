/**
 * Pannello Impostazioni (solo ufficio): tariffe, fasi, parametri, materiali, voci di costo, utenti.
 * Le modifiche valgono per i NUOVI preventivi: quelli salvati restano calcolati come al momento del salvataggio.
 */
import express, { Router, type Request } from 'express';
import { importaDocumenti, leggiDocumenti, type Avanzamento } from '../import-legacy-servizio.js';
import bcrypt from 'bcryptjs';
import { q, q1 } from '../db.js';
import { caricaCatalogo, caricaTariffe, controllaFormula } from '../catalogo-db.js';
import { layout } from '../views/layout.js';
import { html, raw, type Raw } from '../views/html.js';
import { rotteAnagrafiche } from './anagrafiche.js';
import { rotteFornitoriAnagrafica } from './fornitori-anagrafica.js';
import { creaBackup, elencoBackup, nomeFileBackup, salvaBackupSuDisco } from '../backup.js';
import { leggiOperatori } from '../../engine/operatori.js';
import { caricaOperatori } from '../commesse-servizio.js';
import { caricaPin } from './reparto.js';
import { fasiAperte, inviaAdesso, orariPromemoria, ricaricaPromemoria } from '../promemoria.js';
import { leggiOrari } from '../../engine/promemoria.js';
import { caricaOreGiorno, importaOrdini, leggiFileOrdini } from '../ordini-servizio.js';
import { importaCrm, importaFatturato, leggiFileCrm, leggiFileFatturato } from '../crm-servizio.js';
import { conteggiComponenti, importaComponenti, caricaRegoleScarto } from '../codifica-servizio.js';
import { fornitoriConfigurati, provaFornitore } from '../fornitori.js';
import { iaConfigurata } from '../lettura-ia.js';
import { NOMI_FORNITORI, leggiRegoleScarto, type Fornitore } from '../../engine/acquisti.js';
import { join, basename } from 'node:path';
import { FASI, PARAMETRI, MATERIALI, VOCI } from '../../catalogo/iniziale.js';
import { motivoCatalogoNonEliminabile, type TabellaCatalogo } from '../../engine/eliminazioni.js';

/** Codici del catalogo di partenza: il programma li usa, non si eliminano (si spengono con "Attiva"). */
const CODICI_INIZIALI: Record<TabellaCatalogo, Set<string>> = {
  fasi: new Set(FASI.map(x => x.codice)), parametri: new Set(PARAMETRI.map(x => x.codice)),
  materiali: new Set(MATERIALI.map(x => x.codice)), voci_costo: new Set(VOCI.map(x => x.codice)),
};

type Campo = { nome: string; titolo: string; tipo?: 'testo' | 'numero' | 'formula' | 'si_no' | 'scelta' | 'area'; scelte?: string[]; largo?: boolean };
interface Tabella { tabella: string; chiave: string; titolo: string; spiegazione: string; ordine: string; campi: Campo[]; formula?: string }

const TABELLE: Record<string, Tabella> = {
  fasi: {
    tabella: 'fasi', chiave: 'codice', titolo: 'Fasi', ordine: 'ordine, numero', formula: 'formula_secondi',
    spiegazione: 'La formula dà il TEMPO CICLO dell\'intero lotto in secondi. Tempo uomo = ciclo × persone. "Scala" dice come riportare i tempi reali a un\'altra quantità.',
    campi: [
      { nome: 'ordine', titolo: 'Ordine', tipo: 'numero' }, { nome: 'numero', titolo: 'N.' }, { nome: 'nome', titolo: 'Nome', largo: true },
      { nome: 'gruppo', titolo: 'Gruppo' }, { nome: 'formula_secondi', titolo: 'Formula (secondi)', tipo: 'formula', largo: true },
      { nome: 'persone_default', titolo: 'Persone', tipo: 'numero' },
      { nome: 'tariffa', titolo: 'Tariffa', tipo: 'scelta', scelte: ['produzione', 'ufficio'] },
      { nome: 'una_tantum', titolo: '1° lotto', tipo: 'si_no' },
      { nome: 'scala', titolo: 'Scala', tipo: 'scelta', scelte: ['fisso', 'scheda', 'pannello'] },
      { nome: 'stampa_su_scheda', titolo: 'Su scheda', tipo: 'si_no' }, { nome: 'attiva', titolo: 'Attiva', tipo: 'si_no' },
    ],
  },
  parametri: {
    tabella: 'parametri', chiave: 'codice', titolo: 'Parametri', ordine: 'ordine',
    spiegazione: 'I dati che si inseriscono nel preventivo. Il "codice" è il nome da usare nelle formule (non cambiarlo se è già usato).',
    campi: [
      { nome: 'ordine', titolo: 'Ordine', tipo: 'numero' }, { nome: 'etichetta', titolo: 'Etichetta', largo: true }, { nome: 'unita', titolo: 'Unità' },
      { nome: 'gruppo', titolo: 'Gruppo' }, { nome: 'valore_default', titolo: 'Default', tipo: 'numero' },
      { nome: 'suggerimento', titolo: 'Suggerimento', largo: true }, { nome: 'tipo', titolo: 'Tipo', tipo: 'scelta', scelte: ['numero', 'si_no'] },
      { nome: 'attivo', titolo: 'Attivo', tipo: 'si_no' },
    ],
  },
  materiali: {
    tabella: 'materiali', chiave: 'codice', titolo: 'Materiali di consumo', ordine: 'descrizione',
    spiegazione: 'Prezzi usati nei nuovi preventivi. Nelle formule: prezzo_<codice> e qta_<codice>.',
    campi: [{ nome: 'descrizione', titolo: 'Descrizione', largo: true }, { nome: 'costo', titolo: 'Costo €', tipo: 'numero' }, { nome: 'um', titolo: 'U.m.' }, { nome: 'quantita', titolo: 'Quantità', tipo: 'numero' }],
  },
  voci: {
    tabella: 'voci_costo', chiave: 'codice', titolo: 'Voci di costo', ordine: 'ordine', formula: 'formula_euro',
    spiegazione: 'Costi non a tempo (materiali, lamine, spedizione…). La formula dà il costo in euro dell\'intero lotto; il prezzo è costo × ricarico, oppure il "prezzo fisso" se indicato (già ricaricato, es. lamina 110 €).',
    campi: [
      { nome: 'ordine', titolo: 'Ordine', tipo: 'numero' }, { nome: 'nome', titolo: 'Nome', largo: true }, { nome: 'gruppo', titolo: 'Gruppo' },
      { nome: 'formula_euro', titolo: 'Formula (€)', tipo: 'formula', largo: true },
      { nome: 'formula_prezzo', titolo: 'Prezzo fisso (€, senza ricarico)', tipo: 'formula', largo: true }, { nome: 'una_tantum', titolo: '1° lotto', tipo: 'si_no' },
      { nome: 'attiva', titolo: 'Attiva', tipo: 'si_no' },
    ],
  },
};

const CODICE_VALIDO = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

export function rotteImpostazioni() {
  const r = Router();
  const pag = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'impostazioni', contenuto: html`${menu(titolo)}${contenuto}`, avviso, script }));

  r.get('/', (_req, res) => res.redirect('/impostazioni/tariffe'));
  r.use('/anagrafiche', rotteAnagrafiche(menu));
  r.use('/fornitori', rotteFornitoriAnagrafica(menu));

  // ── Tariffe ──
  r.get('/tariffe', async (req, res) => {
    const t = await caricaTariffe();
    res.send(pag(req, 'Tariffe', html`
      <form method="post" class="blocco stretto-form">
        <p class="nota">Valori proposti nei nuovi preventivi (modificabili anche nel singolo preventivo).</p>
        <label>Costo orario azienda <span class="unita">€/h di ciclo</span><input name="costoAziendaH" inputmode="decimal" value="${t.costoAziendaH}"></label>
        <label>Costo operatore produzione <span class="unita">€/h per persona</span><input name="costoOperatoreProduzioneH" inputmode="decimal" value="${t.costoOperatoreProduzioneH}"></label>
        <label>Costo ufficio (pre-produzione) <span class="unita">€/h per persona</span><input name="costoOperatoreUfficioH" inputmode="decimal" value="${t.costoOperatoreUfficioH}"></label>
        <label>Ricarico <span class="unita">es. 1,25</span><input name="ricarico" inputmode="decimal" value="${t.ricarico}"></label>
        <button class="primario">Salva tariffe</button>
      </form>`, req.query.ok ? 'Tariffe salvate.' : undefined));
  });
  r.post('/tariffe', async (req, res) => {
    const n = (k: string) => Number(String(req.body[k] ?? '').replace(',', '.')) || 0;
    const t = { costoAziendaH: n('costoAziendaH'), costoOperatoreProduzioneH: n('costoOperatoreProduzioneH'), costoOperatoreUfficioH: n('costoOperatoreUfficioH'), ricarico: n('ricarico') };
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('tariffe', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(t)]);
    res.redirect('/impostazioni/tariffe?ok=1');
  });

  // ── Operatori: sigle per la colonna OPERATORE del foglio tempi ──
  r.get('/operatori', async (req, res) => {
    const op = await caricaOperatori();
    const pin = await caricaPin();
    res.send(pag(req, 'Operatori', html`
      <form method="post" class="blocco stretto-form">
        <p class="nota">Una riga per persona, nella forma <code>AG = Adriano Gambi</code>. Se scrivi solo il nome, la sigla
          (2 lettere) si propone da sola. Le sigle sono stampate in fondo ai fogli tempi e proposte nel rientro.</p>
        <textarea name="operatori" rows="14" spellcheck="false">${op.map(o => `${o.sigla} = ${o.nome}`).join('\n')}</textarea>
        <button class="primario">Salva operatori</button>
      </form>
      <section class="blocco stretto-form">
        <h2>Accesso dal telefono (reparto)</h2>
        <p class="nota">Ogni operatore entra nelle pagine del reparto (<code>/r</code>, oppure inquadrando il QR della scheda) con la sua
          sigla e un PIN di 4–6 cifre. Il telefono lo ricorda per 120 giorni. Il PIN non si può rileggere: se lo dimentica, se ne imposta uno nuovo.</p>
        <table class="tabella"><thead><tr><th>Sigla</th><th>Nome</th><th>PIN</th><th></th></tr></thead><tbody>
        ${op.map(o => html`<tr><td><b>${o.sigla}</b></td><td>${o.nome}</td><td>${pin[o.sigla] ? '✓ impostato' : '—'}</td>
          <td><form method="post" action="/impostazioni/operatori/pin" class="inline">
            <input type="hidden" name="sigla" value="${o.sigla}">
            <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" placeholder="nuovo PIN" autocomplete="new-password" class="corto">
            <button>Salva PIN</button>
            ${pin[o.sigla] ? html`<button name="togli" value="1" class="link">togli</button>` : ''}
          </form></td></tr>`)}
        </tbody></table>
      </section>`, req.query.ok ? 'Operatori salvati.' : req.query.pin ? String(req.query.pin) : undefined));
  });
  r.post('/operatori/pin', async (req, res) => {
    const sigla = String(req.body.sigla ?? '').toUpperCase();
    if (!(await caricaOperatori()).some(o => o.sigla === sigla)) return res.redirect('/impostazioni/operatori?pin=' + encodeURIComponent('Operatore non trovato'));
    const pin = await caricaPin();
    if (req.body.togli) delete pin[sigla];
    else {
      const nuovo = String(req.body.pin ?? '').trim();
      if (!/^\d{4,6}$/.test(nuovo)) return res.redirect('/impostazioni/operatori?pin=' + encodeURIComponent('Il PIN deve avere da 4 a 6 cifre'));
      pin[sigla] = await bcrypt.hash(nuovo, 10);
    }
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('pin_operatori', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(pin)]);
    res.redirect('/impostazioni/operatori?pin=' + encodeURIComponent(req.body.togli ? `PIN di ${sigla} tolto` : `PIN di ${sigla} salvato`));
  });

  // ── Componenti: archivio, distributori, scarti ──
  r.get('/componenti', async (req, res) => {
    const conti = await conteggiComponenti();
    const f = fornitoriConfigurati();
    const rs = await caricaRegoleScarto();
    const prove = (req.session as any).proveFornitori ?? {};
    delete (req.session as any).proveFornitori;
    const ISTRUZIONI: Record<Fornitore, Raw> = {
      digikey: html`<code>DIGIKEY_CLIENT_ID</code> e <code>DIGIKEY_CLIENT_SECRET</code>: developer.digikey.com → Organizations → Production Apps → app con
        "Product Information V4" (sono le stesse del vecchio programma di codifica, file config.ini). Limite: 1000 ricerche al giorno.`,
      mouser: html`<code>MOUSER_API_KEY</code>: mouser.it → My Mouser → APIs → "Search API". Gratuita, 30 ricerche al minuto.`,
      farnell: html`<code>FARNELL_API_KEY</code>: partner.element14.com → Register → My API Keys. Gratuita. Negozio: <code>FARNELL_STORE</code> (vuoto = it.farnell.com).`,
      tme: html`<code>TME_APP_TOKEN</code> e <code>TME_APP_SECRET</code>: developers.tme.eu → Sign up → nuova applicazione (API v2). Gratuita.`,
    };
    res.send(pag(req, 'Componenti', html`
      <section class="blocco stretto-form">
        <h2>Archivio componenti</h2>
        <p class="nota">${conti.totale} componenti in archivio (${conti.gestionale} con codice gestionale). Si carica il file
          <code>componenti_casteltech.json.gz</code> preparato dal database del programma "Codifica componenti": i componenti già presenti vengono saltati,
          si può ripetere.</p>
        <label>File <input type="file" id="file-componenti" accept=".gz,.json"></label>
        <button id="avvia-import-componenti">Importa</button>
        <output id="esito-import-componenti" class="nota"></output>
      </section>
      <section class="blocco">
        <h2>Distributori e IA</h2>
        <p class="nota">Le chiavi si inseriscono solo su Render (servizio casteltech-portale → Environment), mai qui né in chat. Dopo averle salvate Render riavvia il portale.</p>
        <table><tbody>${(Object.keys(f) as Fornitore[]).map(k => html`<tr><td><b>${NOMI_FORNITORI[k]}</b></td>
          <td>${f[k] ? html`<span class="esito nuovo">collegato</span>` : html`<span class="esito escluso">chiavi non impostate</span>`}</td>
          <td class="nota">${ISTRUZIONI[k]}${prove[k] ? html`<br><b>Prova:</b> ${prove[k]}` : ''}</td>
          <td>${f[k] ? html`<form method="post" action="/impostazioni/componenti/prova" class="inline"><button name="fornitore" value="${k}">Prova</button></form>` : ''}</td></tr>`)}
          <tr><td><b>IA (Anthropic)</b></td><td>${iaConfigurata() ? html`<span class="esito nuovo">attiva</span>` : html`<span class="esito escluso">non attiva</span>`}</td>
          <td class="nota"><code>ANTHROPIC_API_KEY</code> (già usata per la lettura delle schede): legge le righe di BOM senza P/N o non riconosciute.</td><td></td></tr>
        </tbody></table>
      </section>
      <form method="post" action="/impostazioni/componenti/scarto" class="blocco stretto-form">
        <h2>Scarto negli acquisti</h2>
        <label>Famiglie dei passivi <input name="famigliePassive" value="${rs.famigliePassive.join(', ')}"></label>
        <label>Passivi sotto <input name="sogliaPassivoEconomico" value="${rs.sogliaPassivoEconomico}" class="corto"> €/pz: più
          <input name="percentualePassivi" value="${rs.percentualePassivi}" class="corto"> %</label>
        <label>Altri sotto <input name="sogliaEconomico" value="${rs.sogliaEconomico}" class="corto"> €/pz: più
          <input name="percentualeEconomici" value="${rs.percentualeEconomici}" class="corto"> %</label>
        <label>Fino a <input name="sogliaMedio" value="${rs.sogliaMedio}" class="corto"> €/pz: più <input name="pezziMedi" value="${rs.pezziMedi}" class="corto"> pezzi
          <small class="unita">oltre: nessuno scarto</small></label>
        <button class="primario">Salva</button>
      </form>`, req.query.ok ? 'Salvato.' : undefined, 'componenti.js'));
  });
  r.post('/componenti/importa', express.raw({ type: 'application/octet-stream', limit: '60mb' }), async (req, res) => {
    try { res.json(await importaComponenti(req.body as Buffer)); }
    catch (e: any) { res.status(400).json({ errore: `File non valido: ${e.message}` }); }
  });
  // ── Ordini: import da Fatture in Cloud / ordini dei clienti, ore di lavoro al giorno per il Gantt ──
  r.get('/ordini', async (req, res) => {
    const conti = (await q(`SELECT (SELECT count(*) FROM ordini)::int AS ordini, (SELECT count(*) FROM ordini_righe)::int AS righe,
      (SELECT count(*) FROM ddt_righe)::int AS ddt, (SELECT count(*) FROM fatture_righe)::int AS fatture`))[0];
    res.send(pag(req, 'Ordini', html`
      <section class="blocco stretto-form">
        <h2>Import degli ordini</h2>
        <p class="nota">Nel portale: ${conti.ordini} ordini (${conti.righe} righe), ${conti.ddt} righe di DDT, ${conti.fatture} righe di fattura.
          Si carica il file <code>ordini_AAAA.json.gz</code> preparato dall'incrocio di ordini, DDT e fatture di Fatture in Cloud con gli ordini dei clienti.
          Si può ripetere: ordini e righe si aggiornano, gli ordini importati che non sono più nel file si tolgono (se non hanno commesse), restano le date di arrivo materiale, i ritardi, gli stati e le note scritti nel portale;
          DDT e fatture dell'anno si sostituiscono. Clienti e prodotti si collegano solo se sono già in anagrafica (nessuno viene aggiunto).</p>
        <label>File <input type="file" id="file-ordini" accept=".gz,.json"></label>
        <button id="avvia-import-ordini">Importa</button>
        <output id="esito-import-ordini" class="nota"></output>
      </section>
      <form method="post" action="/impostazioni/ordini/pianificazione" class="blocco stretto-form">
        <h2>Gantt</h2>
        <label>Ore di lavoro al giorno <input name="oreGiorno" value="${await caricaOreGiorno()}" inputmode="decimal" class="corto"></label>
        <button class="primario">Salva</button>
      </form>`, req.query.ok ? 'Salvato.' : undefined, 'ordini.js'));
  });
  r.post('/ordini/importa', express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res) => {
    try { res.json(await importaOrdini(leggiFileOrdini(req.body as Buffer))); }
    catch (e: any) { res.status(400).json({ errore: `File non valido: ${e.message}` }); }
  });
  // ── CRM: import delle aziende dal file preparato da Claude (vecchio CRM_Database_Clienti, senza le attività) ──
  r.get('/crm', async (req, res) => {
    const conti = (await q(`SELECT (SELECT count(*) FROM crm_aziende)::int AS aziende, (SELECT count(*) FROM crm_aziende WHERE da_verificare IS NOT NULL)::int AS verificare,
      (SELECT count(*) FROM crm_contatti)::int AS contatti, (SELECT count(*) FROM crm_attivita)::int AS attivita`))[0];
    const anniFatt = (await q<{ anno: number }>(`SELECT DISTINCT anno FROM fatturato_clienti ORDER BY anno`)).map(r => r.anno);
    res.send(pag(req, 'CRM', html`
      <div class="blocco stretto-form">
        <h2>Import delle aziende</h2>
        <p class="nota">Nel CRM: ${conti.aziende} aziende (${conti.verificare} da verificare), ${conti.contatti} referenti, ${conti.attivita} attività.
          Si carica il file <code>crm_aziende.json.gz</code> preparato da Claude. Si può ripetere: le aziende si aggiornano per codice (es. AZ00001),
          il file riempie solo i campi vuoti e restano stato, prossima azione, attività e verifiche fatte nel portale.
          Le aziende con la stessa partita IVA o lo stesso nome di un cliente in anagrafica si collegano a quel cliente.</p>
        <label>File <input type="file" id="file-crm" accept=".gz,.json"></label>
        <button id="controlla-crm" type="button">Controlla il file</button>
        <output id="esito-crm" class="nota"></output>
        <button id="conferma-crm" type="button" class="primario" hidden>Conferma e importa</button>
      </div>
      <div class="blocco stretto-form">
        <h2>Fatturato dei clienti</h2>
        <p class="nota">${anniFatt.length ? `Caricati gli anni ${anniFatt.join(', ')}.` : 'Nessun anno caricato.'} Si carica il file <code>fatturato_clienti.json.gz</code>
          preparato da Claude dagli export delle fatture di Fatture in Cloud: nel CRM i clienti mostrano la fascia del fatturato medio annuo.
          Un nuovo caricamento sostituisce gli anni presenti nel file.</p>
        <label>File <input type="file" id="file-fatturato" accept=".gz,.json"></label>
        <button id="carica-fatturato" type="button">Carica</button>
        <output id="esito-fatturato" class="nota"></output>
      </div>`, undefined, 'crm.js'));
  });
  r.post('/crm/fatturato', express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res) => {
    try { res.json(await importaFatturato(leggiFileFatturato(req.body as Buffer))); }
    catch (e: any) { res.status(400).json({ errore: 'File non valido: ' + (e?.message ?? e) }); }
  });
  r.post('/crm/importa', express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res) => {
    try { res.json(await importaCrm(leggiFileCrm(req.body as Buffer), { anteprima: req.query.conferma !== '1' })); }
    catch (e: any) { res.status(400).json({ errore: 'File non valido: ' + (e?.message ?? e) }); }
  });

  r.post('/ordini/pianificazione', async (req, res) => {
    const n = Number(String(req.body.oreGiorno ?? '').replace(',', '.'));
    const valore = { oreGiorno: n > 0 && n <= 24 ? n : 8 };
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('pianificazione', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(valore)]);
    res.redirect('/impostazioni/ordini?ok=1');
  });
  r.post('/componenti/prova', async (req, res) => {
    const f = String(req.body.fornitore) as Fornitore;
    if (f in NOMI_FORNITORI) (req.session as any).proveFornitori = { [f]: await provaFornitore(f) };
    res.redirect('/impostazioni/componenti');
  });
  r.post('/componenti/scarto', async (req, res) => {
    const x = leggiRegoleScarto({ ...req.body, famigliePassive: String(req.body.famigliePassive ?? '').split(/[,\s]+/) });
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('regole_scarto', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(x)]);
    res.redirect('/impostazioni/componenti?ok=1');
  });

  // ── Promemoria delle fasi aperte dal telefono ──
  r.get('/promemoria', async (req, res) => {
    const o = orariPromemoria();
    const aperte = await fasiAperte();
    const ultime = await q(`SELECT sigla, tipo, testo, canale, esito, letta_il, creato_il FROM notifiche ORDER BY creato_il DESC LIMIT 50`);
    const TIPI: Record<string, string> = { durata: 'aperta da troppo', fine_giornata: 'fine giornata', giorno_dopo: 'giorno dopo' };
    const quando = (d: Date) => new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    res.send(pag(req, 'Promemoria', html`
      <form method="post" class="blocco stretto-form">
        <p class="nota">Promemoria per le fasi aperte dal telefono e non chiuse. Per ora i messaggi compaiono sul telefono dell'operatore
          (pagina del reparto) e qui sotto; SMS / WhatsApp / Telegram si aggiungeranno quando sceglieremo la piattaforma.</p>
        <label>Fase aperta da troppo: dopo <input name="fattore" inputmode="decimal" value="${o.fattore}" class="corto"> volte il tempo previsto,
          ma non prima di <input name="minimoMin" inputmode="numeric" value="${o.minimoMin}" class="corto"> minuti e non dopo le
          <input name="fineLavoro" type="time" value="${o.fineLavoro}"></label>
        <label>Promemoria a tutti quelli con fasi aperte (lun–ven) alle <input name="fineGiornata" type="time" value="${o.fineGiornata}"></label>
        <label>Messaggio di chiusura il giorno lavorativo dopo (lun–ven) alle <input name="giornoDopo" type="time" value="${o.giornoDopo}"></label>
        <button class="primario">Salva orari</button>
      </form>
      <h2>Fasi aperte adesso (${aperte.length})</h2>
      ${aperte.length ? html`<table class="tabella"><thead><tr><th>Operatore</th><th>Commessa</th><th>Fase</th><th>Aperta</th><th></th></tr></thead><tbody>
        ${aperte.map(f => html`<tr><td>${f.sigla}</td><td><a href="/commesse/${f.commessa_id}">${f.commessa}</a></td><td>${f.numero} ${f.nome}</td>
          <td>${quando(f.aperta_il)}</td><td><a href="/r/chiudi/${f.id}">chiudi</a></td></tr>`)}</tbody></table>` : html`<p class="nota">Nessuna.</p>`}
      ${aperte.length ? html`<form method="post" action="/impostazioni/promemoria/invia" class="barra-azioni">
        <button name="tipo" value="fine_giornata">Manda adesso il promemoria a chi ha fasi aperte</button>
        <button name="tipo" value="giorno_dopo">Manda adesso il messaggio di chiusura (fasi dei giorni prima)</button>
        <span class="nota">Uno solo al giorno per operatore.</span></form>` : ''}
      <h2>Ultimi promemoria</h2>
      ${ultime.length ? html`<table class="tabella"><thead><tr><th>Quando</th><th>A</th><th>Tipo</th><th>Messaggio</th><th>Letto</th></tr></thead><tbody>
        ${ultime.map(n => html`<tr><td>${quando(n.creato_il)}</td><td>${n.sigla}</td><td>${TIPI[n.tipo] ?? n.tipo}</td><td>${n.testo}</td>
          <td>${n.letta_il ? quando(n.letta_il) : '—'}</td></tr>`)}</tbody></table>` : html`<p class="nota">Ancora nessuno.</p>`}`,
      req.query.ok ? 'Orari salvati.' : req.query.inviati ? 'Promemoria inviati.' : undefined));
  });
  r.post('/promemoria/invia', async (req, res) => {
    await inviaAdesso(req.body.tipo === 'giorno_dopo' ? 'giorno_dopo' : 'fine_giornata');
    res.redirect('/impostazioni/promemoria?inviati=1');
  });
  r.post('/promemoria', async (req, res) => {
    const o = leggiOrari({ ...req.body, fattore: String(req.body.fattore ?? '').replace(',', '.') });
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('promemoria', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(o)]);
    await ricaricaPromemoria();
    res.redirect('/impostazioni/promemoria?ok=1');
  });
  r.post('/operatori', async (req, res) => {
    const op = leggiOperatori(String(req.body.operatori ?? ''));
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('operatori', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(op)]);
    res.redirect('/impostazioni/operatori?ok=1');
  });

  // ── Tabelle del catalogo ──
  for (const [slug, T] of Object.entries(TABELLE)) {
    r.get(`/${slug}`, async (req, res) => {
      const righe = await q(`SELECT * FROM ${T.tabella} ORDER BY ${T.ordine}`);
      res.send(pag(req, T.titolo, html`
        <p class="nota">${T.spiegazione}</p>
        ${T.formula ? html`<p class="nota">Nelle formule: + − × ÷ con <code>* /</code>, parentesi, <code>min()</code>, <code>max()</code>, <code>round()</code>, <code>se(condizione, sì, no)</code>.
          Variabili sempre disponibili: <code>nSchede</code>, <code>nPCB</code> (pannelli), <code>nSchedeInPCB</code>. Elenco nomi: <a href="/impostazioni/parametri">parametri</a>, <a href="/impostazioni/materiali">materiali</a>.
          ${T.tabella === 'voci_costo' ? html`Nelle voci si usano anche le ore di ciclo delle fasi: <code>ore_</code> + codice fase (es. <code>ore_saldaturaOnda</code>).` : ''}</p>` : ''}
        <div class="tabella-scorre"><table class="editor">
          <thead><tr><th>Codice</th>${T.campi.map(c => html`<th>${c.titolo}</th>`)}<th></th></tr></thead>
          <tbody>
          ${righe.map(riga => html`<tr>
            <td><code>${riga[T.chiave]}</code></td>
            ${T.campi.map(c => html`<td class="${c.largo ? 'largo' : ''}">${input(c, riga[c.nome], `f-${slug}-${riga[T.chiave]}`)}</td>`)}
            <td class="nowrap"><form method="post" action="/impostazioni/${slug}/${encodeURIComponent(riga[T.chiave])}" id="f-${slug}-${riga[T.chiave]}"><button>Salva</button></form>
              ${CODICI_INIZIALI[T.tabella as TabellaCatalogo].has(riga[T.chiave]) ? '' : html`<form method="post" action="/impostazioni/${slug}/${encodeURIComponent(riga[T.chiave])}/elimina"
                class="inline" data-conferma="${`Eliminare ${riga[T.chiave]}? I preventivi già salvati non cambiano.`}"><button class="link negativo">Elimina</button></form>`}</td>
          </tr>`)}
          <tr class="nuova-riga">
            <td><input name="codice" form="f-${slug}-nuovo" placeholder="nuovoCodice" required pattern="[A-Za-z][A-Za-z0-9_]*"></td>
            ${T.campi.map(c => html`<td class="${c.largo ? 'largo' : ''}">${input(c, c.tipo === 'si_no' ? (c.nome.startsWith('attiv') || c.nome === 'stampa_su_scheda') : '', `f-${slug}-nuovo`)}</td>`)}
            <td><form method="post" action="/impostazioni/${slug}" id="f-${slug}-nuovo"><button class="primario">Aggiungi</button></form></td>
          </tr>
          </tbody></table></div>`, req.query.msg ? String(req.query.msg) : undefined));
    });

    const valori = (body: any) => T.campi.map(c => {
      const v = body[c.nome];
      if (c.tipo === 'si_no') return v === 'on' || v === 'true';
      if (c.tipo === 'numero') return v === '' || v == null ? null : Number(String(v).replace(',', '.'));
      return String(v ?? '').trim();
    });
    const verificaFormula = async (body: any) => {
      if (!T.formula) return null;
      const cat = await caricaCatalogo();
      const prezzo = String(body.formula_prezzo ?? '').trim();
      if (T.tabella === 'voci_costo' && prezzo) { const e = controllaFormula(prezzo, cat, true); if (e) return `Prezzo fisso: ${e}`; }
      return controllaFormula(String(body[T.formula] ?? ''), cat, T.tabella === 'voci_costo');
    };

    // solo le righe aggiunte a mano e non usate (vedi engine/eliminazioni.ts)
    r.post(`/${slug}/:codice/elimina`, async (req, res) => {
      const codice = req.params.codice;
      const torna = (msg: string) => res.redirect(`/impostazioni/${slug}?msg=${encodeURIComponent(msg)}`);
      if (!(await q1(`SELECT 1 FROM ${T.tabella} WHERE ${T.chiave} = $1`, [codice]))) return torna(`${codice} non trovato.`);
      const formule = await q<{ codice: string; formula: string | null }>(`SELECT codice, formula_secondi AS formula FROM fasi
        UNION ALL SELECT codice, formula_euro FROM voci_costo UNION ALL SELECT codice, formula_prezzo FROM voci_costo`);
      const usataInCommesse = T.tabella === 'fasi' && !!(await q1(`SELECT 1 WHERE EXISTS (SELECT 1 FROM commesse_fasi WHERE fase_codice = $1)
        OR EXISTS (SELECT 1 FROM rilevazioni WHERE fase_codice = $1) OR EXISTS (SELECT 1 FROM segnalazioni WHERE fase_codice = $1)`, [codice]));
      const motivo = motivoCatalogoNonEliminabile({ tabella: T.tabella as TabellaCatalogo, codice, iniziale: CODICI_INIZIALI[T.tabella as TabellaCatalogo].has(codice), formule, usataInCommesse });
      if (motivo) return torna(`Non eliminato: ${motivo}`);
      await q(`DELETE FROM ${T.tabella} WHERE ${T.chiave} = $1`, [codice]);
      torna(`${codice} eliminato.`);
    });

    r.post(`/${slug}/:codice`, async (req, res) => {
      const errore = await verificaFormula(req.body);
      if (errore) return res.redirect(`/impostazioni/${slug}?msg=${encodeURIComponent(`${req.params.codice}: ${errore}. Non salvato.`)}`);
      const set = T.campi.map((c, i) => `${c.nome} = $${i + 2}`).join(', ');
      await q(`UPDATE ${T.tabella} SET ${set} WHERE ${T.chiave} = $1`, [req.params.codice, ...valori(req.body)]);
      res.redirect(`/impostazioni/${slug}?msg=${encodeURIComponent(`${req.params.codice} salvato.`)}`);
    });
    r.post(`/${slug}`, async (req, res) => {
      const codice = String(req.body.codice ?? '').trim();
      if (!CODICE_VALIDO.test(codice)) return res.redirect(`/impostazioni/${slug}?msg=${encodeURIComponent('Codice non valido: solo lettere, numeri e _, iniziando con una lettera.')}`);
      if (await q1(`SELECT 1 FROM ${T.tabella} WHERE ${T.chiave} = $1`, [codice])) return res.redirect(`/impostazioni/${slug}?msg=${encodeURIComponent(`Il codice ${codice} esiste già.`)}`);
      const errore = await verificaFormula(req.body);
      if (errore) return res.redirect(`/impostazioni/${slug}?msg=${encodeURIComponent(`${errore}. Non aggiunto.`)}`);
      const v = valori(req.body);
      // campi obbligatori senza valore: valori di riserva sensati
      const nomi = T.campi.map(c => c.nome);
      const vv = v.map((x, i) => (x === '' || x == null) && ['nome', 'etichetta', 'descrizione', 'numero', 'gruppo', 'um'].includes(nomi[i]) ? codice : x)
        .map((x, i) => (x == null && ['ordine', 'persone_default', 'costo'].includes(nomi[i]) ? (nomi[i] === 'persone_default' ? 1 : 0) : x))
        .map((x, i) => (x === '' && ['formula_secondi', 'formula_euro'].includes(nomi[i]) ? '0' : x));
      await q(`INSERT INTO ${T.tabella} (${T.chiave}, ${nomi.join(', ')}) VALUES ($1, ${nomi.map((_, i) => `$${i + 2}`).join(', ')})`, [codice, ...vv]);
      res.redirect(`/impostazioni/${slug}?msg=${encodeURIComponent(`${codice} aggiunto.`)}`);
    });
  }

  // ── Import dal vecchio portale ──
  let importInCorso: Avanzamento | null = null;
  r.get('/importa', async (req, res) => {
    const importati = (await q(`SELECT count(*)::int AS n FROM preventivi WHERE origine = 'vecchio_portale'`))[0].n;
    res.send(pag(req, 'Importa', html`
      <p class="nota">Carica l'export del vecchio portale: il file <code>casteltech-json.zip</code> (o il <code>preventivi.json</code> che contiene).
        Clienti e prodotti vengono creati in automatico; ogni preventivo è ricalcolato con le regole nuove e conserva
        il totale del vecchio portale per confronto. I preventivi importati risultano "archiviati". Si può ripetere: quelli già presenti vengono saltati.</p>
      <div class="blocco stretto-form">
        <label>File da importare <input type="file" id="file-import" accept=".zip,.json"></label>
        <button class="primario" id="avvia-import" type="button">Importa</button>
        <output id="stato-import" aria-live="polite"></output>
      </div>
      <h2>Elimina i preventivi importati</h2>
      <form method="post" action="/impostazioni/importa/elimina" class="blocco stretto-form">
        <p class="nota">Cancella dal portale nuovo <strong>tutti i preventivi importati dal vecchio portale</strong> (${importati} ora presenti).
          I preventivi creati qui, i clienti e i prodotti in anagrafica restano. Prima di cancellare viene salvato in automatico un backup
          completo (Impostazioni → Backup), da cui si possono recuperare. Il vecchio portale non viene toccato.</p>
        <label>Per confermare scrivi <strong>ELIMINA</strong> <input name="conferma" autocomplete="off" class="maiuscolo" required></label>
        <button class="pericolo">Elimina i preventivi importati</button>
      </form>`, req.query.msg ? String(req.query.msg) : undefined, 'importa.js'));
  });
  r.post('/importa/elimina', async (req, res) => {
    if (String(req.body.conferma ?? '').trim().toUpperCase() !== 'ELIMINA')
      return res.redirect('/impostazioni/importa?msg=' + encodeURIComponent('Non eliminato: scrivi ELIMINA per confermare.'));
    if (importInCorso && !importInCorso.finito)
      return res.redirect('/impostazioni/importa?msg=' + encodeURIComponent('Non eliminato: c\'è un import in corso.'));
    const copia = await salvaBackupSuDisco('prima-di-eliminare-importati');
    const n = (await q(`WITH x AS (DELETE FROM preventivi WHERE origine = 'vecchio_portale' RETURNING 1) SELECT count(*)::int AS n FROM x`))[0].n;
    res.redirect('/impostazioni/importa?msg=' + encodeURIComponent(`Eliminati ${n} preventivi importati.${copia ? ' Backup salvato prima: ' + copia : ''}`));
  });
  r.post('/importa', express.raw({ type: '*/*', limit: '60mb' }), async (req, res) => {
    if (importInCorso && !importInCorso.finito) return res.status(409).json({ errore: 'Un import è già in corso' });
    let docs: any[];
    try { docs = leggiDocumenti(req.body as Buffer); } catch (e: any) { return res.status(400).json({ errore: e.message }); }
    importInCorso = { totale: docs.length, fatti: 0, importati: 0, saltati: 0, errori: [], finito: false };
    importaDocumenti(docs, req.session.utente!.id, importInCorso).catch(e => { importInCorso!.errori.push(e.message); importInCorso!.finito = true; });
    res.json(importInCorso);
  });
  r.get('/importa/stato', (_req, res) => res.json(importInCorso ?? { finito: true, totale: 0 }));

  // ── Backup ──
  r.get('/backup', (req, res) => {
    const copie = elencoBackup();
    res.send(pag(req, 'Backup', html`
      <p class="nota">Dal lunedì al venerdì alle 20:30 il portale salva una copia completa dei dati (ultimi 30 giorni).
        Puoi anche scaricarne una adesso e conservarla dove vuoi (es. Google Drive).</p>
      <form method="post" action="/impostazioni/backup/scarica"><button class="primario">Scarica un backup adesso</button></form>
      <h2>Copie automatiche</h2>
      ${copie.length ? html`<table class="editor"><thead><tr><th>File</th><th class="n">Dimensione</th><th></th></tr></thead><tbody>
        ${copie.map(c => html`<tr><td><code>${c.nome}</code></td><td class="n">${c.kb} KB</td><td><a href="/impostazioni/backup/file/${encodeURIComponent(c.nome)}">Scarica</a></td></tr>`)}
      </tbody></table>` : html`<p class="vuoto">Nessuna copia automatica ancora${process.env.BACKUP_DIR ? '' : ' (cartella backup non configurata)'}.</p>`}`));
  });
  r.post('/backup/scarica', async (_req, res) => {
    const file = await creaBackup();
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeFileBackup()}"`);
    res.send(file);
  });
  r.get('/backup/file/:nome', (req, res) => {
    const nome = basename(String(req.params.nome));
    if (!process.env.BACKUP_DIR || !elencoBackup().some(c => c.nome === nome)) return res.status(404).send('Backup non trovato');
    res.download(join(process.env.BACKUP_DIR, nome));
  });

  // ── Utenti ──
  r.get('/utenti', async (req, res) => {
    const utenti = await q(`SELECT id, nome, email, ruolo, attivo, pin_hash IS NOT NULL AS ha_pin FROM utenti ORDER BY ruolo, nome`);
    res.send(pag(req, 'Utenti', html`
      <p class="nota">Ufficio: accesso completo. Produzione: solo inserimento tempi e note sulle schede (accesso con email e password; il PIN servirà per tablet e telefono).</p>
      <table class="editor">
        <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Attivo</th><th>Nuova password</th><th></th></tr></thead>
        <tbody>${utenti.map(u => html`<tr>
          <td><input name="nome" value="${u.nome}" form="u-${u.id}"></td>
          <td><input name="email" value="${u.email ?? ''}" form="u-${u.id}" type="email"></td>
          <td><select name="ruolo" form="u-${u.id}">${['ufficio', 'produzione'].map(x => html`<option ${x === u.ruolo ? raw('selected') : ''}>${x}</option>`)}</select></td>
          <td><input type="checkbox" name="attivo" form="u-${u.id}" ${u.attivo ? raw('checked') : ''}></td>
          <td><input name="password" type="password" form="u-${u.id}" placeholder="lascia vuoto per non cambiarla" autocomplete="new-password"></td>
          <td class="nowrap"><form method="post" action="/impostazioni/utenti/${u.id}" id="u-${u.id}"><button>Salva</button></form>
            ${u.id === req.session.utente!.id ? '' : html`<form method="post" action="/impostazioni/utenti/${u.id}/elimina" class="inline"
              data-conferma="${`Eliminare l'utente ${u.nome}? Si può solo se non ha mai lavorato nel portale; altrimenti togli la spunta Attivo.`}"><button class="link negativo">Elimina</button></form>`}</td></tr>`)}
          <tr class="nuova-riga">
            <td><input name="nome" form="u-nuovo" required placeholder="Nome e cognome"></td>
            <td><input name="email" form="u-nuovo" type="email" required></td>
            <td><select name="ruolo" form="u-nuovo"><option>produzione</option><option>ufficio</option></select></td>
            <td></td>
            <td><input name="password" type="password" form="u-nuovo" required minlength="10" autocomplete="new-password" placeholder="almeno 10 caratteri"></td>
            <td><form method="post" action="/impostazioni/utenti" id="u-nuovo"><button class="primario">Aggiungi</button></form></td>
          </tr>
        </tbody></table>`, req.query.msg ? String(req.query.msg) : undefined));
  });
  r.post('/utenti', async (req, res) => {
    const pwd = String(req.body.password ?? '');
    if (pwd.length < 10) return res.redirect('/impostazioni/utenti?msg=' + encodeURIComponent('La password deve avere almeno 10 caratteri.'));
    try {
      await q(`INSERT INTO utenti (nome, email, password_hash, ruolo) VALUES ($1, lower($2), $3, $4)`,
        [String(req.body.nome).trim(), String(req.body.email).trim(), await bcrypt.hash(pwd, 12), req.body.ruolo === 'ufficio' ? 'ufficio' : 'produzione']);
    } catch { return res.redirect('/impostazioni/utenti?msg=' + encodeURIComponent('Email già presente.')); }
    res.redirect('/impostazioni/utenti?msg=' + encodeURIComponent('Utente aggiunto.'));
  });
  r.post('/utenti/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const torna = (msg: string) => res.redirect('/impostazioni/utenti?msg=' + encodeURIComponent(msg));
    if (id === req.session.utente!.id) return torna('Non puoi eliminare te stesso.');
    const u = await q1(`SELECT nome FROM utenti WHERE id = $1`, [id]);
    if (!u) return torna('Utente non trovato.');
    try {
      await q(`DELETE FROM utenti WHERE id = $1`, [id]);
    } catch (e: any) {
      // ha creato preventivi, commesse, tempi…: resta per lo storico
      if (e?.code === '23503') return torna(`${u.nome} non eliminato: ha già lavorato nel portale. Togli la spunta Attivo per bloccare l'accesso.`);
      throw e;
    }
    torna(`${u.nome} eliminato.`);
  });

  r.post('/utenti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const ruolo = req.body.ruolo === 'ufficio' ? 'ufficio' : 'produzione';
    const attivo = req.body.attivo === 'on';
    if (id === req.session.utente!.id && (!attivo || ruolo !== 'ufficio'))
      return res.redirect('/impostazioni/utenti?msg=' + encodeURIComponent('Non puoi disattivare o declassare te stesso.'));
    await q(`UPDATE utenti SET nome = $2, email = lower(nullif($3, '')), ruolo = $4, attivo = $5 WHERE id = $1`,
      [id, String(req.body.nome).trim(), String(req.body.email ?? '').trim(), ruolo, attivo]);
    const pwd = String(req.body.password ?? '');
    if (pwd) {
      if (pwd.length < 10) return res.redirect('/impostazioni/utenti?msg=' + encodeURIComponent('Password non cambiata: almeno 10 caratteri.'));
      await q(`UPDATE utenti SET password_hash = $2 WHERE id = $1`, [id, await bcrypt.hash(pwd, 12)]);
    }
    res.redirect('/impostazioni/utenti?msg=' + encodeURIComponent('Utente salvato.'));
  });

  return r;
}

function menu(attiva: string) {
  const voci = [['tariffe', 'Tariffe'], ['operatori', 'Operatori'], ['promemoria', 'Promemoria'], ['componenti', 'Componenti'], ['ordini', 'Ordini'], ['crm', 'CRM'], ['fasi', 'Fasi'], ['parametri', 'Parametri'], ['materiali', 'Materiali di consumo'], ['voci', 'Voci di costo'], ['anagrafiche', 'Anagrafiche'], ['fornitori', 'Fornitori'], ['utenti', 'Utenti'], ['importa', 'Importa'], ['backup', 'Backup']];
  return html`<h1>Impostazioni</h1><nav class="schede">${voci.map(([s, t]) => html`<a href="/impostazioni/${s}" class="${t === attiva ? 'attiva' : ''}">${t}</a>`)}</nav>`;
}

function input(c: Campo, v: any, form: string) {
  switch (c.tipo) {
    case 'si_no': return html`<input type="checkbox" name="${c.nome}" form="${form}" ${v ? raw('checked') : ''}>`;
    case 'scelta': return html`<select name="${c.nome}" form="${form}">${c.scelte!.map(s => html`<option ${s === v ? raw('selected') : ''}>${s}</option>`)}</select>`;
    case 'numero': return html`<input name="${c.nome}" form="${form}" value="${v ?? ''}" inputmode="decimal" class="corto">`;
    case 'formula': return html`<input name="${c.nome}" form="${form}" value="${v ?? ''}" class="formula" spellcheck="false">`;
    default: return html`<input name="${c.nome}" form="${form}" value="${v ?? ''}">`;
  }
}
