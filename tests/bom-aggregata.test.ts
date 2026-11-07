// BOM quotata = pagina di acquisto (Adriano 5/11/2026): codici uguali in una riga, alternative equivalenti, elenco per il cliente. Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alternativaAutomatica, righeOriginali, serveAlternativa, tipoComponente, unisciPerPn } from '../src/engine/codifica/aggrega.js';
import { REGOLE_SCARTO_DEFAULT, type Offerta } from '../src/engine/acquisti.js';

const riga = (n: number, pn: string | null, x: any = {}) => ({ n, pn, esito: 'NUOVO', qtaScheda: 1, designatori: `C${n}`, note: [], ...x });
const offerta = (x: Partial<Offerta> = {}): Offerta => ({ fornitore: 'mouser', codiceFornitore: 'X', mpn: 'X', produttore: '', descrizione: '', stock: 100000,
  moq: 1, multiplo: 1, scaglioni: [{ qta: 1, prezzo: 0.1 }], valuta: 'EUR', ...x });

test('codici uguali: una riga per P/N, quantità sommate, riferimenti uniti, prezzo a mano per tutte', () => {
  const righe = unisciPerPn([
    riga(2, 'CL10B103KB8NNNC'), riga(3, 'CL10B103KB8NNNC'), riga(4, 'cl10b103kb8nnnc', { prezzoManuale: 0.02 }),
    riga(10, 'CL10B104KB8NNNC'), riga(11, 'CL10B-104KB8NNNC', { qtaScheda: 2, designatori: 'C11, C12' }),
    riga(20, 'CL10B103KB8NNNC', { esito: 'NON MONTATO' }), riga(21, null), riga(22, null),
    riga(30, 'CL10B104KB8NNNC', { aggiuntaAMano: true }), riga(31, 'CL10B104KB8NNNC', { clienteFornisce: true }),
  ]);
  assert.deepEqual(righe.map(r => r.n), [2, 10, 20, 21, 22, 30, 31]);
  const a = righe[0];
  assert.equal(a.qtaScheda, 3);
  assert.equal(a.designatori, 'C2, C3, C4');
  assert.deepEqual(righeOriginali(a), [2, 3, 4]);
  assert.equal(a.prezzoManuale, 0.02, 'il prezzo scritto su una delle righe vale per tutte');
  assert.match(a.note[0], /unisce le righe 2, 3, 4/);
  assert.equal(righe[1].qtaScheda, 3);
  assert.equal(righe[1].designatori, 'C10, C11, C12');
});

test('codici uguali: acquisto e scarto sul totale, non riga per riga', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { calcolaAcquistiCon, ESITI } = await import('../src/server/codifica-servizio.js');
  const base = (n: number) => ({ ...riga(n, 'CL10B103KB8NNNC'), esito: ESITI.NUOVO, famiglia: 'CC', attributi: {}, fonti: [], acquisti: [],
    offerte: [offerta({ moq: 10, multiplo: 10, scaglioni: [{ qta: 10, prezzo: 0.0258 }] })] }) as any;
  // prima: 13 righe da 1 pezzo, 5 schede → 13 × (5 + 1 scarto → 10 pz minimi) = 130 pezzi
  const separate = Array.from({ length: 13 }, (_, i) => base(i + 2));
  calcolaAcquistiCon(separate, [5], REGOLE_SCARTO_DEFAULT);
  assert.equal(separate.reduce((t, r) => t + r.acquisti[0].scelta.qta, 0), 130);
  // adesso: una riga da 13 a scheda → 65 + 7 scarto = 72 → 80 pezzi (multipli di 10)
  const unite = unisciPerPn(Array.from({ length: 13 }, (_, i) => base(i + 2)), ESITI.NON_MONTATO);
  assert.equal(unite.length, 1);
  calcolaAcquistiCon(unite, [5], REGOLE_SCARTO_DEFAULT);
  assert.equal(unite[0].acquisti[0].netta, 65);
  assert.equal(unite[0].acquisti[0].scarto, 7);
  assert.equal(unite[0].acquisti[0].scelta.qta, 70 + 10);
});

test('tipo di componente: passivi, attivi (sempre conferma), altri', () => {
  assert.equal(tipoComponente('CC'), 'passivo');
  assert.equal(tipoComponente('RS'), 'passivo');
  assert.equal(tipoComponente('IC'), 'attivo');
  assert.equal(tipoComponente('TM'), 'attivo');
  assert.equal(tipoComponente(null), 'attivo', 'famiglia sconosciuta: si chiede la conferma');
  assert.equal(tipoComponente('CN'), 'altro');
  assert.equal(tipoComponente('QZ'), 'altro');
});

