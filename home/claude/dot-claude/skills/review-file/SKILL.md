---
name: review-file
description: >-
  Store code review findings in a Markdown file read in vim,
  with every code location a gF-jumpable path:line.
---

# review-file

Write the findings per the `format-findings` skill to a file.

## The file

- Start the file only in the conversation where the user ran the review,
  never in a review agent or its subagents.
  In another conversation, update the file the user names instead of starting one.
- Write it where the user says,
  by default in the reviewed repo's main worktree
  to `.claude/reviews/<feature-name>-<prefix>-<YYYY-MM-DD>-<seq>.md`.
  Keep one file per conversation and letter.
  Leave out `-<prefix>` when no letter was given,
  and add `-<seq>`, numbered from 2, only when another conversation already used the name.
- The file is the record of the review: never drop a finding from it.
  Keep findings as `###` headings under `## Open`, `## Fixed` and `## Declined`,
  and move a finding between sections as its status changes.
  Under an empty `## Open` write "Nothing left.", and leave out an empty Fixed or Declined.
- A declined finding gets a `- Declined:` field with the reason, right after `- Path:`.
- The user runs vim from the reviewed repo's checkout.
  Put the command that checks out what was reviewed in the header,
  adding `git pull` when the local branch is behind its upstream.
  When the branch is checked out in another worktree, `cd` to that worktree instead.
- Put the command that resumes the conversation that ran the review in the header,
  with its session ID from `$CLAUDE_CODE_SESSION_ID`.
  Add the session name when it has one,
  from the last `customTitle` in `~/.claude/projects/*/<session ID>.jsonl`,
  and rewrite the header when the user renames the session.
- Whenever you create the file, give the command to open it:
  the reviewed repo's checkout command from the header, followed by `&& vi <absolute path>`.
- Rewrite the file on every change to the list, `/check-fixes` results included.
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

Resume `<session name>`: `cd <directory Claude started in> && claude -r <session ID>`
```
