// Riprese delle pagine del portale demo per il video (1600x900, nitide x2)
const { chromium } = require('playwright');
const PAGINE = require(process.argv[2]);
const OUT = process.argv[3];
const ZONE = require(process.argv[4]);
const zone = {};
const CSS = `
  header .marchio, .logo-testo {}
  .avviso.ia, .messaggio-ia {display:none!important}
`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, locale: 'it-IT', timezoneId: 'Europe/Rome' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3999/login');
  await p.fill('input[name=email]', 'demo@esempio.it');
  await p.fill('input[name=password]', 'DemoPortale2026!');
  await Promise.all([p.waitForNavigation(), p.click('button.primario')]);
  for (const [nome, url, full] of PAGINE) {
    await p.goto('http://localhost:3999' + url); await p.waitForTimeout(700);
    await p.evaluate(() => {
      // niente marchio: il nome del portale sparisce (si vende con un altro nome)
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const sost = [[/Portale Casteltech/g, 'Il tuo portale'], [/Casteltech/g, 'Demo'], [/con la chiave ANTHROPIC_API_KEY le leggerebbe l'IA/g, 'controllate dall\'IA']];
      let n; while ((n = walk.nextNode())) for (const [a, c] of sost) if (a.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(a, c);
      document.querySelectorAll('a,span,div').forEach(e => { if (e.children.length === 0 && e.textContent.trim() === 'C' && e.getBoundingClientRect().top < 50) e.textContent = '◆'; });
      document.querySelectorAll('[class*=chiudibile], .nota-browser').forEach(e => e.remove());
      document.querySelectorAll('img').forEach(i => { if (/logo|marchio/i.test(i.src + i.alt + i.className)) i.style.visibility = 'hidden'; });
    });
    const cerca = ZONE[nome] || {};
    zone[nome] = await p.evaluate((cerca) => {
      const r = {};
      for (const [chiave, testo] of Object.entries(cerca)) {
        const tutti = [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.includes(testo)));
        let e = tutti[0]; if (!e) continue;
        const base = e;
        while (e.parentElement && e !== document.body) {
          const st = getComputedStyle(e), b = e.getBoundingClientRect();
          if (b.width > 280 && (st.backgroundColor === 'rgb(255, 255, 255)' || parseFloat(st.borderTopLeftRadius) > 4) && e !== base) break;
          e = e.parentElement;
        }
        const b = e.getBoundingClientRect(), t = base.getBoundingClientRect();
        r[chiave] = { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height, tx: t.x + scrollX, ty: t.y + scrollY, tw: t.width, th: t.height };
      }
      return r;
    }, cerca);
    await p.screenshot({ path: `${OUT}/${nome}.png`, fullPage: !!full });
    console.log(nome);
  }
  require('fs').writeFileSync(OUT + '/zone.json', JSON.stringify(zone, null, 1));
  await b.close();
})();
