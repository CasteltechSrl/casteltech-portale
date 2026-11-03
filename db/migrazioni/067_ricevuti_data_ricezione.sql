-- Registro acquisti (Adriano 3/11/2026): il protocollo è progressivo per DATA DI RICEZIONE del documento, non per data della fattura.
-- ricevuto_il = giorno in cui la fattura è arrivata (SdI: data di arrivo in Invoicetronic; caricate a mano: giorno del caricamento;
-- spese senza fattura elettronica: la loro data). Storico di Fatture in Cloud: vuoto, vale la data del documento.
ALTER TABLE documenti_ricevuti ADD COLUMN IF NOT EXISTS ricevuto_il date DEFAULT ((now() AT TIME ZONE 'Europe/Rome')::date);
UPDATE documenti_ricevuti SET ricevuto_il = NULL WHERE origine = 'fic';
UPDATE documenti_ricevuti SET ricevuto_il = data WHERE origine = 'manuale';
UPDATE documenti_ricevuti SET ricevuto_il = greatest(data, (creato_il AT TIME ZONE 'Europe/Rome')::date) WHERE origine IN ('sdi', 'acquisito');
COMMENT ON COLUMN documenti_ricevuti.ricevuto_il IS 'Data di ricezione: ordina il protocollo e decide mese e anno nel registro acquisti (vuota = data del documento).';
