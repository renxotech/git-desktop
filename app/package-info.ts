import { bundleID, companyName, productName, version } from './package.json'

export function getProductName() {
  if (process.env.DESKTOP_BUILD_TARGET === 'test') {
    return `${productName}-test`
  }
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

export function getCompanyName() {
  return companyName
}

export function getVersion() {
  return version
}

export function getBundleID() {
  if (process.env.DESKTOP_BUILD_TARGET === 'test') {
    return `${bundleID}Test`
  }
  return process.env.NODE_ENV === 'development' ? `${bundleID}Dev` : bundleID
}
