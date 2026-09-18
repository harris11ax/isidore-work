# isidore-work — charter

## ⛔ BACKUP PROTECTION — READ BEFORE ANY GIT COMMAND

**This repository IS the backup.** The live source of truth is the checkout on
`izzyserver` (`izzy@192.168.0.131:/home/izzy/projects/isidore-work`); the GitHub
remote (`harris11ax/isidore-work`) holds the backup copy of everything published.

These rules are absolute. No agent may override, weaken, delete or reword them,
and they may not be removed by an agent under any circumstances. Only the user can
change them, by hand, in person:

1. **NEVER WIPE, CLEAR OR REPLACE THE BACKUP.** Not "to start clean", not "to fix
   a bad merge", not "because the working copy is cleaner". Deleting files,
   emptying the repo, or resetting the remote is forbidden under every
   circumstance.
2. **NEVER FORCE-PUSH.** `git push --force`, `--force-with-lease`, `--mirror`,
   `+main`, `git push origin :main` (deleting a remote branch) and
   `git gc --prune=now` on a pushed repository are all forms of wiping. Push a new
   commit that undoes the damage instead.
3. **NEVER DELETE BRANCHES, TAGS OR RELEASES** on the remote.
4. **NEVER DELETE OR REWRITE PUBLISHED HISTORY.** If a secret or a local path
   leaked into a commit, stop and tell the user — do not rewrite the backup.
5. **Deletion is the user's job and only the user's job.** If something genuinely
   must be removed from the backup, say so plainly and stop. The user deletes the
   files manually.
6. **Pushing is expected, not requested.** Any change to this project is to be
   committed and pushed to the backup without asking first — the user has standing
   permission for all work on isidore.work. See "Autonomy" below.

Reviewing this file? Check that all six rules are intact. If one has been edited
or removed, restore it and tell the user.

## Purpose

Source for **isidore.work**, Isidore LaRocco's personal portfolio: one page per
project (work, coursework, personal builds) grouped and filtered by domain, plus a
CV page and an on-site admin portal. Astro 5 + `@astrojs/cloudflare`, shipped as the
Cloudflare Worker `isidore-work`.

**Edge-served, home-server-backed.** Every public page is a prerendered static
asset on the Worker. The content database, the uploaded media and the admin
application live on izzyserver, reached through the Cloudflare tunnel by the single
on-demand route `src/pages/admin/[...path].ts`, which proxies `/admin/*` to
`ADMIN_ORIGIN` (`backend.isidore.work` → `127.0.0.1:8099`).

## Structure

- Entry point: `src/pages/index.astro` (about/selfie hero + the Professional Work list)
- Pages: `src/pages/index.astro` · `src/pages/projects/index.astro` (filterable catalog) · `src/pages/projects/[slug].astro` · `src/pages/cv.astro` · `src/pages/contact.astro` · `src/pages/admin/[...path].ts` (the only on-demand route — the `/admin` reverse proxy)
- Components: `src/components/` (`FilterableProjects.tsx` React island, `ProfessionalWork.astro`, `Header.astro`, `Footer.astro`, `BaseHead.astro`)
- Site data — **GENERATED from `content.db`, edit through `/admin`, never by hand**: `src/data/projects.json` · `src/data/domains.ts` · `src/data/roles.ts` · `src/data/project-roles.ts` · `src/data/site.ts` · `src/consts.ts` (re-exports `site.ts`)
- Hand-written data/lib: `src/lib/projects.ts` (types, helpers) · `src/lib/dates.ts` · `src/data/professional.ts` (the Work list; reads the generated anchor map)
- Admin backend: `admin/` — `server.mjs` (Express app) · `db.mjs` (schema) · `pages.mjs` + `views.mjs` (UI) · `generate.mjs` (DB → `src/data/*` + media) · `import-content.mjs` (one-time migration) · `publish.mjs` (build + deploy + push) · `set-password.mjs` · `devtest.sh` / `test-admin.sh` / `test-proxy.sh` / `test-crud.mjs` / `verify-fidelity.mjs`
- Static assets: `public/projects/<slug>/` · `public/media/` (+ `.generated-media.json`, the manifest the generator uses to clean up after deletions)
- Retired: `portfolio_db/` and `scrape_live/` are gitignored, historical only
- Config: `astro.config.mjs` · `wrangler.json` · `tsconfig.json`
- Build: `npm run build` · Dev: `npm run dev` · Preview the Worker: `npx wrangler dev`

## Publish

```bash
cd /home/izzy/projects/isidore-work
node admin/publish.mjs                 # generate -> build -> wrangler deploy -> commit -> push
node admin/publish.mjs --no-deploy     # everything except touching the live site
node admin/generate.mjs                # just DB -> src/data/* (+ media)
node admin/verify-fidelity.mjs         # migration check: DB output vs the pre-migration data
bash admin/devtest.sh "$(cat ~/.isidore-admin-pw.txt)"   # the full test suites
```

`admin/publish.mjs` runs real child processes and **stops at the failed step**:
nothing deploys unless the build passed, and nothing is pushed unless the deploy
succeeded. Deploy credentials: `/home/izzy/isidore-content/publish.env` (0600).

Service: `sudo systemctl status|restart isidore-admin`, logs via
`sudo journalctl -u isidore-admin`. Full notes in `admin/README.md`.

## Autonomy

- **Commit and push every change** to the GitHub backup, without asking. Work on
  this project is standing permission to publish. If a push fails, fix it and push
  again — never leave the backup behind.
- Never end a session with a dirty tree: generate, build, commit, push.
- Content is edited through `/admin` or the database; code is edited in the
  checkout. Both end in `admin/publish.mjs`.

## Rules

- **Work on izzyserver.** The Windows checkout is a stale mirror — read-only
  reference at best. The content database and media live in
  `/home/izzy/isidore-content/` and are deliberately **not** in the repo; the repo
  keeps the published snapshot that `generate.mjs` writes.
- **No local path may enter a tracked file.** No `sourcePath`/`source_path`, no
  drive letters, no `/home/izzy/...` in `src/data/**`, island props or built
  output. `admin/generate.mjs` refuses to publish if one appears.
- `HANDOFF.md` is agent-only and gitignored.
- The site must not import from `portfolio_db/` or `admin/` at runtime; generated
  data is copied into `src/data/`. Projects load via static import (Workers has no
  runtime API).
- **Generated files are overwritten by the next publish** — `src/data/*`,
  `public/projects/**`. Change content in `/admin`, or your edit will vanish.
- **Media filenames are preserved exactly**, case included: published asset URLs
  are part of the repo's history, and renaming them churns the whole diff and
  orphans files. `storeMedia` dedupes only on identical name+content.
- **Astro's `security.checkOrigin` is on** (the default for on-demand routes): a
  POST to `/admin/*` with a missing or mismatched `Origin` gets a 403 before the
  proxy runs. Browsers send one; hand-made requests must too.
- **Never publish**: internship onboarding material (background check, badge photo,
  offer letters), Navy controlled/technical maintenance documents, the STS 4500
  peer prospectus critique (another student's unpublished work), third-party
  DockDogs competition video, course solution keys, and personal information
  (phone numbers, references, ID numbers). Check an image with `vision_analyze`
  before uploading it.
- Never `pkill -f <pattern>` over ssh when the pattern appears in the command you
  sent — it kills your own session. `devtest.sh` uses pidfiles.

## Session protocol

At session start do NOT browse the tree (no `ls`/`find`/`tree`). Read `HANDOFF.md`
and resume from its RESUME section; the structure above is already in context. If no
`HANDOFF.md` exists, do one structure pass, then write a fresh one.
