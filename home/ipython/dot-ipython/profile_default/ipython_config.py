from pygments.token import Token, Keyword, Name, Comment, String, Error, Text, Number, Operator, Generic, Whitespace, Punctuation, Other, Literal

## Set the color scheme (NoColor, Neutral, Linux, or LightBG).
c.InteractiveShell.colors = 'Linux'

## The name or class of a Pygments style to use for syntax highlighting. To see available styles, run `pygmentize -L styles`.
c.TerminalInteractiveShell.highlighting_style = 'friendly'

gray = "#b0b0b0"
c.TerminalInteractiveShell.highlighting_style_overrides = {
    Token.OutPrompt:    "#ansidarkred",
    Token.OutPromptNum: "bold #ansired",
    Token.InPrompt:     "#ansidarkgreen",
    Token.InPromptNum:  "bold #ansigreen",
    Name:               f"italic {gray}",
    Name.Builtin:       f"bold {gray}",
    Name.Function:      f"bold {gray}",
    Keyword:            f"{gray}",
    Name.Class:         "bold noitalic #7e84b5",
    Name.Namespace:     "bold noitalic #7e84b5",
}

c.TerminalInteractiveShell.editing_mode = 'vi'
c.TerminalInteractiveShell.confirm_exit = False
