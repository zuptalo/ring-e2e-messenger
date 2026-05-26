---
name: speckit.roadmap.mark-specify-done
description: Flip the Specify column for the active spec to ✅ on ROADMAP.md
---

# Mark Specify Done on Roadmap

Auto-update the roadmap after `/speckit-specify` completes. Resolves the active
spec from the current git branch and flips the Specify column from ⬜ (or 🟡)
to ✅. Marks the next stage (Clarify) 🟡 for visibility.

## Execution

Run from the repository root:

```
bash .specify/extensions/roadmap/scripts/bash/mark-done.sh Specify
```

The script no-ops silently if the current branch is not a feature branch or
if ROADMAP.md does not yet exist.
