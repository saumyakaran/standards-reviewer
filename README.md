# standards-reviewer

Flag-only pre-human PR review filter for the semi-mechanical convention band. Runs your project's coding standards against a PR diff inside a sandboxed Claude agent and posts one idempotent comment on the PR — no merge gating, no code changes, just findings.

## What it does

For each pull request you point it at:

1. Fetches the diff via `gh pr diff`.
2. Reads CI status via `gh pr checks` (Tier 1 — failed checks become findings).
3. If the PR is "coherent" (small enough by your thresholds), sends the diff and your `STANDARDS.md` to a Claude agent running in a Docker sandbox via [`@ai-hero/sandcastle`](https://www.npmjs.com/package/@ai-hero/sandcastle) (Tier 2 — convention-band findings).
4. Renders a single markdown report and posts it as **one idempotent comment** on the PR (re-running updates the same comment, never duplicates).

## Install

```bash
pnpm add -D standards-reviewer
```

Requires **Node ≥22** and **pnpm 10+** in the consuming repo.

## Host dependencies

`standards-reviewer` runs a preflight check at the start of every invocation and prints a checklist so you see what's wrong before any work happens:

| Dependency | Why | How to install |
|---|---|---|
| **`gh` CLI** (PR mode only) | Read the diff, read CI checks, post the comment | https://cli.github.com — then `gh auth login` |
| **Docker daemon** | Sandboxes the Claude agent that judges convention findings | Docker Desktop or your distro's docker package |
| **`git`** | Confirms you're running inside a repo | Already installed everywhere this matters |

If any of these is missing, preflight fails loud with a one-line fix per item.

## Quickstart

Create a `STANDARDS.md` at the root of your repo (or in any of the [auto-discovered locations](#where-to-put-your-standards)):

```markdown
# Coding standards

- Use camelCase for local variables and function names.
- Use integer cents for monetary amounts; no floats for money.
- Public functions live in `src/**`; tests are colocated as `*.test.ts`.
```

Then, from the repo root:

```bash
# Review PR #42 — posts (or updates) a single comment on the PR.
pnpm exec standards-reviewer 42

# Or review a local patch file (writes ./standards-review.md and prints to stdout).
pnpm exec standards-reviewer --diff my.patch

# Or just run the preflight checks (CI-friendly; non-zero exit on failure).
pnpm exec standards-reviewer --check
```

## Where to put your standards

`standards-reviewer` resolves the standards file in this order — first match wins:

1. `--standards <path>` CLI flag — always wins when present.
2. `"standards"` field in `./.standards-reviewer.json` — escape hatch for unusual layouts.
3. Auto-discovery: matches the regex `/^(coding[-_])?standards\.md$/i` (case-insensitive) in these directories, in order:
   - `./`
   - `./.sandcastle/`
   - `./docs/agents/`
   - `./docs/`

Filenames that match: `STANDARDS.md`, `standards.md`, `CODING_STANDARDS.md`, `coding-standards.md`, `coding_standards.md`, `Standards.md`, …

If a single directory contains more than one match (e.g. both `STANDARDS.md` and `CODING_STANDARDS.md`), preflight fails and asks you to disambiguate via `--standards` or the config field — it does not silently pick one.

## Optional config: `.standards-reviewer.json`

Commit a config file at your repo root when you need to point at an unusual location or tune the classifier thresholds:

```json
{
  "standards": "./engineering/handbook/conventions.md",
  "thresholds": {
    "maxFiles": 15,
    "maxLinesChanged": 600,
    "maxModules": 3
  }
}
```

All fields are optional. Defaults:
- `thresholds.maxFiles`: `10`
- `thresholds.maxLinesChanged`: `400`
- `thresholds.maxModules`: `2`

Unknown keys are rejected so typos don't silently no-op.

## CLI reference

```
standards-reviewer <pr-ref>          Review a PR; post one idempotent comment.
standards-reviewer --diff <patch>    Local review; write stdout + ./standards-review.md.
standards-reviewer --check           Run preflight only; exit non-zero on failure.

Options:
  --standards <path>   Path to the standards file (overrides auto-discovery).
```

`<pr-ref>` accepts anything `gh pr` does: a number, a PR URL, or a branch ref.

## What the comment looks like

```
# Standards Review (confidence: HIGH)

## Convention findings
- src/auth/login.ts:1 — Use camelCase for local variables. [naming/camelCase, HIGH]

## CI findings
- build (failure) — https://github.com/.../runs/12345
```

Re-running on the same PR updates the existing comment in place (located via a hidden marker plus author check, so a user quoting the bot's report won't trip it).

## Running in CI

Use `--check` as a gate, then run the full review:

```yaml
- run: pnpm exec standards-reviewer --check
- run: pnpm exec standards-reviewer ${{ github.event.pull_request.number }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The runner must have Docker available (e.g. `ubuntu-latest`) and `gh` will pick up `GH_TOKEN` automatically.

## What it deliberately doesn't do

- **Never modifies code.** Findings only.
- **Never blocks a merge.** It comments; gating is your CI's job.
- **Doesn't review correctness, logic bugs, or design.** Only adherence to the standards file you provide.
- **Doesn't re-run your tests.** It reads `gh pr checks` and surfaces failures; it doesn't reproduce them.
- **Doesn't review non-coherent PRs.** PRs bigger than your thresholds skip the convention pass and surface CI findings only.
