# Dogear

**Every new Claude Code session opens where the last one stopped.**

![A first session adds a discount function and stops before free shipping. A brand-new session opens with a Dogear note and, asked "where did we leave off?", answers with what was done, the open choice, the uncommitted files and the next step (replay of two real sessions)](assets/demo.svg)

A new session starts with no memory of the last one. You either explain everything again, or Claude rediscovers it by reading files, and the half-finished parts get lost. Dogear folds the corner of the page for you. While you work, it keeps a short note: what you asked, the plan, what changed, the last check, and how the session ended. The next session in that project opens with that note already in context.

```
Last session · 14h ago · branch checkout-v2 · session closed
Asked: "Add a discount(code) function to src/cart.js supporting SAVE10…"
Plan: ◐ Free shipping over $50 · ✓ 2 done
Changed: src/cart.js, test/cart.test.js
Uncommitted: 2 files: src/cart.js, test/cart.test.js
Last check: `npm test` passed
Ended with: "I stopped before free shipping and haven't committed anything."
```

Ask "where were we?" and Claude knows. Start on something unrelated and Claude leaves the note alone, because the note is labelled as background and Claude is told not to act on it unprompted.

## Install

```
/plugin marketplace add giveitlegs/dogear
/plugin install dogear@dogear
```

There's nothing to configure or remember to run. Dogear writes the note as you go and hands it on automatically.

## How it behaves

| Situation | Dogear |
|---|---|
| A new session in a project you've worked in during the last 7 days | Adds the last note to Claude's context, plus a one-line banner for you |
| The last session only asked questions ("where were we?") | Keeps the note from the session before it, which did the work |
| You resume a session (`--resume`, `/resume`) | Nothing. The whole conversation is already back |
| The conversation gets compacted | Restores this session's specifics (plan, files, last check), which summaries tend to drop |
| You switched branches since | Says so: "branch checkout-v2 (you're now on main)" |
| First session in a project, or nothing worth noting | Silent |
| Node isn't installed | Silent. Dogear never breaks a session |

A session counts as "work" once it edits files, makes a plan (TodoWrite or tasks), or runs a check (tests, lint, build, typecheck). Edits made through shell commands still show up in the **Uncommitted** line, which comes from `git status`.

## `/dogear`

| Command | What it does |
|---|---|
| `/dogear` | Shows exactly what the next session will open with |
| `/dogear pin <note>` | Carries a note into every new session in this project, e.g. `/dogear pin Prices are in cents; never use floats for money` |
| `/dogear unpin` | Removes all pinned notes |
| `/dogear clear` | Forgets everything for this project, so the next session starts fresh |
| `/dogear off`, `/dogear on` | Pauses or resumes Dogear for this project |

Set `DOGEAR_DISABLED=1` to turn it off for one shell.

## What Dogear runs, stores, and sends

- **Runs:** one local Node script, `scripts/dogear.mjs`, from six hooks:
  - `SessionStart`, `UserPromptSubmit` and `Stop`;
  - `PostToolUse` on edits, TodoWrite, tasks and Bash;
  - `PostToolUseFailure` on Bash;
  - `SessionEnd`.

  It also runs `git status` in your project to note the branch and uncommitted files. The `/dogear` command runs the same script. Dogear uses only documented hook inputs and never reads your transcript files.
- **Stores:** a small JSON file per session in the plugin's data directory (`${CLAUDE_PLUGIN_DATA}`), plus your pins. Each session file holds:
  - your first and latest prompt in that session, trimmed to 240 characters;
  - the paths of edited files;
  - plan item titles;
  - the last check command and whether it passed;
  - the branch and uncommitted file names;
  - the first lines of Claude's final message.

  Nothing goes into your repository. Notes older than 7 days aren't handed on, and files older than 30 days are deleted. `/dogear clear` and uninstalling remove everything.
- **Sends:** nothing. The note goes only into your next local Claude Code session's context. Dogear makes no network calls, collects no telemetry, and has no dependencies.

Because the note includes your own prompts, keep that in mind if you share a machine account. `/dogear clear` wipes it at any time.

## Develop

```
node --test test/dogear.test.mjs           # unit + end-to-end hook tests
claude plugin validate --strict .
claude --plugin-dir .                      # try it live
```

Requires Node 18 or newer. MIT licensed.
