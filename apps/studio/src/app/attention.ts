// The attention flag (docs/plans/project-updates.md, the narrow activation gap): what needs the person on Home (A15)
// and what changed in a project since they last looked (A34's Updates), both served, show without the vision flag only
// when the build sets VITE_SOPHIA_ATTENTION=1. Nothing else of the vision flag comes with it: Updates' meetings and
// their recaps stay its own. import.meta.env exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const ATTENTION = env?.VITE_SOPHIA_ATTENTION === '1'
