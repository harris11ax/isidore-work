# isidore.work — Projects Overhaul Plan

> Historical: written before the first build. §3's home page was superseded on 2026-09-18 —
> `/` is now about + selfie + Professional Work, and the filterable grid lives at `/projects/`.
> See `AGENTS.md` for the current structure and `HANDOFF.md` for state.

## Problem / Success / Constraints
- **Problem:** Live site is still the Astro starter. Local repo is a half-built portfolio with placeholder data and a broken in-memory API. Need all 49 real projects published, intuitively grouped, filterable, with visuals rendered and non-visual work displayed elegantly.
- **Success:** `isidore.work` shows 49 projects grouped by domain, a working multi-select filter, visual projects rendering their real assets, text-only projects shown as clean typographic cards. Deployed via `wrangler deploy`.
- **Load-bearing constraints:** Astro 5 + Cloudflare Workers (SSR fetch-to-self must go — build-time static data instead). Assets live on `G:\` (Google Drive) + `OneDrive` (both mounted/accessible). Repo: `harris11ax/isidore-work`.

---

## 1. Data model (replaces the in-memory API)
Delete `src/pages/api/projects.*` and the client `fetch()` pattern in `src/lib/projects.ts`. Move to a **static content collection** committed to the repo.

`src/data/projects.json` — one object per project:
```
{
  "slug": "gupta-lab-ree-libs",
  "name": "Rare-Earth Element Recovery from HDDs (LIBS/EDS)",
  "date": "2026-05-27",
  "domain": "research-lab",
  "category": "School",          // Personal | Work | School (from CSV)
  "audience": "Research advisor / lab",
  "effort": "High",
  "timeHours": "60+",
  "summary": "≤2 sentence blurb",
  "hasVisuals": true,
  "tags": ["spectroscopy","materials","python"],
  "assets": [
    {"type":"image","src":"/projects/gupta-lab-ree-libs/spectrum.png","caption":"LIBS spectrum"},
    {"type":"pdf","src":"/projects/gupta-lab-ree-libs/report.pdf","thumb":"...png"}
  ]
}
```
Register as a `projects` collection in `src/content.config.ts` with a zod schema mirroring the above. Pages read it via `getCollection('projects')` at build time — no runtime API, works on Workers.

## 2. Domain taxonomy (the "intuitive layout")
Six domain clusters (primary grouping + primary filter axis). Each of the 49 rows maps to exactly one:

| Domain | Slug | Representative projects |
|---|---|---|
| **Power & Energy Systems** | `power-energy` | ECE 3250/3251 machines & transformer labs, ECE 4103 solar/SSD, ECE 2700 DC-AC converter, Dominion internship |
| **Embedded & Hardware** | `embedded-hw` | Capstone AutoBleedr, ECE 2300 boost-converter PCB, ECE 2600 audio analyzer, ECE 3430 embedded, ECE 2330 FPGA/VHDL |
| **Software, Data & ML** | `software-data` | OpenBoard pipeline, AES D3 dashboard, ECE 2410 ML, APMA 3100/3080, Audiobook converter, CS 2130, HooHacks |
| **Research & Lab Science** | `research-lab` | Gupta Lab LIBS, ECE 3209 EM fields labs, CHM 111, BIO 2870 |
| **Policy & Writing** | `policy-writing` | All STS 3020 memos, SMR course paper + poster, issue-advocacy deliverables |
| **Teaching & Field Work** | `teaching-field` | RKC canal tour + guide manual, RKC coaching records |

Secondary filter axis: **Category** (Personal / Work / School) straight from the CSV. Optional tertiary: year (from `date`).

## 3. Pages & components
- `src/pages/index.astro` — hero/bio + **sticky filter bar** + domain-sectioned project grid. Replace placeholder bio with real one.
- `src/pages/projects/[slug].astro` — detail page: title/meta header, summary, then asset gallery.
- **Remove** `electronics.astro`, `policy.astro`, `photography.astro`, `admin.astro` (superseded).
- `FilterBar.tsx` (React island): multi-select domain chips + category chips + free-text search; filters the grid client-side, instant, URL-syncable (`?domain=power-energy&cat=School`).
- `ProjectCard.astro` — two render modes:
  - **Visual:** thumbnail (image, or PDF first-page render, or video poster) + title + meta.
  - **Non-visual:** elegant typographic card — accent bar in domain color, monospace metadata line (date · effort · audience), title, blurb. No broken-image boxes.
- `ProjectGallery.astro` — in detail page: images inline (responsive, lightbox), PDFs as embedded `<iframe>`/thumbnail+download, video via `<video>`, the AES D3 dashboard via `<iframe>` embed of its built HTML.

## 4. Asset collection pipeline (I run this)
For each project folder in the CSV:
1. Scan for renderable assets: `.png/.jpg/.svg` (charts, schematics, PCB, posters), `.pdf` (reports, memos), `.mp4` (ECE 3430 video), notebooks/plots.
2. Pick 1–4 representative visuals per project. Copy into `public/projects/<slug>/`.
3. PDF → first-page PNG thumbnail via `pdftoppm` (pdf skill) for card previews; keep full PDF for detail view.
4. Flag `hasVisuals: false` for pure-text work (policy memos w/o poster, coaching records, C labs, study guide) → typographic card path.
5. Write `summary`/`tags` per project from folder contents.
Output: populated `src/data/projects.json` + `public/projects/**` assets.

Special cases: AES dashboard = embed built D3 HTML; ECE 3430 `.mp4` = compress + host in `public/` (check size vs Workers limits, else link out); large PDFs = thumbnail + download link, not inline.

## 5. Config & polish
- `astro.config.mjs`: `site: "https://isidore.work"`.
- `src/consts.ts`: real title (`Isidore` / name), description, LinkedIn/Instagram/GitHub URLs (currently placeholders).
- Domain color tokens + dark-mode-aware styles in `src/styles/global.css`.
- Delete starter blog posts or repurpose `/blog` (out of scope unless wanted).

## 6. Deploy & verify
1. `npm run dev` — local review of grid, filter, sample detail pages.
2. `npm run build` (catches SSR/Workers issues).
3. `wrangler deploy`.
4. Verify `https://isidore.work` now serves the portfolio (not the starter); test filters + a visual and a non-visual detail page.
5. Commit + push to `harris11ax/isidore-work`.

## Open questions before build
- Confirm domain names/buckets above.
- Bio text + real social URLs.
- Keep or drop the `/blog` section.
- Any projects to hide (e.g. 2018 BIO study guide) or feature-pin to top?
