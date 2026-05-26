---
name: speckit-roadmap-mark-specify-done
description: Flip the Specify column for the active spec to ✅ on ROADMAP.md
compatibility: Requires .specify/extensions/roadmap/scripts/bash/mark-done.sh
metadata:
  author: ring-project
  source: roadmap:commands/speckit.roadmap.mark-specify-done.md
---

# Mark Specify Done on Roadmap

Invokes the shared mark-done script with the `Specify` stage. The script
auto-detects the active spec from the current git branch.

## Execution

```
bash .specify/extensions/roadmap/scripts/bash/mark-done.sh Specify
```

The script silently no-ops if the current branch is not a feature branch or if
ROADMAP.md does not exist — roadmap maintenance must never block development.
