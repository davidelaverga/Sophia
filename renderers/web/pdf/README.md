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
- the renderer's identity:
  - one hash (`rendererSha256`) over the kernel's files, `KERNEL_FILES`: every module it runs, transitively, and the wrapper the browser starts through (M03-RF-0018);
  - the same hash also covers the packages that judge with it (`JUDGE_PACKAGES`): each one's version and the bytes of the files a judgement loads from it (pdf.js, which reads the printed pages back, worker code included, and the `@napi-rs/canvas` files pdf.js loads in Node), or "absent". Tests hold these lists to the import closure and to what a judgement actually loads;
  - the donor, playwright-core and the browser version, reported on their own;
  - inputs from the host are not in it (the fonts, the Node runtime and the browser binary beyond its version). They are part of a host's qualification evidence (OP-C, SMC-M03.md §29), not of a receipt;
- the source manifest's hash;
- the sandbox verdict;
- the PDF's SHA-256, size, header, trailer, page count and embedded images;
- the overflow measurement, `measured` or `unavailable` (never a zero it did not measure), with the elements that reach past the printable width;
- the visible SVG and image counts;
- every undeclared asset or blocked request;
- checks that are `passed`, `failed` or `unknown`; an unknown check never passes.

The printed pages are read back with pdf.js (`pdf-text.mjs`, the version Studio pins, in-process, with fonts, WebAssembly and XFA off). Each page's body words are counted with the footer margin stripped, along with its raster images. A page with at most one word and no image fails `blank_pages`. A page between the first and the last with fewer than 80 words and no image fails `short_pages`; these are the donor's rules. A PDF that cannot be read leaves both `unknown`.

The kernel reports; the service judges. A PDF that exists is `succeeded` whatever its checks say. When the receipt is settled, the service (0034) treats any failed check except the advisory `short_pages` as a failed render, and names a short page on the rendition. The supervisor turns this receipt into `sophia.render-result.v1`.

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

## Capture kernel (`capture-html.mjs`, `capture-page.mjs`), SDD-01

`capture-html.mjs --job job.json`, or `captureHtml(job, { signal })`. One designed HTML page (html-design-v1: self-contained, no assets) is loaded in the same confined browser as the PDF kernel, with page JavaScript off, at each admitted target: `w390-light` (390×844) and `w1280-light` (1280×800), screen media, light scheme, reduced motion. A job names `sourceRoot`, `entry` (path and SHA-256), `language`, `targets`, `outputDir`, and optionally `sections` (the ones to capture; every one by default).

At each target the kernel:
- **measures** the page with `capture-page.mjs`, run through the browser's protocol: the page's size and horizontal overflow (and the outermost elements past the edge), each `[data-section]`'s box, and each `[data-block]`'s box, font size, issues and text contrast. A block's issues are `not_rendered`, `hidden`, `transparent`, `no_visible_text`, `off_page`, `text_cut` (its own overflow hides text), `clipped` (an ancestor that hides overflow cuts it), `scrolls` (inside a scrolling container, not whole on screen), `covered` (something not fixed or sticky is drawn over its first line), `adjoined` (other text, a mark, a label or another block, sits on one of its lines within half an em of it, however the page places it, so a reader takes the two as one: `-` before `10%`) and `low_contrast` (below 4.5, or 3 for large text, WCAG 2). Contrast is painted on a canvas, so any colour syntax resolves; over a gradient it is the worst stop; over an image it is unknown, never passed;
- **captures** with `Page.captureScreenshot` beyond the viewport (the viewport, and so `vh`, never changes): overview tiles of the whole page scaled down (0.5 at 390, 0.375 at 1280, each at most 2400 px tall), readable tiles of each section at full scale (at most 1200 or 900 CSS px tall), and readable tiles of every stretch outside the sections (head, gaps, foot) when every section is asked for.

