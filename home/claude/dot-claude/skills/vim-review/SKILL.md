---
name: vim-review
description: >-
  Write code review findings to a Markdown file read in vim,
  with every code location a gF-jumpable path:line.
  Use when the user wants to read a review in vim.
---

# vim-review

Write the findings per the `format-findings` skill, but to a file instead of the reply.

## The file

- Write it where the user says,
  by default in the reviewed repo's main worktree
  to `.claude/reviews/<feature-name>-<prefix>-<YYYY-MM-DD>-<seq>.md`.
  Leave out `-<prefix>` when no letter was given, and `-<seq>` on the first review;
  number later ones from 2.
- The file is the record of the review: never drop a finding from it.
  Keep findings as `###` headings under `## Open`, `## Fixed` and `## Declined`,
  and move a finding between sections as its status changes.
  Under an empty `## Open` write "Nothing left.", and leave out an empty Fixed or Declined.
- A declined finding gets a `- Declined:` field with the reason, right after `- Path:`.
- Give the command to open it: the header's command followed by `&& vi <absolute path>`.
- The user runs vim from the reviewed repo's checkout.
  Put the command that checks out what was reviewed in the header,
  adding `git pull` when the local branch is behind its upstream.
  When the branch is checked out in another worktree, `cd` to that worktree instead.
- Rewrite the file on every change to the list, `/check-fixes` results included,
  then say what changed.
- Wrap per the `reflow` skill.
- Keep field labels plain, e.g. `- Fix:`, since vim shows bold markers as raw asterisks.

## Paths

- A location in the reviewed repo is `<repo-relative path>:<line>`.
- A location in another repo is `<absolute path>:<line>`.
  Add that repo's checkout command to the header, before the reviewed repo's.

## Header

```markdown
# Review of `<what was reviewed>`

Check out what was reviewed with `cd <absolute repo path> && <command>`.
```
