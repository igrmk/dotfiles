# Testing nvim

Test nvim by sending each step as keys through `--remote-send`, Ex commands included,
in a call of its own with a pause before the next, and reading the state with `--remote-expr`.
`:normal` and commands run over RPC skip the input loop,
so its events, such as `CursorMoved` and `SafeState`, don't come as they do for typed keys.
Keys sent together run ahead of the callbacks that earlier ones schedule.

Read colors from a terminal nvim with `tmux capture-pane -e` once it shows the expected text,
as a headless nvim's `nvim__inspect_cell()` can misreport them.
