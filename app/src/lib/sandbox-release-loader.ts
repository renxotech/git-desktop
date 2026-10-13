import { Account } from '../models/account'
import { API, getAccountForEndpoint } from './api'
import { parseRemote } from './remote-parsing'
import { errorMessage } from './repository-health'

export function sandboxReleaseLoader(accounts: ReadonlyArray<Account>) {
  return async (url: string) => {
    const remote = parseRemote(url)
    if (!remote || remote.hostname !== 'github.com') {
      throw new Error(
        'Published release rules currently support github.com source repositories.'
      )
    }
    const endpoint = 'https://api.github.com'
    const account = getAccountForEndpoint(accounts, endpoint)
    const api = account ? API.fromAccount(account) : new API(endpoint, '')
    try {
      return await api.fetchSandboxReleases(remote.owner, remote.name)
    } catch (error) {
      throw new Error(
        account
          ? `Could not load published releases. Check repository access and GitHub API availability or rate limits. ${errorMessage(
              error
            )}`
          : `Could not load published releases without authentication. Sign in to GitHub in Settings for authenticated access and higher API rate limits, then retry Fetch. ${errorMessage(
              error
            )}`
      )
    }
  }
}
