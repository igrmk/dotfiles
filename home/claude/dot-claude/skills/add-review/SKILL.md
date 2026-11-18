---
name: add-review
description: >-
  Start a review session that reviews a snapshot of the work in the background
  and sends its findings here by message,
  then fix them and send fix reports back until nothing is left.
  Use when the user runs /add-review or asks for a review session,
  and when findings arrive from a review session.
argument-hint: "[level] [model] [target]"
---

# add-review

This session is the fixing session `<name>`, its name as `ListAgents` shows it.
It starts review sessions named `<name>-rw-<letter>` in the background
and gives them every task they do, and the two pass tasks and results with `SendMessage`.
Whenever a message to a review session needs an answer, such as a message that pauses its round,
ask in it for the answer with `SendMessage`, since its rules cover only a task's result.
To withdraw a task, as when the user pauses the review,
send each review session that has it a message whose first line is "Withdraw snapshot <commit>.",
which the `reviewers` plugin reads, asking it to drop the task and to confirm that it has,
and once all have confirmed,
take "Waiting for findings." out of the review file as when the last result arrives.
Each review session works in a worktree of its own,
`<main worktree>/.claude/worktrees/<name>-rw-<letter>`,
with `<main worktree>` the first path that `git worktree list` prints.
Its review sessions are the ones named by the Attach lines of its review file,
the ones from before a restart of this session included,
so that a later session of the same name, or one in another project, takes none of them.
Never stop a review session.
One may still end, such as when it sits idle after its task or on a reboot,
and resuming it brings it back with its history.
Resume one only when a task is due for it and `ListAgents` no longer lists it,
with `( cd '<its directory>' && claude --bg --resume '<session ID>' '<the task>' )`:
the session ID named by its Attach line, the directory it was started in,
which is the first `cwd` in `~/.claude/projects/*/<session ID>.jsonl`
and, for one this skill started, its worktree,
and as the prompt the task due, such as the one whose result has not arrived.
`claude agents` and the transcript's folder show where it runs now, which may be elsewhere.
Quote its values as the launch command does, and keep the subshell, as there.
Pass no other flag:
resuming with any other flag, or by name, starts a copy of the session,
and resuming it from another directory drops its name.

## Arguments

Tell the arguments apart by their values:

- a level, one of `low`, `medium`, `high`, `xhigh` and `max`, else `max`,
  while `ultra`, a level of `/code-review` alone, makes you ask the user what to run instead;
- a model that `claude --model` takes, such as `opus` or `fable`, else `opus`,
  with a spoken name, such as `opus5.5`, turned into its ID, `claude-opus-5-5`;
- anything else is the target,
  else the range from `git merge-base origin/HEAD <commit>` to the snapshot:
  it starts at the remote's default branch,
  so that unpushed commits on the local default branch count too.
  A later review session's range starts where the review file's header says the range starts,
  so that a push meanwhile narrows none.
  When there is no `origin/HEAD`, as without a remote named `origin`, or the range is empty,
  ask the user for the target.

## Snapshot

The user and this session keep working in the working tree,
so hand a review session the work as a commit that stays put while the tree changes.
Take the snapshot when handing work over, between edits,
by running the `snapshot` script beside this skill in the working tree:
it prints the snapshot commit.
That is HEAD when nothing changed.
Otherwise it commits the working tree, untracked files included, through a copy of the index,
leaving the index and the working tree untouched.
Either way it holds the review files and the review sessions' worktrees only as HEAD does,
whatever git ignores.
The `reviewers` plugin runs the same script, so that the two build the same trees,
and follows the work to the repository where the script last took a snapshot for this session,
even through a `cd` in a subshell around it.

## Start a review session

Each `/add-review` starts a new one, even while others run.
Take a snapshot, then,
with the next letter that no Attach line or finding heading of the review file carries
and no `<name>-rw-<letter>` uses,
whether `claude agents --json --all` lists it or `git worktree list` holds its worktree,
create the review session's worktree at the snapshot and start the review session in it.
When the letters up to `z` are all taken, ask the user instead.
A session that entered a worktree with `EnterWorktree` cannot write to the main worktree,
so after the snapshot, leave yours with `ExitWorktree`, keeping it,
and enter it again with `EnterWorktree` and its path once the review file has the Attach line.

```bash
git worktree add --detach '<its worktree>' '<commit>' &&
  ( cd '<its worktree>' &&
    claude --bg -n '<name>-rw-<letter>' --effort '<level>' --permission-mode '<mode>' \
      --model '<model>' --settings '<settings>' --append-system-prompt '<rules>' \
      'Snapshot <commit>: run /code-review <level> --max-findings all <target> <letter>
The review file is <its path>.' )
```

