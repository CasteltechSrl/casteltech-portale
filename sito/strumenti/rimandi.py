"""
Pagine di rimando dai vecchi indirizzi del WordPress (es. /assemblaggio-smd/) alle sezioni del sito nuovo (/#smd).
Il sito nuovo è una sola pagina con le sezioni dopo il "#": un rimando del server non può portare il "#", quindi ogni vecchio
indirizzo è una paginetta che porta subito alla sezione giusta (e dice a Google qual è la pagina nuova).
Uso: python3 sito/strumenti/rimandi.py   (riscrive le cartelle dei rimandi dentro sito/pubblico)
"""
import os
QUI = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(QUI, "..", "pubblico")
RIMANDI = {
    "assemblaggio-smd": "smd", "assemblaggio-tht": "tht", "collaudo": "collaudo", "revisione": "rework",
    "programmazione": "programmazione", "gestione-componenti": "componenti", "competenze": "produzione", "esd": "qualita",
    "storia": "storia", "contact": "contatti", "richiedi-un-preventivo": "preventivo", "lavora-con-noi": "lavora-con-noi",
    "stampa-3d": "stampa-3d", "informativa-clienti-e-fornitori": "privacy",
    "portfolio_page/montaggio-smd": "smd", "portfolio_page/pick-and-place": "smd", "portfolio_page/forno": "smd",
    "portfolio_page/casteltech": "azienda", "portfolio_page/distributori-automatici": "chiavi-in-mano",
}
PAGINA = """<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Casteltech</title>
<link rel="canonical" href="https://www.casteltech.net/">
<meta http-equiv="refresh" content="0; url=/#{sezione}">
<script>location.replace('/#{sezione}');</script>
</head><body><p><a href="/#{sezione}">Vai alla pagina</a></p></body></html>
"""
def scrivi(percorso, sezione):
    cartella = os.path.join(PUB, percorso)
    os.makedirs(cartella, exist_ok=True)
    open(os.path.join(cartella, "index.html"), "w", encoding="utf8").write(PAGINA.format(sezione=sezione))
for vecchio, sezione in RIMANDI.items():
    scrivi(vecchio, sezione)
    scrivi("en/" + vecchio, sezione)          # la versione inglese non c'è più: si va alla pagina italiana
scrivi("en", "home")
# il vecchio indirizzo .html dell'informativa
open(os.path.join(PUB, "informativa-clienti-e-fornitori.html"), "w", encoding="utf8").write(PAGINA.format(sezione="privacy"))
print(len(RIMANDI) * 2 + 2, "rimandi scritti")
