import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { Board, Reviewer, Snapshot, Usage } from '../types'

const PANE = 'reviewers'
const TITLE = 'Reviewers'
// Leave 3 columns past the longest row, 60 columns, a row of the snapshots table,
// whose branch is cut to fit, to 22 characters with a project of 13 and 3 review sessions,
// since the narrowest dock, 24 columns, would wrap it
const COLUMNS = 63

// Change a tag when its value's fields change:
// it declines what an earlier version stored, which outlives a reload.
const board = atom({ plugin: 'reviewers', key: 'board' } as const, { reviewers: [], snapshots: [] } as Board, {
  shape: 'board-23',
})
const closed = atom({ plugin: 'reviewers', key: 'closed' } as const, false, { shape: 'closed-1' })
const usage = atom({ plugin: 'reviewers', key: 'usage' } as const, { at: 0, windows: [] } as Usage, {
  shape: 'usage-4',
})
const workDir = atom({ plugin: 'reviewers', key: 'workDir' } as const, '', { shape: 'work-dir-1' })

// The usage windows by the names the pane gives them, in its order
const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

// A commit as git prints it, from an abbreviation to a full SHA-256 ID
const COMMIT = '[0-9a-f]{7,64}'
// The snapshots of a task, one per repository, as the autoreview skill lists them
const COMMITS = `${COMMIT}(?:, ${COMMIT})*`
// The opening of a task the autoreview skill hands a review session, with its snapshots
const opening = (commits: string) => `Snapshots? ${commits}: run /`
// A task by its opening line, which starts a prompt or a message from another session,
// and nothing that only quotes one:
// the snapshots and the skill it runs
const TASK = new RegExp(`(?:^|<cross-session-message[^>]*>\\s*)${opening(`(${COMMITS})`)}(code-review|check-fixes)`)
// The opening of a withdrawal of the tasks whose snapshots it names, one or several
const withdrawal = (commits: string) => `Withdraw snapshots? ${commits}\\.`
// A withdrawal by its opening line, as the autoreview skill sends one
const WITHDRAWAL = new RegExp(`(?:^|<cross-session-message[^>]*>\\s*)${withdrawal(`(${COMMITS})`)}`)
// A line of a task below its opening that names a repository's path and its snapshot,
// maybe as a list item
const PATH = new RegExp(`^(?:- )?(/[^\\n:]*): (${COMMIT})$`, 'gm')
// The transcript lines that may hold a task, a withdrawal or a result
const TASK_OR_RESULT = new RegExp(`${opening(COMMITS)}|${withdrawal(COMMITS)}|"name":"SendMessage"`)
// A line's time, and the opening of a line the engine writes as it queues a message for the session
const TIMESTAMP = /"timestamp":"([^"]+)"/
const QUEUED = '{"type":"queue-operation"'
// The model and the effort a transcript records for each request
const MODEL_OR_EFFORT = /"model":"(claude-[^"]*)"|"effort":"(low|medium|high|xhigh|max)"/g
// A result's first line names the autoreview skill, whatever the case,
// or the add-review skill, as one sent under the rules from before its rename does,
// and not as part of a session's name, which may hold it,
// as `autoreview-rw-a` or `autoreview-2-rw-a`
const RESULT = /\b(?:autoreview|add-review)\b(?!-)/i
// A finding's heading in a result, such as `### A12.`, or `## A12.` per the format-findings skill
const RESULT_HEADING = /^#{2,3} ([A-Z]\d+)\. /gm
// A subagent's ID, which a message to a subagent may name, unlike one to a session
const SUBAGENT = /^a[0-9a-f]{16}$/
// The infix of a review session's name, `<session name>-rw-<letter>`, per the autoreview skill
const INFIX = '-rw-'
const NAME = new RegExp(`${INFIX}[a-z]$`)

