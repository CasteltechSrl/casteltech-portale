-- Adriano, 24/10/2026:
--  * SMD (TOP e BOT): attrezzaggio P&P 2 min a feeder (era 3), smontaggio 1 min a feeder (era 2);
--  * Informazioni generali → Produzione: "Campionatura" (ricarico al 35%) e "Variazione quantità";
--  * Lavorazioni: "Splicing" = un tape extender (0,30 €) per ogni feeder SMD, TOP e BOT;
--  * imballaggio: preparazione = 1 min a scatola + 10 s a busta; imballaggio 15 s a scheda (era 30);
--  * lamina std: costo 75 € (vendita 110 €);
--  * materiali: niente più "lead free" nei nomi (si usa solo quello); crema → pasta saldante.
-- Come per la 003: si cambia solo ciò che è ancora uguale al valore lasciato dalle migrazioni precedenti.
UPDATE parametri SET valore_default = 2 WHERE codice IN ('tempoAttrezPeP', 'tempoAttrezPePLatoB') AND valore_default IS NOT DISTINCT FROM 3;
UPDATE parametri SET valore_default = 1 WHERE codice IN ('tempoSmontaggio', 'tempoSmontaggioLatoB') AND valore_default IS NOT DISTINCT FROM 2;
UPDATE parametri SET valore_default = 75 WHERE codice = 'prezzoLamina' AND valore_default IS NOT DISTINCT FROM 91.6;
UPDATE parametri SET valore_default = 15 WHERE codice = 'tempoDiImballaggio' AND valore_default IS NOT DISTINCT FROM 30;

INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT * FROM (VALUES
  ('campionatura', 'Campionatura', '', 'INFORMAZIONI GENERALI', 0::numeric, 'Campionatura: il ricarico passa al 35%', 'si_no', -4.93),
  ('variazioneQuantita', 'Variazione quantità', '', 'INFORMAZIONI GENERALI', 0, 'Stesso prodotto già prodotto, cambia solo la quantità (niente 1ª produzione)', 'si_no', -4.92),
  ('usaSplicing', 'Splicing', '', 'INFORMAZIONI GENERALI', 0, 'Splicing: un tape extender per ogni feeder SMD (TOP e BOT)', 'si_no', -4.795)
) AS v(codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;

-- splicing: tape extender per feeder
INSERT INTO materiali (codice, descrizione, costo, um)
SELECT 'tapeExtender', 'Tape extender', 0.3, 'pz' WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;
INSERT INTO voci_costo (codice, nome, gruppo, formula_euro, una_tantum, ordine)
SELECT 'tapeExtender', 'Tape extender (splicing)', 'MATERIALE DI CONSUMO',
       'se(usaSplicing, (qtFeeder + doppiaFaccia * qtFeederLatoB) * prezzo_tapeExtender, 0)', false, ordine + 0.25
FROM voci_costo WHERE codice = 'materialeDiConsumo'
ON CONFLICT (codice) DO NOTHING;

-- imballaggio: preparazione in base a scatole e buste
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
SELECT v.codice, v.etichetta, v.unita, 'IMBALLAGGIO', v.valore_default, 'numero', p.ordine + v.dopo
FROM (VALUES ('minPrepScatola', 'Preparazione per scatola', 'min', 1::numeric, -0.2),
             ('secPrepBusta', 'Preparazione per busta', 's', 10, -0.1)) AS v(codice, etichetta, unita, valore_default, dopo)
JOIN parametri p ON p.codice = 'tempoPrepScatole'
ON CONFLICT (codice) DO NOTHING;
UPDATE fasi SET formula_secondi = 'cartoni * minPrepScatola * 60 + buste * secPrepBusta'
  WHERE codice = 'prepScatole' AND formula_secondi = 'tempoPrepScatole * nSchede';
UPDATE parametri p SET attivo = false WHERE p.codice = 'tempoPrepScatole'
  AND NOT EXISTS (SELECT 1 FROM fasi f WHERE f.attiva AND f.formula_secondi ~ '\mtempoPrepScatole\M');

-- nomi dei materiali
UPDATE materiali SET descrizione = 'Pasta saldante' WHERE codice = 'cremaLF' AND descrizione = 'Crema lead free';
UPDATE materiali SET descrizione = 'Stagno saldatrice' WHERE codice = 'stagnoSaldatriceLF' AND descrizione = 'Stagno per saldatrice LF';
UPDATE materiali SET descrizione = 'Stagno saldatrice (a reoforo)' WHERE codice = 'stagnoLF' AND descrizione = 'Stagno lead free';
