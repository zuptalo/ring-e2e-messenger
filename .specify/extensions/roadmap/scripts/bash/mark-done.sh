#!/usr/bin/env bash
# Ring roadmap auto-update. Constitution §F.
#
# Usage: mark-done.sh <stage>
#   <stage> ∈ { Specify, Clarify, Plan, Tasks, Analyze, T→I, Implement }
#
# Resolves the active spec ID from the current git branch (which must match
# ^[0-9]{3}-), finds the row in ROADMAP.md, and flips the stage column from
# ⬜ or 🟡 to ✅. Also marks the next stage 🟡 for visibility.
#
# Silently no-ops when the branch is not a feature branch, when ROADMAP.md
# does not exist, or when the spec row is not present. Never fails the
# pipeline — roadmap maintenance must never block development work.
set -e

stage="${1:?usage: mark-done.sh <stage>}"

case "$stage" in
  Specify|Clarify|Plan|Tasks|Analyze|"T→I"|Implement) ;;
  *)
    echo "[roadmap] Unknown stage '$stage'" >&2
    exit 0
    ;;
esac

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || repo_root="$(pwd)"
cd "$repo_root"

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || branch=""
case "$branch" in
  0[0-9][0-9]-*|1[0-9][0-9]-*|2[0-9][0-9]-*) ;;
  *)
    echo "[roadmap] Skipping; branch '$branch' is not a feature branch"
    exit 0
    ;;
esac

if [ ! -f ROADMAP.md ]; then
  echo "[roadmap] No ROADMAP.md at repo root; nothing to mark"
  exit 0
fi

spec_id=$(printf '%s' "$branch" | grep -Eo '^[0-9]{3}')

if ! command -v python3 >/dev/null 2>&1; then
  echo "[roadmap] python3 not available; skipping auto-update" >&2
  exit 0
fi

python3 - "$spec_id" "$stage" <<'PYEOF'
import sys, re, pathlib

spec_id, stage = sys.argv[1], sys.argv[2]
columns = ["Specify", "Clarify", "Plan", "Tasks", "Analyze", "T→I", "Implement"]
if stage not in columns:
    print(f"[roadmap] Unknown stage '{stage}'", file=sys.stderr)
    sys.exit(0)
col_idx = columns.index(stage)

p = pathlib.Path("ROADMAP.md")
text = p.read_text(encoding="utf-8")
lines = text.split("\n")

row_re = re.compile(r"^\|\s*" + re.escape(spec_id) + r"\s*\|")
modified = False
for i, line in enumerate(lines):
    if not row_re.match(line):
        continue
    # Split the pipe-delimited row, preserving the leading/trailing empty cells.
    parts = line.split("|")
    # parts: ['', ' 001 ', ' title ', ' Specify ', ' Clarify ', ..., ' Implement ', '']
    # Stage cells start at index 3 (after id and title); column 0 = Specify.
    target_idx = 3 + col_idx
    if target_idx >= len(parts) - 1:
        break
    cell = parts[target_idx].strip()
    if cell in ("⬜", "🟡"):
        # Preserve the original cell width so the markdown table stays aligned.
        original_len = len(parts[target_idx])
        parts[target_idx] = ("✅").center(original_len)
        modified = True
    # Mark the next stage as in-progress (🟡) for visibility
    next_idx = target_idx + 1
    if next_idx < len(parts) - 1:
        next_cell = parts[next_idx].strip()
        if next_cell == "⬜":
            original_len = len(parts[next_idx])
            parts[next_idx] = ("🟡").center(original_len)
    lines[i] = "|".join(parts)
    break

if modified:
    p.write_text("\n".join(lines), encoding="utf-8")
    print(f"[roadmap] {spec_id} / {stage} = ✅")
else:
    print(f"[roadmap] No change (row {spec_id} not found or already ✅)")
PYEOF