// The review file's lines that name sessions, in its header, per the review-file skill:
// the resume line of its fixing session and an Attach line per review session,
// which may break the line before "session" or "from", the directory it was started in
const RESUME = /claude -r ([0-9a-f-]{36})/g
const ATTACH = /^Attach `([^`]+)`(?:,\s+session `([0-9a-f-]+)`)?(?:,\s+from `[^`]*`)?:/gm
// The review file's findings, by the letter of their numbers, which is their review session's
const HEADING = /^### ([A-Z])\d+\./gm
// A checkout line of the review file's header, one per repository, with the directory it enters,
// also when reworded, as after a merge, and broken before its command
const CHECKOUT = /^Check out what was reviewed\b.*?(?:\n.*?)??`cd ([^`]+?)(?: && [^`]*)?`/gm

// A row with a clock redraws every tick.
// Polls come every few seconds while a review session is busy, else rarely,
// and right after a command or a message that may start or wake one.
const TICK_MS = 1000
const POLL_MS = 3000
const IDLE_POLL_MS = 30000
// How long the fast polls go on after a launch or a message, before a new review session shows busy
const FAST_MS = 30000
// How long the list of a review session's transcript files stays cached,
// and how long a lookup that found no successor stays cached
const TRANSCRIPTS_MS = 60000
// How many times a fixing session may go on under a new session ID and keep its review file
const MAX_SUCCESSORS = 5
// How many main worktrees where fixing sessions found their review files all sessions keep
const MAX_FILE_ROOTS = 10
// How long a changed transcript's facts stay cached while its review session's status holds
const FACTS_MS = 15000
// How long the list of sessions stays cached while no session's status file changes,
// and for less time while a row is busy or waiting
const AGENTS_MS = 300000
const LIVE_AGENTS_MS = 30000
// How long a gap between polls means the machine slept, whose time counts as no quiet time
const AWAKE_MS = 120000
// How long a review session, busy or idle with its task out,
// goes without writing to its transcript or its subagents'
// before its row shows it nudging and this session gets a message, unless the review is paused,
// as it may be stuck, or only on a long command
const QUIET_MS = 600000
// How long after a notice that did not enter it goes again
const RETRY_MS = 60000
// Stat at most this many changed paths for the key of the tree,
// so that a tree with many untracked files costs no more than this,
// and past them build the tree again once a minute, since their edits change nothing the key holds
const MAX_STATS = 1000
const MAX_STATS_MS = 60000

// A session as `claude agents` lists it, with the state of its job, such as `blocked` or `failed`
type Agent = {
  id?: string
  sessionId?: string
  name?: string
  status?: string
  state?: string
  startedAt?: number
}
type Kind = NonNullable<Reviewer['task']>
// What a review session's transcript tells,
// with how many new findings its last result gave each letter
type Facts = Pick<
  Reviewer,
  'model' | 'effort' | 'rounds' | 'snapshots' | 'startedAt' | 'lastRoundAt' | 'lastRoundMs' | 'totalMs'
> & {
  task?: { kind: Kind; since: number }
  lastFound?: Record<string, number>
  // The path of the worktree of each of its snapshots, as its tasks named them
  paths?: (string | undefined)[]
}
// What the lines of a transcript read so far tell:
// the tasks whose results have not come, less those withdrawn,
// when the task before the current one ended, by its result or its withdrawal,
// the snapshots of the newest task a result freed,
// the results sent whose tool results have not come, by their tool uses' IDs,
// the highest number its results gave each letter, the time of its last line,
// the path of each snapshot's worktree that a task named, by its commit,
// and the rest of the facts
type Task = { snapshots: string[]; kind: Kind; at: number }
type Tally = Omit<Facts, 'task' | 'paths'> & {
  pathOf: Record<string, string>
  pending: Task[]
  freedAt: number
  freedSnapshots?: string[]
  sends: { id: string; at: number; message: string }[]
  highest: Record<string, number>
  lastWriteAt?: number
}
type Part = {
  type?: string
  text?: string
  id?: string
  name?: string
  input?: { message?: unknown; to?: unknown }
  tool_use_id?: string
  is_error?: boolean
  content?: unknown
}

// Return the parts of a message's content, a string or a list of parts.
function partsOf(content: unknown): Part[] {
  return typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []
}

function textOf(content: unknown): string {
  return partsOf(content)
    .map(part => part.text ?? '')
    .join('')
}

// Whether a task names a commit among its snapshots, either of the two maybe abbreviated
function holds(task: Task, commit: string): boolean {
  return task.snapshots.some(one => one.startsWith(commit) || commit.startsWith(one))
}

// Add what the complete lines of a review session's transcript tell to a tally:
// the model and the effort of its requests,
// the tasks the fixing session sent, as a prompt, a message, or a message queued mid-turn,
// and the results it sent back,
// whose first line names the autoreview skill and the task's snapshots, or one of them.
// A task that comes again before its result, as when a resume repeats it, counts once:
// one that names the same snapshots,
// as tasks in a row share those of the repositories that kept theirs.
// A result frees the oldest task that holds every snapshot it names, and every older one,
// else, as when it names the snapshots of two tasks, up to the newest task that holds the most,
// since a review session does its tasks in order,
// once its tool result says the send went through,
// as a send to a name no session has, such as the fixing session's old one, frees nothing.
// A withdrawal drops the tasks all of whose snapshots it names, which then count as no round,
// and leaves the snapshots of the newest task still pending, else of the newest freed,
// as the review session handles no withdrawn one.
// A message to a subagent's ID is no result,
// and the rules keep any other message from opening like one.
function tally(sum: Tally, lines: string[]): void {
  for (const line of lines) {
    // The time of the session's last line,
    // less one the engine queued for it, as a message on its way
    const [, stamp] = line.startsWith(QUEUED) ? [] : (line.match(TIMESTAMP) ?? [])
    if (stamp !== undefined) sum.lastWriteAt = Math.max(sum.lastWriteAt ?? 0, Date.parse(stamp) || 0)
    for (const [, model, effort] of line.matchAll(MODEL_OR_EFFORT)) {
      if (model !== undefined) sum.model = model
      if (effort !== undefined) sum.effort = effort
    }
    // The tool result of a result sent, which names its tool use's ID
    const isSent = sum.sends.some(send => line.includes(send.id))
    if (!isSent && !TASK_OR_RESULT.test(line)) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    // A compaction summary quotes the tasks, so it is no task.
    if (entry.isSidechain || entry.isCompactSummary) continue
    const at = Date.parse(entry.timestamp)
    if (entry.type === 'assistant') {
      for (const part of partsOf(entry.message?.content)) {
        if (part.type !== 'tool_use' || part.name !== 'SendMessage') continue
        if (SUBAGENT.test(String(part.input?.to ?? ''))) continue
        const message = String(part.input?.message ?? '')
        if (part.id !== undefined && RESULT.test(message.split('\n')[0] ?? '')) sum.sends.push({ id: part.id, at, message })
      }
      continue
    }
    if (isSent && entry.type === 'user') {
      for (const part of partsOf(entry.message?.content)) {
        const k = part.type === 'tool_result' ? sum.sends.findIndex(send => send.id === part.tool_use_id) : -1
        const [send] = k < 0 ? [] : sum.sends.splice(k, 1)
        if (send === undefined || part.is_error === true || /"success":\s*false/.test(textOf(part.content))) continue
        const first = send.message.split('\n')[0] ?? ''
        // Of the commits it names, those no pending task holds, as the start of a range,
        // count for none.
        const named = (first.match(new RegExp(COMMIT, 'g')) ?? []).filter(one =>
          sum.pending.some(task => holds(task, one)),
        )
        let i = sum.pending.findIndex(task => named.length > 0 && named.every(one => holds(task, one)))
        if (i < 0) {
          const counts = sum.pending.map(task => named.filter(one => holds(task, one)).length)
          const most = Math.max(0, ...counts)
          i = most > 0 ? counts.lastIndexOf(most) : -1
        }
        if (i < 0) continue
        sum.lastRoundAt = send.at
        // The round ran from when its clock started, as the pane shows it, to the result.
        sum.lastRoundMs = send.at - Math.max(sum.pending[0]?.at ?? send.at, sum.freedAt)
        sum.totalMs = (sum.totalMs ?? 0) + sum.lastRoundMs
        sum.freedSnapshots = sum.pending[i]?.snapshots
        sum.pending.splice(0, i + 1)
        sum.freedAt = send.at
        // A finding is new when its number passes the highest that earlier results gave its letter.
        const highest = { ...sum.highest }
        const found: Record<string, number> = {}
        for (const id of new Set([...send.message.matchAll(RESULT_HEADING)].map(([, id]) => id ?? ''))) {
          const letter = id.slice(0, 1)
          const number = Number(id.slice(1))
          if (number > (sum.highest[letter] ?? 0)) found[letter] = (found[letter] ?? 0) + 1
          highest[letter] = Math.max(highest[letter] ?? 0, number)
        }
        sum.highest = highest
        sum.lastFound = found
      }
      continue
    }
    const text =
      entry.type === 'attachment' && entry.attachment?.type === 'queued_command'
        ? textOf(entry.attachment.prompt)
        : entry.type === 'user'
          ? textOf(entry.message?.content)
          : ''
    // The skill text that follows a task may repeat it in its arguments.
    if (text.startsWith('Base directory for this skill:')) continue
    const [, withdrawnList] = text.match(WITHDRAWAL) ?? []
    if (withdrawnList !== undefined) {
      const withdrawn = withdrawnList.split(/, /)
      const isWithdrawn = (task: Task) =>
        task.snapshots.every(snapshot => withdrawn.some(one => snapshot.startsWith(one) || one.startsWith(snapshot)))
      const kept = sum.pending.filter(task => !isWithdrawn(task))
      // The task under way ends with its withdrawal, and the next one starts then, as on a result.
      if (sum.pending[0] !== undefined && isWithdrawn(sum.pending[0])) sum.freedAt = at
      if (kept.length < sum.pending.length) sum.snapshots = kept.at(-1)?.snapshots ?? sum.freedSnapshots
      sum.rounds -= sum.pending.length - kept.length
      sum.pending = kept
      continue
    }
    const [, listed, skill] = text.match(TASK) ?? []
    if (listed === undefined) continue
    for (const [, path = '', commit = ''] of text.matchAll(PATH)) sum.pathOf[commit] = path
    const snapshots = listed.split(/, /)
    const kind: Kind = skill === 'code-review' ? 'reviewing' : 'verifying'
    const isSame = (task: Task) =>
      task.kind === kind &&
      task.snapshots.length === snapshots.length &&
      snapshots.every(one => holds(task, one))
    if (sum.pending.some(isSame)) continue
    sum.startedAt ??= at
    sum.snapshots = snapshots
    sum.pending.push({ snapshots, kind, at })
    sum.rounds += 1
  }
}

// Return the facts a tally tells, with its oldest task,
// timed from when it arrived or the task before it ended, whichever is later.
function factsOf({ pending, freedAt, freedSnapshots, sends, highest, lastWriteAt, pathOf, ...facts }: Tally): Facts {
  const oldest = pending[0]
  // A path named with a commit, either of the two maybe abbreviated
  const named = Object.entries(pathOf)
  const paths = facts.snapshots?.map(
    one => named.find(([commit]) => commit.startsWith(one) || one.startsWith(commit))?.[1],
  )
  return { ...facts, paths, task: oldest && { kind: oldest.kind, since: Math.max(oldest.at, freedAt) } }
}

// Return a model ID the way Anthropic writes it, such as `Opus 5.5` for `claude-opus-5-5`,
// and `Opus 4` for `claude-opus-4-20250514`, whose last part is a date.
function modelName(id: string): string {
  const parts = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/)
  const name = !parts
    ? id.replace(/^claude-/, '')
    : parts[3] === undefined
      ? `${parts[1]} ${parts[2]}`
      : `${parts[1]} ${parts[2]}.${parts[3]}`
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// Return ms as minutes and seconds, such as `21m 04s`, as seconds alone under a minute, as `18s`,
// and as hours and minutes from an hour on, as `4h 19m`.
function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const two = (part: number) => String(part).padStart(2, '0')
  if (hours > 0) return `${hours}h ${two(minutes % 60)}m`
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${two(seconds % 60)}s`
}

// Return when to tell next of a review session quiet since a given time, if it is due now,
// by when it was last told of: once it is quiet for QUIET_MS, then each time that time doubles
function quietNotice(
  told: { quietSince: number; due: number } | undefined,
  quietSince: number,
  now: number,
): { quietSince: number; due: number } | undefined {
  const due = told?.quietSince === quietSince ? told.due : QUIET_MS
  const quiet = now - quietSince
  return quiet < due ? undefined : { quietSince, due: 2 * quiet }
}

// Return a time in milliseconds since the epoch as the local date and time,
// such as `2026-11-19 14:39`.
function dateTime(ms: number): string {
  const at = new Date(ms)
  const two = (part: number) => String(part).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`
}

// Return a time as its time of day when it is today, such as `14:05`,
// else with its month and day, such as `11-19 03:03`.
function shortDateTime(ms: number, now: number): string {
  const full = dateTime(ms)
  return full.slice(0, 'yyyy-mm-dd'.length) === dateTime(now).slice(0, 'yyyy-mm-dd'.length)
    ? full.slice(-'00:00'.length)
    : full.slice('yyyy-'.length)
}

// Return a table's rows as lines, two spaces between its columns,
// each cell padded to its column's width, from the left in a column of numbers,
// and each column at least as wide as its widest value may be,
// so that a change of a cell, as of a state from idle to verifying, moves no column.
function linesOf(rows: string[][], columns: { isNumber?: boolean; width: number }[]): string[] {
  const width = (cell: string) => Array.from(cell).length
  const widths = columns.map((one, i) => Math.max(one.width, ...rows.map(row => width(row[i] ?? ''))))
  return rows.map(row =>
    row
      .map((cell, i) => {
        const pad = ' '.repeat((widths[i] ?? 0) - width(cell))
        return columns[i]?.isNumber ? pad + cell : cell + pad
      })
      .join('  ')
      .trimEnd(),
  )
}

// Turn the rate limits a response reported into a reading taken at `at`.
function readingOf(rateLimits: readonly SessionRateLimit[], at: number): Usage {
  return {
    at,
    windows: rateLimits.map(({ kind, percentUsed, resetsAt }) => ({
      kind,
      percentUsed,
      resetsAt: resetsAt === undefined ? undefined : Date.parse(resetsAt),
    })),
  }
}

// The file where every session shares its newest reading of the plan's usage,
// since a session reads it only from its own responses,
// and the windows are the account's, whatever the model:
// so the pane stays current while the review sessions work and this session waits.
// Its name holds the layout's shape, so that another version of the plugin keeps its own.
let usageFile = ''

// Tell whether a value read from the shared file is a reading of this layout.
function isReading(value: unknown): value is Usage {
  const reading = value as Usage | undefined
  return (
    typeof reading?.at === 'number' &&
    Array.isArray(reading.windows) &&
    reading.windows.every(one => typeof one?.kind === 'string' && typeof one?.percentUsed === 'number')
  )
}

// Take the newest reading of the plan's usage:
// this session's own, which it shares when newer, else the one any session shared last.
async function takeUsage($: EngineInterface, own?: Usage): Promise<void> {
  if (usageFile === '') return
  let shared: Usage | undefined
  try {
    const parsed: unknown = JSON.parse(await $.fs.read(usageFile))
    if (isReading(parsed)) shared = parsed
  } catch {
    // No session has shared a reading yet.
  }
  const mine = own && own.windows.length > 0 ? own : undefined
  if (mine && (!shared || mine.at > shared.at)) {
    // Write a file of this session's own and rename it over the shared one,
    // so that no session reads the shared one half written.
    // A failure costs the sharing alone, and the file of this session's own goes.
    const written = `${usageFile}.${await $.session.id()}`
    let isMoved = false
    try {
      await $.fs.write(written, JSON.stringify(mine))
      isMoved = (await $.process.run(['mv', written, usageFile])).exitCode === 0
    } catch {
      // The shared file stays as it was.
    } finally {
      if (!isMoved) await $.process.run(['rm', written]).catch(() => undefined)
    }
    shared = mine
  }
  const last = await read($, usage)
  const newest = shared && shared.at > last.at ? shared : last
  if (newest !== last) await update($, usage, () => newest)
}

// The store's key for the directory of this session's work, which a resume keeps
async function workKey($: EngineInterface): Promise<string> {
  return `workDir:${await $.session.id()}`
}

// Keep the directory where the work is, in the state for a reload and in the store for a resume.
async function keepWorkDir($: EngineInterface, dir: string): Promise<void> {
  await update($, workDir, () => dir)
  await $.store.set(await workKey($), dir).catch(() => undefined)
}

// Return how many bytes a text takes in UTF-8.
function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length
}