After the targets, the kernel **sweeps the widths** between and beyond them (`SWEEP`, #117, CX-0039): it reads every media condition of the page's stylesheets, splits the window widths from 320 to 2560 px into the bands in which those conditions hold or fail alike (each breakpoint `v` tested at `v−1`, `v` and `v+1`), and measures, without capturing, both ends of every band, as at a target. Its global check `widths_visible` fails on what any band end hides, cuts, covers, sets beside other text, overflows or shows in low contrast, and on any band end it could not measure: a condition it cannot read (not a screen width in pixels, a container query), a breakpoint past those widths, more than 8 breakpoints, or a sweep past 60 s. The hard gate requires it (0043).

The host probe (`host-probe.mjs`) qualifies this kernel on a host before its runner is registered: it captures a small designed page at both targets, and `capture`, `capture_checks` (an unmeasured contrast is not a failure, as the design gate reads it), `capture_sandbox` and `capture_images` (every PNG on disk with its recorded hash) must pass.

Captures are bounded (72 per job, 8 MiB each, 64 MiB in all, the first 48,000 CSS px of a page). Whatever is left is named in the target's coverage (`captured`, `missing`, `truncated`), never dropped. Any request but the entry document fails the capture, and a failed or cancelled capture keeps no image.

The receipt (`sophia.html-capture-receipt.v1`) names the kernel's identity (`captureSha256`: its files, `CAPTURE_KERNEL_FILES`), Playwright, the browser, the sandbox verdict, the platform fonts the text was drawn with, each target's measures and coverage, every capture (name, target, kind, section, tile, clip, scale, size, SHA-256) and its checks: `source_verified`, `sandbox_active`, `requests_contained`, `source_unchanged`, and per target `layout_overflow`, `blocks_visible`, `contrast` and `captures_complete`.

## Supervisor (`supervisor.mjs`)

The trusted process on the renderer host (S5a part 2). It holds only a render runner capability and talks only to the Sophia API (`/v1/renderer/*`, A11). It never holds a database URL, a storage URL or a storage key. For each job it:
1. claims the job under a lease (`POST /v1/renderer/claim`), naming the formats it renders (`pdf`, `png`). A runner that names none is a PDF runner and is never handed a capture;
2. fetches every file of the source package through the API, each checked against the package's SHA-256 and size, into a fresh job directory;
3. runs the kernel as its own process group. The kernel's environment carries only the render user and the browser's path, never the capability. The supervisor resolves that path itself, because the kernel's home is the job directory;
4. sends heartbeats while the kernel runs. A Hold or a Stop, or a lost lease, kills the kernel, and nothing is uploaded or settled;
5. uploads the PDF once (`PUT …/output`) if the kernel succeeded, then settles with the kernel's receipt (`POST …/settle`). A capture job (SDD-01, `format: png`) runs the capture kernel instead and uploads each PNG its receipt names (`PUT …/captures/{name}`), each checked against the receipt, before it settles;
6. removes the job directory.

Configuration:
- `SOPHIA_API_URL`: https, or localhost for development;
- `SOPHIA_RENDER_RUNNER_TOKEN_FILE`: the capability, registered by the owner by its SHA-256 (`sophia.register_render_runner`);
- `SOPHIA_RENDER_WORK`: the work directory. When the supervisor runs as root it must be searchable by others, so the render user reaches the job directories; a host where it is not takes no job;
- for the kernel: `SOPHIA_RENDER_UID` (when root), and the browser: `SOPHIA_CHROMIUM_PATH`, `PLAYWRIGHT_BROWSERS_PATH`, or Playwright's default cache in `HOME`. A host where the browser is missing takes no job.

On the service side (migration 0030):
- **Queue and claims.** A render job is a research task's child job. The queue skips goals that are not working. A lease runs 5 minutes and is extended by heartbeats. A lost lease is claimed again, at most three times, then the job fails as `renderer_lost`.
- **Output.** The PDF becomes a byte-stored source derived from every file of the package. A succeeded settle must name the package the kernel recomputed and the output recorded for it.
- **Hold and Stop.** A render that ends under a Hold is queued again. One that ends after a Stop, or after its task ended, is stale and never the job's result.
