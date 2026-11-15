import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAIBuildFlags } from '../../src/lib/ai/build-flags'
import {
  enableAIProviderSettings,
  enableCommitMessageGeneration,
  enableCopilotAccountInfo,
  enableCopilotAppHandoff,
  enableCopilotAssistedCommit,
  enableCopilotConflictResolution,
  enableCopilotSdkCommitMessageGeneration,
} from '../../src/lib/feature-flag'
import { makeCopilotAccount } from '../helpers/copilot-assisted-commit'
import { AppStore } from '../../src/lib/stores/app-store'
import { requireAIProviderModel } from '../../src/lib/ai/providers'
import { CopilotStore } from '../../src/lib/stores/copilot-store'
import { createTestAccountsStore } from '../helpers/app-store-test-harness'
import { API } from '../../src/lib/api'

const optIns = {
  DESKTOP_ENABLE_AI: 'true',
  DESKTOP_ENABLE_COPILOT: 'true',
  DESKTOP_AI_COMMIT_MESSAGES: 'true',
  DESKTOP_AI_ASSISTED_COMMITS: 'true',
  DESKTOP_AI_CONFLICT_RESOLUTION: 'true',
  DESKTOP_AI_APP_HANDOFF: 'true',
  DESKTOP_AI_PROVIDER_SETTINGS: 'true',
  DESKTOP_AI_ACCOUNT_INFO: 'true',
}

describe('AI build policy', () => {
  it('defaults every capability off, including development and preview builds', () => {
    for (const NODE_ENV of ['production', 'development', 'test']) {
      assert.ok(
        Object.values(
          getAIBuildFlags({
            NODE_ENV,
            RELEASE_CHANNEL: 'beta',
            GITHUB_DESKTOP_PREVIEW_FEATURES: '1',
          })
        ).every(value => value === false)
      )
    }
    for (const value of [undefined, '', 'false', '1', 'TRUE']) {
      assert.ok(
        Object.values(
          getAIBuildFlags({ ...optIns, DESKTOP_ENABLE_AI: value })
        ).every(flag => flag === false)
      )
    }
    assert.ok(Object.values(getAIBuildFlags(optIns)).every(Boolean))
  })

  it('requires each feature opt-in and supports providers without Copilot', () => {
    assert.equal(
      getAIBuildFlags({ ...optIns, DESKTOP_AI_COMMIT_MESSAGES: 'false' })
        .commitMessages,
      false
    )
    const flags = getAIBuildFlags({
      DESKTOP_ENABLE_AI: 'true',
      DESKTOP_AI_PROVIDER_SETTINGS: 'true',
    })
    assert.deepEqual(flags, {
      copilot: false,
      commitMessages: false,
      assistedCommits: false,
      conflictResolution: false,
      appHandoff: false,
      providerSettings: true,
      accountInfo: false,
    })
  })

  it('blocks entry points despite an eligible account and runtime preview settings', async t => {
    const old = __AI_BUILD_FLAGS__
    Object.assign(globalThis, { __AI_BUILD_FLAGS__: getAIBuildFlags({}) })
    t.after(() => Object.assign(globalThis, { __AI_BUILD_FLAGS__: old }))
    const account = makeCopilotAccount()
    assert.equal(enableCommitMessageGeneration(account), false)
    assert.equal(enableCopilotSdkCommitMessageGeneration(account), false)
    for (const enabled of [
      enableAIProviderSettings,
      enableCopilotAccountInfo,
      enableCopilotAppHandoff,
      enableCopilotAssistedCommit,
      enableCopilotConflictResolution,
    ]) {
      assert.equal(enabled(), false)
    }
    const accounts = createTestAccountsStore()
    const credentials = t.mock.method(accounts, 'createTokenGetter')
    const store = new CopilotStore(accounts)
    await assert.rejects(
      store.generateCommitMessage(account, 'diff', '/unused'),
      /disabled/
    )
    await assert.rejects(
      store.resolveConflicts(
        account,
        {
          ourLabel: 'a',
          theirLabel: 'b',
          files: [],
          pullRequests: [],
          ourCommits: [],
          theirCommits: [],
        },
        '/unused'
      ),
      /disabled/
    )
    await assert.rejects(
      API.fromAccount(account).getDiffChangesCommitMessage('diff'),
      /disabled/
    )
    assert.equal(await store.isAssistedCommitRuntimeAvailable(), false)
    assert.equal(await store.listModels(account), null)
    assert.equal(await store.getQuotaSnapshots(account), null)
    assert.equal(credentials.mock.callCount(), 0)
  })

  it('keeps unavailable custom selections and fails before choosing another provider', () => {
    const selection = 'byok:missing-provider:custom-model'
    assert.deepEqual(
      AppStore.prototype['scrubCopilotModelSelections']({
        'commit-message-generation': selection,
      }),
      { 'commit-message-generation': selection }
    )
    assert.throws(
      () => requireAIProviderModel([], 'missing-provider', 'custom-model'),
      /unavailable/
    )
    assert.throws(() => requireAIProviderModel([], '', ''), /unavailable/)
  })
})
