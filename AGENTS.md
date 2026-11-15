# Working on GitHub Desktop

## Git-first product and optional AI

Git Desktop is an independent Git client. Preserve useful GitHub repository
integrations without making Git operations depend on GitHub accounts or AI.

All AI capabilities are disabled by default in every build channel. Use the
central policy in `app/src/lib/ai/build-flags.ts`; only the exact build-time
value `true` opts in. Account flags, preview mode, saved settings and upstream
changes must never bypass it. Every future AI feature requires its own
default-off capability under the master AI gate, including UI, dispatch,
background requests, credentials and packaged runtime dependencies. Review
upstream merges for new AI entry points and add disabled-build regression tests.

Provider/model configuration must remain independent of GitHub sign-in and the
Copilot SDK. Never silently replace a selected provider with Copilot or another
provider. Keep optional inference adapters explicit; configuring a provider does
not authorize sending repository content. Default packages omit the Copilot
SDK implementation and native runtime. Preserve existing provider credentials
when disabling features. See `docs/technical/optional-ai.md`.

## Authorized upstream integration

Before editing or committing, honor the cooperative sync lock described in
[the upstream workflow](docs/upstream-sync.md). After a Codex-requested commit
leaves this checkout clean, immediately execute that workflow. Do not trigger
it for integration-created commits. Dirty/busy checkouts skip. Follow its
isolated merge, validation, build and promotion safeguards; never push or launch.

Follow the repository's [contribution guidance](.github/CONTRIBUTING.md)
and [development instructions](.github/copilot-instructions.md).
These instructions supplement those guides; they do not change contribution
eligibility or merge requirements.

## Preparing team-authored pull requests

Before preparing or updating a team-authored PR, use the
[prepare-team-pr skill](.agents/skills/prepare-team-pr/SKILL.md).
Follow its authorization checks, evidence collection, review assessment,
and ownership requirements.

Read the current [PR template](.github/pull_request_template.md).
Preserve its sections and generate or update the skill's
`Team-authored review` section in the PR body, not in the template.
