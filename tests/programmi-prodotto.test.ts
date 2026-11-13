import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiProgrammi, riempiVuote, aggiornaDaCommessa } from '../src/engine/programmi-prodotto.js';

const CHIAVI = ['progSerigrafia', 'progPePFox', 'progPePIpulse', 'progAOI'];

test('leggiProgrammi: solo chiavi conosciute e caselle scritte', () => {
  assert.deepEqual(leggiProgrammi({ progAOI: { top: ' A ', bot: '' }, progX: { top: 'z' }, progPePFox: { top: '', bot: '' } }, CHIAVI),
    { progAOI: { top: 'A', bot: '' } });
  assert.deepEqual(leggiProgrammi(null, CHIAVI), {});
});

test('riempiVuote: non sovrascrive quello che è già scritto', () => {
  const { programmi, riempite } = riempiVuote(
    { progPePFox: { top: 'PANNELLO_A_TOP', bot: '' } },
    { progPePFox: { top: 'ALTRO', bot: 'PANNELLO_A_BOT' }, progAOI: { top: 'AOI_A', bot: '' } });
  assert.deepEqual(programmi, { progPePFox: { top: 'PANNELLO_A_TOP', bot: 'PANNELLO_A_BOT' }, progAOI: { top: 'AOI_A', bot: '' } });
  assert.equal(riempite, 2);
});

test('aggiornaDaCommessa: vince la casella scritta nella commessa, le vuote non cancellano', () => {
  assert.deepEqual(aggiornaDaCommessa({ progAOI: { top: 'VECCHIO', bot: 'B' } }, { progAOI: { top: 'NUOVO', bot: '' } }),
    { progAOI: { top: 'NUOVO', bot: 'B' } });
});
