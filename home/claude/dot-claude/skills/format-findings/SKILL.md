---
name: format-findings
description: >-
  Render code review findings as a numbered list that keeps its numbers for the whole conversation:
  bold literal numbers, file:line, category, summary, failure scenario, and a Fix line each.
  Use when reporting a review's findings, and again on every change to the list.
---

# format-findings

One format for review findings, in any project, from the first report to the last re-render.

## What goes in

- Report only; never fix anything unless asked.
- Every defect belongs in the enumerated list.
  Never state one in prose, in another finding's body, or in a fix suggestion.
- When a comment at or near the code documents a choice as deliberate, that is the answer.
  Report a finding against it only when you can show its reasoning or its numbers are wrong,
  and say so explicitly.
- Always look for simplifications, in new code and in fixes as much as in the diff.

## Numbering

- Enumerate findings and never renumber.
  A dropped finding leaves a gap; a new one takes the next unused number.
- Start each finding's paragraph with a bold literal number, e.g. `**5.**`.
  Never use markdown ordered-list syntax: the renderer renumbers items and erases gaps.

## Fields

Every rendered finding carries every field; a status never replaces them:

```
**5.** `pkg/store/query.go:42` — efficiency.
One-sentence statement of the defect, then what it rests on.
Failure: concrete inputs or state, then the wrong output or crash.
Fix: the one change that resolves it.
```

- `file:line` is repo-relative and points at the line the finding anchors to.
- Category is a short slug: correctness, efficiency, simplification, comment-accuracy,
  docs-accuracy, test-coverage, robustness, style.
  Mark a judgment call as such after the category.
- The failure scenario is concrete: inputs, state, then the outcome.
  A measured figure goes there, with where it was measured.
- Close with `Fix:` on its own line, one line naming the change.
  Where the finding is a judgment call, the fix may be to accept it and change nothing.
- Write each finding to stand alone, so one can be handed over without the rest of the list.
  Never point at another finding by number; restate what the reader needs.

## Re-rendering

- Re-render the whole list on every change: a dropped finding, an answered question,
  a new one added.
- The list keeps resolved findings and drops rejected ones,
  until the user asks what is left or constrains the list in another way;
  from then on render only what fits the constraint.
- Always render the list in the reply,
  even when a findings tool has reported the same findings to the UI
  and its instructions say not to duplicate them.

## While reviewing

- Never touch the working tree.
  Run mutation tests and other experiments in a temporary worktree or copy.
