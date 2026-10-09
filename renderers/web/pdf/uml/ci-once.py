"""CI-only idle adapter; the original fixture verdict and all guards stay active."""

import json, os, pathlib, runpy, signal

if os.environ.get("RENDER_SERVICE_ID"):
    raise RuntimeError("CI idle adapter must not run on Render")


def finished():
    receipt = json.loads(pathlib.Path("/tmp/uml-qualification-started.json").read_text())
    if receipt.get("event") != "UML_QA_EXIT":
        raise RuntimeError("fixture has not settled")
    if receipt.get("qualification") is not False:
        raise RuntimeError("fixture must not claim qualification")
    raise SystemExit(receipt["status"])


# Only the post-fixture idle changes in CI. The driver retains its ownership,
# source guards, wall/output caps, latch, cleanup and required suite verdict.
signal.pause = finished
runpy.run_path("/opt/uml/host-qa.py", run_name="__main__")
