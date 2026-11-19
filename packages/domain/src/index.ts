// @sophia/domain — accepted goals, authority, versions and transitions.
// Depends on @sophia/contracts only; never on frameworks, providers, dsh or Omnigent.
export * from './errors.ts'
export * from './allocation-selection.ts'
// INC04-R07 C4/C5 (accepted pure module, unchanged): one namespace, so its names (Window, Unit…) stay its own.
export * as capacityExposure from './capacity-exposure.ts'
