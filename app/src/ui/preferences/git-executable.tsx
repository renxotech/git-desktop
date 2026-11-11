import * as React from 'react'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { LinkButton } from '../lib/link-button'
import { showOpenDialog } from '../main-process-proxy'
import {
  GitExecutableSelection,
  getGitExecutable,
  discoverInstalledGit,
  validateGitExecutable,
  MinimumGitVersion,
} from '../../lib/git/executable'

interface IProps {
  readonly selection: GitExecutableSelection
  readonly error?: string
  readonly onChange: (selection: GitExecutableSelection) => void
}

export function GitExecutable(props: IProps) {
  const [active, setActive] = React.useState('Checking active Git…')
  const [result, setResult] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    let mounted = true
    getGitExecutable().then(
      git => mounted && setActive(`Active: ${git.path} (Git ${git.version})`),
      error => mounted && setActive(error.message)
    )
    return () => {
      mounted = false
    }
  }, [])
  React.useEffect(() => {
    setResult('')
  }, [props.selection])

  const onModeChanged = React.useCallback(
    (event: React.FormEvent<HTMLSelectElement>) => {
      props.onChange(
        event.currentTarget.value === 'bundled'
          ? { kind: 'bundled' }
          : { kind: 'installed', path: '' }
      )
    },
    [props.onChange]
  )
  const onPathChanged = React.useCallback(
    (path: string) => props.onChange({ kind: 'installed', path }),
    [props.onChange]
  )
  const browse = React.useCallback(async () => {
    const path = await showOpenDialog({
      title: 'Select Git executable',
      properties: ['openFile'],
      filters: __WIN32__
        ? [{ name: 'Git executable', extensions: ['exe'] }]
        : undefined,
    })
    if (path) {
      props.onChange({ kind: 'installed', path })
    }
  }, [props.onChange])
  const discover = React.useCallback(async () => {
    const path = await discoverInstalledGit()
    if (path) {
      props.onChange({ kind: 'installed', path })
    } else {
      setResult('Git was not found on PATH. Browse to the executable.')
    }
  }, [props.onChange])
  const check = React.useCallback(async () => {
    setBusy(true)
    try {
      const git = await validateGitExecutable(props.selection)
      setResult(
        `Compatible: Git ${git.version}. ${
          git.lfsAvailable
            ? 'Git LFS is available.'
            : 'Git LFS is unavailable; install it before using LFS repositories.'
        }`
      )
    } catch (error) {
      setResult(error.message)
    } finally {
      setBusy(false)
    }
  }, [props.selection])
  return (
    <>
      <p className="settings-description">{active}</p>
      <Select
        label="Git executable"
        value={props.selection.kind}
        disabled={busy}
        onChange={onModeChanged}
      >
        <option value="bundled">Bundled Git (fallback)</option>
        <option value="installed">Installed Git</option>
      </Select>
      {props.selection.kind === 'installed' && (
        <>
          <TextBox
            label="Full path to Git executable"
            value={props.selection.path}
            disabled={busy}
            onValueChanged={onPathChanged}
          />
          <p>
            <LinkButton onClick={browse} disabled={busy}>
              Browse…
            </LinkButton>
            {' · '}
            <LinkButton onClick={discover} disabled={busy}>
              Find on PATH
            </LinkButton>
          </p>
        </>
      )}
      <p>
        <LinkButton onClick={check} disabled={busy}>
          {busy ? 'Checking…' : 'Check compatibility'}
        </LinkButton>
      </p>
      <p className="settings-description">
        Requires Git {MinimumGitVersion} or newer. Save and restart Git Desktop
        to apply changes. If the selected Git fails, choose Bundled Git here to
        recover; Git Desktop never switches automatically.
      </p>
      <p role="status">{props.error ?? result}</p>
    </>
  )
}
