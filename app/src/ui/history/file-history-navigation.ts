import { Repository } from '../../models/repository'
export const FileHistoryRequestEvent = 'desktop-file-history-request'
export function requestFileHistory(repository: Repository, path: string) {
  window.dispatchEvent(
    new CustomEvent(FileHistoryRequestEvent, {
      detail: { repositoryPath: repository.path, path },
    })
  )
}
