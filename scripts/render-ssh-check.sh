#!/bin/sh
# WBC-02-CC-0010 §2.2: what Render's SSH into a Docker service needs of an image, checked inside the image as it starts
# (no --user, no HOME given), by the CI that builds it:
#   docker run --rm --network none --read-only --volume <this file>:/opt/check/render-ssh-check.sh:ro \
#     --entrypoint /bin/sh <image> /opt/check/render-ssh-check.sh [<the service's disk mount>]
# Render's session runs as the image's user. Per Render's documentation (Docker-specific configuration), the root
# account must not be locked and no persistent disk may be mounted at the user's $HOME; the session's keys go in that
# home's .ssh, at 0700. So here: the user is root; its HOME is /root, as its passwd entry says, and not on the disk; its
# .ssh is its own directory at 0700; root's shadow entry is neither locked (`!`, as passwd -l and usermod -L leave it)
# nor empty. Each failure is a line; the exit is 1 if any. (RENDER_SSH_ROOT_HOME stands for /root in tests only.)
set -u
disk="${1:-}"
root_home="${RENDER_SSH_ROOT_HOME:-/root}"
fail=0
no() {
  printf 'RENDER_SSH_PRECONDITION failed: %s\n' "$1"
  fail=1
}
[ "$(id -un)" = root ] || no "the image's user is $(id -un), not root"
[ "${HOME:-}" = "$root_home" ] || no "the user's HOME is ${HOME:-unset}, not $root_home"
home="$(getent passwd root | cut -d: -f6)"
[ "$home" = "$root_home" ] || no "root's home in passwd is ${home:-missing}, not $root_home"
pw="$(getent shadow root | cut -d: -f2)"
case "$pw" in
  '') no "root has no shadow entry, or an empty password" ;;
  '!'*) no "root is locked" ;;
esac
if [ -n "$disk" ]; then
  case "${HOME:-}/" in
    "${disk%/}"/*) no "the user's HOME ${HOME:-} is on the disk mounted at $disk" ;;
  esac
fi
ssh_dir="${HOME:-/nonexistent}/.ssh"
# shellcheck disable=SC2046 # ls's fields: the mode and the owner's uid
set -- $(ls -ldn "$ssh_dir" 2>/dev/null)
case "${1:-}" in
  drwx------*) [ "${3:-}" = "$(id -u)" ] || no "$ssh_dir is not the user's own" ;;
  *) no "$ssh_dir is not a directory at 0700" ;;
esac
[ "$fail" = 0 ] && printf 'RENDER_SSH_PRECONDITION ok: user root, HOME %s, %s at 0700, root not locked\n' "$HOME" "$ssh_dir"
exit "$fail"
