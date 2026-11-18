import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { Board, Reviewer, Usage } from '../types'

const PANE = 'reviewers'
const TITLE = 'Reviewers'
// Leave room past the longest row, such as `Usage: 5h 100%, week 100%, spend 100%`,
// since the narrowest dock, 24 columns, feels cramped
const COLUMNS = 42

// Change a tag when its value's fields change:
// it declines what an earlier version stored, which outlives a reload.
const board = atom({ plugin: 'reviewers', key: 'board' } as const, { reviewers: [] } as Board, { shape: 'board-11' })
const closed = atom({ plugin: 'reviewers', key: 'closed' } as const, false, { shape: 'closed-1' })
const usage = atom({ plugin: 'reviewers', key: 'usage' } as const, { at: 0, windows: [] } as Usage, {
  shape: 'usage-4',
})
const workDir = atom({ plugin: 'reviewers', key: 'workDir' } as const, '', { shape: 'work-dir-1' })

// The usage windows by the names the pane gives them, in its order
const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

// A commit as git prints it, from an abbreviation to a full SHA-256 ID
const COMMIT = '[0-9a-f]{7,64}'
// The opening of a task the add-review skill hands a review session, with its snapshot
const opening = (commit: string) => `Snapshot ${commit}: run /`
// A task by its opening line, which starts a prompt or a message from another session,
// and nothing that only quotes one:
// the snapshot, the skill it runs, and for a check, whether it checks a fix report
const TASK = new RegExp(
  `(?:^|<cross-session-message[^>]*>\\s*)${opening(`(${COMMIT})`)}(code-review|check-fixes)( on this fix report)?`,
)
// A withdrawal of the tasks at a snapshot by its opening line, as the add-review skill sends one
const WITHDRAWAL = new RegExp(`(?:^|<cross-session-message[^>]*>\\s*)Withdraw snapshot (${COMMIT})\\.`)
// The transcript lines that may hold a task, a withdrawal or a result
const TASK_OR_RESULT = new RegExp(`${opening(COMMIT)}|Withdraw snapshot ${COMMIT}\\.|"name":"SendMessage"`)
// The model and the effort a transcript records for each request
const MODEL_OR_EFFORT = /"model":"(claude-[^"]*)"|"effort":"(low|medium|high|xhigh|max)"/g
// A result's first line names the add-review skill, whatever the case
const RESULT = /add-review/i
// A finding's heading in a result, such as `### A12.`, or `## A12.` per the format-findings skill
const RESULT_HEADING = /^#{2,3} ([A-Z]\d+)\. /gm
// A subagent's ID, which a message to a subagent may name, unlike one to a session
const SUBAGENT = /^a[0-9a-f]{16}$/
// The infix of a review session's name, `<session name>-rw-<letter>`, per the add-review skill
const INFIX = '-rw-'
const NAME = new RegExp(`${INFIX}[a-z]$`)

