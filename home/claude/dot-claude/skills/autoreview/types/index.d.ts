// A review session of this session, as the autoreview skill names it: `<session name>-rw-<letter>`
export type Reviewer = {
  // Its letter, such as `A`, as its findings carry it, or its whole name when it is named otherwise
  label: string
  // When neither busy nor waiting, blocked as its job ended its turn needing an answer on a task,
  // failed as its job ended on an error, and idle otherwise,
  // as when its session has ended, or when it asked the user something with no task out
  status: 'busy' | 'waiting' | 'blocked' | 'failed' | 'idle'
  // The task whose result it has not sent yet, unless withdrawn, while it is busy on it:
  // a first review, or a check of what was updated since, fixes and other changes alike.
  // A row that is not busy leaves it out.
  task?: 'reviewing' | 'verifying'
  // When it started on that task, in milliseconds since the epoch
  since?: number
  // When it or a subagent of its last wrote to a transcript, in milliseconds since the epoch,
  // while it is busy, or idle with its task out, and has written nothing for ten minutes since,
  // unless the review is paused,
  // as when it waits on what never comes, on a background run left after its result,
  // or runs a long command; its row then shows it nudging, with how long
  quietSince?: number
  // When it got its first task, else when its session started, in milliseconds since the epoch
  startedAt?: number
  // The model and the effort it last ran with, such as `Opus 5.5` and `max`
  model?: string
  effort?: string
  // How many tasks it was given, first reviews and checks alike, less those withdrawn
  rounds: number
  // How many of the review file's findings carry its letter
  findings: number
  // How many new findings its last result gave, those that carry its letter
  // numbered past the highest its earlier results gave that letter
  lastFound?: number
  // When its last round finished, by its result, in milliseconds since the epoch
  lastRoundAt?: number
  // How long its last round took, in milliseconds:
  // from when its clock started, as the pane shows it while it is busy, to its result
  lastRoundMs?: number
  // The snapshot commits of its last task not withdrawn, one per repository
  snapshots?: string[]
  // Whether a snapshot taken now would hold another tree than those, in any repository;
  // absent when it is not known
  hasNewChanges?: boolean
}

// A reading of the plan's usage, as a session's last response reported it:
// when it was taken, in milliseconds since the epoch,
// and its windows, such as `five_hour` at 34 percent, with when each resets
export type Usage = {
  at: number
  windows: { kind: string; percentUsed: number; resetsAt?: number }[]
}

export type Board = {
  reviewers: Reviewer[]
  // Whether the review file says the user has the review paused
  isPaused?: boolean
  // A failure of the pane's own that keeps the rows from being current,
  // such as `claude agents` failing, and when it began, in milliseconds since the epoch
  error?: { text: string; since: number }
}

declare module 'claude-code' {
  interface PluginState {
    reviewers: {
      board: Shaped<Board>
      usage: Shaped<Usage>
      // Whether the user closed the pane by hand, so that it stays closed until `/reviewers`
      closed: Shaped<boolean>
      // The directory where the work is, as the worktree this session stepped out of, keeping it;
      // empty until the session first enters or leaves a worktree or takes a snapshot,
      // or takes the directory of the session it went on from
      workDir: Shaped<string>
    }
  }
}
