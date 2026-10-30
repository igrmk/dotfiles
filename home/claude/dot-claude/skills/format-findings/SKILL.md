---
name: format-findings
description: >-
  Render code review findings as a numbered list that keeps its numbers for the whole conversation:
  a heading with number, summary and category, then Path, Details, Failure and Fix fields each.
  Use when reporting a review's findings, and again on every change to the list.
argument-hint: "[letter]"
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
- Open each finding with a heading: its number, a one-line summary, and its category.
  Never use markdown ordered-list syntax: the renderer renumbers items and erases gaps.
- When invoked with a letter, prefix every number with it in uppercase, e.g. `## B5.`.

## Fields

Every rendered finding carries every field:

```
## 5. Query runs once per row (efficiency)
- **Path:** `pkg/store/query.go:42`
- **Details:** statement of the defect, then what it rests on.
- **Failure:** concrete inputs or state, then the wrong output or crash.
- **Fix:** the one change that resolves it.
```

- Put each field in a bullet with a bold label,
  indenting its continuation lines by two spaces.
- `Path:` is repo-relative `file:line` and points at the line the finding anchors to.
- Category is a short slug: correctness, efficiency, simplification, comment-accuracy,
  docs-accuracy, test-coverage, robustness, style.
  Mark a judgment call after it, e.g. `(style, judgment call)`.
- The failure scenario is concrete: inputs, state, then the outcome.
  A measured figure goes there, with where it was measured.
- `Fix:` names the one change that resolves it.
  Where the finding is a judgment call, the fix may be to accept it and change nothing.

## Writing

- Write each finding to stand alone, so one can be handed over without the rest of the list.
  Never point at another finding by number; restate what the reader needs.
- Prefer wording a reader understands without reading the code.
- Don't use synonyms for well-defined terms: one term per concept.
- Pick the term a human understands over code jargon.
- Put code, commands, paths and identifiers in backticks, headings included.

## Re-rendering

- Re-render the whole list on every change: a dropped finding, an answered question,
  a new one added.
  Read line numbers from the code as it stands.
- Drop declined findings; their numbers stay unused.
  A judgment call accepted as is counts as declined.
- Keep fixed findings after the open ones, under a `# Fixed` heading,
  until the user asks what is left or narrows the list another way;
  from then on render only what they asked for.
- A fixed finding's `Fix:` names the change actually made.
- Always render the list in the reply, unless a skill sends it to a file,
  even when a findings tool has reported the same findings to the UI
  and its instructions say not to duplicate them.
