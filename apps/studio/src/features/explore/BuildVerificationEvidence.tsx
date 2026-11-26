import type { VerificationChecks, VerificationKind, VerificationReview } from '../../api/explore-build-handoff.ts'

export const verificationKindLabel: Record<VerificationKind, string> = {
  source_review: 'Source review',
  deployed_app: 'Deployed app check',
}

export function VerificationTarget({ target }: { target: VerificationReview['target'] }) {
  return (
    <dl className="build-verification-target">
      <div>
        <dt>Repository</dt>
        <dd>
          {target.repository} · {target.repositoryId}
        </dd>
      </div>
      <div>
        <dt>Pull request</dt>
        <dd>#{target.pullRequestNumber}</dd>
      </div>
      <div>
        <dt>Candidate commit</dt>
        <dd>
          <code>{target.candidateSha}</code>
        </dd>
      </div>
      <div>
        <dt>Merge commit</dt>
        <dd>
          <code>{target.mergeSha}</code>
        </dd>
      </div>
      <div>
        <dt>Deployment reference</dt>
        <dd>
          <code>{target.deploymentReference}</code>
        </dd>
      </div>
      <div>
        <dt>Deployed commit</dt>
        <dd>
          <code>{target.deployedSha}</code>
        </dd>
      </div>
    </dl>
  )
}

const checkLabel: Record<VerificationChecks[keyof VerificationChecks], string> = {
  pending: 'Pending',
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  unknown: 'Unknown',
  authority_withdrawn: 'Reviewer authority withdrawn',
}

export function CurrentVerificationChecks({ checks }: { checks: VerificationChecks }) {
  return (
    <dl className="build-verification-checks">
      <div>
        <dt>{verificationKindLabel.source_review}</dt>
        <dd>{checkLabel[checks.sourceReview]}</dd>
      </div>
      <div>
        <dt>{verificationKindLabel.deployed_app}</dt>
        <dd>{checkLabel[checks.deployedApp]}</dd>
      </div>
    </dl>
  )
}
