---
name: unanswered
description: >-
  Ask the questions of the conversation that are still unanswered,
  the ones with a few options in a dialog.
  Use when the user types /unanswered or asks for the unanswered questions.
---

# unanswered

Ask the unanswered questions, the same ones the `Unanswered questions: N` line counts.

- Number them `Q1`, `Q2` and so on, oldest first, and keep each number for the whole conversation.
- Make each one answerable without scrolling back:
  - the question in bold
  - what it is about, in a sentence or two
  - its options as a list, the recommended one first
- If a question has a few options, ask it in a dialog with the AskUserQuestion tool.
  Add the option `Decide later`, which leaves the question unanswered.
  Use checkboxes when the user may pick more than one.
- With none, say `No unanswered questions`.
