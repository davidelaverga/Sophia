# Donor inventory helper

`inventory_raven.py` is an outline-pack helper, not application code. It reads the exact pinned Git objects in an **already acquired external Raven clone**, verifies the four entry blob IDs and computes file SHA-256s. It does not fetch, install, execute or copy the donor. Review it before use.

```sh
python tools/inventory_raven.py \
  --repo /actual/external/Raven \
  --output /actual/approved/evidence/raven-inventory.json
```

The paths above are placeholders to resolve on the operator's own host. The output parent must exist; an existing output is refused. The clone's working-tree HEAD is not used to choose bytes. A missing pinned commit or a mismatched entry blob fails rather than silently selecting a newer version.

LFS pointers, symlinks, fonts and other potentially executable references are explicitly classified; the helper does not turn them into active assets. Notice enumeration is not legal clearance. G1 still requires file/asset rights, clause mapping, dependency closure, actual image availability and native capability qualification.

The pack's helper is exercised with synthetic local Git fixtures. **The actual Raven corpus has not been inventoried by this helper in this environment.** That remains a G1 operation; no generated inventory is claimed here.
