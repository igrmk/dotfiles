---
name: review-status
description: >-
  List review findings' numbers by status, one short line per status, such as `**Fixed:** A23, A55`.
  Use at the end of a reply that fixed review findings, for the findings it handled,
  and when asked for a review's status, for all its findings.
---

# review-status

## Lines

- One line per status: a bold status, a colon, then the findings' numbers, e.g. `**Declined:** B4`.
- Numbers only: no summaries and no reasons.
- Order the numbers by when each finding first appeared, not by letter or number.

## After fixing findings

- Cover the findings the reply handled.
- Always give `**Fixed:**` and `**Declined:**`, with `none` when empty.
- A finding handled before, such as one pasted again, goes under Prior and the status it got,
  e.g. `**Prior fixed:** C27` or `**Prior declined:** A36`.
- Give any other status, such as `**Partly fixed:**` or a Prior one, only when it has findings.

## When asked for a review's status

- Cover every finding of the review, by where it stands now.
- Fixed is a fix still in place, and Dropped a fix later removed or superseded.
  Accepted is a finding whose fix was to change nothing, and Open one waiting on work elsewhere.
- Give each status only when it has findings.
