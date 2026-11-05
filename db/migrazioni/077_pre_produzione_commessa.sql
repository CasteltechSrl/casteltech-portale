-- Scheda di pre-produzione della commessa (Adriano 5/11/2026): checklist di verifica con chi conferma e quando,
-- "cosa fare / cosa non fare" scritti dall'ufficio, componenti segnati "già in casa" e via libera alla produzione.
-- Tutto in un jsonb sulla commessa (vedi `engine/pre-produzione.ts`): la pagina legge il resto da preventivo, documenti,
-- BOM quotata e ordini a fornitore.
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS pre_produzione jsonb NOT NULL DEFAULT '{}'::jsonb;
