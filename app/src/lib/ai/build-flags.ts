/** Build-time AI policy. Every capability requires an explicit opt-in. */
export interface IAIBuildFlags {
  readonly copilot: boolean
  readonly commitMessages: boolean
  readonly assistedCommits: boolean
  readonly conflictResolution: boolean
  readonly appHandoff: boolean
  readonly providerSettings: boolean
  readonly accountInfo: boolean
}

/** Resolve once while building; runtime environment and account flags cannot opt in. */
export function getAIBuildFlags(
  environment: Readonly<Record<string, string | undefined>>
): IAIBuildFlags {
  const enabled = environment.DESKTOP_ENABLE_AI === 'true'
  const copilot = enabled && environment.DESKTOP_ENABLE_COPILOT === 'true'
  return {
    copilot,
    commitMessages:
      copilot && environment.DESKTOP_AI_COMMIT_MESSAGES === 'true',
    assistedCommits:
      copilot && environment.DESKTOP_AI_ASSISTED_COMMITS === 'true',
    conflictResolution:
      copilot && environment.DESKTOP_AI_CONFLICT_RESOLUTION === 'true',
    appHandoff: copilot && environment.DESKTOP_AI_APP_HANDOFF === 'true',
    providerSettings:
      enabled && environment.DESKTOP_AI_PROVIDER_SETTINGS === 'true',
    accountInfo: copilot && environment.DESKTOP_AI_ACCOUNT_INFO === 'true',
  }
}
