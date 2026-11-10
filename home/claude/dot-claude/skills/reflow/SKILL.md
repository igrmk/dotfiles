---
name: reflow
description: >-
  Reflow Markdown prose and code comments at clause boundaries,
  to the requested width, else the project's limit, else 100 columns.
  Use when writing or editing docs or comments, or when asked to reflow or rewrap prose.
---

# reflow

Wrapping moves line breaks and never changes meaning.
It rewords only a sentence you wrote in this task that cannot fit, keeping every fact.
"Prose" means Markdown and code comments both.
Any other rewording, and cutting bloat, belong to the `rephrase` skill.
Write new prose per its Rewrite section: read `../rephrase/SKILL.md`, do not run it.

## Scope

The text the user asks you to reflow; otherwise, prose you wrote or changed in this task.
Never sweep unrelated text.
Never wrap text bound for GitHub issues, PRs and their comments, or chat:
GitHub renders each newline there as a line break.
Keep its paragraph breaks.

## Wrap

Width: the requested one, else the project's configured limit, else 100 columns.
Measure the whole line, including indent and the `//` or `>` prefix,
with tabs at the project's configured width (`.editorconfig`, `.clang-format`, modeline), else 4.

In Markdown, put one sentence per line; a comment may keep short sentences together on one line.
An abbreviation or a decimal point does not end a sentence.
Break inside a sentence only past the width.
Never break mid-phrase.
When a line must break, cut at the longest spoken pause that fits; among equal pauses, the latest.
Punctuation is only a guide to the pause, roughly from longest to shortest:

1. full stop — `.` `?` `!`
2. semicolon or colon — `;` `:`
3. em-dash — `—`
4. comma — `,`
5. before a clause-opening conjunction or preposition

Read the sentence aloud and trust the ear: the comma in "a ceiling, not a target" barely pauses.
If no pause fits, reword a sentence you wrote in this task, keeping every fact;
let any other line run over.

The width is a ceiling, not a target:
never fill to it and break at the last space when a longer pause sits earlier.

Never break before a token that would then parse as syntax,
like a block marker (`>`, `-`, `#`, `1)`) or a doc tag (`@see`).
Pick another boundary instead, or let the line run over.
Move an over-width trailing comment above its code before wrapping it.

## Leave alone

- front matter and YAML
- fenced or indented code
- tables, headings, and link definitions
- blank lines and hard line breaks (trailing `\` or two spaces)
- GitHub alert markers (`> [!NOTE]`) and footnote definitions
- lint and compiler directives (`eslint-disable`, `noqa`, `#[allow]`)
- structured doc lines (`@param`, `Output:`, `Deprecated:`)

Keep URLs and inline code spans whole; one longer than the width may run over.
List and blockquote markers keep their prefix and indent; the prose after them wraps.
A single-line summary a convention requires (a docstring's first line) stays on one line:
shorten it if you wrote it in this task, else let it run over.

## Procedure

1. Settle the scope, the destination and the width.
2. Wrap. Rewrap only paragraphs in scope.
3. Re-read Wrap, then re-check every line:
   it ends at the longest pause that fits and splits no phrase.
   Fix any that does not.
4. Report touched files in one line.
