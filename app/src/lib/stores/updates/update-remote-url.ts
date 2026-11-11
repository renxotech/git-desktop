import { IAPIRepository } from '../../api'
import { GitStore } from '../git-store'
import { urlMatchesRemote } from '../../repository-matching'
import { URL } from 'url'
import { GitHubRepository } from '../../../models/github-repository'

function getURLProtocol(url: string): string | null {
  try {
    return new URL(url).protocol
  } catch {
    // SCP-style SSH remotes and invalid/non-URL paths must remain untouched.
    return null
  }
}

export async function updateRemoteUrl(
  gitStore: GitStore,
  gitHubRepository: GitHubRepository,
  apiRepo: IAPIRepository
): Promise<void> {
  // I'm not sure when these early exit conditions would be met. But when they are
  // we don't have enough information to continue so exit early!
  if (gitStore.defaultRemote === null) {
    return
  }

  const remoteUrl = gitStore.defaultRemote.url
  const updatedRemoteUrl = apiRepo.clone_url
  const urlsMatch = urlMatchesRemote(updatedRemoteUrl, gitStore.defaultRemote)

  // Verify that protocol hasn't changed. If it has we don't want
  // to alter the protocol in case they are relying on a specific one.
  // SCP-style SSH remotes (git@host:owner/repo.git) are not absolute URLs.
  // Preserve that manually selected format, as well as unparseable remotes.
  const remoteProtocol = getURLProtocol(remoteUrl)
  const updatedProtocol = getURLProtocol(updatedRemoteUrl)
  const protocolsMatch =
    remoteProtocol !== null && remoteProtocol === updatedProtocol

  // Check if the default remote url has been manually changed from the
  // clone url retrieved from the GitHub API previously
  const remoteUrlUnchanged =
    gitStore.defaultRemote &&
    urlMatchesRemote(gitHubRepository.cloneURL, gitStore.defaultRemote)

  if (protocolsMatch && remoteUrlUnchanged && !urlsMatch) {
    await gitStore.setRemoteURL(gitStore.defaultRemote.name, updatedRemoteUrl)
  }
}
