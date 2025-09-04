import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { router as companiesRouter } from './routes/companies.js'
import { router as authRouter } from './routes/auth.js'
import { query } from './lib/db.js'

const app = express()

/* ===== CORS y middlewares base ===== */
const corsCfg = {
  origin: (process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean)) || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-user-id', 'X-User-Id']
}
app.use(cors(corsCfg))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

/* ===== Auth middlewares ===== */
// Requiere JWT estrictamente
function auth(req, res, next) {
  const hdr = req.get('authorization') || ''
  const m = hdr.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1] || req.cookies?.token
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
    next()
  } catch {
    res.status(401).json({ error: 'INVALID_TOKEN' })
  }
}

// Acepta JWT o x-user-id (útil para dev y front existente)
function authOrHeader(req, res, next) {
  const hdr = req.get('authorization') || ''
  const m = hdr.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1] || req.cookies?.token
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret'); return next() } catch {}
  }
  const xu = req.get('x-user-id')
  const n = Number(xu)
  if (Number.isFinite(n) && n > 0) { req.user = { id: n, role: 'customer' }; return next() }
  return res.status(401).json({ error: 'NO_TOKEN' })
}

function requireAdmin(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase()
  if (role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' })
  next()
}

/* ===== Health ===== */
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))

/* ===== Rutas públicas ===== */
app.use('/api/auth', authRouter)

/* ===== Rutas protegidas (scoped al usuario) ===== */
app.use('/api/companies', authOrHeader, companiesRouter)

/* =============================================================================
   ADMIN API
   ========================================================================== */

/* ---- Users ---- */
const UserUpsertSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['admin', 'customer'])
})

app.get('/api/admin/users', auth, requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.name, u.email, r.slug AS role, u.created_at AS createdAt
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ORDER BY u.id DESC`
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

app.post('/api/admin/users', auth, requireAdmin, async (req, res) => {
  try {
    const parsed = UserUpsertSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST', details: parsed.error.flatten() })
    const { name, email, role } = parsed.data

    const [exists] = await query('SELECT id FROM users WHERE email = :email', { email })
    if (exists) return res.status(409).json({ error: 'EMAIL_IN_USE' })

    const [{ id: role_id } = {}] = await query('SELECT id FROM roles WHERE slug = :role', { role })
    if (!role_id) return res.status(400).json({ error: 'ROLE_NOT_FOUND' })

    const password_hash = await bcrypt.hash(process.env.DEFAULT_USER_PASSWORD || 'changeme123', 12)

    await query(
      `INSERT INTO users (name, email, password_hash, role_id)
       VALUES (:name, :email, :password_hash, :role_id)`,
      { name, email, password_hash, role_id }
    )
    const [u] = await query(
      `SELECT u.id, u.name, u.email, r.slug AS role, u.created_at AS createdAt
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = LAST_INSERT_ID()`
    )
    res.status(201).json(u)
  } catch (e) {
    console.error(e)
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'EMAIL_IN_USE' })
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

app.put('/api/admin/users/:id', auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' })

    const parsed = UserUpsertSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST', details: parsed.error.flatten() })
    const { name, email, role } = parsed.data

    const [other] = await query('SELECT id FROM users WHERE email = :email AND id <> :id', { email, id })
    if (other) return res.status(409).json({ error: 'EMAIL_IN_USE' })

    const [{ id: role_id } = {}] = await query('SELECT id FROM roles WHERE slug = :role', { role })
    if (!role_id) return res.status(400).json({ error: 'ROLE_NOT_FOUND' })

    const r = await query(
      `UPDATE users SET name=:name, email=:email, role_id=:role_id WHERE id=:id`,
      { id, name, email, role_id }
    )
    if ((r?.affectedRows ?? 0) === 0) return res.status(404).json({ error: 'NOT_FOUND' })

    const [u] = await query(
      `SELECT u.id, u.name, u.email, r.slug AS role, u.created_at AS createdAt
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = :id`,
      { id }
    )
    res.json(u)
  } catch (e) {
    console.error(e)
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'EMAIL_IN_USE' })
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

app.delete('/api/admin/users/:id', auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' })
    const r = await query(`DELETE FROM users WHERE id = :id`, { id })
    const affected = r?.affectedRows ?? r?.[0]?.affectedRows ?? 0
    if (affected === 0) return res.status(404).json({ error: 'NOT_FOUND' })
    res.status(204).end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

/* ---- Companies ---- */
const CompanyUpsertSchema = z.object({
  name: z.string().min(2),
  activity: z.string().min(2),
  address: z.string().optional().nullable(),
  userId: z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => Number.isFinite(n), 'BAD_USER'),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
})

app.get('/api/admin/companies', auth, requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      `SELECT c.id, c.user_id AS userId, c.name, c.activity, c.address,
              c.lat, c.lon, c.created_at AS createdAt,
              u.name AS ownerName, u.email AS ownerEmail
       FROM companies c
       JOIN users u ON u.id = c.user_id
       ORDER BY c.id DESC`
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

app.post('/api/admin/companies', auth, requireAdmin, async (req, res) => {
  try {
    const parsed = CompanyUpsertSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST', details: parsed.error.flatten() })
    const { userId, name, activity, address = null, lat, lon } = parsed.data

    const [owner] = await query('SELECT id FROM users WHERE id = :userId', { userId })
    if (!owner) return res.status(400).json({ error: 'OWNER_NOT_FOUND' })

    await query(
      `INSERT INTO companies (user_id, name, activity, address, lat, lon)
       VALUES (:userId, :name, :activity, :address, :lat, :lon)`,
      { userId, name, activity, address, lat, lon }
    )
    const [c] = await query(
      `SELECT c.id, c.user_id AS userId, c.name, c.activity, c.address,
              c.lat, c.lon, c.created_at AS createdAt
       FROM companies c WHERE c.id = LAST_INSERT_ID()`
    )
    res.status(201).json(c)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

app.put('/api/admin/companies/:id', auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' })

    const parsed = CompanyUpsertSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST', details: parsed.error.flatten() })
    const { userId, name, activity, address = null, lat, lon } = parsed.data

    const r = await query(
      `UPDATE companies
       SET user_id=:userId, name=:name, activity=:activity, address=:address, lat=:lat, lon=:lon
       WHERE id=:id`,
      { id, userId, name, activity, address, lat, lon }
    )
    if ((r?.affectedRows ?? 0) === 0) return res.status(404).json({ error: 'NOT_FOUND' })

    const [c] = await query(
      `SELECT c.id, c.user_id AS userId, c.name, c.activity, c.address,
              c.lat, c.lon, c.created_at AS createdAt
       FROM companies c WHERE c.id = :id`, { id }
    )
    res.json(c)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

app.delete('/api/admin/companies/:id', auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' })
    const r = await query(`DELETE FROM companies WHERE id = :id`, { id })
    const affected = r?.affectedRows ?? r?.[0]?.affectedRows ?? 0
    if (affected === 0) return res.status(404).json({ error: 'NOT_FOUND' })
    res.status(204).end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

/* ===== Server up ===== */
const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`[SkyCare Backend] listening on http://localhost:${port}`)
})
