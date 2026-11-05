// Ricerca su internet dei componenti non trovati (Adriano 5/11/2026: "il P/N non era completo, su internet l'ho trovato"). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { costoIa } from '../src/engine/servizi.js';

test('ogni ricerca web dell\'IA costa 1 centesimo di dollaro e si somma ai token', () => {
  assert.equal(costoIa('claude-sonnet-5-5', { input_tokens: 1_000_000, server_tool_use: { web_search_requests: 4 } }), 2 + 0.04);
  assert.equal(costoIa('claude-sonnet-5-5', { input_tokens: 0 }), 0);
});

test('cercaComponenteSulWeb: strumento web_search, JSON letto anche con testo intorno, continua dopo pause_turn', async () => {
  process.env.ANTHROPIC_API_KEY = 'prova';
  const { cercaComponenteSulWeb } = await import('../src/server/lettura-ia.js');
  const chiamate: any[] = [];
  const vera = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    const corpo = JSON.parse(init.body); chiamate.push(corpo);
    const prima = chiamate.length === 1;
    return new Response(JSON.stringify({
      model: 'claude-sonnet-5-5', stop_reason: prima ? 'pause_turn' : 'end_turn', usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1 } },
      content: prima ? [{ type: 'server_tool_use', id: 'x', name: 'web_search', input: { query: 'S505H-1.6-R' } }]
        : [{ type: 'text', text: 'Ecco:\n```json\n{"pnCompleto": "bk1-s505h-1.6-r", "produttore": "Eaton", "stessoComponente": true, "dove": "DigiKey 283-3538-ND", "criticita": "", "nota": "Serie S505H: il codice ordinabile ha il prefisso BK1-."}\n```' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as any;
  try {
    const e = await cercaComponenteSulWeb({ riga: 124, pn: 'S505H-1.6-R', produttore: '', descrizione: 'FUSIBILE 5X20 1A6', valore: '', footprint: '', famiglia: 'FS' });
    assert.equal(chiamate.length, 2, 'dopo pause_turn si continua');
    assert.equal(chiamate[0].tools[0].name, 'web_search');
    assert.equal(chiamate[0].tools[0].max_uses, 4);
    assert.equal(chiamate[1].messages.length, 2, 'la seconda richiesta porta avanti la conversazione');
    assert.equal(e?.pnCompleto, 'BK1-S505H-1.6-R');
    assert.equal(e?.stessoComponente, true);
    assert.equal(e?.dove, 'DigiKey 283-3538-ND');
  } finally { globalThis.fetch = vera; }
});

test('servizio BOM: ricerca su internet dopo le alternative, esito conservato sulla riga, codice trovato = alternativa', () => {
  const s = readFileSync(new URL('../src/server/codifica-servizio.ts', import.meta.url), 'utf8');
  assert.match(s, /await ricercaSulWeb\(daCercare\.filter\(x => !x\.r\.alternativaScelta && !x\.r\.alternativaProposta\)/);
  assert.match(s, /if \(!opz\.forzaPrezzi && prima\.ricercaInternet !== undefined\) r\.ricercaInternet = prima\.ricercaInternet/);
  assert.match(s, /INTERNET: 'codice completo trovato su internet'/);
  assert.match(s, /CRITICITÀ: \$\{ri\.criticita\}/);
});
