# CLAUDE.md

- A trailing single letter in `/code-review` arguments is not part of the target:
  process the rest as usual,
  and render the findings per the `format-findings` skill invoked with that letter.
- Write the findings of every `/code-review` to a file per the `review-file` skill,
  also when a findings tool reported them.
- Consistency comes first:
  make a feature behave like its siblings and like the tool it extends, in every mode and case,
  and decline a review finding whose fix would break that.
- When fixing review findings, report the fixed and the declined ones separately,
  with the reason for each decline, referring to the user as "the user", not "you".
  End the reply with their status lines, per the `review-status` skill.
- When the work in the current repository is on a branch or in a worktree,
  put the corresponding changes in other repositories on a branch or in a worktree too,
  and name it the same if it makes sense, except in a repository you created for this work:
  work on its default branch there.
- Drop a worktree once its branch is merged into the default branch
  and it has no uncommitted changes, and the branch with it;
  drop a temporary one you created once its task is done.
- Never use less precise synonyms:
  repeat the word if needed, and use the plain word over a paraphrase.
  For example, call anything:
  - hardcoded "hardcoded"
  - cached "cached"
  - a UI "UI"
- A rule the user states goes in a CLAUDE.md the user owns, not in memory:
  a rule about one project in the nearest such file at or above it, any other here,
  without work details, since this file is public.
- Make an obvious fix to your own work and report it, rather than proposing it and waiting.
- Once you change a skill or rule that you follow,
  apply the change to the work you are doing under it, such as a review you run.
- Make a change the user suggests once you agree with it, rather than asking whether to,
  except while you review,
  where it goes into a finding or a comment unless the user asks for the change.
- Never read another machine's Claude Code data.
- Before guessing why another Claude session or a subagent behaves as it does, ask it,
  also when the user asks.
- Answer each question sent mid-turn at the end of that turn's final message.
- Say the important thing first and only then why:
  an instruction before its reason, and a consequence before its cause.
- If any question asked by or to the user is still unanswered,
  end the reply with `Unanswered questions: N`, where N is how many are unanswered
- Before starting a piece of work, look for a matching task in the todo list, per the `todo` skill,
  and when one matches, move it to `### In Progress`.
  Skip this when the `todo` skill would do nothing else.
- Keep a commit subject under 70 characters; make it longer only when it cannot be said in 70.
- Fold a change that belongs in an unpushed commit into it with `git commit --fixup` and autosquash,
  never a follow-up commit, but first check with `git status` that the commit is still unpushed,
  as the user may have pushed it; the same goes for an amend or a squash.
- Write plain-text prose docs and code comments per the `reflow` skill.
- In `--` comments, mark list items with `*`, not `-`.
- Describe in a comment or doc what the thing is and does for good,
  not how it differs from its previous states or what it replaces;
  mention those in passing, if they need mentioning at all.
- Before testing nvim, read `~/.claude/docs/nvim.md`.
