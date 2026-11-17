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
- Drop a worktree once its branch is merged into the default branch
  and it has no uncommitted changes, and the branch with it;
  drop a temporary one you created once its task is done.
- Never use less precise synonyms:
  repeat the word if needed, and use the plain word over a paraphrase.
  For example, call anything:
  - hardcoded "hardcoded"
  - cached "cached"
- A rule the user states goes in a CLAUDE.md the user owns, not in memory:
  a rule about one project in the nearest such file at or above it, any other here,
  without work details, since this file is public.
- Answer each question sent mid-turn in that turn's final message.
- If any question asked by or to the user is still unanswered,
  end the reply with `Unanswered questions: N`, where N is how many are unanswered
- Before starting a piece of work, look for a matching task in the todo list, per the `todo` skill,
  and when one matches, move it to `### In Progress`.
  Skip this when the `todo` skill would do nothing else.
- Keep a commit subject under 70 characters; make it longer only when it cannot be said in 70.
