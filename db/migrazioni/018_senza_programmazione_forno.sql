-- Adriano, 24/10/2026: niente programmazione del profilo forno (né nel preventivo né sulla scheda di produzione).
-- I preventivi già salvati restano come sono (hanno la loro fotografia del catalogo).
UPDATE fasi SET attiva = false WHERE codice = 'progForno';
UPDATE parametri SET attivo = false WHERE codice = 'oreProgForno';
