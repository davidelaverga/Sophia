#!/bin/sh
# Build from the clean renderer image. An explicit allowlist excludes host keys,
# home directories, environment files and any runtime job data.
set -eu
root=/tmp/uml-root
mkdir -p "$root"/usr/bin "$root"/usr/lib "$root"/usr/lib64 "$root"/usr/share "$root"/etc "$root"/opt/node/bin "$root"/proc "$root"/sys "$root"/dev "$root"/tmp "$root"/run "$root"/work
cp -a /usr/lib/x86_64-linux-gnu "$root/usr/lib/"
for utility in env unshare setpriv prlimit id dash; do cp /usr/bin/"$utility" "$root/usr/bin/"; done
ln -s dash "$root/usr/bin/sh"
ln -s usr/bin "$root/bin"
ln -s usr/bin "$root/sbin"
ln -s usr/lib "$root/lib"
ln -s usr/lib64 "$root/lib64"
ln -s /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 "$root/usr/lib64/ld-linux-x86-64.so.2"
cp -a /usr/share/fonts /usr/share/fontconfig "$root/usr/share/"
cp -a /etc/fonts "$root/etc/"
cp /usr/local/bin/node "$root/opt/node/bin/node"
cp -a /opt/sophia-renderer "$root/opt/renderer"
cp -a /opt/pw-browsers "$root/opt/"
printf 'root:x:0:0:root:/nonexistent:/usr/bin/sh\nrender:x:10001:10001:render:/nonexistent:/usr/sbin/nologin\n' > "$root/etc/passwd"
printf 'root:x:0:\nrender:x:10001:\n' > "$root/etc/group"
printf 'sophia-uml-guest\n' > "$root/etc/hostname"
mkdir -p /opt/uml
truncate -s 2G /opt/uml/guest.raw
mke2fs -q -F -t ext4 -L SOPHIA_UML_ROOT -d "$root" /opt/uml/guest.raw
chmod 0444 /opt/uml/guest.raw
rm -rf "$root"
