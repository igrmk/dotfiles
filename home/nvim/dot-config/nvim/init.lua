vim.g.mapleader = ' '

-- Bootstrap lazy.nvim (plugin manager).
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not vim.uv.fs_stat(lazypath) then
    vim.fn.system({ 'git', 'clone', '--filter=blob:none', '--branch=stable',
        'https://github.com/folke/lazy.nvim.git', lazypath })
end
vim.opt.rtp:prepend(lazypath)

-- Scope pickers to the repo above the cwd,
-- so a subdirectory launch still searches the whole project.
-- Anchoring on the current file would root them at Homebrew after a jump into the Go stdlib.
local function project_picker(name)
    return function()
        local root = vim.fs.root(vim.uv.cwd(), '.git') or vim.uv.cwd()
        require('telescope.builtin')[name]({ cwd = root })
    end
end

local function picker(name)
    return function() require('telescope.builtin')[name]() end
end

require('lazy').setup({
    {
        'igrmk/kull-vim',
        lazy = false,
        priority = 1000,
        config = function()
            pcall(vim.cmd.colorscheme, vim.env.BRIGHT == 'high' and 'hull' or 'kull')
        end,
    },
    {
        'nvim-treesitter/nvim-treesitter',
        branch = 'main',
        build = ':TSUpdate',
        lazy = false,
        config = function()
            -- Parsers for c, lua, markdown ship with Neovim; install the rest.
            require('nvim-treesitter').install({ 'cpp', 'c_sharp', 'go', 'python', 'bash', 'json', 'yaml', 'toml' })
            vim.api.nvim_create_autocmd('FileType', {
                pattern = { 'c', 'cpp', 'cs', 'go', 'python', 'lua', 'sh', 'bash', 'json', 'yaml', 'toml', 'markdown' },
                callback = function(args)
                    -- pcall: the parser may still be compiling on first launch.
                    pcall(vim.treesitter.start, args.buf)
                end,
            })
        end,
    },
    {
        'folke/flash.nvim',
        -- Leave f/t/F/T and / search untouched; s jump only.
        opts = { modes = { char = { enabled = false }, search = { enabled = false } } },
        keys = {
            { 's', mode = { 'n', 'x', 'o' }, function() require('flash').jump() end, desc = 'Flash jump' },
        },
    },
    {
        'stevearc/oil.nvim',
        -- Not lazy loaded: oil replaces netrw, so it has to be up before the first directory buffer.
        lazy = false,
        opts = {},
        keys = {
            { '-', '<cmd>Oil<cr>', desc = 'Open parent directory' },
        },
    },
    {
        'nvim-telescope/telescope.nvim',
        dependencies = {
            'nvim-lua/plenary.nvim',
            -- Native fzf sorter, a C extension, so it builds on install.
            { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
        },
        cmd = 'Telescope',
        keys = {
            { '<leader>o', project_picker('find_files'), desc = 'Find files' },
            { '<leader>p', project_picker('oldfiles'), desc = 'Recent files' },
            { '<leader>b', picker('buffers'), desc = 'Buffers' },
            { '<leader>/', project_picker('live_grep'), desc = 'Live grep' },
            { '<leader><tab>', picker('keymaps'), desc = 'Keymaps' },
        },
        opts = {
            defaults = {
                mappings = {
                    -- fzf's selection keys. In the prompt, j/k type text.
                    i = {
                        ['<C-j>'] = 'move_selection_next',
                        ['<C-k>'] = 'move_selection_previous',
                    },
                },
            },
        },
        config = function(_, opts)
            require('telescope').setup(opts)
            require('telescope').load_extension('fzf')
        end,
    },
    {
        -- Servers on lspconfig defaults, apart from basedpyright. clangd stays hand-rolled below:
        -- its query-driver and compile-commands flags aren't the default.
        'neovim/nvim-lspconfig',
        ft = { 'cs', 'go', 'python' },
        config = function()
            vim.lsp.config('gopls', {
                settings = { gopls = { symbolScope = 'workspace' } },
            })
            -- Type checking off by default; projects opt in via [tool.basedpyright],
            -- which makes basedpyright drop every setting below.
            vim.lsp.config('basedpyright', {
                -- Drop the default .git fallback.
                -- Go-to-definition opens stubs under Homebrew's Cellar,
                -- whose nearest .git is /opt/homebrew: that would root the whole tree.
                -- Python projects have a real marker; stubs get single-file mode.
                root_markers = {
                    'pyrightconfig.json',
                    'pyproject.toml',
                    'setup.py',
                    'setup.cfg',
                    'requirements.txt',
                    'Pipfile',
                },
                settings = {
                    basedpyright = {
                        analysis = {
                            typeCheckingMode = 'off',
                            -- Setting exclude replaces pyright's defaults, so repeat them.
                            -- Indexing ignores openFilesOnly, so build/ would double symbol hits.
                            exclude = {
                                '**/node_modules',
                                '**/__pycache__',
                                '**/.*',
                                '**/build',
                                '**/dist',
                            },
                        },
                    },
                },
            })
            vim.lsp.enable({ 'roslyn_ls', 'gopls', 'ruff', 'basedpyright' })
        end,
    },
})

local opt = vim.opt
opt.path:append('**')
opt.fileencodings = { 'utf-8', 'cp1251', 'koi8-r', 'cp866', 'ucs-bom' }
opt.scrolloff = 6
opt.wildmode = 'list:longest'
opt.autoindent = true
opt.shiftwidth = 4
opt.tabstop = 4
opt.expandtab = true
opt.wrap = false
opt.mouse = 'a'
opt.list = true
opt.listchars = { tab = '»·', trail = '·', nbsp = '⎵' }
opt.clipboard = 'unnamed,unnamedplus'
opt.swapfile = false
-- Drives the CursorHold diagnostic float; the 4s default feels broken.
opt.updatetime = 200
opt.fixendofline = false
opt.foldenable = false
opt.langmap = 'ФИСВУАПРШОЛДЬТЩЗЙКЫЕГМЦЧНЯ;ABCDEFGHIJKLMNOPQRSTUVWXYZ,фисвуапршолдьтщзйкыегмцчня;abcdefghijklmnopqrstuvwxyz'

vim.api.nvim_create_user_command('Sudow', 'w !sudo tee % >/dev/null', {})
vim.api.nvim_create_user_command('Clean', [[%s/\s\+$//e]], {})

-- Dismissing is a keypress, which re-arms CursorHold, so the float would pop back.
local diag_float_muted = false
local diag_float_line = 0
local diag_float_win = nil

-- Close only the float we opened.
-- Sweeping every float would take Telescope's picker windows with it.
local function close_diag_float()
    if diag_float_win and vim.api.nvim_win_is_valid(diag_float_win) then
        -- pcall: force=false throws on a modified float.
        pcall(vim.api.nvim_win_close, diag_float_win, false)
    end
    diag_float_win = nil
end

local map = vim.keymap.set
map('', ',,', '<cmd>nohlsearch<cr>', { desc = 'Clear search highlight' })
map('n', '<leader>r', [[:%s/\<<C-r><C-w>\>//g<Left><Left>]], { desc = 'Substitute word under cursor' })
map('n', '<leader>q', function()
    diag_float_muted = true
    close_diag_float()
    vim.cmd('lclose | cclose')
end, { desc = 'Dismiss diagnostic float, close quickfix and location lists' })
map('x', 'x', '"_d', { desc = 'Delete without yanking' })
map('n', 'Q', '<Nop>', { desc = 'Disabled, stops an accidental macro replay' })
map('n', 'QQ', '<cmd>cquit<cr>', { desc = 'Quit with a non-zero exit code' })
map('i', 'j', function() return vim.fn.pumvisible() == 1 and '<C-n>' or 'j' end, { expr = true, desc = 'Next completion item while the popup is open' })
map('i', 'k', function() return vim.fn.pumvisible() == 1 and '<C-p>' or 'k' end, { expr = true, desc = 'Previous completion item while the popup is open' })
map('n', 'gw', [["_yiw:s/\(\%#\w\+\)\(\_W\+\)\(\w\+\)/\3\2\1/<cr><C-o>:noh<cr>]], { silent = true, desc = 'Swap word under cursor with the next one' })

-- Restore cursor to last position when reopening a file.
vim.api.nvim_create_autocmd('BufReadPost', {
    callback = function()
        local line = vim.fn.line
        if line([['"]]) > 1 and line([['"]]) <= line('$') then
            vim.cmd([[normal! g'"]])
        end
    end,
})

-- C/C++ LSP via built-in client (no plugins). clangd + GCC query-driver.
vim.api.nvim_create_autocmd('FileType', {
    pattern = { 'c', 'cpp' },
    callback = function(args)
        local marker = vim.fs.find(
            { 'compile_commands.json', '.clangd', 'conanfile.py', 'conanfile.txt', 'CMakeLists.txt', '.git' },
            { upward = true, path = vim.api.nvim_buf_get_name(args.buf) }
        )[1]
        local root = marker and vim.fs.dirname(marker) or nil
        local cmd = { 'clangd', '--query-driver=/usr/bin/g++*,/usr/bin/gcc*' }
        -- clangd's own search skips nested build dirs; point it at compile_commands.json.
        if root then
            for _, sub in ipairs({ 'build/Debug', 'build/Release', 'build' }) do
                if vim.uv.fs_stat(root .. '/' .. sub .. '/compile_commands.json') then
                    table.insert(cmd, '--compile-commands-dir=' .. root .. '/' .. sub)
                    break
                end
            end
        end
        vim.lsp.start({
            name = 'clangd',
            cmd = cmd,
            root_dir = root,
            -- Standard for files not in the compilation database (concepts, operator<=>).
            init_options = { fallbackFlags = { '-std=c++23' } },
        })
    end,
})

-- gopls, ruff, basedpyright, and roslyn_ls (C#) are enabled via nvim-lspconfig in the plugin spec above.

-- Neovim 0.11+ shows no message text by default, only underline and signs.
-- The float adds the server name and rule code.
vim.diagnostic.config({
    underline = true,
    severity_sort = true,
    float = {
        source = true,
        border = 'rounded',
        suffix = function(d) return d.code and ('  [' .. d.code .. ']') or '' end,
    },
})

-- Float the diagnostic once the cursor settles.
-- DiagnosticChanged also covers opening straight onto a bad line.
vim.api.nvim_create_autocmd({ 'CursorHold', 'DiagnosticChanged' }, {
    callback = function(args)
        if diag_float_muted then return end
        if args.buf ~= vim.api.nvim_get_current_buf() then return end
        if vim.api.nvim_get_mode().mode ~= 'n' then return end
        -- Don't stack over a focusable popup like K hover; our own float is not focusable.
        for _, win in ipairs(vim.api.nvim_list_wins()) do
            local cfg = vim.api.nvim_win_get_config(win)
            if cfg.relative ~= '' and cfg.focusable then return end
        end
        -- Fixing the diagnostic makes open_float a no-op, so close the old float first.
        close_diag_float()
        -- The default close_events fire on horizontal motion too, which flickers.
        local _, win = vim.diagnostic.open_float({
            focusable = false,
            close_events = { 'CursorMovedI', 'InsertCharPre', 'BufLeave', 'WinLeave' },
        })
        diag_float_win = win
        diag_float_line = vim.api.nvim_win_get_cursor(0)[1]
    end,
})

-- The float is line-scoped, so only a line change should close it.
vim.api.nvim_create_autocmd('CursorMoved', {
    callback = function()
        diag_float_muted = false
        if vim.api.nvim_win_get_cursor(0)[1] ~= diag_float_line then close_diag_float() end
    end,
})

-- Buffer-local LSP mappings, set when a server attaches.
vim.api.nvim_create_autocmd('LspAttach', {
    callback = function(args)
        local function buf_with_desc(desc) return { buffer = args.buf, desc = desc } end
        map('n', 'gd', vim.lsp.buf.definition, buf_with_desc('Go to definition'))
        map('n', 'gu', vim.lsp.buf.references, buf_with_desc('List references'))
        map('n', 'gi', vim.lsp.buf.implementation, buf_with_desc('Go to implementation'))
        map('n', 'K', vim.lsp.buf.hover, buf_with_desc('Hover documentation'))
        map('n', '<leader><space>', picker('lsp_dynamic_workspace_symbols'), buf_with_desc('Workspace symbols'))
        map('n', '<leader>r', vim.lsp.buf.rename, buf_with_desc('Rename symbol'))
        map('n', '<leader>a', vim.lsp.buf.code_action, buf_with_desc('Code action'))
        map('n', '<leader>=', function() vim.lsp.buf.format() end, buf_with_desc('Format buffer'))
        map('n', '[d', function() vim.diagnostic.jump({ count = -1, float = true }) end, buf_with_desc('Previous diagnostic'))
        map('n', ']d', function() vim.diagnostic.jump({ count = 1, float = true }) end, buf_with_desc('Next diagnostic'))
    end,
})
