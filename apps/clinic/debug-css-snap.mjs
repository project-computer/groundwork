/**
 * [DEBUG-csssnap] Computed-style snapshot harness for the CSS -> Tailwind
 * migration (throwaway). Serves apps/clinic/dist, walks the workspace dialog
 * tabs + lock screen, and dumps computed styles of every styled element to a
 * JSON file. Diff before.json vs after.json to prove a migration is
 * pixel-identical. Delete when the migration completes.
 *
 * Usage: node debug-css-snap.mjs out.json
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { chromium } from 'playwright'

const DIST = new URL('./dist', import.meta.url).pathname
const OUT = process.argv[2] ?? 'css-snapshot.json'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' }

const PROPS = [
  'display', 'position', 'top', 'left', 'right', 'bottom', 'zIndex', 'inset',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
  'background', 'backgroundColor', 'backgroundImage',
  'boxShadow', 'color', 'opacity', 'overflow', 'overflowX', 'overflowY',
  'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'textTransform',
  'textDecorationLine', 'letterSpacing', 'whiteSpace', 'textOverflow',
  'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows',
  'gridColumn', 'gridRow', 'flexDirection', 'flex', 'alignItems', 'justifyContent',
  'flexWrap', 'alignSelf', 'transform', 'transition', 'animation',
  'visibility', 'pointerEvents', 'aspectRatio', 'outline', 'accentColor',
]

const server = createServer((req, res) => {
  let file = join(DIST, req.url.split('?')[0])
  if (!existsSync(file) || extname(file) === '') file = join(DIST, 'index.html')
  try {
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
    res.end(readFileSync(file))
  } catch {
    res.statusCode = 404
    res.end('nope')
  }
})

await new Promise((resolve) => server.listen(4174, resolve))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const scenes = []
const snapshotScene = async (name) => {
  const data = await page.evaluate((props) => {
    const out = []
    const els = document.querySelectorAll('body *')
    els.forEach((el, index) => {
      const cls = typeof el.className === 'string' ? el.className : ''
      if (!cls.trim()) return
      const cs = getComputedStyle(el)
      const styles = {}
      for (const prop of props) {
        const value = cs.getPropertyValue(prop)
        if (value) styles[prop] = value
      }
      out.push({ index, tag: el.tagName.toLowerCase(), class: cls, styles })
    })
    return out
  }, PROPS)
  scenes.push({ name, elements: data })
  console.log(`[${name}] ${data.length} styled elements`)
}

// Seed + land on the dashboard
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.clear()
  const seedEvent = new CustomEvent('noop')
  void seedEvent
})
await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.setItem('vet.locale', 'en'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// Sign in past the lock screen (demo: sign in as the PIN-less seeded admin)
const signIn = page.getByRole('button', { name: /Sign in/i }).first()
if (await signIn.count()) {
  await signIn.click()
  await page.waitForTimeout(400)
}

// Open the workspace dialog (clinic card in the sidebar)
const manage = page.getByRole('button', { name: /Manage .*/i }).first()
await manage.click()
await page.waitForTimeout(500)
await snapshotScene('workspace-clinic')

for (const [tab, name] of [['My account', 'workspace-account'], ['Team', 'workspace-team'], ['Roles & permissions', 'workspace-roles']]) {
  await page.getByRole('tab', { name: tab }).click()
  await page.waitForTimeout(300)
  await snapshotScene(name)
}

// Lock screen: flip session.locked in the persisted document, reload
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('clinicbook:state:v1') ?? '{}')
  raw.session = { ...(raw.session ?? {}), locked: true }
  localStorage.setItem('clinicbook:state:v1', JSON.stringify(raw))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await snapshotScene('lock-screen')

writeFileSync(OUT, JSON.stringify({ props: PROPS, scenes }, null, 1))
console.log(`written: ${OUT}`)
await browser.close()
server.close()
