# CLAUDE.md

- A trailing single letter in `/code-review` arguments is not part of the target:
  process the rest as usual,
  and render the findings per the `format-findings` skill invoked with that letter.
- When fixing review findings, report the fixed and the declined ones separately,
  with the reason for each decline.
