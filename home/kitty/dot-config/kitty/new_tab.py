# Open new tabs in the active window's directory, or in the one ssh was run from
from kittens.tui.handler import result_handler
from kitty.boss import Boss


def main(args: list[str]) -> None:
    pass


@result_handler(no_ui=True)
def handle_result(args: list[str], answer: None, target_window_id: int, boss: Boss) -> None:
    # Oldest, not newest: Claude Code's lingering xclip runs in /
    cwd = 'oldest'
    # Look under an overlay, as launch does for the directory
    window = boss.active_window_for_cwd
    # Take kitten ssh's own directory, as oldest would connect to the host again
    if window is not None and window.ssh_kitten_cmdline():
        cwd = window.get_cwd_of_child(oldest=True) or '~'
    # Keep the tab in the source window's session, which launch skips for a path
    boss.launch('--type=tab', f'--cwd={cwd}', '--add-to-session=.')
