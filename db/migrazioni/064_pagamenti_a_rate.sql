-- Pagamenti a rate (Adriano 3/11/2026): 30/60, 60/90, 30/60/90 per RiBa e bonifico, per clienti e fornitori.
-- Prima rata = data documento + giorni, poi una rata ogni "ogni" giorni; il totale si divide in parti uguali
-- (i centesimi che avanzano vanno sull'ultima rata). Fine mese vale per ogni rata.
ALTER TABLE condizioni_pagamento
  ADD COLUMN rate int NOT NULL DEFAULT 1 CHECK (rate BETWEEN 1 AND 12),
  ADD COLUMN ogni int NOT NULL DEFAULT 30 CHECK (ogni BETWEEN 1 AND 365);
COMMENT ON COLUMN condizioni_pagamento.rate IS 'Numero di rate (1 = pagamento unico)';
COMMENT ON COLUMN condizioni_pagamento.ogni IS 'Giorni tra una rata e la successiva';

INSERT INTO condizioni_pagamento (codice, descrizione, modalita, giorni, fine_mese, rate, ogni, ordine) VALUES
  ('BB_30_60FM', 'Bonifico bancario 30/60 gg f.m.', 'MP05', 30, true, 2, 30, 8),
  ('BB_60_90FM', 'Bonifico bancario 60/90 gg f.m.', 'MP05', 60, true, 2, 30, 9),
  ('BB_30_60_90FM', 'Bonifico bancario 30/60/90 gg f.m.', 'MP05', 30, true, 3, 30, 10),
  ('RB_30_60FM', 'RiBa 30/60 gg f.m.', 'MP12', 30, true, 2, 30, 11),
  ('RB_60_90FM', 'RiBa 60/90 gg f.m.', 'MP12', 60, true, 2, 30, 12),
  ('RB_30_60_90FM', 'RiBa 30/60/90 gg f.m.', 'MP12', 30, true, 3, 30, 13)
ON CONFLICT (codice) DO NOTHING;
