/**
 * Segno "Inviato" nelle pagine (Adriano 4/11/2026; regole in engine/invii.ts): negli elenchi un'etichetta breve con la data
 * (al passaggio del mouse destinatario e ora), nella scheda la frase intera e il tasto "Segna come inviato" per i documenti
 * mandati da fuori del portale. Nessun segno = ancora da inviare.
 */
import { html, raw, type Raw } from './html.js';
import { segniInvio, mancaSdi, type DatiInvio, type SegnoInvio } from '../../engine/invii.js';

const ICONA: Record<SegnoInvio['canale'], string> = { email: '✉', sdi: '⇪', fic: '✓', mano: '✓' };

/** Etichette per la colonna "Inviato" degli elenchi (vuoto = da inviare). */
export function segnoInvioElenco(d: DatiInvio): Raw {
  const s = segniInvio(d);
  if (!s.length) return html``;
  return html`${s.map(x => html`<span class="invio invio-${x.livello} invio-${x.canale}" title="${x.frase}">${ICONA[x.canale]} ${x.breve}</span> `)}`;
}

/**
 * Riquadro della scheda: frasi dei segni, oppure "Non ancora inviato"; con `segna` il modulo per segnarlo inviato a mano
 * (o togliere il segno messo a mano). `segna` = indirizzo del POST.
 */
export function riquadroInvio(d: DatiInvio, o: { segna?: string; torna?: string; cosa?: string } = {}): Raw {
  const s = segniInvio(d);
  const cosa = o.cosa ?? 'documento';
  const manca = mancaSdi(d);
  const aMano = !!d.inviato_a_mano && !!d.email_inviata_il;
  const torna = o.torna ? html`<input type="hidden" name="torna" value="${o.torna}">` : '';
  const modulo = !o.segna ? '' : aMano
    ? html`<form method="post" action="${o.segna}" class="inline" data-conferma="Togliere il segno 'inviato' messo a mano?">${torna}
        <input type="hidden" name="togli" value="1"><button class="piccolo">Togli il segno</button></form>`
    : !d.email_inviata_il ? html`<form method="post" action="${o.segna}" class="inline segna-inviato">${torna}
        <input name="a" placeholder="a chi / come (facoltativo)" aria-label="A chi è stato mandato" size="22">
        <button class="piccolo" title="Per un ${cosa} mandato da fuori del portale (posta, PEC, a mano): resta scritto come inviato">Segna come inviato</button></form>` : '';
  return html`<div class="riquadro-invio${s.length ? '' : ' da-inviare'}">
    ${s.length ? s.map(x => html`<p class="invio-frase invio-${x.livello}">${raw(ICONA[x.canale])} ${x.frase}</p>`)
      : html`<p class="invio-frase"><b>Non ancora inviato</b>: nessun invio registrato.</p>`}
    ${manca ? html`<p class="invio-frase invio-attesa">⇪ Non ancora inviata allo SdI.</p>` : ''}
    ${modulo}
  </div>`;
}
