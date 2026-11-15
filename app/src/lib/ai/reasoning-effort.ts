/** Provider-neutral reasoning preferences; no SDK or account dependency. */
export const ReasoningEffortOrder = ['low', 'medium', 'high', 'xhigh'] as const

export type ReasoningEffort = typeof ReasoningEffortOrder[number]

/** Format a configured reasoning effort for display. */
export function formatReasoningEffort(effort: ReasoningEffort): string {
  return effort === 'xhigh'
    ? 'Extra high'
    : effort.charAt(0).toUpperCase() + effort.slice(1)
}
