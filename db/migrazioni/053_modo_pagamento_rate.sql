-- Modo di pagamento delle rate (Adriano 31/10/2026): oltre al conto (es. Bper) si sceglie come è stata pagata o incassata
-- (bonifico, Ri.Ba., bancomat, carta di credito, PayPal, compensata con fattura, stornata).
ALTER TABLE documenti_scadenze ADD COLUMN IF NOT EXISTS modo text;
ALTER TABLE documenti_ricevuti_scadenze ADD COLUMN IF NOT EXISTS modo text;
