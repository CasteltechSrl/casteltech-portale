# Casteltech — portale preventivi e produzione

Preventivi, schede di produzione con QR code, consuntivi, storico prodotto e collegamento con mOKa.
Sostituirà il vecchio portale `portalepreventivicasteltech.ovh`, che resta attivo fino al passaggio completo.

## Come è fatto (in parole semplici)

| Cartella | Cosa contiene |
|---|---|
| `src/engine/` | **Il cuore dei calcoli.** `calcolo.ts` = preventivo; `consuntivo.ts` = confronto preventivo/produzione e prezzo corretto; `espressioni.ts` = le formule scritte nel pannello. |
| `src/catalogo/` | Fasi, parametri, materiali e voci di costo **iniziali** (poi si modificano dal pannello). `legacy.ts` = vecchio portale, `iniziale.ts` = nuove fasi della scheda di produzione. |
| `db/migrazioni/` | Struttura del database, con le spiegazioni di ogni tabella. |
| `tests/` | Controlli automatici: girano a ogni modifica. |
| `src/server/` | Il sito: pagine, login, salvataggi. |
| `public/` | Stile grafico e script delle pagine. |
| `tools/` | Verifiche e import dei dati del vecchio portale. |
| `render.yaml` | Configurazione della pubblicazione su Render. |

## Regole di calcolo

- **Tempo ciclo** = quanto resta impegnata la fase/linea. **Tempo uomo** = tempo ciclo × persone.
- Costo fase = ore ciclo × costo orario azienda + ore uomo × costo orario operatore
  (azienda 25 €/h + produzione 15 €/h per persona, oppure + ufficio 20 €/h per la pre-produzione — modificabili).
- Prezzo = costo × ricarico. Le fasi/voci "una tantum" entrano solo nel primo lotto.
- Di default 2 persone su Serigrafia + P&P (TOP e BOT), Forno (fuori linea), Saldatura ad onda (modificabile per fase e per preventivo).
- Pre-produzione = costi una tantum di avvio produzione.
- Energia: forno 6 € di preriscaldamento a lotto + 0,40 €/h di fase; onda 20 € + 0,40 €/h (solo se la fase c'è).
- In produzione ogni riga della scheda indica il numero di persone: il sistema ricava ciclo e uomo reali.
  Le righe segnate **P** (problema contingente, confermato dall'ufficio) non entrano nel prezzo corretto.

## Verifiche fatte sul vecchio portale (dump del 21/10/2026, 1.180 preventivi)

- Il nuovo motore, con il catalogo del vecchio portale, dà **gli stessi totali al centesimo** su tutti i 1.093
  preventivi con totali aggiornati. Gli altri 87 hanno totali salvati non aggiornati (il vecchio portale
  ricalcolava solo aprendo la pagina "calcola"): `npx tsx tools/diagnosi-legacy.ts <preventivi.json>`.
- La formula del materiale di consumo coincide su tutti i 930 preventivi verificabili.

## Comandi

```bash
npm install          # installa le dipendenze
npm test             # controlli automatici
npm run verifica     # controllo dei tipi TypeScript
npm run verifica-legacy -- percorso/preventivi.json
npm run importa-legacy -- percorso/preventivi.json   # serve DATABASE_URL
npm run dev          # sito in locale (serve PostgreSQL e le variabili in CLAUDE.md)
```
