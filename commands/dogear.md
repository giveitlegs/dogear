---
description: Show what the next session will open with. Also `/dogear pin <note>`, `/dogear unpin`, `/dogear clear`, `/dogear off`, `/dogear on`.
argument-hint: "[pin <note> | unpin | clear | off | on]"
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/dogear.mjs" --data="${CLAUDE_PLUGIN_DATA}" show`

The user ran `/dogear` with these arguments: `$ARGUMENTS`

- No arguments: relay the Dogear output above to the user exactly as printed, in a code block, with no commentary.
- `pin`, `unpin`, `clear`, `off` or `on`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/dogear.mjs" --data="${CLAUDE_PLUGIN_DATA}" <subcommand> [note]` with the Bash tool, passing a pin's note as one single-quoted argument, then relay its one-line output.
