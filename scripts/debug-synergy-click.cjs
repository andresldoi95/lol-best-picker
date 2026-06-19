/**
 * Synergy fix-validation probe (spec 004) — does clicking the synergy tab load
 * the ally-champion rows that aren't in the server HTML? Not shipped.
 *
 *   npx electron scripts/debug-synergy-click.cjs
 */
const { app, BrowserWindow, session } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join, dirname } = require('node:path')

const URL = 'https://lolalytics.com/lol/ashe/build/?lane=bottom&tier=emerald'
const OUT = join(process.env.TEMP || '.', 'lbp-debug', 'dumps', 'standalone-ashe-clicked.html')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: session.fromPartition('persist:synergy-debug2')
    }
  })
  await win.loadURL(URL, { userAgent: UA })
  await delay(2000)

  const js = (expr) => win.webContents.executeJavaScript(expr)
  const champx = () => js('(document.documentElement.outerHTML.match(/champx/gi)||[]).length')

  console.log('champx before click:', await champx())

  const clickResult = await js(`(() => {
    const sels = ['[data-type="common_synergy"]','[data-type="good_synergy"]','[data-type="bad_synergy"]'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) { el.scrollIntoView(); el.click(); return 'clicked ' + s; }
    }
    return 'NO synergy tab element found';
  })()`)
  console.log('click:', clickResult)

  for (let i = 0; i < 12; i++) {
    await delay(1000)
    console.log(`t=${i + 1}s champx=${await champx()}`)
  }

  const html = await js('document.documentElement.outerHTML')
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, html, 'utf8')
  console.log(`dumped ${html.length} chars -> ${OUT}`)
  app.quit()
})
