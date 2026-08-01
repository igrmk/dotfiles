-- A brief wash over the window focus moves to, so landing somewhere unexpected is obvious.
-- Through winhighlight, which is itself a window highlight namespace underneath:
-- attaching one of our own with nvim_win_set_hl_ns would replace it, not layer over it,
-- and every mapping a plugin like Diffview keeps there would drop out for the duration.

local M = {}

local defaults = {
    duration = 100,
    -- Used when the colourscheme leaves Normal without a background,
    -- as a terminal one often does. Where there is a background, the wash is derived from it.
    hl = { bg = '#303030', ctermbg = 236 },
    derive = true,
}

local wash_prefix = 'WinkWash'
local wash_pattern = '^Normal:' .. wash_prefix .. '(.+)$'
local config = defaults

-- Keyed by window: two can be mid-wink at once,
-- and re-entering a winking window must not record the wash as the mapping to put back.
local winking = {}
local counter = 0
-- Windows created in the current tick, none of which count as a focus change.
local born = {}
-- Keyed by the group the window maps Normal to, because that is what the wash is built from.
-- Two windows winking at once through different mappings then keep their own colours.
local wash_groups = {}

-- The window's own mappings, with ours removed, and the group it maps Normal to.
-- A wash group is named after the mapping it replaced,
-- so a wash inherited from another window gives that mapping back rather than being dropped.
local function unwashed(win)
    local kept, normal, washed = {}, nil, nil
    for _, part in ipairs(vim.split(vim.wo[win].winhighlight, ',', { trimempty = true })) do
        local target = part:match(wash_pattern)
        if target then
            washed = target ~= 'Normal' and target or nil
        elseif vim.startswith(part, 'Normal:') then
            normal = part:sub(#'Normal:' + 1)
        else
            table.insert(kept, part)
        end
    end
    return kept, normal or washed
end

local function tint(rgb, delta)
    local function channel(value)
        return math.max(0, math.min(255, value + delta))
    end
    return channel(math.floor(rgb / 65536) % 256) * 65536
        + channel(math.floor(rgb / 256) % 256) * 256
        + channel(rgb % 256)
end

-- Built once per target and kept, so a wink is two option writes and a table lookup.
local function wash_group(target)
    local group = wash_groups[target]
    if group then return group end
    group = wash_prefix .. target
    local hl = vim.tbl_extend('keep', {}, config.hl)
    -- A configured highlight is taken as given. Only the default one,
    -- which cannot know the theme, gives way to what the window actually uses.
    if config.derive then
        local base = vim.api.nvim_get_hl(0, { name = target, link = false })
        if base.fg then
            hl.fg, hl.ctermfg = base.fg, base.ctermfg
        end
        if base.bg then
            hl.bg = tint(base.bg, vim.o.background == 'dark' and 24 or -24)
        end
    end
    vim.api.nvim_set_hl(0, group, hl)
    wash_groups[target] = group
    return group
end

local function unwink(win, saved)
    -- Rebuilt from the mappings in force now, so anything set during the wink survives.
    local kept, normal = unwashed(win)
    normal = normal or saved
    if normal then
        table.insert(kept, 'Normal:' .. normal)
    end
    vim.wo[win].winhighlight = table.concat(kept, ',')
end

function M.wink(win)
    win = win or vim.api.nvim_get_current_win()
    counter = counter + 1
    local state = winking[win]
    if not state then
        local kept, normal = unwashed(win)
        state = { normal = normal }
        winking[win] = state
        table.insert(kept, 'Normal:' .. wash_group(normal or 'Normal'))
        vim.wo[win].winhighlight = table.concat(kept, ',')
    end
    state.generation = counter
    local generation = counter
    vim.defer_fn(function()
        local current = winking[win]
        -- A later wink on this window owns the revert.
        if not current or current.generation ~= generation then return end
        winking[win] = nil
        if vim.api.nvim_win_is_valid(win) then
            unwink(win, current.normal)
        end
    end, config.duration)
end

function M.setup(opts)
    opts = opts or {}
    -- Replaced rather than merged: a highlight definition is a whole,
    -- and a caller asking for a different background does not mean to keep the old ctermbg.
    config = {
        duration = opts.duration or defaults.duration,
        hl = opts.hl or defaults.hl,
        derive = opts.hl == nil,
    }
    wash_groups = {}
    local group = vim.api.nvim_create_augroup('wink', { clear = true })

    -- The colours the wash was derived from are gone.
    -- Setting background fires ColorScheme only when a scheme was loaded by name,
    -- so the option is watched as well.
    local function forget_wash() wash_groups = {} end
    vim.api.nvim_create_autocmd('ColorScheme', { group = group, callback = forget_wash })
    vim.api.nvim_create_autocmd('OptionSet', {
        group = group,
        pattern = 'background',
        callback = forget_wash,
    })

    -- WinNew runs with the new window current, right before its WinEnter if one comes at all,
    -- and a window opened without being entered gets no WinEnter.
    -- winhighlight is inherited, so one created mid-wink arrives already washed,
    -- and this is where every new window passes.
    vim.api.nvim_create_autocmd('WinNew', {
        group = group,
        callback = function()
            local win = vim.api.nvim_get_current_win()
            if vim.wo[win].winhighlight:find('Normal:' .. wash_prefix, 1, true) then
                unwink(win, nil)
            end
            -- A layout built in one go, as Diffview does, creates several windows at once,
            -- so they are collected until the tick ends.
            if not next(born) then
                vim.schedule(function() born = {} end)
            end
            born[win] = true
        end,
    })

    vim.api.nvim_create_autocmd('WinEnter', {
        group = group,
        callback = function()
            local win = vim.api.nvim_get_current_win()
            local just_born = born[win]
            born[win] = nil
            -- Floats are pickers and diagnostic popups, which are not somewhere focus lands.
            if just_born or vim.api.nvim_win_get_config(win).relative ~= '' then return end
            M.wink(win)
        end,
    })
end

return M
