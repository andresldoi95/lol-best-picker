// NOTE: `electron` is imported dynamically inside the render method (never
// statically) so this module — and its exported pure `parseSynergyDom` — loads in
// plain-Node Vitest without an Electron runtime or mock (SC-005). Only the *type*
// is imported here, which is erased at compile time.
import type { BrowserWindow as BrowserWindowInstance } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Role } from '@shared/types'
import {
  LolalyticsMatchupProvider,
  type LolalyticsMatchupProviderOptions
} from './lolalyticsMatchupProvider'
import type {
  BuildStats,
  BuildStatsProvider,
  NormalizedSynergyRow,
  SynergyProvider,
  SynergyProviderTarget
} from './synergyProvider'

/**
 * Section boundary markers. Once the synergy section is located by label, the
 * region extends until the next *other* section heading so sibling tables
 * (counters / matchups / bans) can never leak their high win-rate rows into the
 * synergy result — the same "target by label" guarantee `parseSynergyHtml`
 * relies on in `lolalyticsMatchupProvider.ts`.
 */
const SYNERGY_LABEL = /synergy|teammate|duo|\bwith\b/i
const SECTION_BOUNDARY =
  /counters?|matchups?|weak\s+against|strong\s+against|best\s+(?:picks?|with)|worst|bans?\b/i

const clampWinRate = (wr: number): number => Math.max(0, Math.min(100, wr))

/**
 * Resolve a champion slug from a portrait image URL. lolalytics embeds the slug
 * either as a path segment (`…/champion/ahri/103.webp`) or as the filename
 * (`…/missfortune.webp`), so every URL token (and its extension-stripped form) is
 * tested against `slugToKey`; the first that maps to a known champion wins. An
 * unrecognised image (decoration, item, unknown champ) yields `undefined` and the
 * caller drops the row.
 */
