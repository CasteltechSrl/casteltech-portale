# Pannello "Portale Casteltech" dentro Gmail

Nel pannello a destra di Gmail ci sono le ultime mail con allegati e una casella di ricerca: si sceglie la mail
e compaiono tre tasti (se Gmail passa al pannello la mail aperta, i tasti compaiono anche direttamente):

- **Preventivo**: il testo della mail e gli allegati utili (BOM, pick and place, Gerber, zip…) vanno in
  Preventivi → Documenti del cliente. L'analisi parte da sola; il pannello dà il link "Apri nel portale".
- **Ordine**: la mail intera va in Ordini → Da acquisire e l'IA la legge come i file della cartella Drive.
- **Fattura estera**: la mail intera va in Amministrazione → Autofatture.

La stessa mail mandata due volte non entra due volte (Ordine e Fattura estera).

## Installazione (una volta sola)

### 1. La chiave sul portale
Render → casteltech-portale → Environment → aggiungi `GMAIL_ADDON_CHIAVE` con una frase lunga a caso
(almeno 20 caratteri, es. creata con un generatore di password). Salva: il portale si riavvia.

### 2. Lo script
1. Con l'account di Workspace che amministra casteltech.net apri https://script.google.com → **Nuovo progetto**,
   chiamalo "Portale Casteltech".
2. Impostazioni progetto (ingranaggio) → spunta **Mostra il file manifest "appsscript.json" nell'editor**.
3. Nell'editor: incolla il contenuto di `appsscript.json` al posto di quello che c'è, e il contenuto di `Codice.gs`
   al posto di `Codice.gs`. Se l'indirizzo del portale non è `https://casteltech-portale.onrender.com`, cambialo
   in `urlFetchWhitelist` (con la `/` finale).
4. Impostazioni progetto → **Proprietà script** → aggiungi:
   - `PORTALE_URL` = indirizzo del portale (es. `https://casteltech-portale.onrender.com`)
   - `PORTALE_CHIAVE` = la stessa frase scritta su Render.

### 3. Prova (solo per te)
Esegui il deployment → **Testa i deployment** → Applicazione: Gmail → **Installa**. Ricarica Gmail: a destra compare
l'icona del pannello. Premi "Prova il collegamento": deve rispondere "Collegato al portale come …".

### 4. Per tutto l'ufficio
Lo script resta sul progetto Google standard: **non** collegarlo a un progetto Google Cloud proprio (29/10/2026: dopo il
collegamento Gmail non faceva più partire il pannello e il cambio non si annulla).
1. Nello script: Condividi → aggiungi i colleghi dell'ufficio come **Editor** (vedono anche la chiave: solo personale fidato).
2. Ogni collega, con il suo account: apre lo script → Esegui il deployment → Testa i deployment → **Installa**, poi ricarica Gmail
   e concede i permessi (se compare "Google non ha verificato l'app": Avanzate → Vai a…).

Quando si cambia `Codice.gs`: incolla la versione nuova e fai Gestisci deployment → modifica → Nuova versione.

## Cosa sa fare e cosa no
- Gli allegati che Gmail mostra come link a Google Drive (file oltre 25 MB) non sono allegati veri: non arrivano.
  Scaricali dal Drive e caricali da Preventivi → Documenti del cliente.
- PDF, modelli 3D, immagini e file oltre 25 MB restano solo nell'elenco dei file, come quando si carica una cartella.
- Il cliente del preventivo si riconosce dal mittente (stessa email o stesso dominio di un cliente del CRM o dell'anagrafica);
  se non è sicuro resta da scegliere nel portale.
