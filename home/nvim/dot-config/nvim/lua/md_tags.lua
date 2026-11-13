-- Highlight tags like #tag in Markdown, as todomd uses them in TODO.md.
-- The parsers have no node for a tag, so the text of the inline trees is scanned for them,
-- outside code spans, HTML tags, autolinks, LaTeX, and link destinations, titles and labels.
-- The marks are drawn at each redraw for the rows on screen,
-- from the trees the treesitter highlighter keeps parsed for them.

local M = {}

local ns = vim.api.nvim_create_namespace('md_tags')

-- Inline nodes whose text holds no tags
local skip = {
    code_span = true,
    email_autolink = true,
    html_tag = true,
    latex_block = true,
    link_destination = true,
    link_label = true,
    link_title = true,
    uri_autolink = true,
}

-- Return the byte length of the UTF-8 character at byte i of s.
local function char_len(s, i)
    local b = s:byte(i)
    return b >= 240 and 4 or b >= 224 and 3 or b >= 192 and 2 or 1
end

-- Tell whether the n-byte character at byte i of s is a letter of any script.
local function letter(s, i, n)
    if n == 1 then return s:sub(i, i):match('%a') ~= nil end
    local class = vim.fn.charclass(s:sub(i, i + n - 1))
    return class == 2 or class > 3
end

-- Tell whether byte i of s begins a word, in a text that starts at byte from.
-- A tag must, so page#anchor is not a tag.
local function word_start(s, i, from)
    if i == from then return true end
    local j = i - 1
    if s:byte(j) < 128 then return s:sub(j, j):match('%s') ~= nil end
    while j > from and s:byte(j) >= 128 and s:byte(j) < 192 do j = j - 1 end
    return vim.fn.charclass(s:sub(j, i - 1)) == 0
end

-- Return the byte after the tag whose # is byte i of s, looking no further than byte to,
-- or nil when no tag starts there.
-- A tag is a letter, then letters, digits, _ and -, with single dots inside it.
local function tag_end(s, i, to)
    local j = i + 1
    if j > to or not letter(s, j, char_len(s, j)) then return nil end
    local e, dot = j, false
    while j <= to do
        local n = char_len(s, j)
        local c = s:sub(j, j)
        if c == '.' and not dot then
            dot = true
        elseif (n == 1 and c:match('[%w_-]')) or (n > 1 and letter(s, j, n)) then
            dot = false
            e = j + n
        else
            break
        end
        j = j + n
    end
    return e
end

-- Tell whether the byte at col of row lies in a node whose text holds no tags.
local function skipped(root, row, col)
    local node = root:named_descendant_for_range(row, col, row, col + 1)
    while node do
        if skip[node:type()] then return true end
        node = node:parent()
    end
    return false
end

-- Mark the tags between bytes from and to of line, the text at row, in the tree with root.
local function mark(buf, root, row, line, from, to)
    local i = from
    while true do
        local s = line:find('#', i, true)
        if not s or s > to then return end
        local e = word_start(line, s, from) and tag_end(line, s, to)
        if e and not skipped(root, row, s - 1) then
            vim.api.nvim_buf_set_extmark(buf, ns, row, s - 1,
                { end_col = e - 1, hl_group = 'Constant', ephemeral = true })
        end
        i = e or s + 1
    end
end

local function on_win(_, _, buf, toprow, botrow)
    local highlighter = package.loaded['vim.treesitter.highlighter']
    local hl = highlighter and highlighter.active[buf]
    local inline = hl and hl.tree:lang() == 'markdown' and hl.tree:children().markdown_inline
    if not inline then return false end
    local lines = vim.api.nvim_buf_get_lines(buf, toprow, botrow + 1, false)
    -- Leave the trees alone when no row on screen has a #
    if not table.concat(lines, '\n'):find('#', 1, true) then return false end
    -- Pick the trees on screen by the rows of their regions, which are Lua tables,
    -- as asking each tree for its range calls into C once per tree.
    -- Each range is { start_row, start_col, start_byte, end_row, end_col, end_byte }.
    local regions = inline:included_regions()
    for i, tree in pairs(inline:trees()) do
        local region = regions[i]
        local first, last = region and region[1], region and region[#region]
        if first and first[1] <= botrow and last[4] >= toprow then
            local root = tree:root()
            for _, r in ipairs(region) do
                for row = math.max(r[1], toprow), math.min(r[4], botrow) do
                    local line = lines[row - toprow + 1]
                    if line then
                        local from = row == r[1] and r[2] + 1 or 1
                        local to = math.min(row == r[4] and r[5] or #line, #line)
                        mark(buf, root, row, line, from, to)
                    end
                end
            end
        end
    end
    return false
end

function M.setup()
    vim.api.nvim_set_decoration_provider(ns, { on_win = on_win })
end

return M
