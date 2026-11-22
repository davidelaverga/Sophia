import type { ExploreFunding } from '../../api/managed-explore.ts'

const billingUrl = 'https://platform.openai.com/settings/organization/billing/overview'
const dollars = new Intl.NumberFormat('en-US')
const reportedAt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
})

function usd(cents: number): string {
  const amount = BigInt(Math.abs(cents))
  const fraction = String(amount % 100n).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}$${dollars.format(amount / 100n)}.${fraction}`
}

function rechargeLabel(enabled: boolean | null | undefined): string {
  if (enabled === true) return 'On'
  if (enabled === false) return 'Off'
  return 'Unavailable'
}

export function OpenBilling() {
  return (
    <a className="explore-billing-link" href={billingUrl} target="_blank" rel="noopener noreferrer">
      Open OpenAI billing <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function ExploreFundingDetails({ funding }: { funding: ExploreFunding }) {
  const snapshot = funding.accountSnapshot
  const balance = snapshot?.balanceCents
  return (
    <section className="explore-funding" aria-label="API billing snapshot">
      <dl className="explore-funding-values">
        <div>
          <dt>Reported account balance</dt>
          <dd>{typeof balance === 'number' ? usd(balance) : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Auto-recharge</dt>
          <dd>{rechargeLabel(snapshot?.autoRechargeEnabled)}</dd>
        </div>
      </dl>
      <p className="explore-funding-note">
        {snapshot ? (
          <span>
            Reported by the account operator ·{' '}
            <time dateTime={snapshot.observedAt}>{reportedAt.format(new Date(snapshot.observedAt))}</time>
          </span>
        ) : (
          <span>No account report available</span>
        )}
        <OpenBilling />
      </p>
    </section>
  )
}
