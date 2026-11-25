---
name: autoreview
description: >-
  Run a review in the background: start review sessions that review snapshots of the work
  and send their findings here by message, fix them and send fix reports back,
  and pause, resume or end the review.
  Use when the user runs /autoreview or asks for a review session,
  and when findings arrive from a review session.
argument-hint: "add [level] [model] [warm] [target] | pause | resume | end"
---

# autoreview

This session is the fixing session `<name>`, its name as `ListAgents` shows it.
It starts review sessions named `<name>-rw-<letter>` in the background
and gives them every task they do, and the two pass tasks and results with `SendMessage`.

Whenever a message to a review session needs an answer,
ask in it for the answer with `SendMessage`, since its rules cover only a task's result,
and not to open the answer with a line that names this skill and a snapshot commit,
which the `reviewers` plugin takes for the task's result.
To withdraw a task, as when the user pauses the review,
send each review session that has it a message whose first line is "Withdraw snapshot <commit>.",
or for several repositories "Withdraw snapshots <commit>, <commit>.",
naming every one of the task's,
which the `reviewers` plugin reads,
asking it to drop the task and stop any background run of it, such as a review's subagent,
and to confirm that it has,
resuming one that `ListAgents` no longer lists, as below, with that message as the prompt,
since a message reaches no session that has ended,
and once all have confirmed,
take "Waiting for findings." out of the review file as when the last result arrives.
While the user has the review paused, keep "Paused." in its place, which the plugin shows,
and send no task until the user resumes the review, which an `add` does first;
then send every review session one task at a new snapshot:
its withdrawn task with what changed meanwhile added to its report,
or for one that had none out, a report of what changed meanwhile, when anything did.

Each review session works in a worktree of its own,
`<main worktree>/.claude/worktrees/<name>-rw-<letter>`,
with `<main worktree>` the first path that `git worktree list` prints.
The worktree stays from task to task,
as moving it to the next snapshot rewrites only the files that changed and keeps what git ignores,
such as installed dependencies and build caches.
The review goes on wherever the work goes, as when this session merges it into another branch,
and takes in every commit this session adds, since its range ends at the snapshot.
Once the user ends the review, withdraw each task still out, as above,
only from the review sessions that `ListAgents` still lists,
as one that has ended gets no task again,
and once all have confirmed,
remove each review session's worktrees with `git worktree remove --force`, as nothing else does,
and take their Attach lines and "Paused." out of the review file,
so that neither the plugin nor a later `add` counts them as this session's.
This session's review sessions are the ones named by the Attach lines of its review file,
the ones from before a restart of this session included,
so that a later fixing session of the same name, or one in another project,
does not count these review sessions as its own.

Never stop a review session.
One may still end, such as when it sits idle after its task or on a reboot,
and resuming it brings it back with its history.

Resume one only when a task, a withdrawal or an answer is due for it
and `ListAgents` no longer lists it,
with `( cd '<its directory>' && claude --bg --resume '<session ID>' '<the prompt>' )`:
the session ID and the directory it was started in, both of which its Attach line names,
or for an Attach line that names no directory, the first `cwd` in its transcript,
`~/.claude/projects/*/<session ID>.jsonl`,
and as the prompt the task, the withdrawal or the answer due,
such as the task whose result has not arrived.
`claude agents` and the transcript's folder show where it runs now, which may be elsewhere.
Quote its values as the launch command does, and keep the subshell, as there.
Pass no other flag:
resuming with any other flag, or by name, starts a copy of the session,
and resuming it from another directory drops its name.
When that directory is the review session's worktree and is gone,
create the worktree again first, at the snapshot of the task due, or of the one withdrawn,
with `git worktree prune`, as git keeps a deleted worktree registered,
then with the launch command's `git worktree add`.

## Verbs

The first argument names what to do, else it is `add`:

- `add` starts a review session, with the arguments below, per Start a review session,
  resuming the review first when the user has it paused.
- `pause` pauses the review, as above.
- `resume` resumes it, as above.
- `end` ends it, as above.

## Arguments of `add`

