# isidore-work — charter

## Purpose
Source for **isidore.work**, Isidore LaRocco's personal portfolio: one page per project
(work, coursework, personal builds) grouped and filtered by domain, plus a CV page.
Astro 5 + `@astrojs/cloudflare`, shipped as the Cloudflare Worker `isidore-work`.

## Structure
- Entry point: `src/pages/index.astro` (bio + filterable project grid)
- Pages: `src/pages/index.astro`, `src/pages/projects/[slug].astro`, `src/pages/cv.astro`, `src/pages/contact.astro`
- Components: `src/components/` (`FilterableProjects.tsx` React island, `Header.astro`, `Footer.astro`, `BaseHead.astro`)
- Site data: `src/data/projects.json` (one record per site project) · `src/data/domains.ts` (domain taxonomy) · `src/data/roles.ts` (CV roles/awards/credentials)
- Types/lib: `src/lib/projects.ts` (`Project` interface) · `src/consts.ts` (titles, email, social URLs)
- Static assets: `public/projects/<slug>/`
- Local portfolio database (gitignored, local-only): `portfolio_db/` — `build_db.py` (generator) and `export_site.py` (database → `src/data/projects.json`)
- Config: `astro.config.mjs` · `wrangler.json` · `tsconfig.json`
- Build: `npm run build` · Run: `npm run dev` · Preview worker: `npx wrangler dev`
- Deploy: `npx wrangler deploy` (needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`)
- Test: none — verify with `npm run build`, then a live page fetch after deploy

## Session protocol
At session start do NOT browse the tree (no `ls`/`find`/`tree`). Read `HANDOFF.md` and
resume from its RESUME section; the structure above is already in context. If no
`HANDOFF.md` exists, do one structure pass, then write a fresh one.

## Rules
- **Never ship a local filesystem path.** No `sourcePath`/`source_path` in `src/data/**`,
  island props, or built output — the live site leaked Windows/Drive paths once.
- `HANDOFF.md` is agent-only and gitignored. So is `portfolio_db/` (it contains the
  local paths and the private media index).
- The site must not import from `portfolio_db/` at runtime; `export_site.py` copies
  generated data into `src/data/`. Projects load via static import (Cloudflare Workers
  has no runtime API — `src/content.config.ts` exports empty collections by design).
- **Never publish**: internship onboarding material (background check, badge photo, offer
  letters), Navy controlled/technical maintenance documents, the STS 4500 peer prospectus
  critique (another student's unpublished work), third-party DockDogs competition video,
  course solution keys, and personal information (phone numbers, references, ID numbers).
  Check an image with `vision_analyze` before copying it into `public/`.
- Rebuild the database with the Python 3.11 interpreter (the Hermes venv one lacks
- Ask before `wrangler deploy`; `npm run build` must pass first.
