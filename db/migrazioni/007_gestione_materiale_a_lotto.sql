-- Gestione materiale rivista (Adriano, 23/10/2026):
--  * tutto a ogni lotto anche con materiale a nostro magazzino (casi 2 e 3): quasi sempre qualcosa finisce
--    e va ricaricato, quindi controllo bolla, etichettatura e stoccaggio non sono più "solo 1° lotto";
--  * materiale del cliente da restituire (caso 1): non passa dal magazzino, quindi niente estrazione;
--    l'estrazione da magazzino si separa dalla preparazione per la produzione (che c'è sempre).
-- Come per la 003: si cambia solo ciò che è ancora uguale a come l'ha lasciato la 006.

-- controllo bolla: una sola fase, a ogni lotto, per tutti i casi
UPDATE fasi SET nome = 'Controllo bolla e materiale arrivato', formula_secondi = 'oreControlloBolla * 3600'
  WHERE codice = 'controlloBollaLotto' AND formula_secondi = 'se(provenienzaMateriale == 1, oreControlloBolla * 3600, 0)';
UPDATE fasi SET attiva = false
  WHERE codice = 'controlloBollaArrivo' AND formula_secondi = 'se(provenienzaMateriale != 1, oreControlloBolla * 3600, 0)';

-- etichettatura e stoccaggio a ogni lotto
UPDATE fasi SET una_tantum = false
  WHERE codice = 'etichettaturaMateriale' AND formula_secondi = 'se(provenienzaMateriale != 1, oreEtichettaturaMateriale * 3600, 0)';
UPDATE fasi SET una_tantum = false
  WHERE codice = 'stoccaggioMateriale' AND formula_secondi = 'se(provenienzaMateriale != 1, oreStoccaggioMateriale * 3600, 0)';

-- estrazione solo dal nostro magazzino (casi 2 e 3); preparazione per la produzione sempre
UPDATE fasi SET nome = 'Estrazione da magazzino', formula_secondi = 'se(provenienzaMateriale != 1, oreEstrazioneMateriale * 3600, 0)'
  WHERE codice = 'estrazioneMateriale' AND formula_secondi = 'oreEstrazioneMateriale * 3600';
UPDATE parametri SET etichetta = 'Estrazione da magazzino'
  WHERE codice = 'oreEstrazioneMateriale' AND etichetta = 'Estrazione e preparazione per la produzione';
UPDATE parametri SET ordine = 147 WHERE codice = 'oreChiusuraSessione' AND ordine = 146;
UPDATE fasi SET numero = 'M6', ordine = 127 WHERE codice = 'chiusuraSessione' AND numero = 'M5' AND ordine = 126;
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
SELECT 'orePreparazioneMateriale', 'Preparazione materiale per la produzione', 'h', 'GESTIONE MATERIALE', NULL, 'durata', 146
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;
INSERT INTO fasi (codice, numero, nome, gruppo, formula_secondi, persone_default, tariffa, una_tantum, scala, ordine)
SELECT 'preparazioneMateriale', 'M5', 'Preparazione materiale per la produzione', 'GESTIONE MATERIALE',
       'orePreparazioneMateriale * 3600', 1, 'produzione', false, 'fisso', 126
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;
