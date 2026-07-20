# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Conventions

- Use relative paths when referencing files (e.g., `home/git/` not `/Users/.../dotfiles/home/git/`)
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`, `docs:`)
- Don't use unnecessary flags (e.g., `git -C` when already in the working directory)
- Use one-line commit messages and don't use heredocs when committing
- Don't use `+` in commit messages (write "and" or use commas)
- Capitalize acronyms and proper nouns in commit messages (e.g., `LSP`, `Python`)
- NEVER push to origin unless explicitly asked; committing does not imply pushing (applies to every repo, not just this one)
- Break comment lines at clause boundaries, not mid-phrase (e.g., keep a parenthetical list on one line)
- Keep Markdown lines to 100 columns max, wrapping at clause boundaries (not mid-phrase)
- 100 columns is an upper bound, not a target; lines often land well short of it
- Pick break points by grammar, not by width
- Break where speech pauses longest: sentence end, then comma, then phrase boundary
- If a clause won't fit in 100 columns, rewrite it rather than split it mid-phrase

## Installing tools

When installing software (not configs), prefer these methods in order and use the highest one
that has the tool:

1. System packages (`apt` on Linux)
2. Homebrew (macOS)
3. Snap (Linux — see `home/linux/dot-local/bin/install-snaps`)
4. `uv tool install` (Python CLIs and language servers)
5. `cargo install` (Rust CLIs — see `home/linux/dot-local/bin/install-cargo`)
6. `npm install -g` (node-only tools, last resort)

Avoid `curl | sh` installers and other ad-hoc global installs when a listed manager has the tool.

## Overview

This is a personal dotfiles repository using GNU Stow for symlink-based configuration management across Linux and macOS systems.

## Commands

### Installing configurations

```bash
cd home
./create-dirs          # Create required directories first
stow <package>         # Install a package (e.g., stow zsh, stow git)
stow -D <package>      # Uninstall a package
```

For system-level configs:
```bash
cd root
sudo stow <package>    # Installs to / instead of ~
```

## Architecture

### Directory Structure

- `home/` - User-level configs, stowed to `~`
- `root/` - System-level configs, stowed to `/`

### Stow Conventions

Stow's `--dotfiles` option is enabled via `.stowrc`. Files named `dot-*` become `.*` when symlinked:
- `dot-bashrc` → `~/.bashrc`
- `dot-config/git/config` → `~/.config/git/config`

### Modular Shell Configuration

Shell configs use a `.source.d/` pattern for modularity. Files in `~/.source.d/` are sourced by `.zshrc` in alphabetical order. Naming convention: `<NN>-<platform/tool>-<function>` (e.g., `10-mac-paths`, `50-mac-aliases`).

The numeric prefix is a load-order tier:
- `10-` — PATH setup only. These run first so later files can probe for tools.
- `50-` — everything else (aliases, functions, tool config).

Anything that tests for a tool at load time (`command -v`, `which`) must sort after the `10-` files, otherwise the tool is not on PATH yet and the check silently fails.

Platform-specific packages (`linux/`, `mac/`) add their own `.source.d/` files when stowed.

### Git Config Layering

Git config uses includes for OS-specific and local overrides:
1. Main config in `dot-config/git/config`
2. OS-specific: included via `os` file (from `linux/` or `mac/` package)
3. Local overrides: `~/.config/git/local` (not tracked)
