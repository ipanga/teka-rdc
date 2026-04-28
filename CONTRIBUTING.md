# Contributing to Teka RDC

## Branching model

This repo uses a two-branch GitHub Flow:

| Branch | Role |
|---|---|
| `develop` | **Active working branch.** All day-to-day commits land here (directly or via short-lived topic branches merged into it). |
| `main` | **Protected, release-only.** Updated *exclusively* via Pull Request from `develop`. Every merge to `main` represents a deploy-ready state. |

### Daily loop

```bash
git checkout develop
git pull --ff-only
# ...make changes...
git add <files>
git commit -m "feat(module): clear summary"
git push                              # pushes to origin/develop
```

### Releasing to main

```bash
git push origin develop               # make sure develop is up to date on GitHub
gh pr create --base main --head develop \
  --title "Release: <short summary>" \
  --body "What's included / what changed since last main"

# Use --merge (real merge commit). DO NOT --squash — see the "Why merge, not
# squash" note below.
gh pr merge --merge
```

After merging, `main` is the new deployable tip.

### Hotfixes that go straight to `main`

Sometimes an SEO/security/payment fix can't wait for a develop release. The
flow:

```bash
git checkout -b fix/<topic> origin/main      # branch from main, NOT develop
# ...make + commit changes...
git push -u origin fix/<topic>
gh pr create --base main --head fix/<topic>  # PR direct to main
gh pr merge --merge                          # merge after review
```

**Then immediately back-merge** `main → develop` so develop doesn't fall
behind:

```bash
git checkout -B sync-from-main origin/develop
git merge origin/main --no-edit              # resolve any conflicts
git push -u origin sync-from-main
gh pr create --base develop --head sync-from-main \
  --title "Sync develop ← main" --body ""
gh pr merge --merge
```

Skipping the back-merge is what produced the persistent `Main` PR conflict
on 2026-04-28. Always close the loop.

## Why merge, not squash

GitHub's "Squash and merge" rewrites a feature branch's commits into a
single new commit on the target branch — with a brand-new SHA. The
original commits keep their SHAs on the feature branch.

For a one-way `feature → main` flow that's harmless. But for our
two-branch `develop ↔ main` flow it causes a permanent divergence:

- `develop` has commits `A B C` (the original feature-branch SHAs)
- `main` has commit `S` (the squash, same content but different SHA)
- A later back-merge `main → develop` sees `S` on main and `A B C` on
  develop, treats them as unrelated histories, and produces phantom
  conflicts on every line either side has touched.

**Use "Create a merge commit" (`gh pr merge --merge`) for every PR**.
This preserves SHAs across both branches, so back-merges are clean.

If a PR has noisy intermediate commits and you'd really prefer a single
clean commit, **rebase locally** (`git rebase -i origin/<base>`) before
opening the PR — that compresses on the source side without changing
SHAs after merge.

If you ever see a back-merge PR stuck in a `DIRTY` state with conflicts
on lines that both branches actually agree about, that's the squash-vs-
real-merge SHA mismatch. Close that PR and open a fresh one from a
brand-new branch off `develop` that does `git merge origin/main`; the
fresh-branch commits don't carry the squash baggage and the conflict
surface shrinks to whatever genuinely differs.

## Local safety net

A pre-push hook at `.githooks/pre-push` blocks `git push origin main` from this
machine. It's activated for your clone via:

```bash
git config core.hooksPath .githooks
```

(Already applied on first clone if you ran `setup`; otherwise run the line above
once.) The hook matches on the *destination ref*, so `git push origin develop`
works normally.

Emergency override (do not use routinely):
```bash
git push --no-verify
```

## GitHub-side protection

The free plan on private repos doesn't allow classic branch protection or
rulesets. To enforce `main`-is-PR-only at the server level, you have three options:

1. **Make the repo public** — branch protection rules and rulesets work on public
   repos for free. Run:
   ```bash
   gh repo edit ipanga/teka-rdc --visibility public --accept-visibility-change-consequences
   ```
   No secrets are in git history (`.env*` files are gitignored).
2. **Upgrade the account to GitHub Pro** ($4/mo) — unlocks branch protection on
   private repos.
3. **Keep the current setup** — rely on the local hook + workflow discipline.

Once any of (1) or (2) is done, re-run the ruleset creation:
```bash
gh api -X POST /repos/ipanga/teka-rdc/rulesets --input scripts/ruleset-main.json
```
(see `scripts/ruleset-main.json` below — committed so it can be re-applied on
any fresh environment.)

## Commit message conventions

Type prefixes used in existing history:

- `feat(<scope>): …` — new feature
- `fix(<scope>): …` — bug fix
- `chore(<scope>): …` — tooling, ops, deps, config
- `docs(<scope>): …` — docs only
- `refactor(<scope>): …` — no behavior change

Scopes in use: `city-marketplace`, `auth`, `prod`, `mobile`, `api`, `admin-web`,
`buyer-web`, `seller-web`, `docs`.
