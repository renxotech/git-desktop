import { appendFile } from 'fs'

/** Whether the user explicitly enabled deprecation tracing for this launch. */
export function isDeprecationTracingEnabled(
  value: string | undefined
): boolean {
  return value?.trim().toLowerCase() === 'true'
}

const tracePath = process.env.DESKTOP_DEPRECATION_TRACE_FILE?.trim()
if (
  isDeprecationTracingEnabled(process.env.DESKTOP_TRACE_DEPRECATIONS) &&
  tracePath
) {
  // Install before the application's other imports in both process entry points.
  // Keep Node's warning output enabled and preserve the original parser behavior.
  const reportTraceError = (error: unknown) => {
    try {
      console.error('Unable to write deprecation trace', error)
    } catch {
      // A closed console must not turn optional tracing into a crash.
    }
  }
  const write = (event: object) => {
    try {
      appendFile(
        tracePath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          pid: process.pid,
          process: process.type ?? 'node',
          ...event,
        }) + '\n',
        error => {
          if (error) {
            reportTraceError(error)
          }
        }
      )
    } catch (error) {
      reportTraceError(error)
    }
  }

  write({ event: 'trace-started' })
  process.on('warning', warning => {
    if ('code' in warning && warning.code === 'DEP0169') {
      write({ event: 'warning', code: warning.code, stack: warning.stack })
    }
  })
}
