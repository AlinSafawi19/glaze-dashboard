/**
 * One window of a list, for every list screen in the dashboard.
 *
 * Paging happens in the database — `skip`/`take` on the query — so a page is
 * one page's worth of rows and nothing more. Search and filters go into the
 * same query's `where`, which is what makes them search the whole table rather
 * than whatever happens to be on screen. That is the whole point of doing it
 * here instead of filtering an array after the fact.
 *
 * Two ways to move through it, because the two layouts want different things:
 *
 *   `page=3`  numbered pages, which is what the desktop pager sets
 *   `show=75` the first 75 rows, which is what "Load more" sets on a phone
 *
 * They are separate parameters rather than one because the choice is made by a
 * CSS breakpoint, which the server cannot see. Whichever control the reader
 * touches sets its own parameter and clears the other, so the URL always says
 * plainly which mode it is in.
 */

export const PAGE_SIZE = 25;

/** Stops a hand-edited `show=999999` from asking for the whole table. */
const MAX_ROWS = PAGE_SIZE * 40;

export interface ListWindow {
  skip: number;
  take: number;
  /** 1-based, and always 1 while loading more. */
  page: number;
  /** True when the window is "the first N", not "the Nth page of". */
  cumulative: boolean;
}

export interface PageParams {
  page?: string;
  show?: string;
}

export function readWindow(params: PageParams): ListWindow {
  const show = Number.parseInt(params.show ?? "", 10);
  if (Number.isFinite(show) && show > PAGE_SIZE) {
    // Rounded up to a whole batch so the count cannot be nudged to an
    // arbitrary value by hand.
    const take = Math.min(Math.ceil(show / PAGE_SIZE) * PAGE_SIZE, MAX_ROWS);
    return { skip: 0, take, page: 1, cumulative: true };
  }

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  return { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, page, cumulative: false };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
