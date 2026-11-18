-- Color the status of each finding in review files, the *.review files of code review findings,
-- in the `- Status:` field right under each finding's heading.
-- The marks are drawn at each redraw for the rows on screen,
-- so they follow edits and reloads of the file as they come.

local M = {}

local ns = vim.api.nvim_create_namespace('review_status')

-- Red for what needs the user, green for what is done, blue for what is declined
local groups = {
    Open     = 'ReviewStatusOpen',
    Disputed = 'ReviewStatusOpen',
    Fixed    = 'ReviewStatusDone',
    Posted   = 'ReviewStatusDone',
    Declined = 'ReviewStatusDeclined',
}

-- Under any other colorscheme than hull, its diff colors
local links = {
    ReviewStatusOpen     = 'Removed',
    ReviewStatusDone     = 'Added',
    ReviewStatusDeclined = 'Changed',
}

-- Define the status colors for the current colorscheme.
-- Under hull, a status is a badge:
-- its removed and added diff lines, and its black text on the blue of Changed for a declined one.
local function set_colors()
    if vim.g.colors_name ~= 'hull' then
        for group, link in pairs(links) do
            vim.api.nvim_set_hl(0, group, { link = link, default = true })
        end
        return
    end
    local add = vim.api.nvim_get_hl(0, { name = 'DiffAdd', link = false })
    local changed = vim.api.nvim_get_hl(0, { name = 'Changed', link = false })
    vim.api.nvim_set_hl(0, 'ReviewStatusOpen', { link = 'DiffDelete', default = true })
    vim.api.nvim_set_hl(0, 'ReviewStatusDone', { link = 'DiffAdd', default = true })
    vim.api.nvim_set_hl(0, 'ReviewStatusDeclined', {
        fg = add.fg,     ctermfg = add.ctermfg,
        bg = changed.fg, ctermbg = changed.ctermfg,
        default = true,
    })
end

-- Color the statuses on the rows on screen of a window showing a review file.
local function on_win(_, _, buf, toprow, botrow)
    if not vim.api.nvim_buf_get_name(buf):match('%.review$') then return false end
    local lines = vim.api.nvim_buf_get_lines(buf, toprow, botrow + 1, false)
    for i, line in ipairs(lines) do
        local col, status = line:match('^%- Status: ()(%a+)%s*$')
        local group = groups[status]
        if group then
            vim.api.nvim_buf_set_extmark(buf, ns, toprow + i - 1, col - 1, {
                end_col = col - 1 + #status,
                hl_group = group,
                ephemeral = true,
            })
        end
    end
    return false
end

function M.setup()
    set_colors()
    -- A colorscheme clears every highlight group when it loads.
    vim.api.nvim_create_autocmd('ColorScheme', {
        group = vim.api.nvim_create_augroup('review_status', { clear = true }),
        callback = set_colors,
    })
    vim.api.nvim_set_decoration_provider(ns, { on_win = on_win })
end

return M
