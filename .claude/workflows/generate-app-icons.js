export const meta = {
  name: 'generate-app-icons',
  description: 'Generate 18 ELO RATED app-icon SVGs across 6 themes, each independently rendered, brand-scored, and repaired if broken',
  phases: [
    { title: 'Design', detail: '6 theme designers, 3 distinct SVG icons each' },
    { title: 'Curate', detail: 'render + validate + brand-score each icon; repair any that are invalid' },
  ],
}

const REPO = '/Users/msponagle/code/EloRated/jits_web'
// Default to a neutral STAGING dir, never an existing batch: if `args.batch` does
// not propagate (it currently does not when launched by name), output lands in
// _incoming/ and is promoted to the next batch by finalize-batch.py, so a rerun
// can never overwrite an already-published batch.
const BATCH = (args && args.batch) || '_incoming'
const OUTDIR = `${REPO}/design/icon-options/${BATCH}/svg`
const BRIEF = `${REPO}/design/icon-options/BRIEF.md`

const THEMES = (args && args.themes) || [
  { key: 'lettermark', title: 'Lettermark E / ER Monogram',
    dir: 'The brand signature. A bold letter E whose horizontal bars ascend in length (reads as both the letter E AND a rising ELO chart, with an optional gold breakthrough peak), plus the "ER" monogram. Make one take the ascending-bar E, one the heavy "ER" monogram tile, and one a more abstract/modern lettermark.' },
  { key: 'belt', title: 'The Belt & Rank',
    dir: 'The BJJ belt = rank and progression, the most jiu-jitsu-specific symbol. One take: a clean head-on tied gi belt knot. One: a belt band whose rank-bar stripes double as an ELO / progress meter. One: an abstract, modern belt or stripe mark.' },
  { key: 'mat', title: 'The Mat & Guard',
    dir: 'The arena of jiu-jitsu rendered as geometry. One take: a top-down tatami / mat grid or competition circle. One: an abstract closed-guard / position diagram. One: a bold "matchmaking" mark of two zones meeting. Cartographic, brutalist, flat.' },
  { key: 'ascend', title: 'Rating & Ascension',
    dir: 'The ELO rating climbing. One take: a heavy upward delta / chevron rising from a bar chart. One: an ascending podium / ladder / step-chart with a highlighted top tier. One: a rank medallion with an up-arrow, OR bold ELO numerals built from geometry. Sharp, competitive, data-driven.' },
  { key: 'combat', title: 'The Lock (Combat)',
    dir: 'The physical art abstracted to a few heavy shapes. One take: two interlocking triangles (the triangle choke / closed guard). One: two figures clinched and matched into one balanced mark. One: a fist gripping a gi lapel. Minimal, iconic, reads at tiny size.' },
  { key: 'statement', title: 'Brutalist Statement',
    dir: 'Pure brand attitude, kindred to the "WE ARE / ELO RATED / ARE YOU?" launch splash. One take: a bold diagonal slash / cut dividing the tile. One: a planted monolith / flag with one geometric accent. One: a nested-square impact / collision emblem. Confident abstract geometry, zero illustration.' },
]

const DESIGN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['themeKey', 'icons'],
  properties: {
    themeKey: { type: 'string' },
    icons: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['file', 'name', 'concept'],
        properties: {
          file: { type: 'string', description: 'filename stem only, no path, no extension, e.g. theme1-lettermark-a' },
          name: { type: 'string', description: 'short display name, 2-5 words' },
          concept: { type: 'string', description: 'one-line description' },
        },
      },
    },
  },
}

const CURATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['themeKey', 'results'],
  properties: {
    themeKey: { type: 'string' },
    results: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['file', 'valid', 'readsAtSmall', 'brandScore', 'note'],
        properties: {
          file: { type: 'string' },
          valid: { type: 'boolean' },
          readsAtSmall: { type: 'boolean' },
          brandScore: { type: 'integer', minimum: 1, maximum: 5 },
          note: { type: 'string' },
        },
      },
    },
  },
}

