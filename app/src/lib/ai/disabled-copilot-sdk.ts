/** Build replacement: default packages contain no Copilot SDK implementation. */
// Preserve the SDK's constructible export while rejecting every construction.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CopilotClient {
  public constructor() {
    throw new Error('Copilot is disabled in this build')
  }
}

/** Reject stale callers before any runtime or credentials can be used. */
export const RuntimeConnection = {
  forStdio: () => {
    throw new Error('Copilot is disabled in this build')
  },
}
