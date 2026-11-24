---
name: review-file
description: >-
  Store code review findings in a Markdown file read in vim,
  with every code location a gF-jumpable path:line.
---

# review-file

Write the findings per the `format-findings` skill to a file.
Its re-rendering rules, which drop, group or narrow findings, are for the reply:
the file keeps every finding in place, per The file.

## The file

- Start the file only in the conversation where the user ran the review,
  never in a review agent or its subagents, and never in a review session:
  its fixing session keeps the file, per Review sessions.
  In another conversation, update the file the user names instead of starting one.
- Write it where the user says,
  by default in the reviewed repo's main worktree
  to `.claude/reviews/<feature-name>-<prefix>-<YYYY-MM-DD>-<seq>.review`.
  Keep one file per conversation and letter, except per Review sessions.
  Leave out `-<prefix>` when no letter was given,
  and add `-<seq>`, numbered from 2, only when another conversation already used the name.
  For a review of several repos, the default place is the directory the session was started in,
  or, when that directory is inside a repo, that repo's main worktree.
- A session that entered a worktree with `EnterWorktree` cannot write to the main worktree:
  to write the file there, leave the worktree with `ExitWorktree`, keeping it, write the file,
  and enter the worktree again with `EnterWorktree` and its path.
- The file is the record of the review: never drop a finding from it.
  Keep findings as `###` headings, adding each at the end of the file as it comes,
  and never move one, so that nothing jumps while the user watches the file.
  Give each a `- Status:` field right after its heading:
  `Open`, `Disputed`, `Fixed`, `Declined`, or `Posted` for a comment posted on a colleague's MR,
  per the `review-human` skill.
  As the status changes, change that field, the outcome fields that go with it,
  and the status lines at the top.
  The outcome fields are the `- Fix:` of a fixed finding, naming the change made,
  `- Declined:`, `- Disputed:` and `- Progress:`.
- Right under the header, give a plain line per status that has findings, with their numbers,
  such as `Open: A3`, in the order of the statuses above, each line's numbers in the file's order,
  with an empty line between two statuses, since a long one wraps into the next.
  Above them write "Nothing left." when no finding is Open, Disputed or Posted,
  or "Nothing to post." when none is Open or Disputed but some are Posted.
- A declined finding gets a `- Declined:` field with the reason, right after `- Path:`.
  A disputed one keeps that field, with a `- Disputed:` field answering the reason right after it.
- When a change moves the code that an open, disputed or posted finding points at,
  update the line numbers,
  in its Path and other fields and in a heading's anchor per the `review-human` skill alike,
  so that gF still lands on them.
  A fixed or declined finding keeps its numbers as its record of the code it was about.
- A finding fixed in part, with the rest declined, is Fixed,
  with a `- Declined:` field for that rest.
  One whose rest is still to do, or waits, such as on the user's answer, stays Open,
  with a `- Progress:` field right after `- Path:`
  saying what is done and what is left or what it waits for,
  except a comment for an MR, which the `review-human` skill handles.
- The user runs vim from the reviewed repo's checkout.
  Put the command that checks out what was reviewed in the header,
  adding `git pull` when the local branch is behind its upstream.
  When the branch is checked out in another worktree, `cd` to that worktree instead.
  For several repos, give each its own such line, all worded alike,
  in the order the review's target names them.
- Once the reviewed branch is merged into the default branch,
  point that command at the main worktree, since the branch's worktree is dropped after the merge.
- Put the command that resumes the conversation that ran the review in the header,
  with its session ID from `$CLAUDE_CODE_SESSION_ID`.
  Add the session name when it has one,
  from the last `customTitle` in `~/.claude/projects/*/<session ID>.jsonl`,
  and rewrite the header when the user renames the session,
  and when the conversation goes on under a new session ID,
  as after the user leaves for the agents view:
  when the resume line names a session whose transcript's `continued-in` records,
  the last ones of `~/.claude/projects/*/<session ID>.jsonl`, lead to `$CLAUDE_CODE_SESSION_ID`.
  Another conversation that updates the file leaves the resume line alone,
  except per Review sessions.
- Whenever you create the file, give the command to open it:
  the reviewed repo's checkout command from the header, followed by `&& vi <path>`,
  the path relative to the directory that command enters when the file is under it, else absolute.
  For several repos,
  the command is `cd <the directory that holds the file's .claude folder> && vi <path>`.
- Update the file on every change to the list, `/check-fixes` results included,
  editing the lines that change, and write it whole only when creating it,
  or when first updating a file in an older layout to put it in this one,
  such as a file with `## Open`, `## Fixed` and `## Declined` sections
  in place of `- Status:` fields.
  Then rename a `.md` file to `.review`, where the editor colors the statuses,
  and give the command to open it again.
- Wrap per the `reflow` skill.
- Keep field labels plain, e.g. `- Fix:`, since vim shows bold markers as raw asterisks.

## Review sessions

The fixing session of review sessions, as the `autoreview` skill names them,
keeps one file for the findings of all of them, with no letter in its name.

- Add each finding as it arrives, keeping the review session's wording,
  and give it the layout of The file where it lacks it:
  plain labels, its locations as the `path:line` of Paths, and wrapped per The file.
  Replace it when the review session renders it again, such as with its Path's line moved,
  or as partly fixed, with a `- Progress:` field,
  keeping the outcome fields this session gave it, and its status,
  unless the rendering finds it left, which makes it Open,
  or disputes its decline, which makes it Disputed,
  and merging the new rendering's `- Progress:` field into the one it has.
- Change only its status, the outcome fields that go with it and its line numbers, per The file.
- Add each finding the user reports from outside the review sessions,
  such as a colleague's MR comment, as it comes, with who raised it in its Details.
  Keep the label its reporter gave it, such as P1,
  unless another finding in the file has it or another reporter carries its letter:
  one whose findings carry it, or a review session whose name or Attach line carries it,
  as one that has not reported yet still numbers its findings with it.
  Give the others a letter of the reporter's own that its labels do not use,
  as those go on with numbers of their own:
  the first letter of their name, or an unused letter if another reporter carries it.
  Keep a bare number the reporter gave, as E3 for 3, unless another finding has it,
  and number the rest after the highest number with that letter in the file,
  as numbers go per letter.
- Under the resume line in the header, add an attach line per review session, as in Header.
  A conversation that adds review sessions to a file another conversation started
  points the resume line at itself, as on a rename,
  since the `reviewers` plugin finds a fixing session's file by that line.

## Paths

- A location in the reviewed repo is `<repo-relative path>:<line>`.
  In a review of several repos,
  it is the path of the file in the checkout that its repo's checkout line enters,
  not in a review session's worktree,
  relative to the directory the open command enters when it is under that directory, else absolute.
- Write a location in the file bare, with no backticks around it,
  except in a comment to paste on an MR, per the `review-human` skill,
  where it goes in backticks, since GitLab renders a `__` in a bare path as bold.
- A location in another repo is `<absolute path>:<line>`.
  Add that repo's checkout command to the header, before the reviewed repo's.

## Header

```markdown
# Review of `<what was reviewed>`

Check out what was reviewed with `cd <absolute repo path> && <command>`.

Resume `<session name>`: `cd <directory Claude started in> && claude -r <session ID>`

Attach `<review session name>`, session `<session ID>`, from `<directory>`: `claude attach <job ID>`
```

The Attach line goes only in a fixing session's file, one per review session,
with the session ID that the `autoreview` skill names,
the directory the review session was started in, from which a resume of it runs,
and as the job ID the session ID's first 8 characters,
which `claude attach` takes even where another job's name holds the review session's.
