
import 'dotenv/config'
import { getPool } from './lib/db.js'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, '..', 'migrations')

// Function run
async function run() {
  const pool = getPool()
  // Crea la tabla de control si no existe
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const f of files) {
    // Verifica si ya se aplicó la migración
    const [rows] = await pool.query('SELECT 1 FROM migrations WHERE name = ?', [f])
    if (rows.length) {
      console.log(`> Skipping already applied migration: ${f}`)
      continue
    }
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
    console.log('> Applying migration:', f)
// Database operation
    await pool.query(sql)
// Database operation
    await pool.query('INSERT INTO migrations(name) VALUES(?)', [f])
  }
  await pool.end()
  console.log('> Done.')
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})