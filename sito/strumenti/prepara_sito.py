"""Trasforma la copia scaricata con wget di www.casteltech.net in pagine statiche pronte per Render.
Uso: python3 -I prepara_sito.py <cartella wget www.casteltech.net> <cartella di destinazione>"""
import os, re, shutil, sys

SRC, DST = sys.argv[1], sys.argv[2]
DOM = 'www.casteltech.net'
TESTO = ('.html', '.css', '.js', '.json', '.xml', '.txt', '.svg')

if os.path.exists(DST):
    shutil.rmtree(DST)

def nome_pulito(n):
    # wget salva "style.css?ver=6.5" (o "...?ver=6.5.css" con --adjust-extension): il server statico ignora la query
    if '?' not in n:
        return n
    base, q = n.split('?', 1)
    if base.endswith('/') or base == '' or base == 'index.html':
        return None   # pagine "?p=123": doppioni delle pagine vere
    return base

copiati = {}
for radice, cartelle, file in os.walk(SRC):
    rel = os.path.relpath(radice, SRC)
    if rel.split(os.sep)[0] in ('wp-json', 'feed', 'comments', 'xmlrpc.php'):
        continue
    for f in file:
        n = nome_pulito(f)
        if not n:
            continue
        if re.search(r'(^|/)(wp-json|feed)(/|$)', rel.replace(os.sep, '/')):
            continue
        a = os.path.join(radice, f)
        b = os.path.normpath(os.path.join(DST, rel, n))
        # se due versioni dello stesso file: tiene la più recente scaricata (più grande come ripiego)
        if b in copiati and os.path.getmtime(copiati[b]) >= os.path.getmtime(a):
            continue
        os.makedirs(os.path.dirname(b), exist_ok=True)
        shutil.copy2(a, b)
        copiati[b] = a

PORTALE = 'https://casteltech-portale.onrender.com'

def pulisci_html(h):
    # commenti di W3 Total Cache e dei plugin
    h = re.sub(r'<!--\s*Performance optimized by W3 Total Cache.*?-->', '', h, flags=re.S)
    # collegamenti che servono solo a WordPress
    h = re.sub(r'<link[^>]+rel=["\'](?:https://api\.w\.org/|EditURI|pingback|shortlink|wlwmanifest)["\'][^>]*>\s*', '', h)
    h = re.sub(r'<link[^>]+(?:wp-json|oembed|xmlrpc)[^>]*>\s*', '', h)
    h = re.sub(r'<meta[^>]+name=["\']generator["\'][^>]*>\s*', '', h)
    # emoji di WordPress
    h = re.sub(r'<script[^>]*>\s*window\._wpemojiSettings.*?</script>\s*', '', h, flags=re.S)
    h = re.sub(r'<script[^>]+wp-emoji[^>]*></script>\s*', '', h)
    # Contact Form 7 e reCAPTCHA: i moduli li manda moduli.js al portale
    h = re.sub(r'<script[^>]+src=["\'][^"\']*(?:contact-form-7/includes|recaptcha|google\.com/recaptcha)[^"\']*["\'][^>]*></script>\s*', '', h)
    h = re.sub(r'<script[^>]+id=["\'](?:contact-form-7|wpcf7-recaptcha|google-recaptcha)[^"\']*-js(?:-extra|-before|-after)?["\'][^>]*>.*?</script>\s*', '', h, flags=re.S)
    # indirizzi del sito: relativi, così le pagine funzionano anche sull'anteprima di Render
    for pre in ('https://' + DOM, 'http://' + DOM, '//' + DOM):
        h = h.replace(pre + '/', '/').replace(pre + '"', '/"').replace(pre + "'", "/'")
        h = h.replace(pre.replace('/', '\\/') + '\\/', '\\/')
    # ...tranne canonical, hreflang e og:url, che per Google devono restare con il dominio vero
    h = re.sub(r'(<link[^>]+rel=["\'](?:canonical|alternate)["\'][^>]*href=["\'])/', r'\1https://' + DOM + '/', h)
    h = re.sub(r'(<link[^>]+href=["\'])/([^"\']*["\'][^>]*rel=["\'](?:canonical|alternate)["\'])', r'\1https://' + DOM + r'/\2', h)
    h = re.sub(r'(<meta[^>]+property=["\']og:url["\'][^>]*content=["\'])/', r'\1https://' + DOM + '/', h)
    h = re.sub(r'(<meta[^>]+content=["\'])/([^"\']*["\'][^>]*property=["\']og:url["\'])', r'\1https://' + DOM + r'/\2', h)
    # query ?ver= sui file: non servono (restano innocue, ma i nomi dei file non le hanno più)
    # moduli: script del portale prima di </body>
    if 'wpcf7-form' in h:
        h = h.replace('</body>', f'<script src="/moduli.js" data-portale="{PORTALE}" defer></script>\n</body>', 1)
    return h

for b in list(copiati):
    if not b.endswith(TESTO):
        continue
    try:
        t = open(b, encoding='utf-8').read()
    except UnicodeDecodeError:
        continue
    if b.endswith('.html'):
        t = pulisci_html(t)
    else:
        for pre in ('https://' + DOM, 'http://' + DOM, '//' + DOM):
            t = t.replace(pre + '/', '/').replace(pre.replace('/', '\\/') + '\\/', '\\/')
    open(b, 'w', encoding='utf-8').write(t)

print(len(copiati), 'file')

# Mappa del sito per Google: stessi nomi del vecchio Yoast (sitemap_index.xml → page-sitemap.xml), pagine IT con la versione EN
import datetime
pagine = sorted(os.path.relpath(os.path.dirname(b), DST).replace(os.sep, '/') for b in copiati
                if b.endswith('/index.html') and '/portfolio_page/' not in b and not b.startswith(os.path.join(DST, 'en')))
oggi = datetime.date.today().isoformat()
righe = []
for p in pagine:
    if p.startswith('wp-') or p == 'informativa-clienti-e-fornitori':
        continue
    it = f'https://{DOM}/' + ('' if p == '.' else p + '/')
    en = f'https://{DOM}/en/' + ('' if p == '.' else p + '/')
    for u in (it, en):
        righe.append(f'  <url><loc>{u}</loc><lastmod>{oggi}</lastmod>'
                     f'<xhtml:link rel="alternate" hreflang="it" href="{it}"/><xhtml:link rel="alternate" hreflang="en" href="{en}"/></url>')
open(os.path.join(DST, 'page-sitemap.xml'), 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + '\n'.join(righe) + '\n</urlset>\n')
indice = f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>https://{DOM}/page-sitemap.xml</loc><lastmod>{oggi}</lastmod></sitemap>\n</sitemapindex>\n'
for n in ('sitemap_index.xml', 'sitemap.xml', 'wp-sitemap.xml'):
    open(os.path.join(DST, n), 'w').write(indice)
open(os.path.join(DST, 'robots.txt'), 'w').write(f'User-agent: *\nDisallow: /informativa-clienti-e-fornitori\n\nSitemap: https://{DOM}/sitemap_index.xml\n')
print(len(righe), 'indirizzi nella sitemap')