Tell the arguments apart by their values:

- a level, one of `low`, `medium`, `high`, `xhigh` and `max`, else `max`;
  for `ultra`, ask the user what to run instead,
  as it is no effort a review session can run with
  but a billed review in the cloud that `/code-review` alone starts,
  and only when the user asks for it;
- a model that `claude --model` takes, such as `opus` or `fable`, else `opus`,
  with a spoken name, such as `opus5.5`, turned into its ID, `claude-opus-5-5`;
- `warm`, which starts the review session warm, on the last report sent to the others,
  instead of a `/code-review` of the whole target, as Start a review session says;
- anything else is the target,
  else the range from `git merge-base <remote>/HEAD <commit>` to the snapshot,
  with `<remote>` the remote whose range holds the fewest commits, of those with a `HEAD`,
  as a fork's branch may track the fork, or nothing, while its work starts at `upstream`:
  it starts at that remote's default branch,
  so that unpushed commits on the local default branch count too,
  or for a branch stacked on another of the work, from `git merge-base <that branch> <commit>`,
  so that no commit is reviewed twice.
  A later review session's range starts where the review file's header says the range starts,
  so that a push meanwhile narrows none.
  When no remote has a `HEAD`, or the range is empty, ask the user for the target.

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

Each `/autoreview add` starts a new one, even while others run.
Take a snapshot, then,
with the next letter that no Attach line or finding heading of the review file carries
and no `<name>-rw-<letter>` uses,
whether `claude agents --json --all` lists it or `git worktree list` holds a worktree of it,
`<name>-rw-<letter>` or one with `-<folder>` added, per Several repositories,
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
With `warm`, the prompt is instead the last report sent to the other review sessions,
as they got it, opening with the snapshots just taken, every repository's,
less any rules below its opening line, as the new one has its own from launch,
and naming the snapshots that the report's changes start from, as "Compare <commit> with <commit>.",
which the new one has no earlier task to know,
so that the new one checks the latest fixes and changes and joins the next round;
when no report has gone out yet, ask the user instead, as there is nothing to start from.

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
Your letter is <letter>:
number your findings with it, after the highest number your letter has in the review file.

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
with a first line above the result naming the autoreview skill and the snapshot commit,
and open no other message with such a line.
Write each finding in the layout that the review-file skill gives a finding in its file.

End your reply to each task with one line saying where its result went,
as "Sent the result for snapshot <commit> to <name>.",
and ask the user nothing in it, leaving out any line that counts unanswered questions:
the fixing session asks the user every question,
and a reply that ends asking something shows you as blocked.
```

Then add the review session to the review file, per the `review-file` skill,
with an Attach line naming its worktree as the directory it was started in, and its session ID:
the `sessionId` that `claude agents --json --all` lists for the job ID the launch printed,
as in `backgrounded · <job ID> · <name>`, which is that ID's first 8 characters.

Create the file when this session has none, in the default place, where the plugin finds it,
with a line in its header that says where the review sessions' range starts,
as "The review sessions review from `<commit>`.", which you keep current as tasks change the target,
and move past the default branch's commits that the work takes in, by a rebase or a merge,
to the newest of them, per Other sessions' commits,
and with "Waiting for findings." under the header,
so that the user can open it right away and watch the findings come in.
The line sits above the status lines, where "Nothing left." goes,
and comes back whenever a task is sent.
It stays until every review session with a task has sent its result,
and then goes, or gives way to the line that the `review-file` skill puts there,
"Nothing left." or "Nothing to post.", when it calls for one.

## Older and adopted review sessions

A session's rules are fixed when it starts, so two kinds of review session lack the rules above:
one started under older rules,
and one the user hands over, such as a session started by hand, from any worktree or directory.
Give such a session the rules in every task, not only the next, below the task's opening line,
since a compaction keeps the rules given at launch but may lose those given in a message,
and a resume takes no `--append-system-prompt`.
Give every review session the rules that way too once this session is renamed,
since the rules it got at launch send its results to the old name.

Take over a session the user hands over once the user has closed it,
so that it runs as one this skill started but for those rules:
give it the letter its findings carry when a new one could take that letter but for those findings,
else the next one,
create its worktree at a snapshot as for a new one, unless `git worktree list` already holds it,
and resume it from there with the name and the flags of a new one,
which a resume takes, the level and the model included:

```bash
{ git worktree list --porcelain | grep -qxF 'worktree <its worktree>' ||
    git worktree add --detach '<its worktree>' '<commit>'; } &&
  ( cd '<its worktree>' &&
    claude --bg --resume '<session ID>' -n '<name>-rw-<letter>' --effort '<level>' \
      --permission-mode '<mode>' --model '<model>' --settings '<settings>' '<its first task>' )
