igrmk's Dotfiles
================

This repository contains my personal dotfiles for various tools and applications.
Below is an example of how to use these dotfiles.

Usage
-----

```bash
# Clone to the root filesystem so the /etc symlinks resolve at boot
git clone git@github.com:igrmk/dotfiles.git ~/dotfiles
cd ~/dotfiles/home
./create-dirs
stow common
stow zsh
stow git
stow ipython
# Add more configurations as needed
```

Local overrides
---------------

Untracked machine-local settings go in `~/.source.d/90-local`, automatically sourced by both shells.
