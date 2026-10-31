-- Fatture alla pubblica amministrazione e altri tipi di fattura (Adriano, 31/10/2026).
-- PA (es. INFN): formato FPA12, codice ufficio di 6 caratteri, CIG/CUP e data dell'ordine in DatiOrdineAcquisto,
-- split payment (EsigibilitaIVA S: il cliente paga solo l'imponibile, l'IVA la versa lui).
-- Tipi SdI: TD24 differita (scelta da sola se la fattura cita DDT con data precedente), TD02 acconto, TD26 beni ammortizzabili,
-- TD05 nota di debito (da una fattura emessa, come la nota di credito). Vedi src/engine/tipi-fattura.ts.
ALTER TABLE documenti
  ADD COLUMN IF NOT EXISTS cig         text,     -- codice identificativo gara (10 caratteri), dall'ordine della PA
  ADD COLUMN IF NOT EXISTS cup         text,     -- codice unico di progetto (15 caratteri), se l'ordine lo indica
  ADD COLUMN IF NOT EXISTS data_ordine date;     -- data dell'ordine del cliente (DatiOrdineAcquisto/Data)

-- riga del saldo che scala una fattura d'acconto (TD02): l'acconto è "usato" quando una fattura non annullata lo cita
ALTER TABLE documenti_righe ADD COLUMN IF NOT EXISTS acconto_id int REFERENCES documenti(id);
CREATE INDEX IF NOT EXISTS documenti_righe_acconto ON documenti_righe (acconto_id) WHERE acconto_id IS NOT NULL;

-- fatture di fornitori e consulenti con ritenuta d'acconto e cassa previdenziale (lette dall'XML)
ALTER TABLE documenti_ricevuti
  ADD COLUMN IF NOT EXISTS ritenuta       numeric NOT NULL DEFAULT 0,   -- da versare con F24 entro il 16 del mese dopo il pagamento
  ADD COLUMN IF NOT EXISTS tipo_ritenuta  text,                         -- RT01 persone fisiche, RT02 persone giuridiche, RT03 INPS…
  ADD COLUMN IF NOT EXISTS causale_ritenuta text,                       -- causale del modello 770 (A = lavoro autonomo…)
  ADD COLUMN IF NOT EXISTS cassa          numeric NOT NULL DEFAULT 0,   -- contributo cassa previdenziale / rivalsa (già nell'imponibile)
  ADD COLUMN IF NOT EXISTS netto_a_pagare numeric;                      -- totale meno ritenuta (vuoto = totale)
