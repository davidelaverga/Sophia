#!/bin/sh
# WBC-02: start the pinned Paperclip server with Sophia's adapter registered from the image, never from the disk.
# The pin reads external adapters from $PAPERCLIP_HOME/adapter-plugins.json (server/src/services/adapter-plugin-store.ts)
# and imports each from its localPath (server/src/adapters/plugin-loader.ts). Writing the record on every start means the
# adapter that runs is always this image's, at its fixed path; PAPERCLIP_ADAPTERS makes the start fail if it did not load.
set -eu
: "${PAPERCLIP_HOME:?PAPERCLIP_HOME is required}"
: "${SOPHIA_PAPERCLIP_DIR:=/opt/sophia}"
: "${PAPERCLIP_APP_DIR:=/app}"
mkdir -p "$PAPERCLIP_HOME"
record="$PAPERCLIP_HOME/adapter-plugins.json"
printf '[{"packageName":"@sophia/paperclip-adapter-sophia-dsh","localPath":"%s/sophia-dsh-adapter","type":"sophia_dsh","installedAt":"1970-01-01T00:00:00.000Z"}]\n' \
  "$SOPHIA_PAPERCLIP_DIR" > "$record.tmp"
mv "$record.tmp" "$record"
cd "$PAPERCLIP_APP_DIR"
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