// The review file's lines that name sessions, in its header, per the review-file skill:
// the resume line of its fixing session and an Attach line per review session,
// which may break the line before "session" or "from", the directory it was started in
const RESUME = /claude -r ([0-9a-f-]{36})/g
const ATTACH = /^Attach `([^`]+)`(?:,\s+session `([0-9a-f-]+)`)?(?:,\s+from `[^`]*`)?:/gm
// The review file's findings, by the letter of their numbers, which is their review session's
const HEADING = /^### ([A-Z])\d+\./gm

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
// How much of a blocked or failed review session's last words its row shows
const DETAIL_CHARS = 200
// How long a changed transcript's facts stay cached while its review session's status holds
const FACTS_MS = 15000
// How long the list of sessions stays cached while no session's status file changes,
// and for less time while a row is busy or waiting
const AGENTS_MS = 300000
const LIVE_AGENTS_MS = 30000
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
  waitingFor?: string
  startedAt?: number
}
type Kind = NonNullable<Reviewer['task']>
// What a review session's transcript tells
type Facts = Pick<Reviewer, 'model' | 'effort' | 'rounds' | 'snapshot' | 'startedAt' | 'lastRound' | 'lastRoundMs'> & {
  task?: { kind: Kind; since: number }
}
// What the lines of a transcript read so far tell:
// the tasks whose results have not come, less those withdrawn,
// when the task before the current one ended, by its result or its withdrawal,
// the snapshot of the newest task a result freed,
// the results sent whose tool results have not come, by their tool uses' IDs,
// and the rest of the facts
type Tally = Omit<Facts, 'task'> & {
  pending: { snapshot: string; kind: Kind; at: number }[]
  freedAt: number
  freedSnapshot?: string
  sends: { id: string; at: number; message: string }[]
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

// Add what the complete lines of a review session's transcript tell to a tally:
// the model and the effort of its requests,
// the tasks the fixing session sent, as a prompt, a message, or a message queued mid-turn,
// and the results it sent back, whose first line names the add-review skill and the snapshot.
// A task that comes again before its result, as when a resume repeats it, counts once.
// A result frees its task and every older one, since a review session does its tasks in order,
// once its tool result says the send went through,
// as a send to a name no session has, such as the fixing session's old one, frees nothing.
// A withdrawal drops the tasks at its snapshot, which then count as no round,
// and leaves the snapshot of the newest task still pending, else of the newest freed,
// as the review session handles no withdrawn one.
// A message to a subagent's ID is no result,
// and the rules keep any other message from opening like one.
function tally(sum: Tally, lines: string[]): void {
  for (const line of lines) {
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
        const named = first.match(new RegExp(COMMIT, 'g')) ?? []
        const i = sum.pending.findIndex(task => named.some(one => task.snapshot.startsWith(one) || one.startsWith(task.snapshot)))
        if (i < 0) continue
        // The round ran from when the review session started on the oldest task it frees.
        sum.lastRoundMs = send.at - Math.max(sum.pending[0]?.at ?? send.at, sum.freedAt)
        sum.freedSnapshot = sum.pending[i]?.snapshot
        sum.pending.splice(0, i + 1)
        sum.freedAt = send.at
        sum.lastRound = new Set([...send.message.matchAll(RESULT_HEADING)].map(([, number]) => number)).size
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
    const [, withdrawn] = text.match(WITHDRAWAL) ?? []
    if (withdrawn !== undefined) {
      const isWithdrawn = (task: { snapshot: string }) =>
        task.snapshot.startsWith(withdrawn) || withdrawn.startsWith(task.snapshot)
      const kept = sum.pending.filter(task => !isWithdrawn(task))
      // The task under way ends with its withdrawal, and the next one starts then, as on a result.
      if (sum.pending[0] !== undefined && isWithdrawn(sum.pending[0])) sum.freedAt = at
      if (kept.length < sum.pending.length) sum.snapshot = kept.at(-1)?.snapshot ?? sum.freedSnapshot
      sum.rounds -= sum.pending.length - kept.length
      sum.pending = kept
      continue
    }
    const [, commit, skill, isFixReport] = text.match(TASK) ?? []
    if (commit === undefined) continue
    const kind: Kind = skill === 'code-review' ? 'reviewing' : isFixReport ? 'checking fixes' : 'checking changes'
    const isSame = (task: { snapshot: string; kind: Kind }) =>
      task.kind === kind && (task.snapshot.startsWith(commit) || commit.startsWith(task.snapshot))
    if (sum.pending.some(isSame)) continue
    sum.startedAt ??= at
    sum.snapshot = commit
    sum.pending.push({ snapshot: commit, kind, at })
    sum.rounds += 1
  }
}

// Return the facts a tally tells, with its oldest task,
// timed from when it arrived or the task before it ended, whichever is later.
function factsOf({ pending, freedAt, freedSnapshot, sends, ...facts }: Tally): Facts {
  const oldest = pending[0]
  return { ...facts, task: oldest && { kind: oldest.kind, since: Math.max(oldest.at, freedAt) } }
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

// Return a count of findings in words, such as `2 findings`, `1 finding` or `no findings`.
function findingsOf(count: number): string {
  return count === 0 ? 'no findings' : count === 1 ? '1 finding' : `${count} findings`
}

// Return a time in milliseconds since the epoch as the local date and time,
// such as `2026-11-19 14:39`.
function dateTime(ms: number): string {
  const at = new Date(ms)
  const two = (part: number) => String(part).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`
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
    // The add-review skill's snapshot script, which builds the trees this pane compares
    const script = `${home}/.claude/skills/add-review/snapshot`

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

    // The tree a snapshot taken now would hold,
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
    let treeKey: string | undefined
    let tree: string | undefined
    let isBuilding = false
    let builtAt = 0
    let builtPeriod = 0
    // Counts the times the cached tree was forgotten, so that a build that spans one is not cached
    let generation = 0
    // Whether a build is due once the wait ends, and whether the last build was such a one
    let isFollowUpDue = false
    let wasFollowUp = false
    // Forget the cached tree of the work, so that the next poll builds it again.
    const forgetTree = () => {
      treeKey = undefined
      generation += 1
    }
    const treeNow = async (dir: string, now: number): Promise<string | undefined> => {
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
      const isPeriodDue = entries.length > MAX_STATS && tree !== undefined && period !== builtPeriod
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
      if ((key === treeKey && !isPeriodDue) || isBuilding) return tree
      // Come back once the last build is far enough behind, rather than at the next scheduled poll,
      // unless the last build came that way.
      if (now - builtAt < POLL_MS) {
        if (!wasFollowUp) {
          isFollowUpDue = true
          void schedule(builtAt + POLL_MS - now).catch(() => undefined)
        }
        return tree
      }
      wasFollowUp = isFollowUpDue
      isFollowUpDue = false
      isBuilding = true
      builtPeriod = period
      const builds = generation
      void (async () => {
        try {
          const built = await run([script, 'tree'], { cwd: dir, timeoutMs: 60000 })
          if (generation === builds) {
            treeKey = key
            tree = built
          }
        } finally {
          builtAt = await $.clock.now().catch(() => now)
          isBuilding = false
          void pollNow()
        }
      })()
      return tree
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

    // What the main worktree's review files tell, each cached until its size or time changes:
    // the sessions their headers name and the count of their findings by letter
    type Parsed = {
      size: number
      mtimeMs: number
      ids: string[]
      attached: { name: string; sessionId?: string }[]
      findings: Record<string, number>
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
    // The main worktree of the work's repository, cached for the work's directory
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
    // The main worktree where this session's review file was last found,
    // with the session it was for, kept in the store for a resume,
    // so that the file is still found while the work and the shell are outside its repository
    let fileRoot: { id: string; root?: string } | undefined
    // Find this session's review file in the main worktree of the work, else of the session,
    // else where it was last found, else where any session last found its own,
    // as a session that went on under a new ID,
    // a new process whose store holds nothing under that ID, has no other root to look in
    const reviewFile = async (dir: string): Promise<Parsed | undefined> => {
      const id = await $.session.id()
      // An in-process /resume keeps this handler's variables for another session.
      if (fileRoot?.id !== id) {
        const stored = await $.store.get(`fileRoot:${id}`).catch(() => undefined)
        fileRoot = { id, root: typeof stored === 'string' && stored !== '' ? stored : undefined }
      }
      const shared = await $.store.get('fileRoots').catch(() => undefined)
      const anyRoots = Array.isArray(shared) ? shared.filter((one): one is string => typeof one === 'string') : []
      const roots = [dir === '' ? undefined : await mainOf(dir), (await $.session.repo())?.root, fileRoot.root, ...anyRoots]
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
    // and which has Attach lines, as only the add-review skill's file has,
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
      // The files of the add-review skill, which alone have Attach lines
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
    // The first line of what a blocked session's job waits for, as its needs say,
    // else of what its job last said, as a failed one's job says nothing of the cause
    const detailOf = async (agent: Agent): Promise<string | undefined> => {
      if (agent.id === undefined) return undefined
      try {
        const state = JSON.parse(await $.fs.read(`${home}/.claude/jobs/${agent.id}/state.json`))
        const firstLine = (text: unknown) => (typeof text === 'string' ? (text.trim().split('\n')[0] ?? '') : '')
        const needs = agent.state === 'blocked' ? firstLine(state.needs) : ''
        const line = needs === '' ? firstLine(state.detail) : needs
        // Cut by code points, so as not to split a surrogate pair,
        // which the engine draws as U+FFFD.
        return line === '' ? undefined : Array.from(line).slice(0, DETAIL_CHARS).join('')
      } catch {
        return undefined
      }
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
      sum: { pending: [], freedAt: 0, rounds: 0, sends: [] },
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
          const sum: Tally = { ...from.sum, pending: [...from.sum.pending], sends: [...from.sum.sends] }
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
        polledAt = now
        const last = await read($, board)
        await followRecord()
        let work = await workDirNow()
        const file = await reviewFile(work)
        if (!file) {
          isActive = false
          isLive = false
          tickWhile(false, now)
          if (last.reviewers.length > 0 || last.error !== undefined) await update($, board, () => ({ reviewers: [] }))
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
            const label = NAME.test(one.name) ? one.name.slice(-INFIX.length) : one.name
            const before = last.reviewers.find(row => row.label === label)
            return { label, agent, status: statusOf(agent), before }
          })
          .sort((a, b) => a.label.localeCompare(b.label))

        const dir = work || (await $.session.cwd())
        const [currentTree, described] = await Promise.all([
          treeNow(dir, now),
          Promise.all(
            sessions.map(async session => {
              const facts = await describe(session.agent, now, session.status !== session.before?.status)
              const snapshotTree = facts.snapshot === undefined ? undefined : await treeOf(facts.snapshot, dir)
              const isStuck = session.status === 'blocked' || session.status === 'failed'
              const detail = isStuck ? await detailOf(session.agent) : undefined
              return { ...session, facts, snapshotTree, detail }
            }),
          ),
        ])

        const reviewers = described.map(({ label, agent, status, facts, snapshotTree, detail }): Reviewer => {
          const { task, ...about } = facts
          const hasNewChanges =
            currentTree === undefined || snapshotTree === undefined ? undefined : currentTree !== snapshotTree
          return {
            label,
            status,
            ...(status === 'waiting' && { waitingFor: agent.waitingFor }),
            ...(detail !== undefined && { detail }),
            // On its task only while busy, and on its status alone otherwise, even with a task out,
            // as while a background task of its own runs
            ...(status === 'busy' && task && { task: task.kind, since: task.since }),
            findings: file.findings[label.slice(-1).toUpperCase()] ?? 0,
            hasNewChanges,
            ...about,
            startedAt: about.startedAt ?? agent.startedAt,
          }
        })
        // Writing the rows drops an error that an earlier poll noted.
        if (last.error !== undefined || JSON.stringify(reviewers) !== JSON.stringify(last.reviewers)) {
          await update($, board, () => ({ reviewers }))
        }

        isActive = reviewers.some(one => one.status === 'busy')
        isLive = reviewers.some(one => one.status === 'busy' || one.status === 'waiting')
        tickWhile(
          reviewers.some(one => one.since !== undefined),
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
    if (e.tool === 'Bash' && text.includes('add-review/snapshot')) void pollNow()
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
    const { reviewers, error } = await read($, board)
    // A window that has reset since the reading shows as 0 percent, until a new reading.
    const windows = (await read($, usage)).windows
      .filter(one => WINDOWS[one.kind] !== undefined)
      .sort((a, b) => Object.keys(WINDOWS).indexOf(a.kind) - Object.keys(WINDOWS).indexOf(b.kind))
      .map(one => {
        const hasReset = one.resetsAt !== undefined && one.resetsAt <= now
        return `${WINDOWS[one.kind]} ${hasReset ? 0 : Math.round(one.percentUsed)}%`
      })
    const behind = reviewers.filter(one => one.hasNewChanges === true)
    const changes =
      behind.length > 0 ? 'yes' : reviewers.every(one => one.hasNewChanges === false) ? 'no' : 'unknown'

    return (
      <Box flexDirection="column">
        {windows.length > 0 && <Text>Usage: {windows.join(', ')}</Text>}
        {windows.length > 0 && <Text> </Text>}
        <Text>Reviewers:</Text>
        {reviewers.length === 0 && <Text dimColor>  none</Text>}
        {reviewers.map(one => {
          // Bold while busy, waiting or blocked, red when failed, else gray
          const isWorking = one.status === 'busy' || one.status === 'waiting' || one.status === 'blocked'
          const hasFailed = one.status === 'failed'
          // The task while busy on it, with how long it has run, else the status
          const state = one.status === 'busy' ? (one.task ?? 'busy') : one.status
          const clock = one.status === 'busy' && one.since !== undefined ? ` for ${elapsed(now - one.since)}` : ''
          return (
            <Box flexDirection="column">
              <Text
                bold={isWorking || hasFailed}
                dimColor={!isWorking && !hasFailed}
                color={hasFailed ? 'error' : undefined}
              >
                {'  '}
                {one.label} {state}
                {clock}
              </Text>
              {one.waitingFor !== undefined && (
                <Text>
                  {'    '}waiting for: {one.waitingFor}
                </Text>
              )}
              {one.detail !== undefined && (
                <Text color={hasFailed ? 'error' : undefined}>
                  {'    '}
                  {hasFailed ? 'last said' : 'blocked on'}: {one.detail}
                </Text>
              )}
              {one.lastRoundMs !== undefined && (
                <Text dimColor>
                  {'    '}last round: {elapsed(one.lastRoundMs)}
                  {one.lastRound !== undefined ? `, ${findingsOf(one.lastRound)}` : ''}
                </Text>
              )}
              <Text dimColor>
                {'    '}rounds: {one.rounds}, findings: {one.findings}
              </Text>
              {one.model !== undefined && (
                <Text dimColor>
                  {'    '}model: {one.model}
                  {one.effort !== undefined ? ` at ${one.effort}` : ''}
                </Text>
              )}
              {one.startedAt !== undefined && (
                <Text dimColor>
                  {'    '}started: {dateTime(one.startedAt)}
                </Text>
              )}
            </Box>
          )
        })}
        {reviewers.length > 0 && <Text> </Text>}
        {reviewers.length > 0 && <Text>New changes: {changes}</Text>}
        {behind.map(one => (
          <Text dimColor>
            {'  '}
            {one.label} since {one.snapshot?.slice(0, 8)}
          </Text>
        ))}
        {error !== undefined && (
          <Text color="error">
            Error: {error.text} since {dateTime(error.since).slice(-'00:00'.length)}
          </Text>
        )}
      </Box>
    )
  })
}
