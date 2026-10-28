-- Adriano, 28/10/2026:
--  * Informazioni generali → Montaggio, riga AOI: TOP · BOT · VISIVO. Con SMD di solito AOI TOP (BOT solo se c'è quel lato);
--    in rari casi (campionature di pochi pezzi, schede con pochissimi componenti) niente AOI, né programmazione né ispezione:
--    controllo visivo, 60 s a scheda di standard.
--  * Pre-produzione: 5 minuti standard per ogni voce, tranne "Disegno e stampa 3D" (resta vuota = 0); acquisto componenti
--    e PCB contano già solo con la loro spunta in Informazioni generali → Acquisti.
-- Come per la 003: si cambia solo ciò che è ancora uguale al valore lasciato dalle migrazioni precedenti.
-- I preventivi salvati non cambiano: hanno la loro copia del catalogo.

INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT v.codice, v.etichetta, '', 'INFORMAZIONI GENERALI', v.valore_default, v.suggerimento, 'si_no', p.ordine + v.dopo
FROM (VALUES
  ('aoiTop', 'AOI TOP', 1::numeric, 'Ispezione AOI del lato TOP (con la sua programmazione alla 1ª produzione)', 0.1),
  ('aoiBot', 'AOI BOT', 0, 'Ispezione AOI del lato BOT (solo con SMD anche sul BOT)', 0.2),
  ('controlloVisivo', 'Controllo visivo', 0, 'Senza AOI (campionature di pochi pezzi, schede con pochissimi componenti): controllo visivo a scheda', 0.3)
) AS v(codice, etichetta, valore_default, suggerimento, dopo)
JOIN parametri p ON p.codice = 'presenteTht'
ON CONFLICT (codice) DO NOTHING;

INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT 'tempoControlloVisivo', 'Controllo visivo per scheda', 's', 'AOI', 60, 'Solo senza AOI (spunta Visivo)', 'numero', ordine + 0.5
FROM parametri WHERE codice = 'tempoRevisioneAoiLatoB'
ON CONFLICT (codice) DO NOTHING;

UPDATE fasi SET formula_secondi = 'se(primaProduzione * (aoiTop * qtSmd + aoiBot * doppiaFaccia * qtSmdLatoB) > 0, oreProgAOI * 3600 * (se(aoiTop * qtSmd > 0, 1, 0) + se(aoiBot * doppiaFaccia * qtSmdLatoB > 0, 1, 0)), 0)'
  WHERE codice = 'progAOI' AND formula_secondi = 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgAOI * 3600 * se(doppiaFaccia, 2, 1), 0)';
UPDATE fasi SET formula_secondi = '(se(aoiTop * qtSmd > 0, tempoRevisioneAoi, 0) + se(aoiBot * doppiaFaccia * qtSmdLatoB > 0, tempoRevisioneAoiLatoB, 0)) * nSchede'
  WHERE codice = 'ispezioneAOI' AND formula_secondi = '(se(qtSmd > 0, tempoRevisioneAoi, 0) + se(doppiaFaccia * qtSmdLatoB > 0, tempoRevisioneAoiLatoB, 0)) * nSchede';

-- controllo visivo subito dopo l'ispezione AOI (numero con la lettera: la numerazione delle altre fasi non cambia)
INSERT INTO fasi (codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine)
SELECT 'controlloVisivo', numero || 'V', 'Controllo visivo (senza AOI)', 'SMD', 'se(controlloVisivo, tempoControlloVisivo * nSchede, 0)',
       1, 'produzione', false, 'scheda', ordine + 0.5
FROM fasi WHERE codice = 'ispezioneAOI'
ON CONFLICT (codice) DO NOTHING;

-- pre-produzione: 5 minuti standard (la 005 le aveva lasciate vuote)
UPDATE parametri SET valore_default = 5 / 60.0
  WHERE codice IN ('oreFoglioTempi', 'oreAnalisiBom', 'orePreventivo', 'oreAcquistoPcb', 'oreAcquistoComponenti',
                   'oreAcquistoLamine', 'orePrepDoc', 'oreCheckPreProduzione')
    AND gruppo = 'PRE-PRODUZIONE' AND valore_default IS NULL;
