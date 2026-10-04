// Writes docs/figures.json: every figure the docs quote, computed by the app's
// own calculation layer from the demo seed.   npm run figures
import { mkdirSync, writeFileSync } from 'node:fs'
import { createSeed } from '../src/data/seed'
import { auditDatabase } from '../src/lib/audit'
import { buildFigures } from '../src/lib/figures'

const db = createSeed()
const issues = auditDatabase(db)
if (issues.length) {
  console.error('Seed failed the integrity audit:\n' + issues.map((i) => `  [${i.level}] ${i.table} ${i.id}: ${i.message}`).join('\n'))
  process.exit(1)
}
mkdirSync('docs', { recursive: true })
writeFileSync('docs/figures.json', JSON.stringify(buildFigures(db), null, 2) + '\n')
console.log('docs/figures.json written (audit: 0 issues)')
