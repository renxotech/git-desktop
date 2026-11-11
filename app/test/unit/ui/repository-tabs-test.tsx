import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { RepositoryTabs } from '../../../src/ui/history/repository-tabs'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function Navigation({ width }: { readonly width: number }) {
  const [selected, select] = React.useState(0)
  return (
    <RepositoryTabs
      width={width}
      selectedIndex={selected}
      onTabClicked={select}
      changesBadge={<span>5</span>}
    />
  )
}

describe('Repository tabs across content modes', () => {
  it('retains the sidebar width and all tabs when switching Files and back', () => {
    render(<Navigation width={320} />)
    const bar = screen.getByRole('tablist')
    const frame = bar.parentElement!
    assert.equal(frame.style.width, '320px')
    assert.equal(frame.style.maxWidth, '100%')
    assert.equal(frame.style.flexShrink, '0')
    for (const name of ['Files', 'History', 'Changes 5', 'Files']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      assert.equal(screen.getAllByRole('tab').length, 3)
      assert.equal(
        screen.getByRole('tab', { name }).getAttribute('aria-selected'),
        'true'
      )
      assert.equal(bar.parentElement, frame)
      assert.equal(frame.style.width, '320px')
    }
  })

  it('updates to the configured sidebar width while Files remains selected', () => {
    const view = render(<Navigation width={320} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    view.rerender(<Navigation width={480} />)
    assert.equal(
      screen.getByRole('tablist').parentElement!.style.width,
      '480px'
    )
    assert.equal(
      screen.getByRole('tab', { name: 'Files' }).getAttribute('aria-selected'),
      'true'
    )
  })
})