// Return the end of a text that ends a line, up to 200 characters,
// enough to tell that line from the others of a transcript, where each holds IDs and a time.
function endOf(text: string): string {
  const end = text.slice(-200)
  // Leave out half of a character that the cut split.
  return /^[\uDC00-\uDFFF]/.test(end) ? end.slice(1) : end
}

export const register: Register = on => {
  // Ask for the review sessions now, once the session has started.
  let pollNow: () => Promise<void> = async () => {}
  // Poll fast until then, in milliseconds since the epoch, after a launch or a message.
  let fastUntil = 0

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // When this handler started, as on a reload, to tell the records written before it
    const handlerStartedAt = await $.clock.now()

    await $.command.register({
      name: 'reviewers',
      description: "Show the plan's usage and the review sessions of this session in a pane",
    })

    // A pane keeps the width it was opened with until it is opened again, which sets it anew,
    // and a reload leaves it open, so open it again in place, as after a change to COLUMNS.
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS })
    }

    const home = (await $.env.get('HOME')) ?? ''
    usageFile = `${home}/.claude/reviewers-usage-4.json`
    // The autoreview skill's snapshot script, which builds the trees this pane compares,
    // the same one the fixing session runs:
    // the installed skill's for a development copy of the plugin,
    // as the session then follows the installed skill, and for a plugin with none beside it,
    // else the one beside the plugin
    const installed = `${home}/.claude/skills/autoreview/snapshot`
    const beside = `${$.plugin.root}/snapshot`
    const isDevelopmentCopy = $.plugin.root.startsWith(`${home}/.claude/dev-mods/`)
    const script =
      !isDevelopmentCopy &&
      (await $.fs.stat(beside).then(
        () => true,
        () => false,
      ))
        ? beside
        : installed

    // Run a command and resolve its trimmed output, or undefined on failure,
    // as when it cannot start or times out.
    const run = async (argv: string[], options: { cwd?: string; timeoutMs?: number } = {}) => {
      try {
        const ran = await $.process.run(argv, { timeoutMs: 20000, ...options })
        return ran.exitCode === 0 ? ran.stdout.trim() : undefined
      } catch {
        return undefined
      }
    }

    // Run a command and resolve all it prints, which may pass the 4 MiB that `run` keeps,
    // or undefined on failure.
    const output = async (argv: string[]): Promise<string | undefined> => {
      try {
        const child = $.process.spawn({ argv })
        let out = ''
        for (;;) {
          const step = await child.next()
          if (step.done) return step.value.code === 0 ? out : undefined
          if (step.value.stream === 'stdout') out += step.value.text
        }
      } catch {
        return undefined
      }
    }

    // The next poll, and when it is due, in milliseconds since the epoch
    let timer: Timer | undefined
    let timerAt = Infinity
    // Poll in ms, unless a poll is due sooner.
    // A timer whose time has passed is not trusted, since a refused one never fires.
    const schedule = async (ms: number) => {
      const now = await $.clock.now().catch(() => undefined)
      const at = now === undefined ? Infinity : now + ms
      if (timer && now !== undefined && timerAt > now && timerAt <= at) return
      timer?.cancel()
      timerAt = at
      timer = $.clock.after(Math.max(0, ms), () => {
        timer = undefined
        timerAt = Infinity
        void poll()
      })
    }

    // The tree a snapshot taken now would hold, in each directory of the work,
    // cached until a snapshot run forgets it or what it depends on changes:
    // the working tree, HEAD's tree, the changed paths, their sizes, times and executable bits,
    // the target of each that is a link, and the commit of each that holds a repository of its own,
    // such as a submodule.
    // So a tree that fails to build is not tried again
    // until the work changes or the next snapshot run.
    // The build runs in the background, as it may take long, and asks for a poll once it settles;
    // until then the poll takes the cached tree.
    // A build starts at least POLL_MS after the last one ended,
    // so that a file that keeps changing drives no builds back to back:
    // a change the wait holds back gets one build when the wait ends,
    // and the next only at a regular poll.
    // Past the cap of changed paths, it also starts once a period after a build that worked.
    // Per directory of the work, the key and the tree cached for it, whether a build runs,
    // when the last one ended and in which period,
    // and whether a build is due once the wait ends and whether the last build was such a one
    type TreeCache = {
      key?: string
      tree?: string
      isBuilding: boolean
      builtAt: number
      builtPeriod: number
      isFollowUpDue: boolean
      wasFollowUp: boolean
    }
    const trees = new Map<string, TreeCache>()
    // Counts the times the cached trees were forgotten,
    // so that a build that spans one is not cached
    let generation = 0
    // Forget the cached trees of the work, so that the next poll builds them again.
    const forgetTree = () => {
      for (const cache of trees.values()) cache.key = undefined
      generation += 1
    }
    const treeNow = async (dir: string, now: number): Promise<string | undefined> => {
      const c = trees.get(dir) ?? {
        isBuilding: false,
        builtAt: 0,
        builtPeriod: 0,
        isFollowUpDue: false,
        wasFollowUp: false,
      }
      trees.set(dir, c)
      const status = await run([script, 'status'], { cwd: dir })
      if (status === undefined) return undefined
      const [top = '', , ...entries] = status.split('\0').filter(Boolean)
      const paths = entries.slice(0, MAX_STATS).map(entry => (/^.. /.test(entry) ? entry.slice(3) : entry))
      const stats = await Promise.all(
        paths.map(async path => {
          try {
            const { size, mtimeMs } = await $.fs.stat(`${top}/${path}`)
            return `${size}:${mtimeMs}`
          } catch {
            return '-'
          }
        }),
      )
      const period = Math.floor(now / MAX_STATS_MS)
      const isPeriodDue = entries.length > MAX_STATS && c.tree !== undefined && period !== c.builtPeriod
      const marks =
        paths.length === 0
          ? ''
          : await run([
              'sh',
              '-c',
              'find "$@" -prune -perm -u+x 2>/dev/null; ' +
                'for path; do [ -L "$path" ] && readlink "$path"; ' +
                '[ -e "$path/.git" ] && git -C "$path" rev-parse -q --verify HEAD; done; true',
              'sh',
              ...paths.map(path => `${top}/${path}`),
            ])
      const key = `${dir}\0${status}\0${stats.join(' ')}\0${marks}`
      if ((key === c.key && !isPeriodDue) || c.isBuilding) return c.tree
      // Come back once the last build is far enough behind, rather than at the next scheduled poll,
      // unless the last build came that way.
      if (now - c.builtAt < POLL_MS) {
        if (!c.wasFollowUp) {
          c.isFollowUpDue = true
          void schedule(c.builtAt + POLL_MS - now).catch(() => undefined)
        }
        return c.tree
      }
      c.wasFollowUp = c.isFollowUpDue
      c.isFollowUpDue = false
      c.isBuilding = true
      c.builtPeriod = period
      const builds = generation
      void (async () => {
        try {
          const built = await run([script, 'tree'], { cwd: dir, timeoutMs: 60000 })
          if (generation === builds) {
            c.key = key
            c.tree = built
          }
        } finally {
          c.builtAt = await $.clock.now().catch(() => now)
          c.isBuilding = false
          void pollNow()
        }
      })()
      return c.tree
    }

    // The trees of the snapshots, cached once resolved, since a snapshot's tree never changes
    const snapshotTrees = new Map<string, string>()
    const treeOf = async (snapshot: string, dir: string): Promise<string | undefined> => {
      const cached = snapshotTrees.get(snapshot)
      if (cached !== undefined) return cached
      const resolved = await run(['git', 'rev-parse', `${snapshot}^{tree}`], { cwd: dir })
      if (resolved !== undefined) snapshotTrees.set(snapshot, resolved)
      return resolved
    }

    // What the review files tell, each cached until its size or time changes:
    // the sessions their headers name, the count of their findings by letter,
    // whether the review is paused, and the directories of the reviewed repositories
    type Parsed = {
      size: number
      mtimeMs: number
      ids: string[]
      attached: { name: string; sessionId?: string }[]
      findings: Record<string, number>
      isPaused: boolean
      repos: string[]
    }
    const files = new Map<string, Parsed>()
    // The directory where the work is, as the state keeps it, else the store, which a resume keeps,
    // as an in-process one empties the state without a session start;
    // empty when neither keeps one, or when it is gone, as a merged worktree is
    const workDirNow = async (): Promise<string> => {
      let dir = await read($, workDir)
      if (dir === '') {
        const stored = await $.store.get(await workKey($)).catch(() => undefined)
        if (typeof stored !== 'string' || stored === '') return ''
        dir = stored
        await update($, workDir, () => stored)
      }
      return (await $.fs.stat(dir).then(
        () => true,
        () => false,
      ))
        ? dir
        : ''
    }
    // Follow where the snapshot script last ran for this session, as it records on every run,
    // whenever the record changes, however the script ran, as by a quoted path or in a subshell,
    // and build the tree again, which may now build where it failed before.
    // The store keeps the time of the record last followed,
    // so that a reload or a resume leaves alone where the session went since, as into a worktree;
    // with none kept, a record written before this handler started, as before a reload,
    // counts as followed for a session that has a work directory,
    // as one kept before the store had these times, since that directory may be newer.
    let followed: { id: string; mtimeMs?: number } | undefined
    const followRecord = async (): Promise<void> => {
      const id = await $.session.id()
      if (followed?.id !== id) {
        const stored = await $.store.get(`workRecord:${id}`).catch(() => undefined)
        followed = { id, mtimeMs: typeof stored === 'number' ? stored : undefined }
      }
      const path = `${home}/.claude/reviewers-work/${id}`
      const stat = await $.fs.stat(path).catch(() => undefined)
      if (stat === undefined || stat.mtimeMs === followed.mtimeMs) return
      const isFirst = followed.mtimeMs === undefined
      followed = { id, mtimeMs: stat.mtimeMs }
      await $.store.set(`workRecord:${id}`, stat.mtimeMs).catch(() => undefined)
      if (isFirst && stat.mtimeMs < handlerStartedAt && (await workDirNow()) !== '') return
      forgetTree()
      const recorded = (await $.fs.read(path).catch(() => '')).trim()
      if (recorded !== '') await keepWorkDir($, recorded)
    }
    // Where the work was for the latest session that has one,
    // of those that went on in this one from one whose ID the review file still names,
    // as the store keeps it, else as the snapshot script recorded it, kept for this session too;
    // empty when none of them has one that still exists
    const workDirBefore = async (file: Parsed, now: number): Promise<string> => {
      const id = await $.session.id()
      for (const one of file.ids) {
        // The sessions from the named one up to this one, the latest first
        const chain: string[] = []
        let at: string | undefined = one
        for (let step = 0; at !== undefined && at !== id && step <= MAX_SUCCESSORS; step += 1) {
          chain.unshift(at)
          at = await successorOf(at, now)
        }
        if (at !== id) continue
        for (const before of chain) {
          const stored = await $.store.get(`workDir:${before}`).catch(() => undefined)
          const recorded = await $.fs.read(`${home}/.claude/reviewers-work/${before}`).catch(() => '')
          for (const dir of [typeof stored === 'string' ? stored : '', recorded.trim()]) {
            if (dir === '' || !(await $.fs.stat(dir).then(() => true, () => false))) continue
            await keepWorkDir($, dir)
            return dir
          }
        }
      }
      return ''
    }
    // The main worktree of a directory's repository, cached for the last directory asked,
    // the work's on every poll
    let main: { dir: string; root: string } | undefined
    const mainOf = async (dir: string): Promise<string | undefined> => {
      if (main?.dir === dir) return main.root
      const common = await run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: dir })
      if (common === undefined) return undefined
      // As git worktree list prints it: the folder of a .git folder,
      // else the git folder itself, as of a bare repository, a submodule or a separate git folder
      main = { dir, root: common.endsWith('/.git') ? common.slice(0, -'/.git'.length) : common }
      return main.root
    }
    // Where the review file of several repositories lives for each session, cached once found:
    // the directory it was started in, as the first records of its transcript hold it,
    // or that directory's main worktree
    const startDirs = new Map<string, string>()
    const startDirOf = async (sessionId: string): Promise<string | undefined> => {
      const known = startDirs.get(sessionId)
      if (known !== undefined) return known
      const script =
        'f=$(ls -t "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -n 1) && head -n 50 "$f" | grep -m 1 -o \'"cwd":"[^"]*"\''
      const found = (await run(['sh', '-c', script, 'sh', sessionId]))?.match(/"cwd":"([^"]*)"/)?.[1]
      if (found === undefined) return undefined
      const root = (await mainOf(found)) ?? found
      startDirs.set(sessionId, root)
      return root
    }
    // The first of the repositories that holds a snapshot, cached once found,
    // per snapshot and list of repositories, as the worktrees of a repository share its snapshots,
    // and as a list without the one found, as after a worktree is dropped, looks again
    const repoOfSnapshot = new Map<string, string>()
    const repoOf = async (snapshot: string, repos: string[]): Promise<string | undefined> => {
      const key = [snapshot, ...repos].join('\0')
      const known = repoOfSnapshot.get(key)
      if (known !== undefined) return known
      for (const repo of repos) {
        if ((await run(['git', 'cat-file', '-e', `${snapshot}^{commit}`], { cwd: repo })) === undefined) continue
        repoOfSnapshot.set(key, repo)
        return repo
      }
      return undefined
    }
    // The directory of each of a task's snapshots, undefined when not known:
    // the path the task named with it, while that is there,
    // as every worktree of a repository holds the others' snapshots,
    // else the work's directory for a single repository's,
    // and otherwise the directory of the repository that holds it, as the header names it,
    // trying first the checkout line in the snapshot's place,
    // which follows the target's order as the snapshots do
    const placesOf = (snapshots: string[], paths: (string | undefined)[], dir: string, repos: string[]) =>
      Promise.all(
        snapshots.map(async (snapshot, i) => {
          const path = paths[i]
          if (path !== undefined && (await $.fs.stat(path).then(() => true, () => false))) return path
          return snapshots.length === 1
            ? dir
            : repoOf(snapshot, snapshots.length === repos.length ? [...repos.slice(i, i + 1), ...repos] : repos)
        }),
      )
    // Whether a snapshot taken now in a directory would hold another tree than a snapshot,
    // undefined when that is not known; currentOf gives the tree a snapshot taken now would hold
    const isDirty = async (
      snapshot: string,
      where: string | undefined,
      currentOf: (where: string) => Promise<string | undefined>,
    ): Promise<boolean | undefined> => {
      if (where === undefined) return undefined
      const [current, then] = await Promise.all([currentOf(where), treeOf(snapshot, where)])
      return current === undefined || then === undefined ? undefined : current !== then
    }
    // A worktree's repository, by the name of its main worktree's folder,
    // and the branch checked out in it now, or the name of its own folder when it is detached
    const projectOf = async (where: string) => {
      const argv = ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel']
      const [common, top, branch] = (await run([...argv, '--abbrev-ref', 'HEAD'], { cwd: where }))?.split('\n') ?? []
      if (common === undefined || top === undefined || branch === undefined) return undefined
      // As mainOf finds the main worktree
      const root = common.endsWith('/.git') ? common.slice(0, -'/.git'.length) : common
      const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
      return { project: nameOf(root), branch: branch === 'HEAD' ? nameOf(top) : branch }
    }
    // The main worktree where this session's review file was last found,
    // with the session it was for, kept in the store for a resume,
    // so that the file is still found while the work and the shell are outside its repository
    let fileRoot: { id: string; root?: string } | undefined
    // Find this session's review file in the main worktree of the work, else of the session,
    // else in the directory it was started in, or that directory's main worktree,
    // else where it was last found, else where any session last found its own,
    // as a session that went on under a new ID,
    // a new process whose store holds nothing under that ID, may have no other root that holds it
    const reviewFile = async (dir: string): Promise<Parsed | undefined> => {
      const id = await $.session.id()
      // An in-process /resume keeps this handler's variables for another session.
      if (fileRoot?.id !== id) {
        const stored = await $.store.get(`fileRoot:${id}`).catch(() => undefined)
        fileRoot = { id, root: typeof stored === 'string' && stored !== '' ? stored : undefined }
      }
      const shared = await $.store.get('fileRoots').catch(() => undefined)
      const anyRoots = Array.isArray(shared) ? shared.filter((one): one is string => typeof one === 'string') : []
      const start = await startDirOf(id)
      const roots = [
        dir === '' ? undefined : await mainOf(dir),
        (await $.session.repo())?.root,
        start,
        fileRoot.root,
        ...anyRoots,
      ]
      for (const root of new Set(roots)) {
        if (root === undefined) continue
        const file = await reviewFileIn(root)
        if (!file) continue
        if (root !== fileRoot.root) {
          fileRoot = { id, root }
          await $.store.set(`fileRoot:${id}`, root).catch(() => undefined)
        }
        // Add a root the list lacks, and leave the order of those it holds alone,
        // so that two fixing sessions in different repositories do not rewrite it on every poll.
        if (!anyRoots.includes(root)) {
          const kept = [root, ...anyRoots].slice(0, MAX_FILE_ROOTS)
          await $.store.set('fileRoots', kept).catch(() => undefined)
        }
        return file
      }
      return undefined
    }
    // Find this session's review file in a main worktree,
    // the newest file in its review folder whose header's resume line names this session
    // and which has Attach lines, as only the autoreview skill's file has,
    // else the newest whose resume line names a session that went on in this one.
    const reviewFileIn = async (root: string): Promise<Parsed | undefined> => {
      const folder = `${root}/.claude/reviews`
      const id = await $.session.id()
      let entries
      try {
        entries = await $.fs.list(folder)
      } catch {
        return undefined
      }
      const present = new Set<string>()
      // The files of the autoreview skill, which alone have Attach lines
      const added: Parsed[] = []
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.review')) continue
        const path = `${folder}/${entry.name}`
        present.add(path)
        let file = files.get(path)
        if (!file || file.size !== entry.size || file.mtimeMs !== entry.mtimeMs) {
          let text
          try {
            text = await $.fs.read(path)
          } catch {
            continue
          }
          // The header ends at the first finding, which may quote a resume or an Attach line.
          const end = text.search(/^### /m)
          const header = end < 0 ? text : text.slice(0, end)
          const findings: Record<string, number> = {}
          for (const [, letter = ''] of text.matchAll(HEADING)) findings[letter] = (findings[letter] ?? 0) + 1
          file = {
            size: entry.size,
            mtimeMs: entry.mtimeMs,
            ids: [...header.matchAll(RESUME)].map(([, one = '']) => one),
            attached: [...header.matchAll(ATTACH)].map(([, name = '', sessionId]) => ({ name, sessionId })),
            findings,
            // As the autoreview skill writes it while the user has the review paused
            isPaused: /^Paused\.$/m.test(header),
            repos: [...header.matchAll(CHECKOUT)].map(([, dir = '']) => dir),
          }
          files.set(path, file)
        }
        if (file.attached.length > 0) added.push(file)
      }
      for (const path of files.keys()) if (path.startsWith(`${folder}/`) && !present.has(path)) files.delete(path)
      const newestOf = (list: Parsed[]) =>
        list.reduce<Parsed | undefined>((one, file) => (!one || file.mtimeMs > one.mtimeMs ? file : one), undefined)
      const named = newestOf(added.filter(file => file.ids.includes(id)))
      if (named) return named
      // A conversation that went on under a new session ID leaves its resume line on the old one.
      const now = await $.clock.now()
      const led: Parsed[] = []
      for (const file of added) {
        for (const one of file.ids) {
          if (await leadsTo(one, id, now)) {
            led.push(file)
            break
          }
        }
      }
      return newestOf(led)
    }
    // The session each session went on in, as the last records of its transcript say,
    // as after the user leaves a terminal session for the agents view:
    // cached once found, and looked for again after TRANSCRIPTS_MS as long as there is none,
    // until this session has run for two of them,
    // since a conversation goes on in a new session only as that session starts
    const successors = new Map<string, { successor?: string; at: number }>()
    // When this handler first saw each session ID, by its own clock
    const firstSeen = new Map<string, number>()
    const successorOf = async (sessionId: string, now: number): Promise<string | undefined> => {
      const known = successors.get(sessionId)
      const id = await $.session.id()
      const seen = firstSeen.get(id) ?? now
      firstSeen.set(id, seen)
      const isSettled = now - seen > 2 * TRANSCRIPTS_MS
      if (known && (known.successor !== undefined || isSettled || now - known.at < TRANSCRIPTS_MS)) {
        return known.successor
      }
      const script =
        'f=$(ls -t "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -n 1) && tail -n 20 "$f" | grep -F \'"continued-in"\''
      const tail = await run(['sh', '-c', script, 'sh', sessionId])
      let successor: string | undefined
      for (const line of tail?.split('\n') ?? []) {
        try {
          const entry = JSON.parse(line)
          if (entry.type === 'continued-in' && typeof entry.continuedInSessionId === 'string') {
            successor = entry.continuedInSessionId
          }
        } catch {
          // A line cut by the tail, or no JSON at all
        }
      }
      successors.set(sessionId, { successor, at: now })
      return successor
    }
    // Whether a session is this one, or went on in it within a few steps
    const leadsTo = async (sessionId: string, id: string, now: number): Promise<boolean> => {
      let at: string | undefined = sessionId
      for (let step = 0; at !== undefined && step <= MAX_SUCCESSORS; step += 1) {
        if (at === id) return true
        at = await successorOf(at, now)
      }
      return false
    }

    // Note a failure of the pane's own on the board, from when it began,
    // which the next poll that writes the rows drops
    const noteError = async (text: string, now: number): Promise<void> => {
      const last = await read($, board)
      if (last.error?.text !== text) await update($, board, one => ({ ...one, error: { text, since: now } }))
    }

    // The sessions that `claude agents` lists, cached while no session's status file changes,
    // since each running session keeps its status in `<pid>.json` there,
    // and for less time while a row is busy or waiting, since a killed session's file stays
    let agentsCache: { key: string; at: number; agents: Agent[] } | undefined
    const listAgents = async (now: number): Promise<Agent[] | undefined> => {
      let key: string | undefined
      try {
        const entries = await $.fs.list(`${home}/.claude/sessions`)
        key = entries
          .filter(one => /^\d+\.json$/.test(one.name))
          .map(one => `${one.name}:${one.size}:${one.mtimeMs}`)
          .sort()
          .join(' ')
      } catch {
        key = undefined
      }
      const maxAge = isLive ? LIVE_AGENTS_MS : AGENTS_MS
      if (key !== undefined && agentsCache?.key === key && now - agentsCache.at < maxAge) return agentsCache.agents
      const listed = await run(['claude', 'agents', '--json', '--all'])
      if (listed === undefined) return undefined
      const agents: Agent[] = JSON.parse(listed)
      agentsCache = key === undefined ? undefined : { key, at: now, agents }
      return agents
    }

    // What each review session's transcript tells.
    // Claude Code moves a session's transcript to the project folder of its new directory,
    // as when it enters or leaves a worktree,
    // so the list of its files is cached for a minute, or until one is gone,
    // and not at all while there is none.
    // Each file is read from the byte where the last read ended, the end of its last complete line.
    // The facts are cached until a file changes,
    // and while the session's status holds, for at least FACTS_MS,
    // since a busy session writes to its transcript between most polls.
    type Transcript = {
      paths: string[]
      listedAt: number
      // How many bytes of each file were read, up to the end of its last complete line,
      // the end of that line, and the file's size then
      offsets: number[]
      ends: string[]
      sizes: number[]
      stamp: string
      readAt: number
      sum: Tally
    }
    const transcripts = new Map<string, Transcript>()
    const fresh = (paths: string[], now: number): Transcript => ({
      paths,
      listedAt: now,
      offsets: paths.map(() => 0),
      ends: paths.map(() => ''),
      sizes: paths.map(() => 0),
      stamp: '',
      readAt: 0,
      sum: { pending: [], freedAt: 0, rounds: 0, sends: [], highest: {}, pathOf: {} },
    })
    const describe = async (agent: Agent, now: number, hasStatusChanged: boolean): Promise<Facts> => {
      const sessionId = agent.sessionId ?? ''
      let cached = transcripts.get(sessionId)
      const stat = async (paths: string[]) =>
        Promise.all(
          paths.map(path =>
            $.fs.stat(path).then(
              ({ size, mtimeMs }) => ({ size, mtimeMs }),
              () => undefined,
            ),
          ),
        )
      let stats = cached ? await stat(cached.paths) : []
      if (!cached || cached.paths.length === 0 || now - cached.listedAt >= TRANSCRIPTS_MS || stats.includes(undefined)) {
        // List a session's files the oldest first, in case it has more than one.
        const listed = await run(['sh', '-c', 'ls -tr "$HOME"/.claude/projects/*/"$1".jsonl', 'sh', sessionId])
        const paths = listed?.split('\n').filter(Boolean) ?? []
        if (!cached || (listed !== undefined && paths.join('\n') !== cached.paths.join('\n'))) cached = fresh(paths, now)
        else cached = { ...cached, listedAt: now }
        transcripts.set(sessionId, cached)
        stats = await stat(cached.paths)
      }
      const stamp = stats.map(one => one && `${one.size}:${one.mtimeMs}`).join(' ')
      const isThrottled = !hasStatusChanged && now - cached.readAt < FACTS_MS
      if (cached.paths.length > 0 && stats.every(Boolean) && stamp !== cached.stamp && !isThrottled) {
        // Read what each file gained, from the end of the last line read, as cached,
        // so as to tell a file written anew, as when the engine cuts a message out of it,
        // where that end no longer comes right before the offset:
        // then read them all again from the start.
        // Resolve undefined on a failure, to keep the cached facts and stamp,
        // so that the next poll reads the files again.
        const readOn = async (from: Transcript): Promise<Transcript | 'anew' | undefined> => {
          const sum: Tally = {
            ...from.sum,
            pending: [...from.sum.pending],
            sends: [...from.sum.sends],
            pathOf: { ...from.sum.pathOf },
          }
          const offsets = [...from.offsets]
          const ends = [...from.ends]
          for (const [i, path] of from.paths.entries()) {
            const offset = offsets[i] ?? 0
            const end = ends[i] ?? ''
            const text = await output(['tail', '-c', `+${offset - bytesOf(end) + 1}`, path])
            if (text === undefined) return undefined
            if (!text.startsWith(end)) return 'anew'
            const gained = text.slice(end.length)
            // The part after the last newline is a line still being written, or nothing.
            const complete = gained.slice(0, gained.lastIndexOf('\n') + 1)
            tally(sum, complete.split('\n').slice(0, -1))
            offsets[i] = offset + bytesOf(complete)
            ends[i] = endOf(end + complete)
          }
          return { ...from, offsets, ends, sizes: stats.map(one => one?.size ?? 0), stamp, readAt: now, sum }
        }
        // A file that shrank was written anew too.
        const hasShrunk = stats.some((one, i) => (one?.size ?? 0) < (cached?.sizes[i] ?? 0))
        let reading = await readOn(hasShrunk ? fresh(cached.paths, now) : cached)
        if (reading === 'anew') reading = await readOn(fresh(cached.paths, now))
        if (reading !== undefined && reading !== 'anew') {
          transcripts.set(sessionId, reading)
          cached = reading
        }
      }
      const facts = factsOf(cached.sum)
      // A background session that has not run yet has only the flags its job was started with.
      if ((facts.model === undefined || facts.effort === undefined) && agent.id !== undefined) {
        try {
          const state = JSON.parse(await $.fs.read(`${home}/.claude/jobs/${agent.id}/state.json`))
          const flags: string[] = state.respawnFlags ?? []
          const flag = (name: string) => (flags.includes(name) ? flags[flags.indexOf(name) + 1] : undefined)
          facts.model ??= flag('--model')
          facts.effort ??= flag('--effort')
        } catch {
          // A job with no state file has no flags to read.
        }
      }
      return { ...facts, model: facts.model && modelName(facts.model) }
    }

    // When a review session or a subagent of its last wrote to a transcript,
    // if QUIET_MS ago or more:
    // the later of the session's last line, less one the engine queued for it,
    // and its subagents' newest file, listed only once that line is as old,
    // and no earlier than `floor`, as after a sleep of the machine, a reload, or a wait on a prompt
    const quietSinceOf = async (sessionId: string, now: number, floor: number): Promise<number | undefined> => {
      const cached = transcripts.get(sessionId)
      const own = Math.max(floor, cached?.sum.lastWriteAt ?? 0)
      if (now - own < QUIET_MS) return undefined
      const times = await Promise.all(
        (cached?.paths ?? []).map(path =>
          $.fs.list(path.replace(/\.jsonl$/, '/subagents')).then(
            entries => Math.max(0, ...entries.filter(one => one.name.endsWith('.jsonl')).map(one => one.mtimeMs)),
            () => 0,
          ),
        ),
      )
      const last = Math.max(own, ...times)
      return now - last >= QUIET_MS ? last : undefined
    }

    // When each review session quiet on its task, or busy after its result, was last told of,
    // by its session ID, the sessions whose last notice has not entered yet,
    // and when the poll saw each session's status change, or first saw it
    const told = new Map<string, { quietSince: number; due: number }>()
    const telling = new Set<string>()
    const seenSince = new Map<string, { status: string; at: number }>()
    // The review sessions blocked on their tasks that this session was told of, by session ID,
    // each with when to tell of it again, never but after a notice that did not enter
    const blockedTold = new Map<string, number>()
    // Whether a poll of this load of the plugin has run
    let hasPolled = false
    // When the polls went on after a gap that means the machine slept
    let awakeAt = 0

    // Whether a review session is busy, which keeps the polls fast
    let isActive = false
    // Whether one is busy or waiting, which keeps the list of sessions fresh
    let isLive = false
    // The redraws every tick while a row shows a clock,
    // with the count of ticks, and when a poll last saw it move
    let ticker: Timer | undefined
    let ticks = 0
    let seenTicks = 0
    let seenAt = 0
    const tickWhile = (hasClock: boolean, now: number) => {
      if (ticks !== seenTicks) {
        seenTicks = ticks
        seenAt = now
      }
      // A refused period ends the interval for good, so start another once ticks stop coming.
      if (ticker && (!hasClock || now - seenAt > 2 * TICK_MS)) {
        ticker.cancel()
        ticker = undefined
      }
      if (hasClock && !ticker) {
        seenAt = now
        ticker = $.clock.every(TICK_MS, () => {
          ticks += 1
          $.ui.invalidate('ui.render')
        })
      }
    }
    // When the last poll started, so that a usage window that resets in between redraws the pane
    let polledAt = 0

    // Ask for the review sessions of this session and whether there are changes they have not seen,
    // then schedule the next poll.
    // A call while a poll runs makes that poll run once more when it ends.
    let isPolling = false
    let isPollDue = false
    const poll = async (): Promise<void> => {
      if (isPolling) {
        isPollDue = true
        return
      }
      isPolling = true
      isPollDue = false
      let now = 0
      try {
        // A failure here costs the usage line alone.
        await takeUsage($).catch(error => $.ui.log(`reviewers: ${String(error)}`, { to: 'debug' }))
        now = await $.clock.now()
        const windows = (await read($, usage)).windows
        if (windows.some(one => one.resetsAt !== undefined && one.resetsAt > polledAt && one.resetsAt <= now)) {
          $.ui.invalidate('ui.render')
        }
        if (polledAt > 0 && now - polledAt > AWAKE_MS) awakeAt = now
        polledAt = now
        const last = await read($, board)
        await followRecord()
        let work = await workDirNow()
        const file = await reviewFile(work)
        if (!file) {
          isActive = false
          isLive = false
          tickWhile(false, now)
          if (last.reviewers.length > 0 || last.error !== undefined) await update($, board, () => ({ reviewers: [], snapshots: [] }))
          return
        }

        if (work === '') work = await workDirBefore(file, now)

        // Keep the rows as they were when the sessions cannot be listed, and say so.
        const agents = await listAgents(now)
        if (agents === undefined) {
          await noteError('claude agents failed', now)
          return
        }
        // Take a review session by its session ID, or by its name for an Attach line with none,
        // where a copy may share it: the one still running wins.
        const pick = ({ name, sessionId }: { name: string; sessionId?: string }): Agent =>
          sessionId !== undefined
            ? (agents.find(agent => agent.sessionId === sessionId) ?? { name, sessionId })
            : (agents.filter(agent => agent.name === name).sort((a, b) => Number(!a.status) - Number(!b.status))[0] ?? {
                name,
              })
        // Busy or waiting while it runs, else blocked or failed as its job ended,
        // and idle otherwise, an ended session included, as its next task resumes it
        const statusOf = (agent: Agent): Reviewer['status'] =>
          agent.status === 'busy' || agent.status === 'waiting'
            ? agent.status
            : agent.state === 'blocked' || agent.state === 'failed'
              ? agent.state
              : 'idle'
        const sessions = file.attached
          .map(one => {
            const agent = pick(one)
            const label = NAME.test(one.name) ? one.name.slice(-1).toUpperCase() : one.name
            const before = last.reviewers.find(row => row.label === label)
            return { label, agent, status: statusOf(agent), before }
          })
          .sort((a, b) => a.label.localeCompare(b.label))

        const dir = work || (await $.session.cwd())
        // The tree a snapshot taken now would hold, cached per directory for the poll
        const currents = new Map<string, Promise<string | undefined>>()
        const currentOf = (where: string) => {
          const current = currents.get(where) ?? treeNow(where, now)
          currents.set(where, current)
          return current
        }
        // The project and branch of each worktree, cached per directory for the poll
        const projects = new Map<string, ReturnType<typeof projectOf>>()
        const projectAt = (where: string) => {
          const project = projects.get(where) ?? projectOf(where)
          projects.set(where, project)
          return project
        }
        const described = await Promise.all(
          sessions.map(async session => {
            const facts = await describe(session.agent, now, session.status !== session.before?.status)
            // Idle, not blocked, with no task out,
            // as when its reply ended asking the user something:
            // it has nothing to do until its next task, and the fixing session asks the user.
            const status = session.status === 'blocked' && facts.task === undefined ? 'idle' : session.status
            const snapshots = facts.snapshots ?? []
            const places = await placesOf(snapshots, facts.paths ?? [], dir, file.repos)
            const dirty = await Promise.all(snapshots.map((snapshot, i) => isDirty(snapshot, places[i], currentOf)))
            // Busy, on its task or after its result, as on a background run it left behind,
            // or idle with its task out, as on a background run of its own or once ended
            const id = session.agent.sessionId ?? ''
            const seen = seenSince.get(id)
            if (seen?.status !== status) seenSince.set(id, { status, at: now })
            const isWatched = status === 'busy' || (status === 'idle' && facts.task !== undefined)
            const floor = Math.max(awakeAt, seenSince.get(id)?.at ?? now)
            const quietSince = isWatched && !file.isPaused ? await quietSinceOf(id, now, floor) : undefined
            return { ...session, status, facts, quietSince, places, dirty }
          }),
        )

        const reviewers = described.map(
          ({ label, agent, status, facts, quietSince }): Reviewer => {
            const { task, lastFound, paths, ...about } = facts
            return {
              label,
              status,
              // On its task only while busy, and on its status alone otherwise,
              // even with a task out, as while a background task of its own runs
              ...(status === 'busy' && task && { task: task.kind, since: task.since }),
              ...(quietSince !== undefined && { quietSince }),
              findings: file.findings[label.slice(-1).toUpperCase()] ?? 0,
              ...(lastFound !== undefined && { lastFound: lastFound[label.slice(-1).toUpperCase()] ?? 0 }),
              ...about,
              startedAt: about.startedAt ?? agent.startedAt,
            }
          },
        )
        // The snapshots of the review sessions' last tasks, each in its worktree once
        const placed = new Map<string, { one: Snapshot; where?: string }>()
        for (const { label, facts, places, dirty } of described) {
          for (const [i, commit] of (facts.snapshots ?? []).entries()) {
            const where = places[i]
            const key = `${where ?? ''}\0${commit}`
            const known = placed.get(key) ?? { one: { commit, labels: [], hasNewChanges: dirty[i] }, where }
            known.one.labels.push(label)
            placed.set(key, known)
          }
        }
        // with their projects and branches, by project, then by branch,
        // those of no known project last,
        // as the sort keeps a worktree's snapshots in the order of the rows and of their tasks
        const snapshots = (
          await Promise.all(
            [...placed.values()].map(
              async ({ one, where }): Promise<Snapshot> => ({
                ...(where !== undefined && (await projectAt(where))),
                ...one,
              }),
            ),
          )
        ).sort(
          (a, b) =>
            Number(a.project === undefined) - Number(b.project === undefined) ||
            (a.project ?? '').localeCompare(b.project ?? '') ||
            (a.branch ?? '').localeCompare(b.branch ?? ''),
        )
        // Writing the rows drops an error that an earlier poll noted.
        const isPaused = file.isPaused
        if (JSON.stringify({ reviewers, snapshots, isPaused }) !== JSON.stringify(last)) {
          await update($, board, () => ({ reviewers, snapshots, isPaused }))
        }

        // Tell this session of a review session quiet on its task, or busy after its result,
        // as the autoreview skill checks on it then,
        // unless the review is paused, or the last notice for it has not entered yet.
        // A notice that does not enter, as while a Stop stands, goes again RETRY_MS later.
        for (const { agent, label, status, facts, quietSince } of described) {
          const id = agent.sessionId ?? label
          if (quietSince === undefined || (facts.task === undefined && status !== 'busy')) {
            told.delete(id)
            continue
          }
          if (telling.has(id)) continue
          const notice = quietNotice(told.get(id), quietSince, now)
          if (notice === undefined) continue
          told.set(id, notice)
          telling.add(id)
          const doing = facts.task === undefined ? 'busy since its result' : `${facts.task.kind}`
          const text =
            `${agent.name ?? label} has been ${doing}, with no write to its transcript ` +
            `or its subagents' for ${elapsed(now - quietSince)}: check on it, per the autoreview skill.`
          void $.prompt
            .submit({ text })
            .then(async ran => {
              // One that entered after a long turn restarts the doubling from then.
              if (ran.drop === undefined) {
                const entered = await $.clock.now()
                if (told.get(id)?.quietSince === quietSince) {
                  told.set(id, { quietSince, due: 2 * (entered - quietSince) })
                }
                return
              }
              told.set(id, { quietSince, due: now - quietSince + RETRY_MS })
              $.ui.log(`reviewers: the notice about ${agent.name ?? label} did not enter`, { to: 'debug' })
            })
            .catch(error => $.ui.log(`reviewers: ${String(error)}`, { to: 'debug' }))
            .finally(() => telling.delete(id))
        }

        // Tell this session once of a review session blocked on its task,
        // as its turn ended on a question or it waits on a prompt only the user can answer,
        // as the autoreview skill answers it or asks the user then, unless the review is paused.
        // One the board shows blocked from before a reload was told of then.
        for (const { agent, label, status, facts, before } of described) {
          const id = agent.sessionId ?? label
          if ((status !== 'blocked' && status !== 'waiting') || facts.task === undefined || file.isPaused) {
            blockedTold.delete(id)
            continue
          }
          if (!hasPolled && before?.status === status) blockedTold.set(id, Infinity)
          if (now < (blockedTold.get(id) ?? 0)) continue
          blockedTold.set(id, Infinity)
          const name = agent.name ?? label
          const text =
            status === 'waiting'
              ? `${name} is blocked on its task by a prompt only the user can answer, ` +
                `in claude attach ${id.slice(0, 8)}: tell the user, per the autoreview skill.`
              : `${name} is blocked on its task, as its turn ended needing an answer: ` +
                `read the end of its transcript, and answer it or ask the user, per the autoreview skill.`
          void $.prompt
            .submit({ text })
            .then(ran => {
              if (ran.drop === undefined) return
              blockedTold.set(id, now + RETRY_MS)
              $.ui.log(`reviewers: the notice about ${agent.name ?? label} did not enter`, { to: 'debug' })
            })
            .catch(error => $.ui.log(`reviewers: ${String(error)}`, { to: 'debug' }))
        }

        hasPolled = true
        isActive = reviewers.some(one => one.status === 'busy')
        isLive = reviewers.some(one => one.status === 'busy' || one.status === 'waiting')
        tickWhile(
          reviewers.some(one => one.since !== undefined || one.quietSince !== undefined),
          now,
        )

        // Keep the pane up while the session has review sessions, as after an unload closed it,
        // unless the user closed it by hand: then it stays closed until `/reviewers`.
        if (!(await read($, closed)) && !(await $.ui.panes()).some(pane => pane.id === PANE)) {
          await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS })
        }
      } catch (error) {
        $.ui.log(`reviewers: ${String(error)}`, { to: 'debug' })
        await noteError(`the poll failed: ${String(error).split('\n')[0]}`, now).catch(() => undefined)
      } finally {
        isPolling = false
        if (isPollDue) void poll()
        else void schedule(isActive || now < fastUntil ? POLL_MS : IDLE_POLL_MS).catch(() => undefined)
      }
    }
    pollNow = poll

    void poll()
    // A refused timer never fires, and nothing tells of it,
    // so look every so often, which replaces a pending poll that is overdue.
    $.clock.every(IDLE_POLL_MS, () => void schedule(IDLE_POLL_MS).catch(() => undefined))

    return started
  })

  on('command.run', { command: 'reviewers' }, async $ => {
    await update($, closed, () => false)
    await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS })
    return { text: 'Reviewers pane opened.' }
  })

  // Look at the review sessions right after a call of this session's own loop
  // that may start or wake one: a command or a message that names one.
  // A command that names the snapshot script polls too, so that the pane follows the work at once,
  // as the poll reads where the script recorded it ran.
  on('tool.call', { tool: ['Bash', 'SendMessage'] }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) return ran
    const text = e.tool === 'Bash' ? e.command : e.tool === 'SendMessage' ? String(e.to ?? '') : ''
    if (e.tool === 'Bash' && /(?:autoreview|add-review)\/snapshot/.test(text)) void pollNow()
    if (text.includes(INFIX)) {
      fastUntil = (await $.clock.now()) + FAST_MS
      void pollNow()
    }
    return ran
  })

  // Note where the work is when this session enters or leaves a worktree, as its result says:
  // the worktree it steps out of, keeping it, as to write the review file,
  // and otherwise where the session goes.
  on('tool.call', { tool: ['ExitWorktree', 'EnterWorktree'] }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    const result = ran.result as { worktreePath?: string; originalCwd?: string; restoredCwd?: string } | undefined
    const dir =
      e.tool === 'ExitWorktree' && e.action !== 'keep'
        ? (result?.restoredCwd ?? result?.originalCwd)
        : result?.worktreePath
    if (dir !== undefined) {
      await keepWorkDir($, dir)
      void pollNow()
    }
    return ran
  })

  // Take and share the plan's usage from every measurement,
  // which the engine takes after each turn and whenever a window moves a whole point,
  // whichever request moved it, since the windows are the account's.
  on('session.measure', async ($, e, next) => {
    await takeUsage($, readingOf(e.rateLimits, await $.clock.now())).catch(error =>
      $.ui.log(`reviewers: ${String(error)}`, { to: 'debug' }),
    )
    return next(e)
  })

  // Remember a close by the user's hand, and only that: an unload closes it too.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await update($, closed, () => true)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const { reviewers, snapshots, error, isPaused } = await read($, board)
    // A window that has reset since the reading shows as 0 percent, until a new reading.
    const windows = (await read($, usage)).windows
      .filter(one => WINDOWS[one.kind] !== undefined)
      .sort((a, b) => Object.keys(WINDOWS).indexOf(a.kind) - Object.keys(WINDOWS).indexOf(b.kind))
      .map(one => {
        const hasReset = one.resetsAt !== undefined && one.resetsAt <= now
        return `${WINDOWS[one.kind]} ${hasReset ? 0 : Math.round(one.percentUsed)}%`
      })
    // The review sessions as three tables:
    // the first gives each its state,
    // with how long a busy one has run or a nudging one has been quiet, its model and effort,
    // and when it started.
    const [header, ...states] = linesOf(
      [
        ['rw', 'state', '', 'model', 'effort', 'started'],
        ...reviewers.map(one => [
          one.label,
          // A waiting one shows as blocked, as either waits on the user.
          one.quietSince !== undefined
            ? 'nudging'
            : one.status === 'busy'
              ? (one.task ?? 'busy')
              : one.status === 'waiting'
                ? 'blocked'
                : one.status,
          one.quietSince !== undefined
            ? elapsed(now - one.quietSince)
            : one.status === 'busy' && one.since !== undefined
              ? elapsed(now - one.since)
              : '',
          one.model ?? '',
          one.effort ?? '',
          one.startedAt !== undefined ? shortDateTime(one.startedAt, now) : '',
        ]),
      ],
      // The letter, a state such as verifying, a clock to 59m 59s, a model such as Sonnet 5.5,
      // an effort such as medium, and a start such as 11-19 03:03
      [
        { width: 2 },
        { width: 9 },
        { isNumber: true, width: 7 },
        { width: 10 },
        { width: 6 },
        { width: 11 },
      ],
    )
    // A line under a table's header, as wide as its widest row
    const ruleOf = (lines: string[]) => '─'.repeat(Math.max(0, ...lines.map(line => Array.from(line).length)))
    // The second gives its round, the number of the last task it got,
    // the findings that carry its letter and how many of them its last result gave new,
    // when its last round finished, and how long all its rounds took and its last one.
    // A pair shares a column, as `found / new`,
    // the first of it set right under its name and the second left under its own,
    // the counts to 99999 and 999 and the durations to 59m 59s or 99h 59m.
    const pairOf = (first: string, second: string, widths: [number, number], gap = '   ') =>
      `${first.padStart(widths[0])}${gap}${second.padEnd(widths[1])}`
    const rounds = linesOf(
      [
        [
          'rw',
          'round',
          pairOf('found', 'new', [5, 3], ' / '),
          'finished',
          pairOf('time', 'last', [7, 7], ' / '),
        ],
        ...reviewers.map(one => [
          one.label,
          String(one.rounds),
          pairOf(String(one.findings), one.lastFound !== undefined ? String(one.lastFound) : '', [5, 3]),
          one.lastRoundAt !== undefined ? shortDateTime(one.lastRoundAt, now) : '',
          pairOf(
            one.totalMs !== undefined ? elapsed(one.totalMs) : '',
            one.lastRoundMs !== undefined ? elapsed(one.lastRoundMs) : '',
            [7, 7],
          ),
        ]),
      ],
      // The letter, the round, the findings, a finish such as 11-19 03:03, and the durations
      [{ width: 2 }, { isNumber: true, width: 5 }, { width: 11 }, { width: 11 }, { width: 17 }],
    )
    // The third gives each snapshot of their last tasks:
    // its project, as a repository's name,
    // and the branch of its worktree, or the name of its folder when it is detached,
    // or ? for each when it is in none of the review's repositories,
    // the snapshot, the review sessions whose last task names it, by their labels,
    // and whether they are behind, as the work there has changed since,
    // or ? when that is not known.
    // Its cells are cut to keep its rows within the pane:
    // the labels to what leaves the project and the branch the 7 and 6 characters of their headers,
    // the branch to the room left, and the project too when the branch is down to 6 characters.
    const labelsOf = (labels: string[]) => labels.join(labels.every(one => one.length === 1) ? '' : ' ')
    // The room for the project, the branch and the labels,
    // left by the gaps, the snapshot and behind
    const free = COLUMNS - 3 - (2 + 2 + 8 + 2 + 2 + 6)
    const rwWidth = Math.min(free - 7 - 6, Math.max(2, ...snapshots.map(one => labelsOf(one.labels).length)))
    // The room for the project and the branch
    const room = free - rwWidth
    const longest = Math.max(...snapshots.map(one => (one.project ?? '?').length))
    const projectWidth = Math.max(7, Math.min(longest, room - 6))
    const branchWidth = Math.max(6, room - projectWidth)
    const cut = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text)
    const snapshotLines = linesOf(
      [
        ['project', 'branch', 'snapshot', 'rw', 'behind'],
        ...snapshots.map(one => [
          cut(one.project ?? '?', projectWidth),
          cut(one.branch ?? '?', branchWidth),
          one.commit.slice(0, 8),
          cut(labelsOf(one.labels), rwWidth),
          one.hasNewChanges === undefined ? '?' : one.hasNewChanges ? 'yes' : 'no',
        ]),
      ],
      [{ width: 7 }, { width: 6 }, { width: 8 }, { width: rwWidth }, { width: 6 }],
    )

    return (
      <Box flexDirection="column">
        {windows.length > 0 && <Text>Usage: {windows.join(', ')}</Text>}
        {windows.length > 0 && <Text> </Text>}
        <Text>REVIEWERS{isPaused ? ' (PAUSED)' : ''}</Text>
        <Text> </Text>
        {reviewers.length === 0 && <Text dimColor>none</Text>}
        {reviewers.length > 0 && <Text>{header}</Text>}
        {reviewers.length > 0 && <Text dimColor>{ruleOf([header ?? '', ...states])}</Text>}
        {reviewers.map((one, i) => {
          // Bold while busy, waiting or blocked, yellow when nudging, red when failed, else gray
          const isWorking = one.status === 'busy' || one.status === 'waiting' || one.status === 'blocked'
          const hasFailed = one.status === 'failed'
          const isQuiet = one.quietSince !== undefined
          return (
            <Text
              bold={isWorking || hasFailed || isQuiet}
              dimColor={!isWorking && !hasFailed && !isQuiet}
              color={hasFailed ? 'error' : isQuiet ? 'warning' : undefined}
            >
              {states[i]}
            </Text>
          )
        })}
        {reviewers.length > 0 && <Text> </Text>}
        {reviewers.length > 0 && <Text> </Text>}
        {reviewers.length > 0 && <Text>ROUNDS</Text>}
        {reviewers.length > 0 && <Text> </Text>}
        {reviewers.length > 0 && <Text>{rounds[0]}</Text>}
        {reviewers.length > 0 && <Text dimColor>{ruleOf(rounds)}</Text>}
        {reviewers.length > 0 && rounds.slice(1).map(line => <Text dimColor>{line}</Text>)}
        {snapshots.length > 0 && <Text> </Text>}
        {snapshots.length > 0 && <Text> </Text>}
        {snapshots.length > 0 && <Text>REVIEW SNAPSHOTS</Text>}
        {snapshots.length > 0 && <Text> </Text>}
        {snapshots.length > 0 && <Text>{snapshotLines[0]}</Text>}
        {snapshots.length > 0 && <Text dimColor>{ruleOf(snapshotLines)}</Text>}
        {snapshots.length > 0 && snapshotLines.slice(1).map(line => <Text dimColor>{line}</Text>)}
        {error !== undefined && <Text> </Text>}
        {error !== undefined && (
          <Text color="error">
            Error: {error.text} since {shortDateTime(error.since, now)}
          </Text>
        )}
      </Box>
    )
  })
}
