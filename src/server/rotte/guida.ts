/**
 * Guida del portale (Adriano, 28/10/2026): macro aree con cosa si fa e come, ricerca intelligente
 * ("ordine documenti" porta a "Caricare un ordine") e, se c'è la chiave dell'IA, domande in linguaggio normale.
 * Testi e ricerca in src/engine/guida.ts; la pagina non interroga il database.
 */
import { Router, type Request } from 'express';
import { layout } from '../views/layout.js';
import { html, type Raw } from '../views/html.js';
import { AREE_GUIDA, ARGOMENTI_GUIDA, cercaGuida, indirizzoArgomento, type ArgomentoGuida } from '../../engine/guida.js';
import { chiediAllaGuida, iaConfigurata } from '../guida-ia.js';
import { ErroreIa } from '../ia.js';

export function rotteGuida() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'guida', contenuto, script: 'guida.js' }));

  const casella = (q = '') => html`
    <form class="cerca-guida" method="get" action="/guida" role="search">
      <input type="search" name="q" value="${q}" placeholder="Cosa vuoi fare? es. ordine documenti, stampare la scheda, nota di credito"
        autocomplete="off" aria-label="Cerca nella guida" data-cerca-guida>
      <button class="primario">Cerca</button>
    </form>
    <div id="risultati-guida" class="risultati-guida" aria-live="polite"></div>`;

  const chat = () => iaConfigurata() ? html`
    <section class="blocco chiedi-guida">
      <h2>Chiedi alla guida</h2>
      <p class="nota">Scrivi la domanda come la faresti a un collega: risponde l'IA usando solo questa guida e ti porta alla parte giusta.</p>
      <div id="conversazione-guida" class="conversazione-guida" aria-live="polite"></div>
      <form id="chiedi-guida" class="cerca-guida">
        <input name="domanda" maxlength="500" required placeholder="es. Il cliente mi ha mandato l'ordine per email: dove lo carico?" autocomplete="off">
        <button class="primario">Chiedi</button>
      </form>
    </section>` : '';

  const elencoRisultati = (q: string) => {
    const ris = cercaGuida(q);
    return ris.length ? html`<ol class="elenco-risultati">${ris.map(x => html`<li>
        <a href="${indirizzoArgomento(x.argomento)}"><strong>${x.argomento.titolo}</strong></a> <span class="etichetta">${x.area.nome}</span>
        <div class="nota">${x.argomento.testo[0]}</div></li>`)}</ol>`
      : html`<p class="vuoto">Nessun argomento trovato per «${q}». Prova con altre parole, oppure scrivi l'idea in <a href="/suggerimenti/nuovo">Suggerimenti</a>.</p>`;
  };

  r.get('/', (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 200);
    res.send(pagina(req, 'Guida', html`
      <div class="intestazione-pagina"><h1>Guida del portale</h1></div>
      <p class="nota">Cosa si fa in ogni sezione, come si fa e cosa non si può fare. Cerca con le parole che useresti tu (anche più parole, es. «ordine documenti»).</p>
      ${casella(q)}
      ${q ? html`<h2>Risultati per «${q}»</h2>${elencoRisultati(q)}` : ''}
      ${chat()}
      <h2>Le sezioni del portale</h2>
      <div class="aree-guida">${AREE_GUIDA.map(area => html`
        <section class="blocco area-guida">
          <h3><a href="/guida/${area.id}">${area.nome}</a></h3>
          <p class="nota">${area.descrizione}</p>
          <ul>${ARGOMENTI_GUIDA.filter(a => a.area === area.id).map(a => html`<li><a href="${indirizzoArgomento(a)}">${a.titolo}</a></li>`)}</ul>
        </section>`)}</div>`));
  });

  // ricerca mentre si scrive (public/guida.js)
  r.get('/cerca', (req, res) => {
    const q = String(req.query.q ?? '').slice(0, 200);
    res.json(cercaGuida(q, 6).map(x => ({ titolo: x.argomento.titolo, area: x.area.nome, href: indirizzoArgomento(x.argomento), testo: x.argomento.testo[0] })));
  });

  r.post('/chiedi', async (req, res) => {
    const domanda = String(req.body?.domanda ?? '').trim().slice(0, 500);
    if (!domanda) return res.status(400).json({ errore: 'Scrivi una domanda.' });
    const collegamenti = (ids: string[]) => ids.map(id => ARGOMENTI_GUIDA.find(a => a.id === id)!).map(a => ({ titolo: a.titolo, href: indirizzoArgomento(a) }));
    const ricerca = () => cercaGuida(domanda, 3).map(x => x.argomento.id);
    if (!iaConfigurata()) return res.json({ risposta: 'L\'IA non è configurata: ecco gli argomenti della guida che parlano di questo.', argomenti: collegamenti(ricerca()) });
    try {
      const r = await chiediAllaGuida(domanda);
      res.json({ risposta: r.risposta, argomenti: collegamenti(r.argomenti.length ? r.argomenti : ricerca()) });
    } catch (e) {
      console.error('Guida, domanda all\'IA:', e);
      // credito finito, tetto di spesa, chiave non valida: si dice il motivo (ErroreIa ha già il messaggio chiaro)
      const motivo = e instanceof ErroreIa ? ` (${e.message.replace(/\.$/, '')})` : '';
      res.json({ risposta: `In questo momento l'IA non risponde${motivo}. Intanto ecco gli argomenti della guida che parlano di questo.`, argomenti: collegamenti(ricerca()) });
    }
  });

  const argomento = (a: ArgomentoGuida) => html`
    <section class="blocco argomento-guida" id="${a.id}">
      <h2>${a.titolo}</h2>
      ${a.testo.map(p => html`<p>${p}</p>`)}
      ${a.passi?.length ? html`<h3>Come si fa</h3><ol class="passi-guida">${a.passi.map(p => html`<li>${p}</li>`)}</ol>` : ''}
      ${a.pagine.length ? html`<p class="vai-guida">${a.pagine.map(([href, testo]) => html`<a class="bottone" href="${href}">${testo} →</a> `)}</p>` : ''}
    </section>`;

  r.get('/:area', (req, res) => {
    const area = AREE_GUIDA.find(a => a.id === req.params.area);
    if (!area) return res.redirect('/guida');
    res.send(pagina(req, `Guida · ${area.nome}`, html`
      <p><a href="/guida">← Guida del portale</a></p>
      <h1>${area.nome}</h1>
      <p class="nota">${area.descrizione}</p>
      ${casella()}
      <nav class="tasti-sezione">${AREE_GUIDA.map(x => html`<a href="/guida/${x.id}" class="${x.id === area.id ? 'attivo' : ''}">${x.nome}</a>`)}</nav>
      ${ARGOMENTI_GUIDA.filter(a => a.area === area.id).map(argomento)}`));
  });

  return r;
}
