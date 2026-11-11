# Working on GitHub Desktop

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
