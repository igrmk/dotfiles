// A review session of this session, as the add-review skill names it: `<session name>-rw-<letter>`
export type Reviewer = {
  // Its letter's part of the name, such as `rw-a`
  label: string
  // When neither busy nor waiting, blocked as its job ended its turn needing an answer,
  // failed as its job ended on an error, and idle otherwise, as when its session has ended
  status: 'busy' | 'waiting' | 'blocked' | 'failed' | 'idle'
  // What a waiting one waits for, such as a permission prompt
  waitingFor?: string
  // The first line of what a blocked one waits for, as its job's needs say,
  // else of what its job last said, as a failed one's does
  detail?: string
  // The task whose result it has not sent yet, unless withdrawn, while it is busy on it:
  // a first review, a check of fixes or a check of other changes.
  // A row that is not busy leaves it out.
  task?: 'reviewing' | 'checking fixes' | 'checking changes'
  // When it started on that task, in milliseconds since the epoch
  since?: number
  // When it got its first task, else when its session started, in milliseconds since the epoch
  startedAt?: number
  // The model and the effort it last ran with, such as `Opus 5.5` and `max`
  model?: string
  effort?: string
  // How many tasks it was given, first reviews and checks alike, less those withdrawn
  rounds: number
  // How many of the review file's findings carry its letter
  findings: number
  // How many findings its last result gives a heading, those left and new ones alike
  lastRound?: number
  // How long its last round took, from when it started on the task to the result, in milliseconds
  lastRoundMs?: number
  // The snapshot commit of its last task not withdrawn
  snapshot?: string
  // Whether a snapshot taken now would hold another tree than that one; absent when it is not known
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
