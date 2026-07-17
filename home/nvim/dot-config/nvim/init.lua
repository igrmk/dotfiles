vim.g.mapleader = ' '

-- Bootstrap lazy.nvim (plugin manager).
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not vim.uv.fs_stat(lazypath) then
    vim.fn.system({ 'git', 'clone', '--filter=blob:none', '--branch=stable',
        'https://github.com/folke/lazy.nvim.git', lazypath })
end
vim.opt.rtp:prepend(lazypath)

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
        -- Servers whose lspconfig defaults fit as-is. clangd stays hand-rolled below:
        -- its query-driver and compile-commands flags aren't the default.
        'neovim/nvim-lspconfig',
        ft = { 'cs', 'go', 'python' },
        config = function()
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
opt.fixendofline = false
opt.foldenable = false
opt.langmap = 'ФИСВУАПРШОЛДЬТЩЗЙКЫЕГМЦЧНЯ;ABCDEFGHIJKLMNOPQRSTUVWXYZ,фисвуапршолдьтщзйкыегмцчня;abcdefghijklmnopqrstuvwxyz'

vim.api.nvim_create_user_command('Sudow', 'w !sudo tee % >/dev/null', {})
vim.api.nvim_create_user_command('Clean', [[%s/\s\+$//e]], {})

local map = vim.keymap.set
map('', ',,', '<cmd>nohlsearch<cr>')
map('n', '<leader>r', [[:%s/\<<C-r><C-w>\>//g<Left><Left>]])
map('n', '<leader>q', '<cmd>lclose | cclose<cr>')
map('x', 'x', '"_d')
map('n', 'Q', '<Nop>')
map('n', 'QQ', '<cmd>cquit<cr>')
map('i', 'j', function() return vim.fn.pumvisible() == 1 and '<C-n>' or 'j' end, { expr = true })
map('i', 'k', function() return vim.fn.pumvisible() == 1 and '<C-p>' or 'k' end, { expr = true })
map('n', 'gw', [["_yiw:s/\(\%#\w\+\)\(\_W\+\)\(\w\+\)/\3\2\1/<cr><C-o>:noh<cr>]], { silent = true })

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

-- Buffer-local LSP mappings, set when a server attaches.
vim.api.nvim_create_autocmd('LspAttach', {
    callback = function(args)
        local o = { buffer = args.buf }
        map('n', 'gd', vim.lsp.buf.definition, o)
        map('n', 'gu', vim.lsp.buf.references, o)
        map('n', 'gi', vim.lsp.buf.implementation, o)
        map('n', 'K', vim.lsp.buf.hover, o)
        map('n', '<leader><space>', vim.lsp.buf.workspace_symbol, o)
        map('n', '<leader>r', vim.lsp.buf.rename, o)
        map('n', '<leader>a', vim.lsp.buf.code_action, o)
        map('n', '<leader>=', function() vim.lsp.buf.format() end, o)
        map('n', '[d', function() vim.diagnostic.jump({ count = -1, float = true }) end, o)
        map('n', ']d', function() vim.diagnostic.jump({ count = 1, float = true }) end, o)
    end,
})
