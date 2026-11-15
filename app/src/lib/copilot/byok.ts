// Compatibility boundary for the optional legacy Copilot integration.
export * from '../ai/providers'

/**
 * Composite model identifier persisted in Copilot model selections. Wraps
 * either a built-in Copilot model or a BYOK provider+model pair so that
 * a single feature can pick from any source.
 */
export type CopilotModelKey =
  | { readonly kind: 'copilot'; readonly modelId: string }
  | {
      readonly kind: 'byok'
      readonly providerId: string
      readonly modelId: string
    }

const ByokKeyPrefix = 'byok:'
const CopilotKeyPrefix = 'copilot:'

/**
 * Encodes a {@link CopilotModelKey} to the string form that is persisted in
 * Copilot model selections.
 */
export function encodeModelKey(key: CopilotModelKey): string {
  if (key.kind === 'byok') {
    return `${ByokKeyPrefix}${key.providerId}:${key.modelId}`
  }
  return `${CopilotKeyPrefix}${key.modelId}`
}

/**
 * Parses a persisted model selection. Bare strings (without a prefix) are
 * treated as legacy Copilot model IDs so existing user settings continue
 * to work without an explicit migration step.
 */
export function parseModelKey(value: string): CopilotModelKey {
  if (value.startsWith(ByokKeyPrefix)) {
    const rest = value.slice(ByokKeyPrefix.length)
    const sep = rest.indexOf(':')
    if (sep > 0 && sep < rest.length - 1) {
      return {
        kind: 'byok',
        providerId: rest.slice(0, sep),
        modelId: rest.slice(sep + 1),
      }
    }
    // Preserve BYOK intent even when corrupt; resolution must fail closed.
    return { kind: 'byok', providerId: '', modelId: '' }
  }

  if (value.startsWith(CopilotKeyPrefix)) {
    return { kind: 'copilot', modelId: value.slice(CopilotKeyPrefix.length) }
  }

  return { kind: 'copilot', modelId: value }
}
