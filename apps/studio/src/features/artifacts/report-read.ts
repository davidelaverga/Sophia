// A report's reads and this person's own refusal of them (R-TASKS-REPORT-NOTFOUND, C1 report reader): the versions and
// cited-sources reads are stamped when set out; a refusal of one (401, 403, or the API's not_found, a 422 that keeps an
// inaccessible report indistinguishable from an unknown one) is kept as it settles, in the account's query cache that
// ran the read, for that report; so is the newest allowed read. While the refusal is newer than every allowed read,
// nothing read before it shows: body, head, sources, history, counts, links, Download and show all go with the versions
// read. A read set out since the refusal and allowed shows the report again; a later ordinary failure changes nothing.
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'

let order = 0
/** This page's order of report reads and refusals: each call is later than every call before it. Never the clock. */
export const reportOrder = (): number => ++order

/** This person's own definitive refusal of a report read: 401, 403, or this contract's not_found (a 422). */
export const ownReportRefusal = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.status === 401 || error.status === 403 || (error.status === 422 && error.code === 'not_found'))

/** Where the account's cache keeps the report's last own refusal and its newest allowed read, in `reportOrder`. */
export const reportFenceKey = (artifactId: string) => ['report-fence', artifactId]

export interface ReportFence {
  refusedAt: number
  allowedFrom: number
}

const NONE: ReportFence = { refusedAt: 0, allowedFrom: 0 }

function keep(client: QueryClient, artifactId: string, next: (was: ReportFence) => ReportFence): void {
  client.setQueryDefaults(reportFenceKey(artifactId), { gcTime: Infinity, staleTime: Infinity })
  client.setQueryData<ReportFence>(reportFenceKey(artifactId), (was) => next(was ?? NONE))
}

/**
 * A report read's query function: stamped when set out; allowed, it is the newest allowed read if it is; refused by
 * this person's own refusal, the refusal is kept, later than every read set out before it. Kept in the query's own
 * client (its account), before its result reaches anything that renders it.
 */
export const reportRead =
  <T>(artifactId: string, read: () => Promise<T>) =>
  async ({ client }: { client: QueryClient }): Promise<T> => {
    const readFrom = reportOrder()
    try {
      const value = await read()
      keep(client, artifactId, (was) => ({ ...was, allowedFrom: Math.max(was.allowedFrom, readFrom) }))
      return value
    } catch (error) {
      if (ownReportRefusal(error)) keep(client, artifactId, (was) => ({ ...was, refusedAt: reportOrder() }))
      throw error
    }
  }

/** Whether the report is fenced: refused since its newest allowed read. */
export const fenced = (fence: ReportFence): boolean => fence.refusedAt > fence.allowedFrom

/** The report's fence as this account's cache keeps it; never fenced before any refusal. Only read here. */
export function useReportFence(artifactId: string): boolean {
  return fenced(
    useQuery({
      queryKey: reportFenceKey(artifactId),
      queryFn: () => NONE,
      initialData: NONE,
      enabled: false,
      staleTime: Infinity,
      gcTime: Infinity,
    }).data,
  )
}
