# CLAUDE.md

- A trailing single letter in `/code-review` arguments is not part of the target:
  process the rest as usual,
  and render the findings per the `format-findings` skill invoked with that letter.
- Write the findings of every `/code-review` to a file per the `review-file` skill,
  also when a findings tool reported them.
- When fixing review findings, report the fixed and the declined ones separately,
  with the reason for each decline.
  End the reply with their status lines, per the `review-status` skill.
- When the work in the current repository is on a branch or in a worktree,
  put the corresponding changes in other repositories on a branch or in a worktree too,
  and name it the same if it makes sense.
- Never use less precise synonyms: repeat the word if needed.
