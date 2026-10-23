-- Gestione materiale a tempi standard per item (Adriano, 23/10/2026):
-- tempo fase = numero item (codici SMD + THT + PCB + altro) × tempo per item.
-- Controllo bolla 60 s, etichettatura 60 s, stoccaggio 30 s, estrazione 30 s, preparazione 30 s, chiusura 2 min.
-- Provenienza: solo due scelte (1 = del cliente da restituire, 2 = gestito a nostro magazzino); i valori 3 e 4
-- dei preventivi già salvati valgono come 2 (le formule usano "provenienzaMateriale != 1").
-- Come per la 003: si cambia solo ciò che è ancora uguale a come l'ha lasciato la 007.
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
SELECT * FROM (VALUES
  ('nItemMateriale', 'Numero item (codici SMD + THT + PCB + altro)', 'pz', 'GESTIONE MATERIALE', NULL::numeric, 'numero', 142),
  ('tempoControlloBolla', 'Controllo bolla e materiale per item', 's', 'GESTIONE MATERIALE', 60, 'numero', 143),
  ('tempoEtichettaturaItem', 'Etichettatura per item', 's', 'GESTIONE MATERIALE', 60, 'numero', 144),
  ('tempoStoccaggioItem', 'Stoccaggio in armadio per item', 's', 'GESTIONE MATERIALE', 30, 'numero', 145),
  ('tempoEstrazioneItem', 'Estrazione da magazzino per item', 's', 'GESTIONE MATERIALE', 30, 'numero', 146),
  ('tempoPreparazioneItem', 'Preparazione per la produzione per item', 's', 'GESTIONE MATERIALE', 30, 'numero', 147),
  ('minChiusuraItem', 'Chiusura sessione, conteggio e rientro per item', 'min', 'GESTIONE MATERIALE', 2, 'numero', 148)
) AS v(codice, etichetta, unita, gruppo, valore_default, tipo, ordine)
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;

UPDATE fasi SET formula_secondi = 'nItemMateriale * tempoControlloBolla'
  WHERE codice = 'controlloBollaLotto' AND formula_secondi = 'oreControlloBolla * 3600';
UPDATE fasi SET formula_secondi = 'se(provenienzaMateriale != 1, nItemMateriale * tempoEtichettaturaItem, 0)'
  WHERE codice = 'etichettaturaMateriale' AND formula_secondi = 'se(provenienzaMateriale != 1, oreEtichettaturaMateriale * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(provenienzaMateriale != 1, nItemMateriale * tempoStoccaggioItem, 0)'
  WHERE codice = 'stoccaggioMateriale' AND formula_secondi = 'se(provenienzaMateriale != 1, oreStoccaggioMateriale * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(provenienzaMateriale != 1, nItemMateriale * tempoEstrazioneItem, 0)'
  WHERE codice = 'estrazioneMateriale' AND formula_secondi = 'se(provenienzaMateriale != 1, oreEstrazioneMateriale * 3600, 0)';
UPDATE fasi SET formula_secondi = 'nItemMateriale * tempoPreparazioneItem'
  WHERE codice = 'preparazioneMateriale' AND formula_secondi = 'orePreparazioneMateriale * 3600';
UPDATE fasi SET formula_secondi = 'nItemMateriale * minChiusuraItem * 60'
  WHERE codice = 'chiusuraSessione' AND formula_secondi = 'oreChiusuraSessione * 3600';

-- le vecchie durate in h:mm non servono più (se nessuna fase o voce attiva le usa)
UPDATE parametri p SET attivo = false
  WHERE p.codice IN ('oreControlloBolla', 'oreEtichettaturaMateriale', 'oreStoccaggioMateriale', 'oreEstrazioneMateriale',
                     'orePreparazioneMateriale', 'oreChiusuraSessione')
    AND NOT EXISTS (SELECT 1 FROM fasi f WHERE f.attiva AND f.formula_secondi ~ ('\m' || p.codice || '\M'))
    AND NOT EXISTS (SELECT 1 FROM voci_costo v WHERE v.attiva AND v.formula_euro ~ ('\m' || p.codice || '\M'));
