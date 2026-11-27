# Cut tab titles for {custom} in tab_title_template to 40 cells like tmux, and to fit their tab
from typing import Any

from kitty.fast_data_types import get_options, wcswidth
from kitty.tab_bar import compile_template, safe_builtins, truncate_line

# Match window-status-format in tmux.conf, which keeps 40 cells of a tab name
TITLE_LENGTH = 40


def draw_title(data: dict[str, Any]) -> str:
    title: str = data['title']
    # Fit the title in the room the rest of the tab leaves,
    # so kitty's own … never covers the end gap
    template = compile_template(get_options().tab_title_template)
    rest = eval(template, {'__builtins__': safe_builtins}, {**data, 'custom': ''})
    # Count the Secure Input symbol, which kitty puts before a template that lacks it
    rest_width = wcswidth(rest) + wcswidth(data.get('secure_input_symbol', ''))
    # Zero means no limit, as for a dragged tab's thumbnail
    limit = data['max_title_length']
    room = limit - rest_width if limit > 0 else TITLE_LENGTH + 1
    if wcswidth(title) <= min(TITLE_LENGTH, room):
        return title
    if room < 1:
        return ''
    return truncate_line(title, min(TITLE_LENGTH, room - 1) + 1)
