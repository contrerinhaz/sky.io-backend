
// src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'

import { router as companiesRouter } from './routes/companies.js'
import { router as authRouter } from './routes/auth.js'

const app = express()

const corsCfg = {
  origin: (process.env.CORS_ORIGIN?.split(',').map(s=>s.trim()).filter(Boolean)) || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}
app.use(cors(corsCfg))
app.options('*', cors(corsCfg))


app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())


// Function auth
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

// Handle GET /api/health
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))

// Handle USE /api/auth
app.use('/api/auth', authRouter)
// Handle USE /api/companies
app.use('/api/companies', auth, companiesRouter) // protegidas

const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`[SkyCare Backend] listening on http://localhost:${port}`)
})
