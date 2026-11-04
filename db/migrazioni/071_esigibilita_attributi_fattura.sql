-- Esigibilità IVA e attributi avanzati della fattura elettronica (Adriano 4/11/2026, come in Fatture in Cloud).
-- esigibilita_iva: I immediata, D differita, S scissione dei pagamenti; vuoto = automatica (S se il cliente è in split payment, altrimenti I).
-- attributi_xml: campi FatturaPA scelti a mano { "2.1.9.3": "VENDITA", ... } (src/engine/attributi-fatturapa.ts), scritti nell'XML all'emissione.
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS esigibilita_iva text CHECK (esigibilita_iva IN ('I', 'D', 'S'));
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS attributi_xml jsonb NOT NULL DEFAULT '{}'::jsonb;
