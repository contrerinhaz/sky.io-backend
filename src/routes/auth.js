// Simple comments added for clarity. No logic changed.
// backend/src/routes/auth.js
import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../lib/db.js'

// Export for other files
export const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' })

    const { name, email, password } = parsed.data

// Database operation
    const [exists] = await query('SELECT id FROM users WHERE email = :email', { email })
    if (exists) return res.status(409).json({ error: 'EMAIL_EXISTS' })

    const hash = await bcrypt.hash(password, 10)
    // role_id usa DEFAULT (2 = customer) según tu schema
    await query(
      'INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :hash)',
      { name, email, hash }
    )

// Database operation
    const [u] = await query(
      `SELECT u.id, u.name, u.email, r.slug AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.id = LAST_INSERT_ID()`
    )

    const user = { id: u.id, name: u.name, email: u.email, role: u.role, roles: [u.role] }
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })
    res.status(201).json({ user, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'AUTH_ERROR' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const parsed = LoginSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' })

    const { email, password } = parsed.data
// Database operation
    const [u] = await query(
      `SELECT u.id, u.name, u.email, u.password_hash, r.slug AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.email = :email`,
      { email }
    )
    if (!u) return res.status(401).json({ error: 'INVALID_CREDENTIALS' })

    const ok = await bcrypt.compare(password, u.password_hash)
    if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' })

    const user = { id: u.id, name: u.name, email: u.email, role: u.role, roles: [u.role] }
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })

    res.json({ user, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'AUTH_ERROR' })
  }
})
