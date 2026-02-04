# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Conventions

- Use relative paths when referencing files (e.g., `home/git/` not `/Users/.../dotfiles/home/git/`)
- Use conventional commits (e.g., `feat:`, `fix:`, `chore:`, `docs:`)

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

Shell configs use a `.source.d/` pattern for modularity. Files in `~/.source.d/` are sourced by `.zshrc` in alphabetical order. Naming convention: `50-<platform/tool>-<function>` (e.g., `50-linux-paths`, `50-mac-aliases`).

Platform-specific packages (`linux/`, `mac/`) add their own `.source.d/` files when stowed.

### Git Config Layering

Git config uses includes for OS-specific and local overrides:
1. Main config in `dot-config/git/config`
2. OS-specific: included via `os` file (from `linux/` or `mac/` package)
3. Local overrides: `~/.config/git/local` (not tracked)
