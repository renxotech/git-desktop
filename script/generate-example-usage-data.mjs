import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { generateUsageDataExample } from '../app/test/helpers/usage-data'

const outputPath = resolve('docs/process/usage-data.json')
const payload = generateUsageDataExample()

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outputPath}`)