```

The session then runs in its worktree, as one this skill started does,
since a resume finds the session by its ID from any directory and runs it in the one it starts from.
A flag on a session that ran in the background starts a copy,
which keeps its history but takes its name only from `-n`:
use the copy from then on,
with an Attach line naming the session ID of the job the resume printed and its worktree.
One that ran interactively resumes in place instead, under its own session ID,
which that job names all the same.

Add the findings the adopted session raised before that the review file lacks,
as the ones the user pasted here may be there already,
under the letter it gets and with the numbers it gave them, read from its transcript,
with their statuses as this session knows them.
Its first task is `/check-fixes` on a fix report of each of those findings
that the work since then fixes, and `/code-review` only of work that fixes none of them.
That task names the letter they now carry when it got another, as its transcript holds the old one.

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
  Busy is not working either:
  a review session may wait on what never comes,
  such as a subagent of its own that waits for a line its log never writes,
  an idle one with its task out may wait on a background run of its own that never ends,
  and one may stay busy after its result on a background run it left behind.
  When one on its task, or busy after its result, has written to no transcript,
  its subagents' included, for ten minutes, and again each time that time doubles,
  the `reviewers` plugin sends this session a message, unless the user has the review paused.
  Then read the ends of its transcript and of its subagents' transcripts written last,
  among which the work under way is.
  When it is stuck, tell it with `SendMessage` what is stuck and to go on,
  or after its result, which background runs of its own to stop,
  asking for no answer but a result that is due;
  otherwise, as on a long command, leave it until the next such message.
  When one is blocked on its task,
  as its turn ended on a question or it waits on a prompt only the user can answer,
  the plugin sends this session a message once.
  Then read the end of its transcript, and answer its question,
  as its turn has ended, by resuming it, as above, with the answer as the prompt,
  asking for no answer but the result,
  or ask the user, as for a prompt,
  which the user answers in `claude attach <job ID>`, as its Attach line gives it.
- Tell the user in the reply about every check a review session says it skipped,
  such as one that would restart a shared service, since no other step passes it on.
- Fix the ones you agree with and decline the rest with reasons, unless the user asks to choose.
  Make the simplest change that covers each failure, which may be simpler than the suggested fix,
  as a check that replaces a parser, and say so in the report;
  decline a suggested fix whose code or rules cost more than the failure it covers.
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
  In the reply, call it open for the user's answer, not something the review waits on,
  as it holds nothing up: the review sessions review whatever snapshot they get.
- Once a round has fixed or declined a finding,
  take a snapshot, and send every review session the report of what was fixed and what was declined,
  with the reasons, and the review file's path,
  so that one that did not report the findings checks them there,
  ending with the status lines per the `review-status` skill and opening with:

  ```
  Snapshot <commit>: run /check-fixes on this fix report.
  ```

  A round that fixed and declined nothing, as when every finding left is open for the user's answer,
  sends no report: the next one goes once the user answers, or the work changes otherwise.

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
the default target and the changes between snapshots hold their commits too,
as they do the default branch's commits that the work takes in, by a rebase onto it or a merge.
Whenever a task's range holds such commits, name them in the task as other sessions' work,
so that the review session reviews and checks only this session's.
When the user asks to check them, such as pulled updates,
the review sessions check, as a change,
those that have to do with the work, such as by touching its files,
and the rest only when the user asks for those as well:
take a snapshot and send every review session a report of the updates they check,
per "When the work changes otherwise",
that asks to check them, not naming them as other sessions' work, which `/check-fixes` leaves out.

## Several repositories

When the work spans several repositories, keep one review file and one set of review sessions,
and treat every repository alike.
Count each worktree of the work as a repository of its own,
as when the work is split into branches of one repository, each in a worktree,
such as one to deploy now and one to clean up later,
since every review session reviews all of this session's work.
Leave out a repository whose snapshot holds nothing past where its range would start,
as a worktree with no commits of the work yet,
from the target, the snapshots and the checkout lines until it holds something,
but give the review sessions their worktrees there all the same,
so that their settings allow moving those once it does.
Run each repository's commands in it, as `( cd '<repository>' && ... )`,
since this session may run outside all of them, such as in a directory that holds them.
Take the repositories in the order the target names them:

- Place the review file, with its checkout lines,
  as the `review-file` skill gives them for several repositories,
  and give it a line per repository of where the review sessions' range starts there.
- Give each review session a worktree in each repository,
  at `<that repository's main worktree>/.claude/worktrees/<name>-rw-<letter>`,
  with `-<folder>` added for each further worktree of the work in the same repository,
  `<folder>` being the name of that worktree's folder,
  and start it in the worktree of the first repository, as it runs in one.
  Allow the two commands of the settings for each of its worktrees,
  and in its rules name every worktree with its repository in place of the one,
  moving each to the snapshot commit the task names for its repository.
  The rules enter only the worktree it started in with `EnterWorktree`,
  which takes no worktree of another repository,
  and have the session move and read the others by their paths, temporary ones included.
