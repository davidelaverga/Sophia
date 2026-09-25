# Renderer extraction unit

The selected route is static HTML → Chromium PDF, and per-slide HTML → PNG → image-based PPTX. Editable HTML/source is retained; the PPTX output does not contain independently editable native text/shapes. This is the measured source capability, not a downgrade hidden behind “editable deck.”

Use `extraction-manifest.json` and `scripts/extract_renderers.py` with a local clone containing the pinned source commit. The helper reads the exact committed blobs irrespective of the working checkout, never edits the clone, refuses an existing destination and copies only the three kernels and license into new staging. It does not copy fonts, install dependencies or execute renderers.

```sh
python scripts/extract_renderers.py --repo /absolute/path/to/Sophia-Agent --out /absolute/path/to/new-renderer-staging
```

The extraction has not been run in this container because the required repository clone is not mounted. Source inspection established the blob identities; schema/Python checks do not prove staging or rendering occurred.

`dependency-closure.json` records actual direct imports and the old package versions. Build the chosen browser image and retain its digest in S1-13B; no fictional image digest is provided here. Remove legacy ambient/virtual path assumptions and `--no-sandbox` before deployment. A confined-browser startup failure remains a failure, not an excuse to lower isolation.

`render-contract.schema.json` and `examples.json` specify fixed job inputs and outcome receipts. Validate relative paths, realpath containment, hashes, unique slide IDs and required checks in code as well as JSON Schema. The examples use invented identities and hashes solely to exercise shape validation.

The required adaptations and live checks are in [architecture 14](../architecture/14_RENDERER_EXTRACTION.md). Runtime checks must include missing visual, denied external request, path escape, failed CDP measurement, cancel during render, retained notes/language, exact source identity and prior-stable preservation.
