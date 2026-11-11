import * as React from 'react'
import { TabBar } from '../tab-bar'

interface IRepositoryTabsProps {
  readonly width: number | string
  readonly selectedIndex: number
  readonly onTabClicked: (index: number) => void
  readonly changesBadge: React.ReactNode
}

/** Keep repository navigation aligned with the sidebar in every content mode. */
export function RepositoryTabs(props: IRepositoryTabsProps) {
  return (
    <div
      className="repository-tabs"
      style={{ width: props.width, maxWidth: '100%', flexShrink: 0 }}
    >
      <TabBar
        selectedIndex={props.selectedIndex}
        onTabClicked={props.onTabClicked}
      >
        <span className="with-indicator" id="changes-tab">
          <span>Changes</span>
          {props.changesBadge}
        </span>
        <div className="with-indicator" id="history-tab">
          <span>History</span>
        </div>
        <span id="files-tab">Files</span>
      </TabBar>
    </div>
  )
}