test('alternativa senza conferma: solo passivi e non attivi, solo con le stesse caratteristiche, la più economica disponibile', () => {
  const alt = (mpn: string, identica: boolean | null, prezzo: number, x: any = {}) => ({ mpn, identica, fonte: 'stesse caratteristiche',
    offerte: [offerta({ mpn, scaglioni: [{ qta: 1, prezzo }] })], ...x });
  const lista = [alt('CARA', true, 0.05), alt('ECONOMICA', true, 0.01), alt('DIVERSA', false, 0.001), alt('DUBBIA', null, 0.002),
    alt('FINITA', true, 0.005, { offerte: [offerta({ mpn: 'FINITA', stock: 3, scaglioni: [{ qta: 1, prezzo: 0.005 }] })] })];
  assert.equal(alternativaAutomatica('CC', lista, 100)?.mpn, 'ECONOMICA');
  assert.equal(alternativaAutomatica('CN', lista, 100)?.mpn, 'ECONOMICA');
  assert.equal(alternativaAutomatica('IC', lista, 100), null, 'attivo: sempre conferma');
  assert.equal(alternativaAutomatica('CC', [alt('DUBBIA', null, 0.002)], 100), null, 'non sicuramente uguale: conferma');
  assert.equal(alternativaAutomatica('CC', [alt('MANO', true, 0.001, { fonte: 'scritta a mano' })], 100), null);
});

test('serve un\'alternativa: senza prezzo, non disponibile o introvabile; non con prezzo a mano o già scelta', () => {
  const r = (x: any) => ({ esito: 'NUOVO', pn: 'ABC123', acquisti: [{ scelta: { disponibile: true } }], reperibilita: { livello: 'ok' }, ...x });
  assert.equal(serveAlternativa(r({})), false);
  assert.equal(serveAlternativa(r({ acquisti: [{}] })), true);
  assert.equal(serveAlternativa(r({ acquisti: [{ scelta: { disponibile: false } }] })), true);
  assert.equal(serveAlternativa(r({ reperibilita: { livello: 'critico' } })), true);
  assert.equal(serveAlternativa(r({ acquisti: [{}], prezzoManuale: 0.1 })), false);
  assert.equal(serveAlternativa(r({ acquisti: [{}], alternativaScelta: 'XYZ' })), false);
  assert.equal(serveAlternativa(r({ acquisti: [{}], esito: 'NON MONTATO' })), false);
});

test('passivi già prezzati: si tiene il prezzo, si cercano alternative solo sotto 0,001 € a componente (Adriano 7/11/2026)', () => {
  const r = (prezzo: number, famiglia = 'CC') => ({ esito: 'NUOVO', pn: 'ABC123', famiglia, reperibilita: { livello: 'ok' },
    acquisti: [{ scelta: { disponibile: true, acquisto: { prezzo } } }] });
  assert.equal(serveAlternativa(r(0.002)), false);
  assert.equal(serveAlternativa(r(0.001)), false);
  assert.equal(serveAlternativa(r(0.0004)), true);
  assert.equal(serveAlternativa(r(0.0004, 'IC')), false, 'solo i passivi');
});

test('pagina BOM: riquadro senza prezzo solo con il filtro, "Cerca alternative", colonna Riferimenti', () => {
  const v = readFileSync(new URL('../src/server/rotte/componenti.ts', import.meta.url), 'utf8');
  assert.match(v, /id="da-prezzare" hidden/);
  assert.match(v, /\/bom\/:id\/alternative'/);
  assert.match(v, /<th>Riferimenti<\/th>/);
  // Rielabora (5/11/2026): ai distributori solo i P/N mai cercati, non "solo cache"
  assert.match(v, /rielabora', async[\s\S]*?\{ mancanti: true \}/);
  const js = readFileSync(new URL('../public/componenti.js', import.meta.url), 'utf8');
  assert.match(js, /riquadro\.hidden = b\.dataset\.filtro !== 'da-prezzare'/);
  const s = readFileSync(new URL('../src/server/codifica-servizio.ts', import.meta.url), 'utf8');
  assert.match(s, /righe = unisciPerPn\(righe/);
});

test('"nm" dei LED (590 nm) non vuol dire "non montare"; NM da solo sì; righe non montate uguali unite tra loro', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { parolaNonMontare } = await import('../src/server/codifica-servizio.js');
  assert.equal(parolaNonMontare('LED YELLOW 590 nm 0805 APT2012SYCK'), null);
  assert.equal(parolaNonMontare('LED 590nm'), null);
  assert.equal(parolaNonMontare('LED rosso NM'), 'NM');
  assert.equal(parolaNonMontare('RES 10K DNP'), 'DNP');
  const righe = unisciPerPn([riga(1, 'APT2012SYCK', { esito: 'NON MONTATO' }), riga(2, 'APT2012SYCK', { esito: 'NON MONTATO' }), riga(3, 'APT2012SYCK')]);
  assert.deepEqual(righe.map(r => [r.n, r.esito, r.qtaScheda]), [[1, 'NON MONTATO', 2], [3, 'NUOVO', 1]]);
});
