import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CopilotCommitMessageResponseLimitBytes,
  parseCopilotCommitMessage,
} from '../../src/lib/copilot-commit-message'

describe('parseCopilotCommitMessage', () => {
  it('parses object payloads', () => {
    assert.deepEqual(
      parseCopilotCommitMessage(
        '{"title":"Fix token renewal","description":"Preserve credentials"}'
      ),
      { title: 'Fix token renewal', description: 'Preserve credentials' }
    )
  })

  it('accepts an omitted or empty description', () => {
    for (const payload of [
      { title: 'Fix bug' },
      { title: 'Fix bug', description: '' },
    ]) {
      assert.deepEqual(parseCopilotCommitMessage(JSON.stringify(payload)), {
        title: 'Fix bug',
        description: '',
      })
    }
  })

  it('preserves valid titles and multiline descriptions', () => {
    const expected = {
      title: `  सुधार ${'a'.repeat(200)}  `,
      description: 'First line\r\n\r\nSecond line\nCo-authored-by: Developer',
    }
    assert.deepEqual(
      parseCopilotCommitMessage(JSON.stringify(expected)),
      expected
    )
  })

  it('rejects missing, non-string, and blank titles', () => {
    for (const title of [undefined, null, 42, {}, [], '', ' \t\r\n ']) {
      assert.throws(
        () => parseCopilotCommitMessage(JSON.stringify({ title })),
        /"title" must be a non-empty string/
      )
    }
  })

  it('rejects line separators and NUL in titles even without a description', () => {
    for (const separator of [
      '\r',
      '\n',
      '\r\n',
      '\0',
      '\u0085',
      '\u2028',
      '\u2029',
    ]) {
      for (const title of [
        `Fix${separator}bug`,
        `${separator}Fix bug`,
        `Fix bug${separator}`,
      ]) {
        assert.throws(
          () => parseCopilotCommitMessage(JSON.stringify({ title })),
          /"title" must be a single line without NUL bytes/
        )
      }
    }
  })

  it('rejects non-string descriptions', () => {
    for (const description of [null, 42, {}, [], true]) {
      assert.throws(
        () =>
          parseCopilotCommitMessage(
            JSON.stringify({ title: 'Fix bug', description })
          ),
        /"description" must be a string when provided/
      )
    }
  })

  it('rejects escaped NUL in descriptions after decoding JSON', () => {
    assert.throws(
      () =>
        parseCopilotCommitMessage(
          '{"title":"Fix bug","description":"before\\u0000after"}'
        ),
      /"description" must not contain NUL bytes/
    )
  })

  it('accepts responses at the UTF-8 byte limit and rejects one byte over', () => {
    for (const character of ['a', 'अ', '😀']) {
      const empty = JSON.stringify({ title: 'Fix bug', description: '' })
      const available =
        CopilotCommitMessageResponseLimitBytes -
        Buffer.byteLength(empty, 'utf8')
      const characterBytes = Buffer.byteLength(character, 'utf8')
      const description =
        character.repeat(Math.floor(available / characterBytes)) +
        'a'.repeat(available % characterBytes)
      const content = JSON.stringify({ title: 'Fix bug', description })

      assert.equal(
        Buffer.byteLength(content, 'utf8'),
        CopilotCommitMessageResponseLimitBytes
      )
      assert.deepEqual(parseCopilotCommitMessage(content), {
        title: 'Fix bug',
        description,
      })
      assert.throws(
        () => parseCopilotCommitMessage(`${content} `),
        /Copilot exceeded the commit message response limit/
      )
    }
  })

  it('checks the entire raw response size before parsing JSON', () => {
    assert.throws(
      () =>
        parseCopilotCommitMessage(
          'x'.repeat(CopilotCommitMessageResponseLimitBytes + 1)
        ),
      /Copilot exceeded the commit message response limit/
    )
  })

  it('preserves code fences inside JSON descriptions', () => {
    for (const fence of ['```json', '```sh', '```']) {
      const expected = {
        title: 'Document configuration',
        description: `Example:\n${fence}\n{"enabled":true}\n\`\`\``,
      }
      assert.deepEqual(
        parseCopilotCommitMessage(JSON.stringify(expected)),
        expected
      )
    }
  })

  it('rejects Markdown-wrapped responses without extracting their JSON', () => {
    const content = '{"title":"Document configuration","description":""}'
    for (const fence of ['```json', '```']) {
      assert.throws(
        () => parseCopilotCommitMessage(`${fence}\n${content}\n\`\`\``),
        {
          message:
            'Copilot returned invalid JSON for commit message generation',
        }
      )
    }
  })

  it('rejects arrays, null, and primitives as non-object payloads', () => {
    for (const content of [
      '[]',
      '[{"title":"Not an object"}]',
      'null',
      '"text"',
      '42',
      'true',
    ]) {
      assert.throws(() => parseCopilotCommitMessage(content), {
        message:
          'Copilot returned an invalid commit message payload: expected an object',
      })
    }
  })
})
