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

System-level configs
--------------------

```bash
cd ~/dotfiles/linux-root
sudo ./create-dirs
sudo stow apt
sudo stow sysctl
# Add more configurations as needed
```

The `nvidia` package touches the boot chain,
so run `sudo dracut -f` after `stow` and after `stow -D`.
On a hybrid laptop, `sudo prime-select intel` stops the NVIDIA modules loading at boot,
and `sudo prime-select on-demand` brings them back for external monitors; both need a reboot.
With no driver bound, nothing else marks the dGPU for runtime suspend,
so the package ships a udev rule for it; otherwise `intel` would idle hotter than `on-demand`.

Local overrides
---------------

Untracked machine-local settings go in `~/.source.d/90-local`, automatically sourced by both shells.
