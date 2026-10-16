// CON candidate/Q13 tests retain the sealed pre-promotion migration baseline, including0053.
// Only tests import this helper. Full migrated-runtime tests use createTestDatabase() directly.
// Every sealed input is verified before database creation; a migration edit cannot silently change this baseline.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'

const BASELINE = [
  ['0001_core.sql', '1595ef42f05d27633010686642f0f46edfc851726eb8aeb6f85977957e9f445e'],
  ['0002_roles_rls.sql', '6acdd303f6cc68a6745599a33d8003a8d5163d761961a158e631a13e9b0b3f04'],
  ['0003_atomic_commands.sql', 'ffc988ae25c166a87cd33d50aea0df19f6b27146e3e51b52119beea21ee90ae0'],
  ['0004_queue_ownership.sql', 'bcb37bc8fc42d5e4f19e1d7abf46bbbe48072fa83ddc5c4825df581cc3f05448'],
  ['0005_event_notify.sql', '41e0b57be4d00e046e25383edd2593cf7d376567312f043c3069032bb42d937a'],
  ['0006_idempotent_project_creation.sql', 'fe9509f3cd4177706ea9b86dd570ebedcde940259db7039b7954f8cda94e275e'],
  ['0007_dispatch_fencing.sql', 'f9fa46d9f882187fc9e93d3573c0990b2055f252fe95d89af90bf18119c81d0d'],
  ['0008_dispatch_result_idempotent.sql', 'd87655c7ed4006edee134ccd09e41c5f1936fe394e56b1b1c57005bf7a3dd4d8'],
  ['0009_project_room.sql', '2fb71a30541ac3a1a691a738e7b8b56dae88c0078c25d7bf94189fbc7b1617f1'],
  ['0010_room_access.sql', '6f29ef7ab098147e65a91b25ec1771f0c05b19ea92de04d8501f5c28873df757'],
  ['0011_lobby_decline_block.sql', 'b2d7cfe8aa9f4e98c7c5cab1cec44768a074e9a17aeb6e1ef6d956b9d1830229'],
  ['0012_runtime_service.sql', '0b4c973d28273ff2567f88bf95b5a513299adb3b2973e3ffa0d33dab8578a60f'],
  ['0013_room_exchange.sql', '44ac2a681e4179a2a7649d632f0382fff32b412a9d113d3d9b1db62521bad221'],
  ['0014_room_removals.sql', '55948614ffb026fa040139a140518e8ee378055b28346ad953fc09354e65cfe2'],
  ['0015_guest_joining.sql', '07eff40148b861705e3e6bf4e44975ff40934af5ec2321a22b0d5b007800712c'],
  ['0016_review_fences.sql', '3c83a62468223462214500a978bbd7870bd5f23723d6e4a8e4c2b96d8f52f34c'],
  ['0017_empty_room.sql', '0d0b929f8648ee26281799b9de3cf4f89a4b109e0733912bdeffd67d83ba2742'],
  ['0018_mission_ledger.sql', 'd6e6598c3a4c4e1a9771c3ac8169fad5cca55d33c1f5a6cb119859e9a87aa181'],
  ['0019_default_mission_capture.sql', '54b1e7f03c4fcf6c47abead77c2aec843dc1a3ee000ca4ee8ef23f42e6a912e9'],
  ['0020_typed_mission_turns.sql', '61641a52fe9c5b66f2ea61d09eb8e2a5d995a2c0396c0d2caba3baf14e873a3e'],
  ['0021_personal_space.sql', '25285fceaa33667d202ebe2d3e1ebc51f6646bfac007a1608a05f09122373f3a'],
  ['0022_research_readers.sql', '0a1955ff7b787dad4939b4ee70e620d2d1146c8b3b8188245a3388df07e0cb9c'],
  ['0023_usage_cache.sql', 'f4b255d3361ad34250aae7803f364850c6412b557503e9a1715f5c12f3119d48'],
  ['0024_research_allowance.sql', '713e7c9ce2403292bf482e04c34a6536108d509d0ac0d3a6f6a052b6ae7e3ba1'],
  ['0025_research_admission.sql', '69cc606fa279d383928877894f3f56c457705d0384d5f7d243cf0f86cab704e9'],
  ['0026_research_submission.sql', '926f7443ba662a95b261f73caf3ce9ab3238933ea6728fd50b0a907cd0e61107'],
  ['0027_report_facts.sql', '9ed7a752305a6608bbc53190866d44bee569ef0d0cf0deb7db7b8fbe6ff773d9'],
  ['0028_research_revocation.sql', '45bcc29055bf501c6484b5f8023c3b9c2b30c7f90f55376d1f2417c4e9085640'],
  ['0029_research_spend_bounds.sql', '836938a1107fa4308fe17843aedc6600bd652ba9d78d127ff04a644c5cd597bb'],
  ['0030_render_jobs.sql', '15eccee230e64ad896157cf136f7ed0d9a8ca2aac5056f67ed9292880fcb70e9'],
  ['0031_research_pdf.sql', '115224b10c478c39ae7a731a1af21b0e88c3f363c5ebb0c7b77cc70f94ef0b8f'],
  ['0032_research_rendition.sql', 'b13716def31538044f3c66ae038f439e8521c3b34d878a1a67144f6bb3df56f7'],
  ['0033_research_withdrawal_closure.sql', '417ba23d666f8988e58b15264f491b70befb5bb2ea8166ebda375ff9d06ca271'],
  ['0034_render_judgement.sql', '61d6828bff1405239b8779955b5837bacdd38673bc827ea175c826c984e2ceaf'],
  ['0035_announcement_delivery.sql', '2e71cc64a103e1cb51b8a1d16ae339aa47eb16f68e886a13ba0a2b9dbd6ae820'],
  ['0036_section_facts.sql', '5e010674d6ae3811672c8165b27a7f9d1b2e421864fafc53653a3e8ff913332b'],
  ['0037_amendment_preservation.sql', 'd1f9ed1231ae52578f9ed3fe5d271273319a87b7d3b5005374a09341d37aa527'],
  ['0038_design_records.sql', 'b3b3acd5d215a2124d3a9fdabe416e7fe0a19eb8981e49774ee430673ed45bb8'],
  ['0039_design_runtime.sql', '8b74ce6a1d904ffea7051e95105b7fc6a3d51877d357bb7f26425fe9a2523161'],
  ['0040_design_flow.sql', '0f0c7af6b723d2008dedf69bf9512e3c74b033681b0f890b3ab984b87996f046'],
  ['0041_design_lifecycle.sql', '40799b7ade10cfe061b249a720793a3c30fa265b2ec69c2d5d96db891471a935'],
  ['0042_source_review_coordination.sql', '9e6064b7b78bf55342cd6f23e62ccaaa96a3a28ad8c8b48136af6557c89e408b'],
  ['0043_design_delivery.sql', 'b52dfede00a6fc611d3bc69734e2cb2f7c3e12914df9d0e49f46778d03ccb0b6'],
  ['0044_object_write_once.sql', '643a4a7bb6b03221973606b23e77d816d1fc2cc1e808fd5f1dafdd8cf0610bf6'],
  ['0045_render_requeue_output.sql', '603143a7a1b4e50d68371ac3930aeab1b813f6437cf88c2e7dc88a349a45aac1'],
  ['0063_project_conversations.sql', 'e36843045caf07b34a0aae9470bd4c18ce50a0849a0d10cf52709089a9fdcf35'],
  ['0053_runtime_outbox_reconcile.sql', 'bf403b7eff741a5d2056b484c802cdc4cbe382f23bc00ee5826315beedc4bae7'],
] as const

async function removeStaging(dir: string, database: TestDatabase | undefined): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true })
  } catch (cleanupError: unknown) {
    // A rejected return cannot hand its caller the drop handle. Settle that database before reporting cleanup.
    try {
      await database?.drop()
    } catch (databaseError: unknown) {
      const failure = new AggregateError(
        [cleanupError, databaseError],
        'CON fixture staging and database cleanup failed',
        {
          cause: databaseError,
        },
      )
      throw failure
    }
    throw cleanupError
  }
}

export async function createConversationCandidateDatabase(
  source = new URL('../../../db/migrations/', import.meta.url),
  create: (directory: string) => Promise<TestDatabase> = createTestDatabase,
): Promise<TestDatabase> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'con01-candidate-fixture-'))
  let database: TestDatabase | undefined
  try {
    for (const [name, digest] of BASELINE) {
      const bytes = await fs.readFile(new URL(name, source))
      if (createHash('sha256').update(bytes).digest('hex') !== digest) {
        throw new Error(`CON candidate migration baseline drift: ${name}`)
      }
      await fs.writeFile(join(dir, name), bytes, { flag: 'wx' })
    }
    database = await create(dir)
    return database
  } finally {
    await removeStaging(dir, database)
  }
}