- Take a snapshot in each repository, and open each task with all of them, in that order,
  as `Snapshots <commit>, <commit>: run /code-review ...`, which the `reviewers` plugin reads,
  with a line `<absolute repository path>: <commit>` per repository below it,
  even for a task of one,
  by which the plugin tells the worktree of each snapshot,
  as the worktrees of a repository hold each other's commits.
- Give `/code-review` one target that names every repository's range alike,
  as `the range <start>..<commit> in <repository path> and the range ...`:
  one review of them all finds what it would in each,
  where a review per repository multiplies the cost by their number.

When the work takes in another repository later,
create each review session's worktree there as for a new one,
and give it the rules naming every worktree in every task, per Older and adopted review sessions,
since those it got at launch name only the first ones;
where its settings do not allow moving the new worktree, the rules' temporary worktree serves.

A session with several review files, as from before a split of the work counted as one review,
merges them into the first:
move the others' findings, checkout lines, range lines and Attach lines into it,
take the Attach lines out of the others, so that the plugin finds the first alone,
and give each review session the worktrees it lacks, as above.

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

The `reviewers` plugin in this skill's folder, the folder of a Claude Code plugin as well,
shows the plan's usage and the review sessions in a pane, with their states,
as nudging once one busy, or idle with its task out, has written to no transcript for ten minutes,
unless the user has the review paused, and whether they have seen the latest work.
The pane opens by itself in a wide enough terminal, and `/reviewers` opens it at any width.

Claude Code loads the plugin only as a session starts,
so a session started before the plugin was installed shows no pane until it restarts.
To show the pane in such a session without a restart, when the user asks for it,
load the plugin-authoring skill,
which has Claude Code watch this session's mods folder,
the folder `~/.claude/dev-mods/<session ID>`,
and link this skill's folder into it,
never copy it, since a copy misses every later change to the plugin:

```bash
mkdir -p ~/.claude/dev-mods/"$CLAUDE_CODE_SESSION_ID" &&
  ln -sfn "<this skill's folder>" ~/.claude/dev-mods/"$CLAUDE_CODE_SESSION_ID"/reviewers
```

The pane loads when the turn ends, once the mods are on:
the auto and bypass permission modes turn them on unasked, dontAsk never does,
and any other mode asks the user first.
Once the session restarts, remove the link before anything else:
Claude Code then loads the plugin from this skill's folder as well,
and with both loaded the pane vanishes.
