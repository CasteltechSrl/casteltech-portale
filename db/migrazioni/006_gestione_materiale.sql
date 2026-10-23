-- Gestione materiale in una sezione unica (Adriano, 23/10/2026).
-- Provenienza del materiale (parametro provenienzaMateriale):
--   1 = del cliente, da restituire: controllo bolla, estrazione, chiusura a ogni lotto + reso al cliente (10' in imballaggio);
--   2 = del cliente, gestito a nostro magazzino;  3 = acquistato da noi:
--       controllo bolla, etichettatura (software magazzino) e stoccaggio solo quando il materiale si riordina
--       (primo lotto), estrazione e chiusura a ogni lotto.
-- I tempi li scrive l'operatore (nessun valore standard), tranne il reso al cliente (10 min).
-- Tolte le vecchie fasi 1T/1B/13 (controllo materiale per feeder / per tipologia THT) e spostate qui
-- etichettatura (era in pre-produzione) e chiusura sessione (era nel gruppo AOI/SMD).
-- Come per la 003: si cambia solo ciò che è ancora uguale al valore iniziale.
-- Database nuovo (catalogo ancora vuoto): non si fa nulla, ci pensa il primo avvio con il catalogo iniziale.

-- ── parametri ──
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT * FROM (VALUES
  ('provenienzaMateriale', 'Provenienza del materiale', '', 'GESTIONE MATERIALE', 1::numeric, NULL, 'numero', 141),
  ('oreControlloBolla', 'Controllo bolla e materiale arrivato', 'h', 'GESTIONE MATERIALE', NULL, NULL, 'durata', 142),
  ('oreStoccaggioMateriale', 'Stoccaggio in armadio / magazzino', 'h', 'GESTIONE MATERIALE', NULL, NULL, 'durata', 144),
  ('oreEstrazioneMateriale', 'Estrazione e preparazione per la produzione', 'h', 'GESTIONE MATERIALE', NULL, NULL, 'durata', 145),
  ('oreChiusuraSessione', 'Chiusura sessione, conteggio e rientro avanzi', 'h', 'GESTIONE MATERIALE', NULL, NULL, 'durata', 146),
  ('minResoMateriale', 'Reso materiale avanzato al cliente (a lotto)', 'min', 'IMBALLAGGIO', 10, 'Solo con materiale del cliente da restituire', 'numero', 0)
) AS v(codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;
UPDATE parametri SET ordine = (SELECT ordine + 1 FROM parametri WHERE codice = 'tempoDiImballaggio')
  WHERE codice = 'minResoMateriale' AND EXISTS (SELECT 1 FROM parametri WHERE codice = 'tempoDiImballaggio');
UPDATE parametri SET gruppo = 'GESTIONE MATERIALE', etichetta = 'Etichettatura (software magazzino)', ordine = 143
  WHERE codice = 'oreEtichettaturaMateriale' AND gruppo = 'PRE-PRODUZIONE';

-- ── fasi nuove ──
INSERT INTO fasi (codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine)
SELECT * FROM (VALUES
  ('controlloBollaLotto', 'M1', 'Controllo bolla e materiale (materiale da restituire)', 'GESTIONE MATERIALE',
     'se(provenienzaMateriale == 1, oreControlloBolla * 3600, 0)', 1::numeric, 'produzione', false, 'fisso', 121),
  ('controlloBollaArrivo', 'M1', 'Controllo bolla e materiale all''arrivo', 'GESTIONE MATERIALE',
     'se(provenienzaMateriale != 1, oreControlloBolla * 3600, 0)', 1, 'produzione', true, 'fisso', 122),
  ('stoccaggioMateriale', 'M3', 'Stoccaggio in armadio / magazzino', 'GESTIONE MATERIALE',
     'se(provenienzaMateriale != 1, oreStoccaggioMateriale * 3600, 0)', 1, 'produzione', true, 'fisso', 124),
  ('estrazioneMateriale', 'M4', 'Estrazione e preparazione materiale per la produzione', 'GESTIONE MATERIALE',
     'oreEstrazioneMateriale * 3600', 1, 'produzione', false, 'fisso', 125),
  ('resoMaterialeCliente', '36R', 'Reso materiale avanzato al cliente', 'IMBALLAGGIO',
     'se(provenienzaMateriale == 1, minResoMateriale * 60, 0)', 1, 'produzione', false, 'fisso', 0)
) AS v(codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine)
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;
UPDATE fasi SET ordine = (SELECT ordine + 1 FROM fasi WHERE codice = 'imballaggio')
  WHERE codice = 'resoMaterialeCliente' AND EXISTS (SELECT 1 FROM fasi WHERE codice = 'imballaggio');

-- ── etichettatura: da pre-produzione (ufficio) a gestione materiale (solo casi 2 e 3, primo lotto) ──
UPDATE fasi SET numero = 'M2', nome = 'Etichettatura materiale (software magazzino)', gruppo = 'GESTIONE MATERIALE',
    formula_secondi = 'se(provenienzaMateriale != 1, oreEtichettaturaMateriale * 3600, 0)', tariffa = 'produzione',
    una_tantum = true, ordine = 123
  WHERE codice = 'etichettaturaMateriale' AND formula_secondi = 'oreEtichettaturaMateriale * 3600';

-- ── chiusura sessione: da AOI a gestione materiale, tempo in h:mm scritto dall'operatore ──
UPDATE fasi SET numero = 'M5', nome = 'Chiusura sessione, conteggio e rientro avanzi', gruppo = 'GESTIONE MATERIALE',
    formula_secondi = 'oreChiusuraSessione * 3600', ordine = 126
  WHERE codice = 'chiusuraSessione' AND formula_secondi = 'minChiusuraSessione * 60';

-- ── vecchio controllo materiale per feeder / per tipologia THT: sostituito dalle fasi M1 ──
UPDATE fasi SET attiva = false WHERE codice = 'materialeTop' AND formula_secondi = 'se(qtSmd > 0, qtFeeder * tempoContMateriale, 0)';
UPDATE fasi SET attiva = false WHERE codice = 'materialeBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, qtFeederLatoB * tempoContMaterialeLatoB, 0)';
UPDATE fasi SET attiva = false WHERE codice = 'materialeTht' AND formula_secondi = 'tempoControlloMateriale * qtTipolTht';

-- parametri non più usati da nessuna fase o voce attiva
UPDATE parametri p SET attivo = false
  WHERE p.codice IN ('tempoContMateriale', 'tempoContMaterialeLatoB', 'tempoControlloMateriale', 'minChiusuraSessione')
    AND NOT EXISTS (SELECT 1 FROM fasi f WHERE f.attiva AND f.formula_secondi ~ ('\m' || p.codice || '\M'))
    AND NOT EXISTS (SELECT 1 FROM voci_costo v WHERE v.attiva AND v.formula_euro ~ ('\m' || p.codice || '\M'));
