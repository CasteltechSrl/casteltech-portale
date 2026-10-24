-- Adriano, 24/10/2026: costo della lamina con trattamenti 110 €; "1ª produzione" non spuntata di default
-- (spesso si rifà il preventivo solo per cambiare le quantità).
UPDATE parametri SET valore_default = 110 WHERE codice = 'costoLaminaTrattata' AND valore_default IS NULL;
UPDATE parametri SET valore_default = 0 WHERE codice = 'primaProduzione' AND valore_default IS NOT DISTINCT FROM 1;