function designPrompt(t, idx) {
  const n = idx + 1
  return `You are an expert brand icon designer for ELO RATED, a Brazilian Jiu-Jitsu competitor matchmaking + ELO-rating app.

FIRST read the brief at ${BRIEF} and obey every HARD RULE and the SVG technical spec EXACTLY:
- Full-bleed 1024x1024 background <rect> as the FIRST element; flat fills only; NO shadows / NO <filter> / NO gradients.
- NO <text> with brand fonts (they are not installed and render broken) -- build ALL letters/numbers as <path>/<polygon>/<rect> geometry.
- Must read clearly at 48px. These render via rsvg-convert, NOT a browser.

YOUR THEME -- "${t.title}":
${t.dir}

Produce EXACTLY 3 genuinely DISTINCT concepts (not 3 tweaks of one idea). Be bold; avoid the obvious first attempt. Write each as a standalone valid SVG to these EXACT paths (run \`mkdir -p ${OUTDIR}\` first):
- ${OUTDIR}/theme${n}-${t.key}-a.svg
- ${OUTDIR}/theme${n}-${t.key}-b.svg
- ${OUTDIR}/theme${n}-${t.key}-c.svg

After writing, VERIFY each renders with: \`rsvg-convert -w 96 -h 96 <file> -o /tmp/chk-${t.key}.png\` (must exit 0) and read the file back to confirm it has a full-bleed background rect and no <text> brand-font elements. Fix anything that fails before returning.

Return themeKey "${t.key}" and the 3 icons. For each icon, "file" is the filename STEM only (e.g. "theme${n}-${t.key}-a"), "name" is a short display name, "concept" is a one-line description.`
}

function curatePrompt(designed, t) {
  const stems = designed.icons.map((i) => i.file).join(', ')
  return `You are an INDEPENDENT icon QA curator. You did NOT draw these icons -- review them adversarially.

Theme: "${t.title}". The 3 SVGs are at ${OUTDIR}/<stem>.svg for these stems: ${stems}.

For EACH of the 3 files:
1. Confirm it is well-formed SVG with a full-bleed background <rect> and ZERO <text> elements using brand fonts (grep the file).
2. Render it BOTH at 1024px and at 64px to PNG via rsvg-convert and VIEW the PNGs (Read them). Judge: does it render correctly (not blank/broken/clipped)? Does it read clearly at 64px? Is it on-brand (flat color, Signal Red #E63946 / Void #0D0F14 palette, brutalist, no gradients/shadows)?
3. Assign brandScore 1-5 (5 = excellent & ship-ready, 3 = acceptable, 1 = broken/off-brand).

If any SVG is INVALID or renders blank/broken/clipped, REPAIR it: rewrite the file in place (same filename, same intended concept) so it renders correctly, then re-render to confirm. Leave good icons untouched.

Return themeKey "${t.key}" and a results entry for each file: { file (stem), valid, readsAtSmall, brandScore, note }.`
}

phase('Design')
log(`Generating ${THEMES.length} themes x 3 icons into ${OUTDIR}`)

const results = await pipeline(
  THEMES,
  (t, _orig, i) => agent(designPrompt(t, i), { schema: DESIGN_SCHEMA, phase: 'Design', label: `design:${t.key}` }),
  (designed, t) => {
    if (!designed) return null
    return agent(curatePrompt(designed, t), { schema: CURATE_SCHEMA, phase: 'Curate', label: `curate:${t.key}` })
      .then((cur) => ({ themeKey: t.key, themeTitle: t.title, icons: designed.icons, curate: cur }))
      .catch(() => ({ themeKey: t.key, themeTitle: t.title, icons: designed.icons, curate: null }))
  }
)

const manifest = results.filter(Boolean)
const total = manifest.reduce((n, m) => n + (m.icons ? m.icons.length : 0), 0)
log(`Done: ${total} icons across ${manifest.length} themes`)

return { batch: BATCH, outdir: OUTDIR, themes: manifest }
