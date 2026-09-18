# isidore.work admin portal

The backend for **isidore.work**. It runs on **izzyserver** and is reached at
`https://isidore.work/admin` — the deployed Cloudflare Worker proxies `/admin/*`
here over the Cloudflare tunnel, path-preserving. Nothing else on the public site
touches this server: every other page is a prerendered static asset at the edge.

```
browser ──► isidore.work (Cloudflare Worker, static assets)
              └── /admin/*  ──► backend.isidore.work (tunnel) ──► 127.0.0.1:8099  (this app)
                                                                    │
                                                                    ├── content.db   the source of truth
                                                                    ├── media/       uploaded files
                                                                    └── publish.log  every publish, verbatim
```

## Where the state lives

| Path | What |
|---|---|
| `/home/izzy/isidore-content/content.db` | every project, asset, domain, CV record and landing-page field |
| `/home/izzy/isidore-content/media/` | uploads, named by content hash |
| `/home/izzy/isidore-content/auth.json` | admin password hash (scrypt) + session signing key — `0600` |
| `/home/izzy/isidore-content/publish.env` | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` for deploys — `0600` |
| `/home/izzy/isidore-content/publish.log` | append-only output of every step of every publish |

Nothing here is in the repo. The repo holds a **snapshot**: each publish writes the
database back out to `src/data/*` and copies the referenced media into
`public/`, and that snapshot is committed and pushed to the GitHub backup.

## Commands

```bash
cd /home/izzy/projects/isidore-work/admin

npm run set-password      # set/reset the login password (prompts, hidden input)
npm run generate          # content.db  -> src/data/*   (no build, no deploy)
npm run publish           # generate -> build -> wrangler deploy -> git push
npm start                 # run the portal in the foreground (:8099)
```

`npm run publish -- --no-deploy --no-push` exercises generation and the build
without touching the live site or the backup repository.

## Operating it

```bash
sudo systemctl status isidore-admin
sudo systemctl restart isidore-admin
sudo journalctl -u isidore-admin -n 50
```

## Deploy credentials

`publish.env` needs a Cloudflare API token with **Workers Scripts: Edit** and the
account id:

```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=9507c61e6fd98b56e3a91879244d7a6c
```

Keep it `chmod 600` — publishing refuses to run if it is missing rather than
silently skipping the deploy.

## Security posture

- One password, stored only as a scrypt hash (`N=32768, r=8, p=1`).
- Sessions are stateless signed cookies (`HttpOnly`, `Secure`, `SameSite=Lax`,
  30 days), signed with a key generated on first password set.
- Login is throttled: 8 failed attempts from one address in 15 minutes locks it out.
- Every state-changing POST requires a session-bound CSRF token.
- The app listens on `127.0.0.1:8099` only; the tunnel is the only way in.

Stronger option, not enabled: put **Cloudflare Access** in front of the backend
hostname so unauthenticated traffic never reaches the origin. That needs a
service token for the Worker's proxy to authenticate with, hence the extra setup.

## Notes

- `node:sqlite` (Node 22.5+) is used for the database — no native modules.
- Uploads are content-addressed, so re-uploading the same file stores it once.
- Deleting a project removes its records; deleting a *file* is refused while a
  project still references it.
- `src/data/*` and `public/projects/**` are generated. Hand edits there survive
  until the next publish, which overwrites them.
