# `@sophia/renderer-pdf`: the confined HTML-to-PDF kernel

SMC-M03 S5a. One static HTML report and its images become an A4 PDF in a confined headless Chromium. The result is a structured receipt. The kernel is adapted from Sophia-Agent's `render_html_to_pdf.mjs`:
- source: `davidelaverga/Sophia-Agent@d467ab97`, blob `f2e808cf`, staged by `docs/pack/scripts/extract_renderers.py`;
- licence: MIT, in `THIRD_PARTY_LEGACY_LICENSE.txt`.

It stays JavaScript (architecture 14 §1) and is typechecked through JSDoc.

## Job and receipt

`render-html.mjs --job job.json`, or `renderHtmlToPdf(job, { signal })`. A job names:
- `sourceRoot`: an absolute, immutable directory;
- `entry`: `{ path, sha256 }`, the report's HTML;
- `assets`: up to 64 images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`), each `{ path, sha256 }`;
- `language`: a BCP 47 tag;
- `outputDir`;
- optionally `jobId`, `scratchDir` and `timeoutMs` (default 120 s).

The browser executable comes only from the operator (`SOPHIA_CHROMIUM_PATH`, or the headless shell playwright-core pins), never from a job.

The output is `report.pdf`, written once and never over an existing file, plus `receipt.json` (`sophia.pdf-render-receipt.v1`). The receipt carries:
- the status (`succeeded`, `failed` or `cancelled`) and a stable error code;
- the renderer's identity: its own files' hash, the donor, playwright-core and the browser version;
- the source manifest's hash;
- the sandbox verdict;
- the PDF's SHA-256, size, header, trailer, page count and embedded images;
- the overflow measurement, `measured` or `unavailable` (never a zero it did not measure), with the elements that reach past the printable width;
- the visible SVG and image counts;
- every undeclared asset or blocked request;
- checks that are `passed`, `failed` or `unknown`; an unknown check never passes.

Blank and short pages stay `unknown` until S5b's text extraction. S5a part 2's supervisor turns this receipt into `sophia.render-result.v1`.

## What is refused

**Before launch** (`source-manifest.mjs`):
- an absolute path, a `..` or empty segment, or a symlink out of the root;
- a missing or non-regular file;
- a hash that does not match;
- a duplicate;
- an extension outside the allowlist;
- a file over its size bound;
- a malformed language.

**While loading.** Requests are denied by default. Only these load: the entry document, `data:` and `blob:` images, and the manifest's own images, matched by real path. A file the manifest does not list fails the job as `undeclared_asset`. Anything else fails it as `blocked_request`, before printing.

## Confinement (`confine.mjs`, `bin/confine-chromium`)

Playwright launches the wrapper instead of Chromium. The wrapper:
- refuses every flag that turns Chromium's sandbox off;
- clears the environment;
- sets limits (no core files; bounded open files, file size and CPU time);
- runs as a non-root user with no new privileges (as root, it switches to `SOPHIA_RENDER_UID`);
- starts the browser in fresh user, network, PID and mount namespaces.

Killing the wrapper kills the namespace; a cancel does this.

After the entry loads, a self-test reads the process tree from `/proc`. It fails closed unless:
- the browser is non-root, has no new privileges, and is in its own PID, user and network namespaces;
- every renderer has a seccomp filter and its own user and network namespaces;
- no process runs with `--no-sandbox`.

There is no retry with weaker isolation. Linux only; elsewhere the browser tests skip, and CI requires them (`SOPHIA_RENDERER_REQUIRED=1`).

Stated limits:
- Scratch space is a per-job directory owned by the render user, not a private tmpfs. An unprivileged mount needs a root-mapped namespace, and Chromium refuses to run as root.
- Memory is not capped here. The qualified renderer host adds a cgroup limit.
- The GPU process runs without seccomp (its state is recorded in the receipt); the renderers, which parse the report, are sandboxed.
- Fonts are the host's. The renderer image installs licensed EN, IT and ES fonts with glyph fixtures (S5b).
