// A session's model, as people say it, with its family's colour (models.ts); its exact id on hover.
import { Chip } from '@sophia/ui'
import { modelLook } from './models.ts'

export function ModelChip({ model }: { model: string }) {
  const { label, family } = modelLook(model)
  return (
    <Chip kind="data" className="model-chip" data-family={family} title={model}>
      <span className="model-dot" aria-hidden />
      {label}
    </Chip>
  )
}
