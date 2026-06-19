/**
 * Standalone synergy-render diagnostic (spec 004 debugging — not shipped).
 *
 * Loads ONE lolalytics build page in a hidden BrowserWindow exactly like
 * LolalyticsPageRendererProvider, but with no DB / pool / freshness gate, and
 * polls the DOM for 20s (vs the app's 5s) printing a time-series so we can tell:
 *   - does the synergy section ever appear?  (synergyWord column)
 *   - are champion portraits eager <img src> or lazy <img data-src/srcset>?
 *   - how long until win-rate numbers show up?
 * Then dumps the final HTML for offline inspection.
 *
 *   npx electron scripts/debug-render-synergy.cjs [url] [outFile]
 */
const { app, BrowserWindow, session } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join, dirname } = require('node:path')

const URL =
  process.argv[2] || 'https://lolalytics.com/lol/ashe/build/?lane=bottom&tier=emerald'
const OUT =
  process.argv[3] || join(process.env.TEMP || '.', 'lbp-debug', 'dumps', 'standalone-ashe.html')
const WAIT_MS = 20000
const STEP_MS = 1000
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const count = (html, re) => (html.match(re) || []).length

app.disableHardwareAcceleration() // quieter GPU/disk-cache logs

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: session.fromPartition('persist:synergy-debug')
    }
  })

  console.log('URL:', URL)
  try {
    await win.loadURL(URL, { userAgent: UA })
  } catch (e) {
    console.log('loadURL error:', e.message)
  }

  let lastHtml = ''
  const deadline = Date.now() + WAIT_MS
  console.log('t(ms)\tlen\tsynergy?\timg<src>\timg<data-src>\timg<srcset>\twr%count')
  while (Date.now() < deadline) {
    let html = ''
    try {
      html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
    } catch {
      /* mid-navigation */
    }
    if (html) {
      lastHtml = html
      const t = WAIT_MS - (deadline - Date.now())
      const synergy = /synergy|teammate|duo/i.test(html)
      const imgSrc = count(html, /<img\b[^>]*\bsrc\s*=/gi)
      const imgData = count(html, /<img\b[^>]*\bdata-src\s*=/gi)
      const imgSrcset = count(html, /<img\b[^>]*\bsrcset\s*=/gi)
      const wr = count(html, /\d+(?:\.\d+)?\s*%/g)
      console.log(`${t}\t${html.length}\t${synergy}\t${imgSrc}\t${imgData}\t${imgSrcset}\t${wr}`)
    }
    await delay(STEP_MS)
  }

  try {
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, lastHtml, 'utf8')
    console.log(`dumped ${lastHtml.length} chars -> ${OUT}`)
  } catch (e) {
    console.log('dump failed:', e.message)
  }
  app.quit()
})
