---
name: check-fixes
description: >-
  Check the fixes made for the last code review's findings:
  say whether they are sound, dispute declines whose reasons do not hold,
  list only what is genuinely left,
  and add new findings for defects the fixes introduced
  and for improvements or simplifications of the fixes.
  Use after the user applied fixes for a rendered findings list.
argument-hint: "[focus]"
---

# check-fixes

A follow-up review of the fixes for the findings last rendered in this conversation,
and for the findings of the review file the request names, as Check each finding picks them.
Report only; never fix anything.
A request may name where to look hardest, such as a finding, a file or a concern:
check that first and most closely, and still check the rest.

## Find the fix set

- The baseline is the commit or diff the findings were reported against.
  The fixed state is whatever replaced it: an amended commit, new commits, or the working tree.
  Diff the two; that diff is the fix set.
- When the working tree is clean, the fixed state is HEAD:
  note its hash when you start and check that commit, since the working tree may change meanwhile.
  Read it with `git show` and `git diff`, and name it in the report.
  Run the checks in place only in a review session's own worktree,
  else in a temporary worktree at it, since another session may change the working tree meanwhile.
  In place, run the project's clean step first,
  since build output that earlier snapshots left can make a check pass,
  and run the checks in a temporary worktree instead when they leave such output with no clean step.
- Never touch a working tree that another session may use, or move its HEAD,
  but for the clean step and the checks in a review session's own worktree, as above.
  When the fixed state sits on another branch, work in the worktree that holds it,
  or in a temporary one created at it.
  Drop every temporary worktree once the check is done.
  A subagent names the worktree in every command (e.g. `make -C <dir> test`):
  its `cd` lasts one Bash call, and the next command runs in the main checkout.
  Run experiments in a scratch database or a copy, never in shared data.

## Check each finding

For every finding that is not Declined, in the last rendered list or the review file,
that the request names, that is still Open, Disputed or Posted, or whose code the fix set touches,
leaving out the changes the request names as other sessions' work:

- Read the fix, not just the diff hunk:
  the surrounding code, the comment it changed, the doc it points to.
- Decide: fixed, fixed but defective, partly fixed, or untouched.
- A comment or doc the fix rewrote must be true of the code as it now stands.
  A stale phrase left behind by a fix is a new finding.
- Check every fix for clarity as well as correctness.
  A vague or ambiguous rewrite is a new finding.
- When soundness rests on a claim (a plan, a timing, a default), measure it rather than assume it.
- Run the project's checks that touch nothing shared on the fixed state: build, vet, lint, tests.
  Skip one that restarts or writes a shared service, such as a running container or its volumes,
  and say so in the report.
  Report their results plainly, failures with output.

## Check each decline

For every finding of the last rendered list or the review file declined since,
in this conversation or in a fix report, with the reason given there:

- Weigh the reason for the decline against the code and the finding.
- Dispute the decline when the reason does not hold,
  such as when it rests on a wrong claim about the code or misreads the finding;
  otherwise accept it.
- Dispute a finding once: a decline repeated after a dispute stands.

## Check the other changes

A report may also describe changes that fix no finding, such as ones the user asked for.
Review every such change in the fix set as a code review would, whether or not any finding is open,
and report its defects as new findings.
Leave out the changes the request names as other sessions' work,
such as their commits on a branch that several sessions share.

## Report

Lead with the verdict: sound or not, and what the checks said.
Then one line tallying which findings are fixed and which declines are disputed.
When nothing is left, nothing is new and no decline is disputed,
open with "Nothing left." and stay that brief, naming any check you skipped.

Render only, as when the user asks what is left:

- findings genuinely left: untouched or partly fixed, under their original numbers,
  a partly fixed one rewritten to describe only what is left,
  or per the `review-human` skill if posted.
  Call one that is open for the user's answer, as its `- Progress:` field says,
  open, not something the review waits on, since it holds nothing up.
  A partly fixed finding kept in a review file, which keeps each finding's text as its record,
  keeps its text instead, with a `- Progress:` field saying what is done and what is left,
  except a comment for an MR, per the `review-human` skill:
  one not posted yet is rewritten to ask only for what is left,
  and a posted one's rest is a new comment to paste;
- disputed declines, under their original numbers,
  with `Declined:` and `Disputed:` fields per the `format-findings` skill;
- new findings, with this conversation's letter,
  numbered after the highest number with that letter in this conversation or the review file, for:
  a defect a fix introduced, a comment or doc a fix left stale, a vague or ambiguous rewrite,
  an improvement or simplification of a fix, with its evidence,
  and a defect in a change that fixes no finding.

Render findings per the `format-findings` skill.
