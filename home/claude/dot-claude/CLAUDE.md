# CLAUDE.md

- A trailing single letter in `/code-review` arguments is not part of the target:
  process the rest as usual,
  and render the findings per the `format-findings` skill invoked with that letter.
- When fixing review findings, report the fixed and the declined ones separately,
  with the reason for each decline.
- When the work in the current repository is on a branch or in a worktree,
  put the corresponding changes in other repositories on a branch or in a worktree too,
  and name it the same if it makes sense.
