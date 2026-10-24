-- Informazioni generali con 12 spunte (Adriano, 24/10/2026):
--  1ª produzione · TOP · TOP+BOT · THT saldatura ad onda · THT saldatura a mano · Componenti · PCB ·
--  Lamina std (110 € di vendita fissi) · Lamina con trattamenti (165 €) · Etichette (15 s a scheda + costo etichetta) ·
--  Pulizia saldature (2 min a scheda + 0,20 € di liquido) · Lavaggio schede (45 s a scheda + 0,10 € + 5 € a lotto).
-- Le voci possono avere un prezzo di vendita fisso (formula_prezzo): il ricarico non si applica.
-- Come per la 003: si cambia solo ciò che è ancora uguale al valore lasciato dalle migrazioni precedenti.
ALTER TABLE voci_costo ADD COLUMN IF NOT EXISTS formula_prezzo text;
ALTER TABLE voci_costo ALTER COLUMN ordine TYPE numeric;

-- spunte nel riquadro, nell'ordine indicato
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT * FROM (VALUES
  ('presenteSmd', 'TOP', '', 'INFORMAZIONI GENERALI', 1::numeric, 'Componenti SMD sul lato TOP', 'si_no', -4.89),
  ('laminaTrattamenti', 'Lamina con trattamenti', '', 'INFORMAZIONI GENERALI', 0, 'Lamina con trattamenti: 165 € di vendita fissi (senza ricarico), due con TOP+BOT', 'si_no', -4.82),
  ('etichette', 'Etichette', '', 'INFORMAZIONI GENERALI', 0, 'Etichettatura delle schede (15 s a scheda) e costo etichetta se non la fornisce il cliente', 'si_no', -4.81),
  ('puliziaSaldature', 'Pulizia saldature', '', 'INFORMAZIONI GENERALI', 0, 'Pulizia punti saldatura: 2 min a scheda + liquido 0,20 € a scheda', 'si_no', -4.80),
  ('lavaggioSchede', 'Lavaggio schede', '', 'INFORMAZIONI GENERALI', 0, 'Lavaggio: 45 s a scheda + liquido 0,10 € a scheda + 5 € a lotto di energia e avvio', 'si_no', -4.79)
) AS v(codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
WHERE EXISTS (SELECT 1 FROM fasi)
ON CONFLICT (codice) DO NOTHING;
UPDATE parametri SET ordine = -4.9, suggerimento = 'Prima produzione: si contano le programmazioni (SMD e/o saldatrice ad onda)' WHERE codice = 'primaProduzione';
UPDATE parametri SET gruppo = 'INFORMAZIONI GENERALI', etichetta = 'TOP+BOT', ordine = -4.88,
    suggerimento = 'SMD su due lati: raddoppiano programmazioni a lato e lamine, si attivano le fasi BOT'
  WHERE codice = 'doppiaFaccia' AND gruppo = 'LATI';
UPDATE parametri SET gruppo = 'INFORMAZIONI GENERALI', etichetta = 'THT saldatura ad onda', unita = '', ordine = -4.87,
    suggerimento = 'THT con saldatrice ad onda: tempi, energia, carrelli e programmazione'
  WHERE codice = 'usaOnda' AND gruppo = 'THT';
UPDATE parametri SET etichetta = 'THT saldatura a mano', ordine = -4.86,
    suggerimento = 'THT senza saldatrice: nessun costo legato alla saldatrice ad onda'
  WHERE codice = 'presenteTht' AND etichetta = 'THT';
UPDATE parametri SET etichetta = 'Componenti', ordine = -4.85, suggerimento = 'Acquisto componenti: tempo di acquisto e costo componenti'
  WHERE codice = 'acquistoComponenti' AND etichetta = 'Acquisto componenti';
UPDATE parametri SET etichetta = 'PCB', ordine = -4.84, suggerimento = 'Acquisto PCB: tempo di acquisto e costo PCB'
  WHERE codice = 'acquistoPcb' AND etichetta = 'Acquisto PCB';
UPDATE parametri SET etichetta = 'Lamina std', ordine = -4.83, suggerimento = 'Lamina standard: 110 € di vendita fissi (senza ricarico), due con TOP+BOT'
  WHERE codice = 'acquistoLamina' AND etichetta = 'Acquisto lamina';

-- tempi e costi collegati alle spunte
UPDATE parametri SET valore_default = 15 WHERE codice = 'targhette' AND valore_default IS NOT DISTINCT FROM 0;
UPDATE parametri SET valore_default = 120 WHERE codice = 'tempoPulizia' AND valore_default IS NOT DISTINCT FROM 0;
UPDATE parametri SET valore_default = 45 WHERE codice = 'tempoLavaggio' AND valore_default IS NOT DISTINCT FROM 0;
UPDATE parametri SET etichetta = 'Costo lamina std' WHERE codice = 'prezzoLamina' AND etichetta = 'Costo lamina';
INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT v.codice, v.etichetta, v.unita, v.gruppo, v.valore_default, v.suggerimento, 'numero', p.ordine + v.dopo
FROM (VALUES
  ('costoLiquidoLavaggio', 'Liquido lavaggio per scheda', '€', 'COMPLETAMENTO', 0.1::numeric, NULL, 'tempoLavaggio', 0.1),
  ('costoAvvioLavaggio', 'Energia e avvio lavaggio (a lotto)', '€', 'COMPLETAMENTO', 5, NULL, 'tempoLavaggio', 0.2),
  ('costoLiquidoPulizia', 'Liquido pulizia saldature per scheda', '€', 'COMPLETAMENTO', 0.2, NULL, 'tempoPulizia', 0.1),
  ('costoEtichetta', 'Costo etichette per scheda', '€', 'COMPLETAMENTO', 0, 'Solo se il cliente non le fornisce', 'targhette', 0.1),
  ('prezzoVenditaLamina', 'Prezzo vendita lamina std', '€', 'ACQUISTI', 110, 'Fisso, già ricaricato', 'prezzoLamina', 0.1),
  ('costoLaminaTrattata', 'Costo lamina con trattamenti', '€', 'ACQUISTI', NULL, 'Vuoto = come il prezzo di vendita', 'prezzoLamina', 0.2),
  ('prezzoVenditaLaminaTrattata', 'Prezzo vendita lamina con trattamenti', '€', 'ACQUISTI', 165, 'Fisso, già ricaricato', 'prezzoLamina', 0.3)
) AS v(codice, etichetta, unita, gruppo, valore_default, suggerimento, vicino, dopo)
JOIN parametri p ON p.codice = v.vicino
ON CONFLICT (codice) DO NOTHING;

-- fasi
UPDATE fasi SET formula_secondi = 'se(acquistoLamina + laminaTrattamenti > 0, oreAcquistoLamine * 3600, 0)'
  WHERE codice = 'acquistoLamine' AND formula_secondi = 'se(acquistoLamina, oreAcquistoLamine * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(primaProduzione * usaOnda > 0, oreProgOnda * 3600, 0)'
  WHERE codice = 'progOnda' AND formula_secondi = 'se(primaProduzione * presenteTht * usaOnda > 0, oreProgOnda * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(usaOnda > 0, minPrepCarrelli * 60, 0)'
  WHERE codice = 'prepCarrelli' AND formula_secondi = 'se(presenteTht * usaOnda > 0, minPrepCarrelli * 60, 0)';
UPDATE fasi SET formula_secondi = 'se(lavaggioSchede, tempoLavaggio * nSchede, 0)' WHERE codice = 'lavaggio' AND formula_secondi = 'tempoLavaggio * nSchede';
UPDATE fasi SET formula_secondi = 'se(puliziaSaldature, tempoPulizia * nSchede, 0)' WHERE codice = 'pulizia' AND formula_secondi = 'tempoPulizia * nSchede';
UPDATE fasi SET formula_secondi = 'se(etichette, targhette * nSchede, 0)' WHERE codice = 'etichettatura' AND formula_secondi = 'targhette * nSchede';

-- lamina a prezzo di vendita fisso
UPDATE voci_costo SET
    formula_euro = 'se(acquistoLamina + laminaTrattamenti > 0, se(nLamine > 0, nLamine, 1 + doppiaFaccia) * se(laminaTrattamenti, se(costoLaminaTrattata > 0, costoLaminaTrattata, prezzoVenditaLaminaTrattata), prezzoLamina), 0)',
    formula_prezzo = 'se(acquistoLamina + laminaTrattamenti > 0, se(nLamine > 0, nLamine, 1 + doppiaFaccia) * se(laminaTrattamenti, prezzoVenditaLaminaTrattata, prezzoVenditaLamina), 0)'
  WHERE codice = 'laminaSerigrafica' AND formula_euro = 'se(acquistoLamina, prezzoLamina * se(nLamine > 0, nLamine, 1 + doppiaFaccia), 0)';

-- nuove voci: etichette, liquido pulizia, lavaggio
INSERT INTO voci_costo (codice, nome, gruppo, formula_euro, una_tantum, ordine)
SELECT v.codice, v.nome, 'MATERIALE DI CONSUMO', v.formula, false, m.ordine + v.dopo
FROM (VALUES
  ('etichette', 'Etichette', 'se(etichette, costoEtichetta * nSchede, 0)', 0.1),
  ('liquidoPulizia', 'Liquido pulizia saldature', 'se(puliziaSaldature, costoLiquidoPulizia * nSchede, 0)', 0.2),
  ('lavaggio', 'Lavaggio (liquido, energia e avvio)', 'se(lavaggioSchede, costoLiquidoLavaggio * nSchede + costoAvvioLavaggio, 0)', 0.3)
) AS v(codice, nome, formula, dopo)
JOIN voci_costo m ON m.codice = 'materialeDiConsumo'
ON CONFLICT (codice) DO NOTHING;
