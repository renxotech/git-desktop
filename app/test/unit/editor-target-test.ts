import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  launchExternalEditor,
  launchCustomExternalEditor,
} from '../../src/lib/editors/launch'

describe('editor target enforcement', () => {
  it('rejects folder launches for files-only editors before spawning an application', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'desktop-editor-target-'))
    try {
      const editor = {
        editor: 'Windows Notepad',
        path: join(dir, 'missing.exe'),
      }
      await assert.rejects(
        launchExternalEditor(dir, editor),
        /configured to open files only/
      )
      await assert.rejects(
        launchCustomExternalEditor(
          dir,
          { path: editor.path, arguments: '%TARGET_PATH%' },
          'files'
        ),
        /configured to open files only/
      )
      // A configured override accepts the folder and proceeds to executable validation.
      await assert.rejects(
        launchExternalEditor(dir, editor, 'files-and-folders'),
        /Could not find executable/
      )
      const file = join(dir, 'one file.txt')
      await writeFile(file, '')
      await assert.rejects(
        launchExternalEditor(file, editor),
        /Could not find executable/
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
