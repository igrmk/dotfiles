---
name: check-fixes
description: >-
  Check the fixes made for the last code review's findings:
  say whether they are sound, list only what is genuinely left,
  and add new findings for defects the fixes introduced
  and for improvements or simplifications of the fixes.
  Use after the user applied fixes for a rendered findings list.
---

# check-fixes

A follow-up review of the fixes for the findings last rendered in this conversation.
Report only; never fix anything.

## Find the fix set

- The baseline is the commit or diff the findings were reported against.
  The fixed state is whatever replaced it: an amended commit, new commits, or the working tree.
  Diff the two; that diff is the fix set.
- Never touch the working tree.
  When the fixed state sits on another branch, work in the worktree that holds it,
  or in a temporary one.
  Run experiments in a scratch database or a copy, never in shared data.

## Check each finding

For every finding in the last rendered list, except those the user declined:

- Read the fix, not just the diff hunk:
  the surrounding code, the comment it changed, the doc it points to.
- Decide: fixed, fixed but defective, partly fixed, or untouched.
- A comment or doc the fix rewrote must be true of the code as it now stands.
  A stale phrase left behind by a fix is a new finding.
- When soundness rests on a claim (a plan, a timing, a default), measure it rather than assume it.
- Run the project's checks on the fixed state: build, vet, lint, tests.
  Report their results plainly, failures with output.

## Report

Lead with the verdict: sound or not, and what the checks said.
Then one line tallying which findings are fixed.
Do not re-render fixed findings.

Render only:

- findings genuinely left: untouched or partly fixed, under their original numbers;
- new findings, numbered after the highest number ever used in this conversation, for:
  a defect a fix introduced, a comment or doc a fix left stale,
  and an improvement or simplification of a fix, with its evidence.

Each finding is one paragraph opening with a bold literal number, e.g. `**5.**`,
never a markdown ordered-list item, which the renderer would renumber:

```
**5.** `pkg/store/query.go:42` — efficiency.
One-sentence statement of the defect, then what it rests on.
Failure: concrete inputs or state, then the wrong output or crash.
Fix: the one change that resolves it.
```

Every finding carries every field: number, repo-relative `file:line`, a category slug,
summary, failure scenario, and `Fix:` on its own line.
A status never replaces them.
Never renumber.
Never state a defect outside the enumerated list.
Write each finding to stand alone, without reference to the others.
