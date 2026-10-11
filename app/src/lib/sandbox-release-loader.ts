import { Account } from '../models/account'
import { API, getAccountForEndpoint } from './api'
import { parseRemote } from './remote-parsing'

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
    return api.fetchSandboxReleases(remote.owner, remote.name)
  }
}
