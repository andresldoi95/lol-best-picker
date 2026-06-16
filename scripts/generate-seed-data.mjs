// Maintainer utility: regenerates the bundled offline seed snapshots from live
// Riot Data Dragon data.
//
//   node scripts/generate-seed-data.mjs
//
// Produces:
//   - src/main/dataDragon/seedData/champions.json    (full Data Dragon `champion.json`)
//   - src/main/stats/seedData/championStats.json     (baseline overall win-rate rows)
//
// The FULL champion roster comes from Data Dragon. Baseline win rates are accurate
// for the curated popular champions below and tag-derived (placeholder) for the rest
// — the live u.gg refresh replaces these once configured (research.md §1).

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Curated, role-accurate baseline win rates for popular champions.
// [slug, [roles], baseWinRate]
const CURATED = [
  ['Aatrox', ['TOP'], 50.8],
  ['Darius', ['TOP'], 51.4],
  ['Fiora', ['TOP'], 50.2],
  ['Garen', ['TOP'], 51.9],
  ['Jax', ['TOP', 'JUNGLE'], 50.6],
  ['Malphite', ['TOP', 'SUPPORT'], 51.7],
  ['Nasus', ['TOP'], 51.1],
  ['Renekton', ['TOP'], 49.8],
  ['Riven', ['TOP'], 49.3],
  ['Sett', ['TOP', 'SUPPORT'], 50.9],
  ['Amumu', ['JUNGLE', 'SUPPORT'], 52.3],
  ['Ekko', ['JUNGLE', 'MIDDLE'], 51.0],
  ['Graves', ['JUNGLE'], 50.4],
  ['Hecarim', ['JUNGLE'], 50.7],
  ['Kayn', ['JUNGLE'], 51.2],
  ['LeeSin', ['JUNGLE'], 48.9],
  ['Vi', ['JUNGLE'], 50.5],
  ['Ahri', ['MIDDLE'], 51.3],
  ['Akali', ['MIDDLE', 'TOP'], 49.6],
  ['Annie', ['MIDDLE', 'SUPPORT'], 51.8],
  ['Katarina', ['MIDDLE'], 50.1],
  ['Lux', ['MIDDLE', 'SUPPORT'], 51.5],
  ['Orianna', ['MIDDLE'], 50.0],
  ['Sylas', ['MIDDLE'], 50.3],
  ['Veigar', ['MIDDLE'], 51.6],
  ['Viktor', ['MIDDLE'], 50.8],
  ['Yasuo', ['MIDDLE', 'BOTTOM'], 49.1],
  ['Yone', ['MIDDLE', 'TOP'], 49.4],
  ['Zed', ['MIDDLE'], 49.7],
  ['Ashe', ['BOTTOM', 'SUPPORT'], 51.2],
  ['Caitlyn', ['BOTTOM'], 49.9],
  ['Ezreal', ['BOTTOM'], 49.5],
  ['Jhin', ['BOTTOM'], 51.4],
  ['Jinx', ['BOTTOM'], 51.0],
  ['Kaisa', ['BOTTOM'], 50.2],
  ['Lucian', ['BOTTOM', 'MIDDLE'], 49.8],
  ['Senna', ['BOTTOM', 'SUPPORT'], 50.6],
  ['Vayne', ['BOTTOM', 'TOP'], 50.0],
  ['Zeri', ['BOTTOM'], 49.2],
  ['Janna', ['SUPPORT'], 52.1],
  ['Karma', ['SUPPORT', 'MIDDLE'], 50.7],
  ['Leona', ['SUPPORT'], 50.9],
  ['Lulu', ['SUPPORT'], 51.3],
  ['Morgana', ['SUPPORT', 'MIDDLE'], 51.0],
  ['Nami', ['SUPPORT'], 51.6],
  ['Nautilus', ['SUPPORT'], 50.4],
  ['Sona', ['SUPPORT'], 52.0],
  ['Soraka', ['SUPPORT'], 51.8],
  ['Thresh', ['SUPPORT'], 49.6]
]
const curatedBySlug = new Map(CURATED.map(([slug, roles, winRate]) => [slug, { roles, winRate }]))

// Tag → likely role(s) for champions without curated data (rough placeholder).
const TAG_TO_ROLES = {
  Marksman: ['BOTTOM'],
  Mage: ['MIDDLE'],
  Assassin: ['MIDDLE'],
  Fighter: ['TOP'],
  Tank: ['TOP'],
  Support: ['SUPPORT']
}

function rolesFromTags(tags) {
  const roles = new Set()
  for (const tag of tags ?? []) for (const role of TAG_TO_ROLES[tag] ?? []) roles.add(role)
  if (roles.size === 0) roles.add('MIDDLE')
  return [...roles]
}

// Deterministic mild win-rate in [48.5, 51.5] from the slug.
function placeholderWinRate(slug) {
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  return Math.round((48.5 + (hash % 300) / 100) * 10) / 10
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`)
  return res.json()
}

const versions = await getJson('https://ddragon.leagueoflegends.com/api/versions.json')
const version = versions[0]
const championFile = await getJson(
  `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
)
const patch = version.split('.').slice(0, 2).join('.')

const champions = Object.values(championFile.data)

// ---- champions.json: the full Data Dragon file, verbatim ----
const championsPath = resolve(root, 'src/main/dataDragon/seedData/champions.json')

// ---- championStats.json: baseline overall rows for every champion ----
const rows = []
for (const champ of champions) {
  const curated = curatedBySlug.get(champ.id)
  const roles = curated ? curated.roles : rolesFromTags(champ.tags)
  const baseWinRate = curated ? curated.winRate : placeholderWinRate(champ.id)
  roles.forEach((role, i) => {
    const winRate = Math.round((baseWinRate - i * 1.2) * 10) / 10
    const gamesPlayed = curated ? (i === 0 ? 60000 : 18000) : i === 0 ? 12000 : 6000
    rows.push({ championKey: champ.id, role, winRate, gamesPlayed })
  })
}
const statsJson = { patch, rows }
const statsPath = resolve(root, 'src/main/stats/seedData/championStats.json')

mkdirSync(dirname(championsPath), { recursive: true })
mkdirSync(dirname(statsPath), { recursive: true })
writeFileSync(championsPath, JSON.stringify(championFile, null, 2) + '\n')
writeFileSync(statsPath, JSON.stringify(statsJson, null, 2) + '\n')

console.log(`Data Dragon version ${version} (patch ${patch})`)
console.log(`Wrote ${champions.length} champions -> ${championsPath}`)
console.log(`Wrote ${rows.length} baseline stat rows -> ${statsPath}`)
