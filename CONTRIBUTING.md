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

# Review, then merge on GitHub (squash or merge commit per your preference)
gh pr merge --squash                  # or --merge / --rebase
```

After merging, `main` is the new deployable tip.

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
