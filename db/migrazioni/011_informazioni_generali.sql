-- Informazioni generali del preventivo (Adriano, 24/10/2026):
--  * spunte: prima produzione, presente THT, acquisto lamina / PCB / componenti;
--  * le programmazioni (P&P, file P&P, serigrafia, forno, AOI, armadi, saldatrice ad onda) contano solo con
--    "prima produzione"; armadi solo se in più il materiale va a nostro magazzino; nulla di SMD senza componenti SMD;
--    onda solo con THT e saldatura a onda;
--  * acquisto lamine / PCB / componenti (tempo e costo) solo con la spunta; lamine: vuoto = una per lato.
-- Come per la 003: le formule si cambiano solo se sono ancora quelle lasciate dalle migrazioni precedenti.
-- Database nuovo (catalogo vuoto): non si fa nulla, ci pensa il primo avvio.

-- "ordine" con decimali, per inserire righe tra quelle esistenti
ALTER TABLE parametri ALTER COLUMN ordine TYPE numeric;
ALTER TABLE fasi ALTER COLUMN ordine TYPE numeric;

INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
SELECT * FROM (VALUES
  ('primaProduzione', 'Prima produzione (programmazioni)', '', 'INFORMAZIONI GENERALI', 1::numeric, 'si_no', -4.9),
  ('presenteTht', 'Presente THT', '', 'INFORMAZIONI GENERALI', 0, 'si_no', -4.8),
  ('acquistoLamina', 'Acquisto lamina', '', 'INFORMAZIONI GENERALI', 0, 'si_no', -4.7),
  ('acquistoPcb', 'Acquisto PCB', '', 'INFORMAZIONI GENERALI', 0, 'si_no', -4.6),
  ('acquistoComponenti', 'Acquisto componenti', '', 'INFORMAZIONI GENERALI', 0, 'si_no', -4.5)
) AS v(codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;

-- gruppo PROGRAMMAZIONI subito dopo la pre-produzione
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
SELECT * FROM (VALUES
  ('oreProgForno', 'Programmazione profilo forno', 'h', 'PROGRAMMAZIONI', NULL::numeric, 'durata', 0),
  ('oreProgOnda', 'Programmazione saldatrice ad onda', 'h', 'PROGRAMMAZIONI', NULL, 'durata', 0)
) AS v(codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;
UPDATE parametri p SET gruppo = 'PROGRAMMAZIONI',
    ordine = (SELECT max(ordine) FROM parametri WHERE gruppo = 'PRE-PRODUZIONE') + v.k / 10.0
  FROM (VALUES ('oreProgArmadi', 1), ('oreFilePeP', 2), ('oreProgPeP', 3), ('oreProgSerigrafia', 4),
               ('oreProgForno', 5), ('oreProgAOI', 6), ('oreProgOnda', 7)) AS v(codice, k)
  WHERE p.codice = v.codice AND p.gruppo IN ('PRE-PRODUZIONE', 'SMD TOP', 'AOI', 'PROGRAMMAZIONI');
UPDATE parametri SET valore_default = NULL, suggerimento = 'Vuoto = una per lato'
  WHERE codice = 'nLamine' AND valore_default IS NOT DISTINCT FROM 0;

-- fasi di acquisto: solo con la spunta
UPDATE fasi SET formula_secondi = 'se(acquistoPcb, oreAcquistoPcb * 3600, 0)'
  WHERE codice = 'acquistoPcb' AND formula_secondi = 'oreAcquistoPcb * 3600';
UPDATE fasi SET formula_secondi = 'se(acquistoComponenti, oreAcquistoComponenti * 3600, 0)'
  WHERE codice = 'acquistoComponenti' AND formula_secondi = 'oreAcquistoComponenti * 3600';
UPDATE fasi SET formula_secondi = 'se(acquistoLamina, oreAcquistoLamine * 3600, 0)'
  WHERE codice = 'acquistoLamine' AND formula_secondi = 'se(qtSmd + doppiaFaccia * qtSmdLatoB > 0, oreAcquistoLamine * 3600, 0)';

-- programmazioni: solo con prima produzione
UPDATE fasi SET formula_secondi = 'se(primaProduzione * (provenienzaMateriale != 1) * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgArmadi * 3600 * se(doppiaFaccia, 2, 1), 0)'
  WHERE codice = 'progArmadi' AND formula_secondi = 'se(qtSmd + doppiaFaccia * qtSmdLatoB > 0, oreProgArmadi * 3600 * se(doppiaFaccia, 2, 1), 0)';
UPDATE fasi SET formula_secondi = 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreFilePeP * 3600 * se(doppiaFaccia, 2, 1), 0)'
  WHERE codice = 'filePeP' AND formula_secondi = 'se(qtSmd + doppiaFaccia * qtSmdLatoB > 0, oreFilePeP * 3600 * se(doppiaFaccia, 2, 1), 0)';
UPDATE fasi SET formula_secondi = 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgPeP * 3600 * se(doppiaFaccia, 2, 1), 0)'
  WHERE codice = 'progPeP' AND formula_secondi = 'se(qtSmd + doppiaFaccia * qtSmdLatoB > 0, oreProgPeP * 3600 * se(doppiaFaccia, 2, 1), 0)';
