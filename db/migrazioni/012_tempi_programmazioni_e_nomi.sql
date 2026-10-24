-- Ritocchi del 24/10/2026 (Adriano):
--  * tempi standard delle programmazioni (solo prima produzione): armadi 15', file P&P 30', P&P 1h, serigrafia 30',
--    profilo forno 10', AOI 2h, saldatrice ad onda 15';
--  * saldatrice ad onda: 15' di preparazione carrelli a ogni produzione; preriscaldamento 10 € (accensione divisa
--    tra più prodotti); +20% di scorie sullo stagno della saldatrice (reofori e peso);
--  * conformal coating e potting in un'unica voce; pulizia = pulizia punti saldatura;
--  * nomi più corti (il testo completo compare passando sopra con il mouse).
-- Come per la 003: si cambia solo ciò che è ancora uguale al valore lasciato dalle migrazioni precedenti.

-- tempi standard delle programmazioni
UPDATE parametri SET valore_default = 0.25 WHERE codice = 'oreProgArmadi' AND valore_default IS NULL;
UPDATE parametri SET valore_default = 0.5 WHERE codice = 'oreFilePeP' AND valore_default IS NULL;
UPDATE parametri SET valore_default = 1 WHERE codice = 'oreProgPeP' AND valore_default IS NULL;
UPDATE parametri SET valore_default = 0.16666666666666666 WHERE codice = 'oreProgForno' AND valore_default IS NULL;
UPDATE parametri SET valore_default = 2 WHERE codice = 'oreProgAOI' AND valore_default IS NOT DISTINCT FROM 1.5;
UPDATE parametri SET valore_default = 0.25 WHERE codice = 'oreProgOnda' AND valore_default IS NULL;

-- saldatrice ad onda: preparazione carrelli a ogni produzione
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
SELECT 'minPrepCarrelli', 'Preparazione carrelli saldatrice (a lotto)', 'min', 'THT', 15, 'numero', ordine + 0.5
FROM parametri WHERE codice = 'cadenzaOnda'
ON CONFLICT (codice) DO NOTHING;
INSERT INTO fasi (codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine)
SELECT 'prepCarrelli', '17C', 'Preparazione carrelli saldatrice', 'THT', 'se(presenteTht * usaOnda > 0, minPrepCarrelli * 60, 0)',
       1, 'produzione', false, 'fisso', ordine - 0.25
FROM fasi WHERE codice = 'saldaturaOnda'
ON CONFLICT (codice) DO NOTHING;
UPDATE parametri SET valore_default = 10, suggerimento = 'Accensione divisa tra più prodotti'
  WHERE codice = 'preriscaldamentoOnda' AND valore_default IS NOT DISTINCT FROM 25;

-- scorie della saldatrice: +20% sullo stagno (reofori e peso)
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT 'scorieSaldatrice', 'Scorie stagno saldatrice', '%', 'MATERIALE DI CONSUMO', 20,
       'Si aggiungono allo stagno della saldatrice (reofori e peso)', 'numero', ordine + 0.5
FROM parametri WHERE codice = 'stagnoPerSaldature'
ON CONFLICT (codice) DO NOTHING;
UPDATE voci_costo SET formula_euro = replace(replace(formula_euro,
    'prezzo_stagnoLF * qta_stagnoLF * stagno * nSchede', 'prezzo_stagnoLF * qta_stagnoLF * stagno * (1 + scorieSaldatrice / 100) * nSchede'),
    'prezzo_stagnoSaldatriceLF * stagnoPerSaldature * nSchede', 'prezzo_stagnoSaldatriceLF * stagnoPerSaldature * (1 + scorieSaldatrice / 100) * nSchede')
  WHERE codice = 'materialeDiConsumo'
    AND strpos(formula_euro, 'prezzo_stagnoLF * qta_stagnoLF * stagno * nSchede') > 0
    AND strpos(formula_euro, 'prezzo_stagnoSaldatriceLF * stagnoPerSaldature * nSchede') > 0
    AND EXISTS (SELECT 1 FROM parametri WHERE codice = 'scorieSaldatrice');

-- nomi del materiale di consumo
UPDATE parametri SET etichetta = 'Pasta saldante per scheda' WHERE codice = 'crema' AND etichetta = 'Crema saldante per scheda';
UPDATE parametri SET etichetta = 'Stagno saldatrice per scheda', unita = 'reofori'
  WHERE codice = 'stagno' AND etichetta = 'Stagno lead free (reofori per scheda)';
UPDATE parametri SET etichetta = 'Stagno saldatrice in peso per scheda'
  WHERE codice = 'stagnoPerSaldature' AND etichetta = 'Stagno saldatrice per scheda';

-- conformal coating e potting in un'unica voce
UPDATE fasi SET nome = 'Conformal coating / potting' WHERE codice = 'conformalCoating' AND nome = 'Conformal coating';
UPDATE parametri SET etichetta = 'Conformal coating / potting per scheda' WHERE codice = 'tropicalizzazione' AND etichetta = 'Conformal coating per scheda';
UPDATE fasi SET attiva = false WHERE codice = 'potting' AND formula_secondi = 'tempoPotting * nSchede';
UPDATE parametri p SET attivo = false WHERE p.codice = 'tempoPotting'
  AND NOT EXISTS (SELECT 1 FROM fasi f WHERE f.attiva AND f.formula_secondi ~ '\mtempoPotting\M');

-- pulizia = pulizia punti saldatura
UPDATE fasi SET nome = 'Pulizia punti saldatura' WHERE codice = 'pulizia' AND nome = 'Pulizia schede';
UPDATE parametri SET etichetta = 'Pulizia punti saldatura per scheda' WHERE codice = 'tempoPulizia' AND etichetta = 'Pulizia per scheda';

-- informazioni generali: nomi corti, spiegazione al passaggio del mouse
UPDATE parametri SET etichetta = '1ª produzione', suggerimento = 'Prima produzione: si contano le programmazioni'
  WHERE codice = 'primaProduzione' AND etichetta = 'Prima produzione (programmazioni)';
UPDATE parametri SET etichetta = 'THT', suggerimento = 'Presente THT: mostra la sezione THT'
  WHERE codice = 'presenteTht' AND etichetta = 'Presente THT';
