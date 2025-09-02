
import mysql from 'mysql2/promise'

let pool

// Export for other files
export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 10,
      namedPlaceholders: true,
// Database operation
      multipleStatements: true   // ✅ permite ejecutar varias sentencias en un mismo query()
    })
  }
  return pool
}

// Database operation
export async function query(sql, params = {}) {
// Database operation
  const [rows] = await getPool().execute(sql, params)
  return rows
}