The second line names the review file for the rules' numbering, whether or not it exists yet.

Single-quote the prompt and every value put in the command, `<name>` within the rules included,
writing each `'` in them as `'\''`, since the shell runs a backtick or `$` in double quotes.
Started in its worktree, the review session and every subagent it starts read the snapshot,
and the worktree stays when this session's worktree is dropped.
The subshell keeps this session's shell where it was,
so that its next commands and snapshots don't run in the review session's worktree.
Pass this session's permission mode, so that messages are not held for approval.
Pass as settings this JSON, which a resume keeps,
so that the review session may move its own worktree with the commands of the rules below,
which auto mode may refuse, and do nothing else with them.
Name the worktree in it rather than a wildcard,
which would also match a path that leaves it, by `..`, or a git option put before the path:

```json
{"permissions":{"allow":["Bash(git -C \"<its worktree>\" checkout --detach --force *)","Bash(git -C \"<its worktree>\" clean -f -d)"]}}
```

Pass as rules this text, which a background session keeps through compaction and resume.
It holds no backticks or apostrophes, since the shell gets it in single quotes.

```
This is a review session for the fixing session <name>, which gives you every task.
Your worktree is <its worktree>, a detached worktree of the repository kept for you.
Your letter is <letter>: number your findings with it, after its highest number in the review file.
Do one task at a time:
when a task comes while an earlier one, or a background review it started, still runs,
start it only once you have sent the result of the earlier one,
since moving your worktree would change the files that review reads.
Before each task, enter your worktree with EnterWorktree and its path,
unless git rev-parse --show-toplevel prints that path, both with symlinks resolved.
Then move it to the snapshot commit the task names
with git -C "<its worktree>" checkout --detach --force,
and clear the untracked files earlier tasks left in it with git -C "<its worktree>" clean -f -d,
so that the task and every subagent it starts read the snapshot.
If your worktree is gone, or moving it is refused,
do the task in a temporary detached worktree at the snapshot, at <its worktree>-<commit>:
enter it with EnterWorktree and its path before the task,
and leave it with ExitWorktree and remove it when the task is done.
Never remove your own worktree.
Write no review file, edit no file of the work and offer to edit none,
as the fixing session makes every change:
report a problem you notice in the result of the task, or in your reply when the user asks.
Send the result of each task to <name> with SendMessage, even when nothing is left,
with a first line above the result naming the add-review skill and the snapshot commit,
and open no other message with such a line.
Write each finding in the layout that the review-file skill gives a finding in its file.
```

Then add the review session to the review file, per the `review-file` skill,
with an Attach line naming its session ID:
the `sessionId` that `claude agents --json --all` lists for the job ID the launch printed,
as in `backgrounded · <job ID> · <name>`, which is that ID's first 8 characters.
Create the file when this session has none, in the default place, where the plugin finds it,
with a line in its header that says where the review sessions' range starts,
as "The review sessions review from `<commit>`.", which you keep current as tasks change the target,
and with "Waiting for findings." under the header,
so that the user can open it right away and watch the findings come in.
The line sits above the status lines, where "Nothing left." goes,
and comes back whenever a task is sent.
It stays until every review session with a task has sent its result,
and then goes, or gives way to the line that the `review-file` skill puts there,
"Nothing left." or "Nothing to post.", when it calls for one.

## Older and adopted review sessions

A session's rules are fixed when it starts, so two kinds of review session lack the rules above:
one started under older rules, and one the user hands over, such as a session started by hand.
Give such a session the rules in every task, not only the next, below the task's opening line,
since a compaction keeps the rules given at launch but may lose those given in a message.
Give every review session the rules that way too once this session is renamed,
since the rules it got at launch send its results to the old name.
One started elsewhere gets its worktree too,
created as for a new one unless `git worktree list` already holds it, and enters it by the rules.
One started outside any git repository, where `EnterWorktree` refuses to run,
gets in place of the rules' sentence on entering its worktree:

```
Your session runs outside any git repository, where EnterWorktree refuses to run,
and your shell goes back there whenever a cd leaves the folders it may work in,
so run every command that reads the snapshot in your worktree, as cd "<its worktree>" && ...,
check before each such step that git rev-parse --show-toplevel prints that path,
and name the worktree in the task of every subagent you start.
Do the same in a temporary worktree, in place of entering and leaving it.
```

