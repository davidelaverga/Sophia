#!/bin/sh
# The CI database job's Q13 exclusive step: scripts/q13-owned-pg16-inner.sh in the image of the job's own postgres:16
# service container (its id is the argument), with no network and no published port, as that image's postgres user,
# 1 CPU, 2 GiB and no swap, 128 processes, a 1 GiB /tmp and five minutes. The repository and the job's Node binary are
# mounted read-only. Nothing is pulled or installed: a missing image, a Node that is not 24.21.0 or one that cannot run
# in that image is a failed capability check, never a reason to fetch another.
set -eu
service="${1:?the postgres service container id}"
image=$(docker inspect --format '{{.Image}}' "$service")
case "$image" in
  sha256:????????????????????????????????????????????????????????????????) ;;
  *) printf 'Q13_OWNED_PG16 failed: the service image id is %s\n' "$image" && exit 1 ;;
esac
node_bin=$(readlink -f "$(command -v node)")
node_version=$("$node_bin" --version)
[ "$node_version" = "v$(cat .node-version)" ] ||
  { printf 'Q13_OWNED_PG16 failed: node %s, not v%s\n' "$node_version" "$(cat .node-version)" && exit 1; }
printf 'Q13_OWNED_PG16 host: source=%s image=%s platform=%s node=%s node_sha256=%s\n' "$(git rev-parse HEAD)" "$image" \
  "$(docker image inspect --format '{{.Os}}/{{.Architecture}} {{join .RepoDigests ","}}' "$image")" "$node_version" \
  "$(sha256sum "$node_bin" | cut -d' ' -f1)"
name="con01-q13-owned-pg16-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
timeout --kill-after=5s 300s docker run --rm --name "$name" --network none --user postgres --read-only \
  --cpus=1 --memory=2g --memory-swap=2g --pids-limit=128 \
  --tmpfs /tmp:rw,nosuid,nodev,size=1g,mode=1777 \
  --mount "type=bind,src=$PWD,dst=/work,readonly" \
  --mount "type=bind,src=$node_bin,dst=/opt/node,readonly" \
  --workdir /work --entrypoint /bin/sh "$image" scripts/q13-owned-pg16-inner.sh
