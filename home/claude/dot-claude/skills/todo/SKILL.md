---
name: todo
description: >-
  Read or change the todo list, `TODO.md` in the todo repository.
  Use when asked what is left on the todo list, or to add, start, finish or change a task on it,
  and when starting or committing work on a task from the list.
argument-hint: "[#tags] [request]"
---

# todo

The list is `TODO.md` in the checkout of the todo repository that `TODO_DIR` names.
When `TODO_DIR` is unset or names no checkout, say so and do nothing else.
Do the same when the current repository has a `TODO.md` or `todo` file at its root
and `TODO_DIR` names a checkout of another repository: the request may be about that file.
Read the todo repository's `CLAUDE.md` and follow it:
it holds the list format, the commit message format and the pull and push rules.

## Read

Read the list as the remote has it, leaving the checkout's working tree alone:

```bash
git -C <checkout> fetch -q && git -C <checkout> show origin/HEAD:TODO.md
```

## Edit

Make each edit in a new worktree of the checkout, shared with no editor and no other session:

```bash
name=$(openssl rand -hex 4) &&
  git -C <checkout> fetch -q &&
  git -C <checkout> worktree add -q -b "$name" ".claude/worktrees/$name" origin/HEAD
```

- Push every edit without asking, as `git push origin HEAD:<default branch>`:
  the todo repository's `CLAUDE.md` asks for it.
  It goes to the default branch
  even when the current repository's work is on a branch or in a worktree.
- When the push is rejected because the remote has new commits,
  run `git pull --rebase origin <default branch>`,
  resolve any conflict by hand, keeping the edits of both sides, and push again.
  Give up after three rejected pushes.
- On any other failure, such as authentication or network, stop.
- After the push, remove the worktree and its branch,
  and fast-forward the checkout to `origin/HEAD`
  when it is on the default branch with no uncommitted changes.
- On giving up or stopping, keep the worktree and its branch,
  and report the commit's hash and title, the branch and the worktree's path:
  the edit lives only there.

## Order

With no request, or with tags alone, print tasks in these groups:

1. Those overdue or due within seven days, whatever their tags, soonest first.
2. Those with one of the current project tags.
3. The rest.

In groups 2 and 3, the tasks in `### In Progress` come first, then those in `### Todo`,
each in list order.
Print each task's title line as the list has it.

The current project tags are those whose rows in `TAGS.md` name a folder in the current path
or the name in the current repository's `origin` URL.

## No request

With no request, print up to five open tasks to take on now, and change nothing.
Take them in the order the Order section gives, leaving out group 3 unless group 2 is empty:
in a project with tasks of its own, other projects' tasks would only get in the way.

## Request

A request that reads as a task, such as `/todo Try zellij`, adds it to `### Todo`,
where the todo repository's `CLAUDE.md` places it.
Lines after the first go under it as its details.
Any other request says what to do, such as starting, finishing or changing a task.
A request that names no task, such as `/todo done`, means the task of the work at hand;
ask when it is not clear.

## Tags

A request may start with tags, such as `#dot #low` in `/todo #dot #low try zellij`.
Put them on the task the request adds, in the order the todo repository's `CLAUDE.md` gives.
Before committing, look for each tag in the list and in `TAGS.md`.
When a tag found in neither is the name in the current repository's `origin` URL
or names a folder next to the todo repository's checkout, where its projects live,
it is a new project tag: add its row to `TAGS.md` in the same commit.
Any other new tag goes on the task as given, unless it looks like a typo: then ask.

Tags alone print up to five open tasks that have all of them, and change nothing.
Take them in the order the Order section gives.