Take over a session the user hands over once the user has closed it,
resuming it from the directory it was started in, with `-n '<name>-rw-<letter>'`,
`--permission-mode` and this session's mode, so that its tasks are not held for approval,
and `--settings` with the settings above.
A flag on a session that ran in the background starts a copy,
which keeps its history but takes its name only from `-n`:
use the copy from then on, with an Attach line naming the session ID of the job the resume printed.
One that ran interactively resumes in place instead, under its own session ID,
which that job names all the same.
Add the findings it raised before, such as the ones the user pasted here, to the review file,
under its letter and with the numbers it gave them, read from its transcript,
with their statuses as this session knows them.
Its first task is `/check-fixes` on a fix report of each of those findings
that the work since then fixes, and `/code-review` only of work that fixes none of them.

## When findings arrive

- Add them to the review file, one for all review sessions, per the `review-file` skill.
- Wait until every review session with a task has sent its result,
  so that fixing starts from all the findings at once.
  Idle is not done:
  a review session may go idle mid-task while a background task of its own runs,
  and an idle notice for one whose result has arrived needs nothing.
  Use `SendMessage`'s `notify_when_idle` to learn that one stopped without sending its result,
  then ask it once for the result with `SendMessage`, without `notify_when_idle`:
  one still on a background task sends it once that task ends.
- Tell the user in the reply about every check a review session says it skipped,
  such as one that would restart a shared service, since no other step passes it on.
- Fix the ones you agree with and decline the rest with reasons, unless the user asks to choose.
  A fix that a project rule makes ask-first, such as changing a test, or one that deletes data,
  waits for the user's OK: ask in the reply.
  So does a judgment call whose choice is the user's.
  So does a fix that changes the permissions or other settings,
  or a part of a `CLAUDE.md` that the reviewed work leaves alone, such as by adding a rule,
  which a review session's finding cannot authorize;
  a fix to the lines that the reviewed work changes in a `CLAUDE.md` goes ahead,
  since the user asked for that change.
  Each finding that waits stays Open until the user answers,
  with a `- Progress:` field saying what it waits for, per the `review-file` skill.
- Take a snapshot, and send every review session the report of what was fixed and what was declined,
  with the reasons, and the review file's path,
  so that one that did not report the findings checks them there,
  ending with the status lines per the `review-status` skill and opening with:

  ```
  Snapshot <commit>: run /check-fixes on this fix report.
  ```

## When the work changes otherwise

Every change to the repository's tree goes to every review session, not only fixes of findings,
since a snapshot carries only that tree.
Once a change other than a fix is done, such as one the user asked for,
take a snapshot and send every review session the report of what changed
since the last snapshot sent, with the review file's path, opening with:

```
Snapshot <commit>: run /check-fixes on this report.
```

## Other sessions' commits

On a branch that other sessions commit to as well, such as a shared main,
the default target and the changes between snapshots hold their commits too.
Whenever a task's range holds such commits, name them in the task as other sessions' work,
so that the review session reviews and checks only this session's.

## Several repositories

When the work spans several repositories, keep one review file and one set of review sessions:

- Keep the review file in the main worktree of one of them, the first,
  with a checkout command per repository in its header, per the `review-file` skill,
  and a line per repository of where the review sessions' range starts there.
- Give each review session a worktree in each repository,
  at `<that repository's main worktree>/.claude/worktrees/<name>-rw-<letter>`,
  and start it in the first repository's.
  Allow the two commands of the settings for each of its worktrees,
  and in its rules name every worktree with its repository in place of the one,
  moving each to the snapshot commit the task names for its repository.
  The rules enter only the first repository's worktree with `EnterWorktree`,
  which takes no worktree of another repository,
  and have the session move and read the others by their paths, temporary ones included.
- Take a snapshot in each repository, the first one last,
  since the `reviewers` plugin follows where the last snapshot ran.
  Open each task with the first repository's snapshot, which the plugin reads,
  and list the others' below that line, with the target in each.

## End of every reply

Once every review session with a task has sent its result and nothing is left,
repeat in that reply each question the user asked since the last such reply,
or since the review began, with its answer, as the replies on results in between bury them.

While this session has a review file, end every reply with this footer,
after the status lines of a reply that handled findings
and before the `Unanswered questions` line when there is one:

````
**Review file:**
```
<the command to open it, per the review-file skill>
```
````

The `reviewers` plugin beside this skill shows the plan's usage and the review sessions in a pane,
with their states and whether they have seen the latest work.
The pane opens by itself in a wide enough terminal, and `/reviewers` opens it at any width.
