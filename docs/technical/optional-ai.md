# Optional AI in Git Desktop

Git Desktop defaults to a Git client with no enabled AI features in production,
beta, development or test builds. GitHub repository hosting support is unchanged.
GitHub account capabilities, preview flags and saved preferences cannot turn AI
on in an AI-disabled binary.

## Build switches

Every switch defaults to false. Only the exact string `true` enables a switch.
Set these in the build environment before compilation and packaging; changing
the environment of an already-built app does not enable features.

| Environment variable | Purpose |
| --- | --- |
| `DESKTOP_ENABLE_AI` | Master prerequisite for every AI capability |
| `DESKTOP_ENABLE_COPILOT` | Explicit optional Copilot SDK/runtime integration |
| `DESKTOP_AI_COMMIT_MESSAGES` | Generate commit messages |
| `DESKTOP_AI_ASSISTED_COMMITS` | Split selected changes into AI-assisted commits |
| `DESKTOP_AI_CONFLICT_RESOLUTION` | Generate conflict resolutions |
| `DESKTOP_AI_APP_HANDOFF` | Open a repository in the Copilot app |
| `DESKTOP_AI_PROVIDER_SETTINGS` | Local provider/model/credential management |
| `DESKTOP_AI_ACCOUNT_INFO` | Copilot settings, model discovery for settings, quotas and account information |

All existing inference features and app handoff also require the Copilot switch.
Existing upstream eligibility restrictions still apply when explicitly enabled.
The assisted workflow shares ordinary commit-generation account eligibility, so
its legacy opt-in build also needs `DESKTOP_AI_COMMIT_MESSAGES=true`.

The default webpack configuration replaces the Copilot SDK implementation with a
rejecting stub. Packaging omits the native runtime and removes a stale `copilot`
directory from the build output when switching from an enabled build. The SDK
remains a development dependency of the source tree for optional builds and
types; this is not an uninstall or removal of upstream source code.

## Independent provider settings

To build only local provider settings, set `DESKTOP_ENABLE_AI=true` and
`DESKTOP_AI_PROVIDER_SETTINGS=true`. Leave every other switch unset. Settings
then offers an AI page without requiring a GitHub account, Copilot subscription,
Copilot SDK implementation or native runtime.

Provider configuration, validation and credential storage live in
`app/src/lib/ai/providers.ts`. Reasoning preferences also have no SDK dependency.
The existing local-storage and OS-keychain identifiers are retained so existing
providers and secrets survive. Disabling AI does not delete them. Models are
entered manually; opening or saving settings does not contact an inference
provider. The provider editor remains shared with the optional legacy UI.

This implements independent configuration, not a new inference engine. Enabling
the settings page does not enable commit generation, conflict resolution or
Codex execution. A future direct adapter must explicitly select its provider,
use that provider's credentials, retain existing result validation and avoid
GitHub account checks or silent provider fallback.

An unavailable/deleted custom provider or malformed custom selection is retained
as unavailable and fails on use. It must not silently become a Copilot request.

## Upstream maintenance

Follow the Git-first policy in the root `AGENTS.md`. New AI functionality must
have its own default-off build capability under the master gate, including
background work and backend entry points. Upstream integration review must check
new entry points and dependencies, not merely whether existing flags survived.

Regression coverage includes the default policy, credential-free rejection,
independent provider UI, missing-provider routing, webpack SDK exclusion and
stale-runtime removal. AI-specific upstream tests deliberately use an enabled
test fixture; that fixture does not define product build defaults.

This change does not alter general application telemetry or GitHub hosting
authentication. Those are separate from the six AI features.
