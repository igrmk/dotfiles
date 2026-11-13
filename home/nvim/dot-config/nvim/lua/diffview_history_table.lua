-- Diffview's history panel as a table: subject, author and date each start in one column.
-- Diffview cuts a subject at 72 bytes however wide the window is;
-- the table cuts one only when the window has no room for it.
-- The ref names follow the subject, so that every subject starts in the same column.
-- Diffview has no option for any of this, so its renderer is wrapped:
-- a commit line stays as Diffview rendered it up to the hash and any reflog selector after it,
-- and the rest is rendered again.

local M = {}

-- Keep this much of the subject even if the author and date then run past the window's edge.
local min_subject_width = 20
-- Cut longer author names, so that one long name cannot widen the author column past this.
local max_author_width = 20
-- Leave out ref names cut narrower than these, which would show no letter of any name.
local min_refs = ' (x…'
local min_tag_refs = ' (tag: x…'
-- Diffview's panel windows show a sign column, two cells wide.
local sign_width = 2
local gap = '  '
local ellipsis = '…'
-- Unlike strdisplaywidth, ignore the current window's tabstop and wrap.
local width = vim.api.nvim_strwidth
-- The text width each panel was last rendered for.
local rendered_width = setmetatable({}, { __mode = 'k' })

-- Cut the text to the display width, ending a cut text with an ellipsis.
-- printf's %S counts display cells and never splits a letter from its combining marks.
local function cut(text, max)
    if width(text) <= max then return text end
    local fit = max - width(ellipsis)
    if fit < 0 then return '' end
    return vim.fn.printf('%.*S', fit, text) .. ellipsis
end

-- Replace control characters, since a tab's width depends on where it sits and others show as ^X.
local function plain(text)
    return (text:gsub('%c', ' '))
end

-- Relative for three months, as Diffview shows it,
-- then the date without Diffview's time and offset.
local function date_of(commit)
    local age = os.difftime(os.time(), commit.time)
    return age > 60 * 60 * 24 * 30 * 3 and commit.iso_date:sub(1, #'YYYY-MM-DD') or commit.rel_date
end

-- A closed panel is measured by its configured width, else by the screen's.
local function text_width(panel)
    if not panel:is_open() then
        return (panel:get_config().width or vim.o.columns) - sign_width
    end
    local info = vim.fn.getwininfo(panel.winid)[1]
    return info.width - info.textoff
end

local function pad(text, to)
    return text .. string.rep(' ', to - width(text))
end

-- The commit lines Diffview rendered, each split after its hash and any reflog selector.
local function rows_of(panel)
    local rows = {}
    for _, struct in ipairs(panel.components.log.entries) do
        local comp, entry = struct.commit.comp, struct.comp.context
        local kept
        for i, mark in ipairs(comp.hl) do
            if mark.group == 'DiffviewHash' or mark.group == 'DiffviewReflogSelector' then
                kept = i
            end
        end
        -- A line with no hash is one Diffview did not render, or rendered some other way: leave it.
        if kept then
            local commit = entry.commit
            table.insert(rows, {
                comp = comp,
                entry = entry,
                kept = kept,
                head = comp.lines[1]:sub(1, comp.hl[kept].last),
                subject = commit.subject ~= '' and plain(commit.subject) or '[empty message]',
                refs = commit.ref_names and ' (' .. commit.ref_names .. ')' or '',
                author = cut(plain(commit.author), max_author_width),
                date = date_of(commit),
            })
        end
    end
    return rows
end

local function render(panel)
    local rows = rows_of(panel)
    local text = text_width(panel)
    rendered_width[panel] = text
    local head_width, cell_width, author_width, date_width = 0, 0, 0, 0
    for _, row in ipairs(rows) do
        head_width = math.max(head_width, width(row.head))
        cell_width = math.max(cell_width, width(row.subject) + width(row.refs))
        author_width = math.max(author_width, width(row.author))
        date_width = math.max(date_width, width(row.date))
    end
    local room = text - head_width - author_width - date_width - 3 * #gap
    cell_width = math.min(cell_width, math.max(room, min_subject_width))

    for _, row in ipairs(rows) do
        local comp = row.comp
        -- The ref names share the subject's cell.
        -- Cut the subject to leave them room, down to the minimum, and give them what is left.
        local subject_max = math.max(cell_width - width(row.refs), min_subject_width)
        local subject = cut(row.subject, subject_max)
        local left = cell_width - width(subject)
        local refs = cut(row.refs, left)
        local min = row.refs:find('^ %(tag: ') and min_tag_refs or min_refs
        if width(refs) < width(min) then refs = '' end
        local selected = panel.cur_item[1] == row.entry
        local subject_hl = selected and 'DiffviewFilePanelSelected' or 'DiffviewFilePanelFileName'
        comp.hl = vim.list_slice(comp.hl, 1, row.kept)
        comp.lines = {}
        comp.line_buffer = pad(row.head, head_width) .. gap
        comp:add_text(subject, subject_hl)
        comp:add_text(refs, 'DiffviewReference')
        comp:add_text(string.rep(' ', left - width(refs)) .. gap)
        comp:add_text(pad(row.author, author_width) .. gap .. row.date, 'DiffviewFilePanelPath')
        comp:ln()
    end
end

function M.setup()
    local renderer = require('diffview.scene.views.file_history.render')
    local diffview_render = renderer.file_history_panel
    renderer.file_history_panel = function(panel)
        diffview_render(panel)
        if panel.render_data then render(panel) end
    end

    -- Fit the table to the window again when the window's width changes.
    vim.api.nvim_create_autocmd('WinResized', {
        group = vim.api.nvim_create_augroup('diffview_history_table', { clear = true }),
        callback = function()
            local view = require('diffview.lib').get_current_view()
            local panel = view and view.panel
            -- The event carries no windows when fired by hand.
            if not panel or not vim.list_contains(vim.v.event.windows or {}, panel.winid) then
                return
            end
            -- Skip when the panel's window shows another buffer,
            -- such as after the panel's own was wiped.
            if vim.api.nvim_win_get_buf(panel.winid) ~= panel.bufid then return end
            if vim.bo[panel.bufid].filetype ~= 'DiffviewFileHistory' then return end
            if text_width(panel) == rendered_width[panel] then return end
            panel:render()
            panel:redraw()
            -- Scroll back to the left edge:
            -- the window kept the scroll it needed for the old, wider rows.
            local line = vim.api.nvim_win_get_cursor(panel.winid)[1]
            vim.api.nvim_win_set_cursor(panel.winid, { line, 0 })
        end,
    })
end

return M
