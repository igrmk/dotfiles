---
name: review-human
description: >-
  Write open review findings as comments a colleague reads on the merge request:
  a heading of the number and anchor, then one plain comment, with no summary and no fields.
  Use when the user asks for review findings as comments to paste on an MR,
  and when updating a review file whose header says its open findings are such comments.
---

# review-human

Lay out each open finding as one comment to paste on the MR,
instead of the fields of the `format-findings` skill.
Say once in the review file's header
that each open finding is one comment to paste on its anchor line.
Only a file with that sentence gets comments, and it keeps them in any conversation.
When the user asks for comments mid-review, rewrite the open findings in the file.
When the user asks for the fields back, drop the sentence and give the open findings their fields.

## Layout

- The heading is the finding's number and anchor only, e.g. `` ### 5. `pkg/store/query.py:42` ``:
  an MR comment has no summary or category.
- Anchor on a line of a file the MR changes, since GitLab takes line comments only there;
  for a defect elsewhere, anchor on the changed line that causes it.
- Under the heading goes the comment, ready to paste on that line.
- Say "here" for the anchor line;
  name another place only when the reader needs it, by its repo and repo-relative path.
- End the comment without a full stop.
- When the user says a comment is posted, move it from `## Open` to `## Posted`.
  It leaves Posted for Fixed once the MR fixes it, or for Declined once the user accepts a decline.
  A partly fixed one also moves to Fixed, and what is left becomes a new finding.
- A comment leaving Open or Posted keeps its text as the record, with only the outcome above it:
  a `- Fix:` naming the change, or a `- Declined:` with the reason.

## The comment

- Open with what we want done, then say why in one sentence.
- Write for a reader who sees only the lines around the anchor:
  name what a suggestion replaces, back any claim about code outside those lines,
  and leave out asides the point doesn't need.
- When the point depends on a mechanism, walk through it as a list of steps,
  each saying what happens, with the values involved, and what follows.
- Put parallel cases, such as the values of a mapping, in a list,
  one value and exactly what it stands for per item: GitLab shows a single newline as a space.
- Give an example only when it shows something the words don't, and keep it short.
- Match the opener to the finding and vary it:
  "Could we…?" or a plain statement for a defect,
  "How about…?", "Maybe…" or "Totally up to you, but…" for a judgment call, "Nit:" for a small one.
- Say outright where you are unsure, e.g. "I'm not sure this is intended" or "I couldn't check".
- Speak as the user: "I" for their readings and decisions.
- Keep to what the MR changes:
  a defect it didn't introduce gets no comment and goes where the user decides,
  such as the MR that introduced it.
