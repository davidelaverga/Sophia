// The confined HTML-to-PDF render kernel (SMC-M03 S5a): verify the source package, launch Chromium confined with
// its sandbox asserted, print, and return a structured receipt. SDD-01: the capture kernel, screenshots and measures
// of a designed page in the same confinement.
export {
  asCaptureJob,
  CAPTURE_KERNEL_FILES,
  CAPTURE_LIMITS,
  CAPTURE_RECEIPT_SCHEMA,
  CAPTURE_TARGETS,
  CaptureFailure,
  captureHtml,
  captureSha256,
} from './capture-html.mjs'
export { ConfinementError, chromiumPath, judgeSandbox, launchConfined, processTree, renderUserOf } from './confine.mjs'
export { pdfFacts } from './pdf-facts.mjs'
export {
  JUDGE_PACKAGES,
  KERNEL_FILES,
  OUTPUT_NAME,
  PRINT_WIDTH_PX,
  RECEIPT_SCHEMA,
  RenderFailure,
  renderHtmlToPdf,
  rendererSha256,
} from './render-html.mjs'
export {
  ASSET_EXTENSIONS,
  ManifestError,
  manifestHash,
  sha256Hex,
  sourceUnchanged,
  verifySource,
} from './source-manifest.mjs'
export { ApiError, FORMATS, runOnce, supervise } from './supervisor.mjs'
