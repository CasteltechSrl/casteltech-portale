/**
 * Anagrafiche → Servizi una tantum (Adriano 3/11/2026): lamina, documentazione, programmazione attrezzature, attrezzaggio PCB…
 * Codici Casteltech UT-… validi per tutti i clienti, con il venduto per anno. Regole in engine/servizi-una-tantum.ts.
 */
import { Router, type Request } from 'express';
import { html, raw, euro, num, numCampo } from '../views/html.js';
import type { PaginaAnagrafiche } from './anagrafiche.js';
import { conCampo } from '../../engine/errori-campo.js';
import { aggiungiServizio, elencoServizi, eliminaServizio, salvaServizio, vendutoServizi } from '../servizi-una-tantum-servizio.js';

export function rotteServizi(pagina: PaginaAnagrafiche) {
  const r = Router();
  const torna = (msg: string) => `/anagrafiche/servizi?msg=${encodeURIComponent(msg)}`;

  r.get('/', async (req: Request, res) => {
    const servizi = await elencoServizi();
    const venduto = await vendutoServizi(servizi.map(s => s.codice));
    const annoOggi = Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 4));
    const anniConDati = new Set(venduto.perCodice.flatMap(v => Object.keys(v.anni).map(Number)));
    const anni = [...new Set([annoOggi, ...anniConDati])].filter(a => a <= annoOggi).sort((a, b) => b - a).slice(0, 4);
    const cella = (v: { quantita: number; importo: number; righe: number } | undefined) => v
      ? html`<td class="n nowrap" data-valore="${v.quantita}" title="${`${v.righe} righe di fattura`}"><b>${num(v.quantita, 0)}</b> pz<br><span class="nota">${euro(v.importo)}</span></td>`
      : html`<td class="n"></td>`;
    res.send(await pagina(req, 'servizi', html`
      <p class="nota">Costi una tantum uguali per tutti i clienti: lamina serigrafica, preparazione della documentazione, programmazione delle attrezzature,
        attrezzaggio PCB. Codici <b>Casteltech</b> (UT-…), validi per qualunque cliente: si scelgono in fondo al menu Codice delle righe di ordini,
        conferme d'ordine, DDT e fatture (gruppo "Servizi una tantum"). La descrizione si può completare nella riga (es. "LAMINA SERIGRAFICA CON TRATTAMENTI
        TOP"), il prezzo qui sotto è solo proposto.</p>
      <div class="tabella-scorre"><table class="elenco" id="servizi"><thead><tr><th>Codice</th><th>Descrizione</th><th class="n">Prezzo proposto €</th><th>Attivo</th>
          ${anni.map(a => html`<th class="n" title="Venduto nelle fatture emesse (note di credito in meno)">Venduto ${a}</th>`)}<th></th></tr></thead><tbody>
        ${servizi.map(s => {
          const v = venduto.perCodice.find(x => x.codice === s.codice);
          return html`<tr class="${s.attivo ? '' : 'spento'}"><td class="codice nowrap">${s.codice}</td>
            <td class="largo"><input name="descrizione" value="${s.descrizione}" class="maiuscolo" form="s-${s.id}" required></td>
            <td class="n"><input name="prezzo" value="${numCampo(s.prezzo, 2)}" class="corto n" inputmode="decimal" form="s-${s.id}"></td>
            <td><input type="checkbox" name="attivo" value="1" form="s-${s.id}" ${s.attivo ? raw('checked') : ''} title="Tolta la spunta non compare più nei menu"></td>
            ${anni.map(a => cella(v?.anni[a]))}
            <td class="nowrap"><form method="post" action="/anagrafiche/servizi/${s.id}" id="s-${s.id}" class="inline"><input type="hidden" name="attivo_presente" value="1"><button>Salva</button></form>
              ${s.usato ? '' : html`<form method="post" action="/anagrafiche/servizi/${s.id}/elimina" class="inline" data-conferma="${`Eliminare ${s.codice}?`}">
                <button class="link negativo">Elimina</button></form>`}</td></tr>`;
        })}
      </tbody></table></div>
      <p class="nota">Il venduto conta le righe con il codice UT e, per le fatture di prima (anche quelle di Fatture in Cloud), le righe che nella descrizione
        citano un servizio solo ("LAMINA SERIGRAFICA", "PROGRAMMAZIONE ATTREZZATURE"…).
        ${venduto.insieme.length ? html`Le righe che ne uniscono più di uno ("costi una tantum: lamina, programmazione…") non si possono dividere e non sono contate:
          ${venduto.insieme.filter(x => anni.includes(x.anno)).map((x, i) => html`${i ? ', ' : ''}${x.anno} ${x.righe} righe per ${euro(x.importo)}`)}.` : ''}</p>
      <form method="post" action="/anagrafiche/servizi" class="blocco stretto-form" id="s-nuovo">
        <h2>+ Aggiungi servizio una tantum</h2>
        <p class="nota">Solo per un costo che vale per tutti i clienti (es. UT-COLLAUDO). Il codice comincia sempre con UT-.</p>
        <div class="riga-campi"><label>Codice <input name="codice" class="maiuscolo" required placeholder="UT-…" autocomplete="off"></label>
          <label class="largo">Descrizione <input name="descrizione" class="maiuscolo" required autocomplete="off"></label>
          <label>Prezzo proposto € <input name="prezzo" class="corto" inputmode="decimal"></label></div>
        <button class="primario">Aggiungi</button>
      </form>`, req.query.msg ? String(req.query.msg) : undefined));
  });

  r.post('/', async (req, res) => {
    const e = await aggiungiServizio(req.body);
    if ('errore' in e) return res.redirect(conCampo(torna(e.errore), e.campo, 's-nuovo'));
    res.redirect(torna(`Aggiunto ${e.servizio.codice} ${e.servizio.descrizione}.`));
  });

  r.post('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const errore = await salvaServizio(Number(req.params.id), { ...req.body, attivo: req.body.attivo_presente ? req.body.attivo === '1' : undefined });
    res.redirect(torna(errore ?? 'Salvato.'));
  });
  r.post('/:id/elimina', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const errore = await eliminaServizio(Number(req.params.id));
    res.redirect(torna(errore ?? 'Servizio eliminato.'));
  });
  return r;
}