UPDATE fasi SET formula_secondi = 'se(primaProduzione * qtSmd > 0, oreProgSerigrafia * 3600, 0)'
  WHERE codice = 'progSerigrafiaTop' AND formula_secondi = 'se(qtSmd > 0, oreProgSerigrafia * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(primaProduzione * doppiaFaccia * qtSmdLatoB > 0, oreProgSerigrafia * 3600, 0)'
  WHERE codice = 'progSerigrafiaBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, oreProgSerigrafia * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgAOI * 3600 * se(doppiaFaccia, 2, 1), 0)'
  WHERE codice = 'progAOI' AND formula_secondi = 'se(qtSmd + doppiaFaccia * qtSmdLatoB > 0, oreProgAOI * 3600 * se(doppiaFaccia, 2, 1), 0)';

INSERT INTO fasi (codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine)
SELECT 'progForno', '9F', 'Programmazione profilo forno', 'SMD',
       'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgForno * 3600, 0)', 1, 'produzione', true, 'fisso',
       (SELECT ordine + 0.5 FROM fasi WHERE codice = 'progAOI')
WHERE EXISTS (SELECT 1 FROM fasi WHERE codice = 'progAOI')
ON CONFLICT (codice) DO NOTHING;
INSERT INTO fasi (codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine)
SELECT 'progOnda', '17P', 'Programmazione saldatrice ad onda', 'THT',
       'se(primaProduzione * presenteTht * usaOnda > 0, oreProgOnda * 3600, 0)', 1, 'produzione', true, 'fisso',
       (SELECT ordine - 0.5 FROM fasi WHERE codice = 'saldaturaOnda')
WHERE EXISTS (SELECT 1 FROM fasi WHERE codice = 'saldaturaOnda')
ON CONFLICT (codice) DO NOTHING;

-- costi di acquisto: solo con la spunta
UPDATE voci_costo SET formula_euro = 'se(acquistoLamina, prezzoLamina * se(nLamine > 0, nLamine, 1 + doppiaFaccia), 0)'
  WHERE codice = 'laminaSerigrafica' AND formula_euro = 'prezzoLamina * nLamine';
UPDATE voci_costo SET formula_euro = 'se(acquistoPcb, costoPcbScheda * nSchede, 0)'
  WHERE codice = 'valoreAcquistoPCB' AND formula_euro = 'costoPcbScheda * nSchede';
UPDATE voci_costo SET formula_euro = 'se(acquistoComponenti, costoComponentiScheda * nSchede, 0)'
  WHERE codice = 'valoreAcquistoComponenti' AND formula_euro = 'costoComponentiScheda * nSchede';
