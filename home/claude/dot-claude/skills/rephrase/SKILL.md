---
name: rephrase
description: >-
  Reword and trim the comments and docs of the latest change, or a draft the user names,
  where they are hard to understand, bloated or machine-sounding.
  Use when asked to rephrase, reword or trim comments, docs, a draft or "the texts you added",
  or to make them clearer, shorter, plainer or more human.
argument-hint: "[commit, range or path]"
model: fable
---

# rephrase

Reword the texts that are hard to understand, hard to read or machine-sounding,
cut the bloat, and leave the rest alone.
Cutting is usually most of the work.

## Scope

The first of these that is not empty:

1. What the user names: a commit, a range, files, "the texts you added",
   or a draft in the conversation, which you rewrite in the reply.
2. The uncommitted work, plus the commits on no remote and on no other local branch:
   `git log --stat HEAD --not --remotes --exclude="$(git branch --show-current)" --branches`
3. The last commit.

Take the comment and doc lines the change added or reworded, not the ones it only moved.
Leave out an untracked file that looks unrelated.
Ask when the scope is far larger than the request suggests.

Leave alone, unless asked: generated and vendored files, directives that tools read, and doc tags.

## Rewrite

Read each text as someone who knows the project but saw neither the diff nor the conversation.
Where that reader would stumble, say it the way you would say it aloud to a colleague.
Cut everything that reader would not miss, and keep every fact that reader needs.

- Add only facts you checked in the code for every case it handles, the failed ones included.
- Keep a claim the code contradicts: the bug may be in the code.
- Comment the non-obvious why, not what the code already says.
- One line is the default for a code comment.
- Keep a doc comment that a linter or a convention requires, even one that only restates the name.
- Lead with the point; the reasoning, when needed, comes after it.
- Use the project's terms, else the established term, and repeat a word rather than vary it.
- A fact stated in several places gets the same wording in each.
- The project's own rules win over this skill.

## Procedure

1. Rewrite the texts in scope.
2. Check each rewrite for a fact lost, added unchecked or made false.
3. Wrap the rewrites with the project's own skill for that, else per the `reflow` skill.
4. Commit the rewrites as the project's rules say; where they say nothing, commit nothing.
   Commit no text that was uncommitted, and no file that has other uncommitted edits.
5. Report the scope and the touched files in one line.
   After a commit, add the command to see the rewrites:
   `git diff <hash before your commits> <hash after>`.
   List separately what rewording cannot fix: a claim the code contradicts, a misleading name.
