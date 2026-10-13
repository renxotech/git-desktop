/** Expand a selection using the displayed, unfiltered history order.
 * Never treat adjacent search matches as adjacent commits.
 */
export function getCommitRangeSelection(
  history: ReadonlyArray<string>,
  selected: ReadonlyArray<string>,
  isSearch: boolean
): ReadonlyArray<string> | null {
  if (isSearch || selected.length < 2) {
    return null
  }

  const indexes = selected.map(sha => history.indexOf(sha))
  if (indexes.some(index => index < 0)) {
    return null
  }

  return history.slice(Math.min(...indexes), Math.max(...indexes) + 1)
}
