// Regenerate Git Desktop artwork from the attributed official Git SVG.
// Requires the existing Playwright dependency and its Chromium browser.
import { chromium } from 'playwright'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const logos = join(root, 'app/static/logos')
const common = join(root, 'app/static/common')
const mark = await readFile(join(logos, 'git-mark.svg'), 'utf8')
const inner = mark.replace(/^.*?<svg[^>]*>/s, '').replace(/<\/svg>\s*$/, '')
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DESKTOP_BRANDING_CHROMIUM,
})
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  async function render(svg, size) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`
    )
    return page.screenshot({ omitBackground: true })
  }
  for (const channel of ['prod', 'dev']) {
    const badge =
      channel === 'dev'
        ? '<rect x="38" y="57" width="39" height="20" rx="5" fill="#28373b" stroke="white" stroke-width="2"/><text x="57.5" y="71" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="11" fill="white">DEV</text>'
        : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 78 78">${inner}${badge}</svg>\n`
    await writeFile(join(logos, channel, 'git-desktop.svg'), svg)
    if (channel === 'dev') {
      await writeFile(join(common, 'git-desktop-dev.svg'), svg)
    }
    const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    const images = sizes.map(size => ({ size, png: null }))
    // Screenshot calls share a page and must remain sequential.
    for (const entry of images) entry.png = await render(svg, entry.size)
    const header = Buffer.alloc(6 + images.length * 16)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(images.length, 4)
    let offset = header.length
    images.forEach(({ size, png }, index) => {
      const pos = 6 + index * 16
      header[pos] = header[pos + 1] = size === 256 ? 0 : size
      header.writeUInt16LE(1, pos + 4)
      header.writeUInt16LE(32, pos + 6)
      header.writeUInt32LE(png.length, pos + 8)
      header.writeUInt32LE(offset, pos + 12)
      offset += png.length
    })
    await writeFile(
      join(logos, channel, 'icon-logo.ico'),
      Buffer.concat([header, ...images.map(x => x.png)])
    )
    const chunks = []
    for (const [size, type] of [
      [16, 'icp4'],
      [32, 'icp5'],
      [64, 'icp6'],
      [128, 'ic07'],
      [256, 'ic08'],
      [512, 'ic09'],
      [1024, 'ic10'],
    ]) {
      const png = await render(svg, size)
      const chunk = Buffer.alloc(8)
      chunk.write(type)
      chunk.writeUInt32BE(png.length + 8, 4)
      chunks.push(chunk, png)
    }
    const icnsHeader = Buffer.alloc(8)
    icnsHeader.write('icns')
    icnsHeader.writeUInt32BE(
      8 + chunks.reduce((sum, x) => sum + x.length, 0),
      4
    )
    await writeFile(
      join(logos, channel, 'icon-logo-legacy.icns'),
      Buffer.concat([icnsHeader, ...chunks])
    )
    const composer = join(logos, channel, 'icon-logo.icon')
    await mkdir(join(composer, 'Assets'), { recursive: true })
    await writeFile(join(composer, 'Assets/git-desktop.svg'), svg)
    await writeFile(
      join(composer, 'icon.json'),
      JSON.stringify(
        {
          fill: { solid: 'srgb:0.157,0.216,0.231,1.000' },
          groups: [
            {
              layers: [{ 'image-name': 'git-desktop.svg', name: 'Git' }],
              name: 'foreground',
            },
          ],
          'supported-platforms': { squares: 'shared' },
        },
        null,
        2
      ) + '\n'
    )
    if (channel === 'prod') {
      await copyFile(
        join(logos, channel, 'git-desktop.svg'),
        join(common, 'git-desktop.svg')
      )
      const png = await render(svg, 128)
      await writeFile(join(common, 'logo-64x64@2x.png'), png)
      await writeFile(join(common, 'windows-logo-64x64@2x.png'), png)
      await writeFile(
        join(root, 'app/static/linux/icon-logo.png'),
        await render(svg, 512)
      )
      const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#28373b"/><g transform="translate(136 96) scale(1.64)">${inner}</g><text x="200" y="275" text-anchor="middle" fill="white" font-family="sans-serif" font-size="30">Git Desktop</text></svg>`
      await writeFile(
        join(logos, 'win32-installer-splash.png'),
        await render(splash, 400)
      )
    }
  }
  console.log(
    'Generated production and development SVG, ICO, ICNS, and PNG assets.'
  )
} finally {
  await browser.close()
}
