import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { conCampo, campoDaEvidenziare } from '../src/engine/errori-campo.js';
import { CAMPI_SEMPLICE, nascostiInSemplice, vistaPreventivo } from '../src/engine/preventivo-semplice.js';
import { PARAMETRI } from '../src/catalogo/iniziale.js';
import { cercaGuida } from '../src/engine/guida.js';

test('errori accanto al campo: il redirect porta campo e modulo, letti e controllati', () => {
  assert.equal(conCampo('/impostazioni/utenti?msg=Email%20gi%C3%A0', 'email', 'u-nuovo'), '/impostazioni/utenti?msg=Email%20gi%C3%A0&campo=email&modulo=u-nuovo');
  assert.equal(conCampo('/crm/12', 'descrizione'), '/crm/12?campo=descrizione');
  assert.deepEqual(campoDaEvidenziare({ campo: 'prezzo', modulo: 'p-15' }), { campo: 'prezzo', modulo: 'p-15' });
  assert.deepEqual(campoDaEvidenziare({ campo: 'ragione_sociale' }), { campo: 'ragione_sociale', modulo: undefined });
  assert.equal(campoDaEvidenziare({ campo: '<script>' }), null);
  assert.equal(campoDaEvidenziare({}), null);
});

test('errori accanto al campo: lo script è in ogni pagina e i moduli a rischio lo usano', () => {
  const layout = readFileSync('src/server/views/layout.ts', 'utf8');
  assert.match(layout, /errori-campo\.js/);
  assert.match(layout, /formati\.js/);
  const js = readFileSync('public/errori-campo.js', 'utf8');
  assert.match(js, /sessionStorage/);
  assert.match(js, /errore-campo/);
  assert.match(js, /type === 'password'/, 'le password non si conservano');
  for (const [file, campi] of [
    ['src/server/rotte/impostazioni.ts', ['password', 'email', 'codice']],
    ['src/server/rotte/anagrafiche.ts', ['ragione_sociale', 'codice', 'prezzo', 'scaglioni', 'cliente_id']],
    ['src/server/rotte/crm.ts', ['descrizione']],
  ] as const) {
    const src = readFileSync(file, 'utf8');
    for (const c of campi) assert.match(src, new RegExp(`conCampo\\([^;]*'${c}'`), `${file} segnala il campo ${c}`);
  }
  const css = readFileSync('public/stile.css', 'utf8');
  assert.match(css, /\.errore-campo/);
  assert.match(css, /\.con-errore/);
});

test('preventivo semplice: i campi della vista Semplice esistono nel catalogo e sono quantità o costi', () => {
  const codici = new Set(PARAMETRI.map(p => p.codice));
  for (const c of CAMPI_SEMPLICE) assert.ok(codici.has(c), `${c} non è un parametro del catalogo`);
  // niente tempi standard (secondi/minuti per operazione) tra i campi semplici, tranne le lavorazioni "se ci sono"
  const perCodice = new Map(PARAMETRI.map(p => [p.codice, p]));
  const lavorazioni = new Set(['collaudo', 'componentiMeccanici', 'tempoCablaggio', 'programmazioneFlash']);
  for (const c of CAMPI_SEMPLICE) {
    const p = perCodice.get(c)!;
    if (lavorazioni.has(c)) continue;
    assert.ok(['pz', '€', ''].includes(p.unita), `${c} (${p.unita}) non è una quantità o un costo`);
  }
  assert.ok(CAMPI_SEMPLICE.size >= 15 && CAMPI_SEMPLICE.size <= 25, 'la vista semplice ha 15–25 campi');
  const smdTop = PARAMETRI.filter(p => p.gruppo === 'SMD TOP').map(p => p.codice);
  assert.equal(nascostiInSemplice(smdTop), smdTop.length - 2);
  assert.equal(nascostiInSemplice(['qtSmd', 'qtFeeder']), 0);
  assert.equal(vistaPreventivo('semplice'), 'semplice');
  assert.equal(vistaPreventivo('qualcosa'), 'completo');
  assert.equal(vistaPreventivo(null), 'completo');
});

test('preventivo semplice: pulsanti in pagina, classe sui campi, script che nasconde', () => {
  const rotta = readFileSync('src/server/rotte/preventivi.ts', 'utf8');
  assert.match(rotta, /data-vista="semplice"/);
  assert.match(rotta, /data-vista="completo"/);
  assert.match(rotta, /CAMPI_SEMPLICE\.has\(p\.codice\) \? 'campo-semplice'/);
  const js = readFileSync('public/preventivo.js', 'utf8');
  assert.match(js, /preventivo-vista/);
  assert.match(js, /vista-semplice/);
  const css = readFileSync('public/stile.css', 'utf8');
  assert.match(css, /form\.vista-semplice \.campi-parametri > label:not\(\.campo-semplice\)/);
});

test('numeri e date: lo script converte il punto in virgola solo nei decimali semplici e avvisa sulle date', () => {
  const js = readFileSync('public/formati.js', 'utf8');
  assert.match(js, /inputmode.*decimal/);
  assert.match(js, /\^-\?\\d\+\\\.\\d\+\$/, 'solo numeri come 12.5, mai 1.000');
  assert.match(js, /type="date"/);
  assert.match(js, /navigator\.language/);
  // nel portale non si usano caselle type="number" (il browser le mostra col punto): tutte inputmode="decimal"
  const src = ['src/server/rotte', 'src/server/views'].flatMap(d => readdirSync(d).map((f: string) => `${d}/${f}`))
    .filter(f => f.endsWith('.ts')).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(src, /type="number"/);
});

test('guida: errori accanto al campo, vista semplice e formati si trovano', () => {
  assert.equal(cercaGuida('non si salva errore sotto il campo')[0]?.argomento.id, 'errori-accanto-campo');
  assert.equal(cercaGuida('preventivo semplice troppi campi')[0]?.argomento.id, 'preventivo-semplice');
  assert.equal(cercaGuida('date formato mese giorno browser inglese')[0]?.argomento.id, 'numeri-date-uniformi');
});