function resolveSlug(url: string, slugToKey: Map<string, string>): string | undefined {
  for (const token of url.toLowerCase().split(/[/?#&=]/)) {
    if (slugToKey.has(token)) return token
    const noExt = token.replace(/\.[a-z0-9]+$/, '')
    if (noExt && slugToKey.has(noExt)) return noExt
  }
  return undefined
}

/** Strip tags → collapsed visible text, so numbers inside attributes (image URLs,
 *  `width="100%"`, sizes) can never be mistaken for a win rate or games count. */
function visibleText(chunk: string): string {
  return chunk
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ParsedSynergyTableRow {
  slug: string
  winRate: number
  games: number
}

/**
 * Parse one synergy row chunk: portrait slug + win rate + games. Column order on
 * lolalytics is portrait | name | WR% | games, so games is read as the first
 * number *after* the win rate (a leading rank number is thus ignored). Returns
 * null when the chunk lacks a recognised champion image or a win rate.
 */
function parseRow(chunk: string, slugToKey: Map<string, string>): ParsedSynergyTableRow | null {
  const src = chunk.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)
  if (!src) return null
  const slug = resolveSlug(src[1], slugToKey)
  if (!slug) return null

  const text = visibleText(chunk)
  const wr = text.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!wr) return null
  const winRate = parseFloat(wr[1])

  const afterWr = text.slice((wr.index ?? 0) + wr[0].length)
  const gamesMatch = afterWr.match(/(\d[\d,]*)/)
  const games = gamesMatch ? parseInt(gamesMatch[1].replace(/,/g, ''), 10) : 0

  return { slug, winRate, games }
}

/**
 * Pure decode of a *rendered* lolalytics build page → ally-synergy rows for
 * `championKey` in `role`. Exported so the parsing is unit-testable in plain Node
 * without an Electron runtime (Constitution IV-adjacent / SC-005) — this module
 * intentionally has no static `electron` import (see the provider class below).
 *
 * Behaviour (contract: renderer-provider.md §parseSynergyDom):
 *  - locates the synergy section *by label*, never the sibling counter/matchup
 *    tables, so counter win rates can never be mislabelled as synergy;
 *  - extracts each row's champion slug (from the portrait URL), win rate and games;
 *  - drops rows that are: the page champion itself, an unknown slug, or below
 *    `minGames`; win rates are clamped to [0, 100], games floored to ≥ 0;
 *  - every emitted row carries `source: 'rendered'`;
 *  - NEVER throws — any parse failure yields `[]` (the caller then keeps polling
 *    or applies the overall-WR fallback).
 *
 * The exact selectors model the structure documented in research.md §4 and MUST
 * be validated against a live captured page (quickstart §2 / Manual Test Checklist).
 */
export function parseSynergyDom(
  html: string,
  slugToKey: Map<string, string>,
  championKey: string,
  role: Role,
  patch: string,
  minGames: number
): NormalizedSynergyRow[] {
  try {
    const start = html.search(SYNERGY_LABEL)
    if (start === -1) return []
    // Region = from the synergy label to the next *different* section heading.
    const after = html.slice(start + 1)
    const boundary = after.search(SECTION_BOUNDARY)
    const region = boundary === -1 ? html.slice(start) : html.slice(start, start + 1 + boundary)

    const rows: NormalizedSynergyRow[] = []
    const seen = new Set<string>()
    // Each champion portrait `<img>` begins a logical row; the chunk runs to the
    // next portrait (lookahead split keeps the `<img` with its row).
    for (const chunk of region.split(/(?=<img\b)/i)) {
      if (!/<img\b/i.test(chunk)) continue
      const parsed = parseRow(chunk, slugToKey)
      if (!parsed) continue

      const allyChampionKey = slugToKey.get(parsed.slug)
      if (!allyChampionKey || allyChampionKey === championKey) continue
      if (parsed.winRate <= 0 || parsed.winRate > 100) continue
      if (parsed.games < minGames) continue
      if (seen.has(allyChampionKey)) continue
      seen.add(allyChampionKey)

      rows.push({
        championKey,
        role,
        allyChampionKey,
        winRate: clampWinRate(parsed.winRate),
        gamesPlayed: Math.max(0, Math.floor(parsed.games)),
        patch,
        source: 'rendered'
      })
    }
    return rows
  } catch {
    return []
  }
}

/** Role → lolalytics lane slug (mirrors `lolalyticsMatchupProvider.ts`). */
const LANE_BY_ROLE: Readonly<Record<Role, string>> = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'middle',
  BOTTOM: 'bottom',
  SUPPORT: 'support'
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** Dedicated session partition for the hidden render window. It carries NO
 *  `onHeadersReceived` CSP hook (that lives only on `session.defaultSession`, see
 *  `applyContentSecurityPolicy` in `main/index.ts`), so the lolalytics page's own
 *  client-side `fetch()` to its internal API is not blocked and the synergy table
 *  can populate (research.md §3). */
const RENDER_PARTITION = 'persist:synergy-render'

export interface LolalyticsPageRendererOptions extends LolalyticsMatchupProviderOptions {
  /** Maps lowercase champion slug → Data Dragon key (e.g. 'ahri' → 'Ahri'). */
  slugToKey: Map<string, string>
  /** Max ms to wait for the synergy table to populate before giving up (per champion). */
  renderTimeoutMs?: number
  /** Polling interval while waiting for the synergy table DOM to appear. */
  pollIntervalMs?: number
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `BuildStatsProvider` that obtains **live ally-synergy** data by rendering each
 * pool champion's lolalytics build page in a hidden Electron `BrowserWindow` (the
 * page's own JS calls lolalytics' internal API; this project never calls that API
 * directly — Constitution II). Enemy-matchup data is unchanged: it delegates to a
 * wrapped {@link LolalyticsMatchupProvider} (the static Qwik-JSON path).
 *
 * Drop-in replacement for `LolalyticsMatchupProvider` in `main/index.ts`
 * (contract: renderer-provider.md). Rendering happens only in the background
 * refresh cycle, never during champ-select polling (Constitution V).
 *
 * BrowserWindow over Puppeteer: Electron already bundles Chromium, so this adds
 * zero npm dependencies (Constitution VII) — see CLAUDE.md Architecture.
 */
export class LolalyticsPageRendererProvider implements BuildStatsProvider, SynergyProvider {
  private readonly wrapped: LolalyticsMatchupProvider
  private readonly slugToKey: Map<string, string>
  private readonly renderTimeoutMs: number
  private readonly pollIntervalMs: number
  private readonly tier: string
  private readonly minGames: number
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly ddragonVersionsUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: LolalyticsPageRendererOptions) {
    this.wrapped = new LolalyticsMatchupProvider(options)
    this.slugToKey = options.slugToKey
    this.renderTimeoutMs = options.renderTimeoutMs ?? 5000
    this.pollIntervalMs = options.pollIntervalMs ?? 250
    this.tier = options.tier ?? 'emerald'
    this.minGames = options.minGames ?? 100
    this.baseUrl = options.baseUrl ?? 'https://lolalytics.com'
    this.userAgent = options.userAgent ?? DEFAULT_UA
    this.ddragonVersionsUrl =
      options.ddragonVersionsUrl ?? 'https://ddragon.leagueoflegends.com/api/versions.json'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  /**
   * Fetch enemy matchups (delegated, unchanged) and ally synergy (rendered).
   * Per-champion render failures are logged and skipped — a partial result is
   * always preferable to an all-or-nothing failure (FR-011). Synergy that can't
   * be rendered simply stays empty and the engine falls back to overall WR.
   */
  async fetchBuildStats(targets: SynergyProviderTarget[]): Promise<BuildStats> {
    if (targets.length === 0) return { matchups: [], synergy: [] }

    // Enemy matchups via the existing static Qwik-JSON path (re-thrown to callers,
    // which already handle it). The wrapped provider returns synergy: [] today, so
    // its synergy is discarded in favour of the rendered rows below.
    const base = await this.wrapped.fetchBuildStats(targets)
    const patch = base.matchups[0]?.patch ?? (await this.resolvePatch())
    const synergy = await this.renderSynergy(targets, patch)

    return { matchups: base.matchups, synergy }
  }

  /** {@link SynergyProvider} shim so this satisfies the scheduler's provider type. */
  async fetchSynergyStats(targets: SynergyProviderTarget[]): Promise<NormalizedSynergyRow[]> {
    return (await this.fetchBuildStats(targets)).synergy
  }

  /**
   * Render every target sequentially in a single hidden BrowserWindow (one window
   * at a time — limits memory and lolalytics rate pressure). The window is always
   * destroyed, even on error. A failure creating the window logs and returns `[]`.
   */
  private async renderSynergy(
    targets: SynergyProviderTarget[],
    patch: string
  ): Promise<NormalizedSynergyRow[]> {
    const { BrowserWindow, session } = await import('electron')
    const rows: NormalizedSynergyRow[] = []
    // [synergy] diagnostic — confirms the refresh reached the renderer, how many
    // pool targets it has, and whether SYNERGY_DUMP_DIR is visible to this process.
    console.log(
      `[synergy] render start: ${targets.length} target(s); dumpDir=${process.env['SYNERGY_DUMP_DIR'] ?? '(unset)'}`
    )
    let win: BrowserWindowInstance | null = null
    try {
      win = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          session: session.fromPartition(RENDER_PARTITION)
        }
      })
      for (const target of targets) {
        try {
          rows.push(...(await this.renderOne(win, target, patch)))
        } catch (err) {
          console.warn(
            `lolalytics synergy render failed for ${target.championKey}/${target.role}: ${(err as Error).message}`
          )
        }
      }
    } catch (err) {
      console.warn(`lolalytics synergy render window init failed: ${(err as Error).message}`)
    } finally {
      win?.destroy()
    }
    return rows
  }

  /**
   * Navigate to one build page and poll the rendered DOM until the synergy table
   * has populated (`parseSynergyDom` returns ≥ 1 row) or the timeout elapses.
   * Polling the parsed result — rather than a hard-coded selector — keeps the wait
   * condition in lockstep with the (live-validated) parser. On timeout: warn and
   * return `[]` (FR-011).
   */
  private async renderOne(
    win: BrowserWindowInstance,
    target: SynergyProviderTarget,
    patch: string
  ): Promise<NormalizedSynergyRow[]> {
    const lane = LANE_BY_ROLE[target.role]
    const url = `${this.baseUrl}/lol/${target.championKey.toLowerCase()}/build/?lane=${lane}&tier=${this.tier}`
    console.log(`[synergy] rendering ${target.championKey}/${target.role} → ${url}`)
    await win.loadURL(url, { userAgent: this.userAgent })

    const deadline = Date.now() + this.renderTimeoutMs
    let lastHtmlLen = 0
    while (Date.now() < deadline) {
      let html = ''
      try {
        html = (await win.webContents.executeJavaScript(
          'document.documentElement.outerHTML'
        )) as string
      } catch {
        // Page mid-navigation / not ready — fall through, wait, retry.
      }
      if (html) {
        lastHtmlLen = html.length
        this.maybeDumpHtml(target, html)
        const parsed = parseSynergyDom(
          html,
          this.slugToKey,
          target.championKey,
          target.role,
          patch,
          this.minGames
        )
        if (parsed.length > 0) {
          console.log(`[synergy] ${target.championKey}/${target.role}: parsed ${parsed.length} row(s)`)
          return parsed
        }
      }
      await delay(this.pollIntervalMs)
    }
    console.warn(
      `[synergy] ${target.championKey}/${target.role}: timed out after ${this.renderTimeoutMs}ms (last HTML ${lastHtmlLen} chars, 0 rows parsed)`
    )
    return []
  }

  /**
   * Optional dev hook (quickstart §2 / task T005): when `SYNERGY_DUMP_DIR` is set,
   * write each rendered page's HTML there so the live synergy-table selectors can
   * be inspected and the parser validated against a real capture. Best-effort —
   * never affects the refresh on failure.
   */
  private maybeDumpHtml(target: SynergyProviderTarget, html: string): void {
    const dir = process.env['SYNERGY_DUMP_DIR']
    if (!dir) return
    try {
      writeFileSync(join(dir, `synergy-${target.championKey}-${target.role}.html`), html, 'utf8')
    } catch (err) {
      console.warn(`synergy HTML dump failed: ${(err as Error).message}`)
    }
  }

  /** Current patch label (e.g. "16.12") from Data Dragon — used only when the
   *  wrapped matchup fetch yielded no rows to borrow a patch from. Mirrors
   *  `LolalyticsMatchupProvider.resolvePatch`. */
  private async resolvePatch(): Promise<string> {
    const res = await this.fetchImpl(this.ddragonVersionsUrl, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`Data Dragon versions HTTP ${res.status}`)
    const versions = (await res.json()) as string[]
    const full = versions[0]
    if (typeof full !== 'string') throw new Error('Data Dragon returned no versions')
    return full.split('.').slice(0, 2).join('.')
  }
}
