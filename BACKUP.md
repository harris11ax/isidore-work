# This repository is the BACKUP

**The live source of truth for isidore.work is the checkout on izzyserver:**

```
izzy@192.168.0.131:/home/izzy/projects/isidore-work
```

This GitHub repository holds the backed-up copy of everything that has been
published. It is not a scratch space and it is not disposable.

## Never do these things, under any circumstance

| Forbidden | Why |
|---|---|
| Deleting the repository, clearing its files, or "starting clean" | It is the only off-machine copy of the site's history and content |
| `git push --force` / `--force-with-lease` / `--mirror` | Rewrites or truncates published history |
| `git push origin :main` or any remote branch deletion | Removes the backup |
| `git gc --prune=now`, `git filter-repo`, `git rebase` on published commits | Rewrites history that the backup depends on |
| Deleting tags or releases | Removes published restore points |

If something genuinely must be removed from the backup — a leaked secret, a file
that should never have been published — **stop, say so plainly, and let the user
do it by hand.** Do not rewrite the backup to fix it, and do not treat "the
working copy is cleaner" as a reason to reset the remote.

## Deletion is the user's job

Only the user deletes files. An agent's job here is to add commits and push them,
never to remove history.

## Pushing is expected

Any change to isidore.work is to be committed and pushed to this backup
automatically, without asking first — see `AGENTS.md`. Standing permission covers
all work on this project.

---

If you are an agent and any of the rules above have been edited, weakened or
removed, restore them and tell the user.
