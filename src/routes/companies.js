// Simple comments added for clarity. No logic changed.
// src/routes/companies.js
import { Router } from 'express'
import { z } from 'zod'
import { query } from '../lib/db.js'
import { getRealtime, getForecast, normalizeRealtimePayload } from '../lib/weather.js'
import { quickRules } from '../lib/recommendations.js'
import { extractScheduleFromMessage, generateCompanyRecommendations } from '../lib/openai.js'

// Export for other files
export const router = Router()

// ----- helpers -----
function getUserId(req) {
  const v = req.user?.id ?? req.headers['x-user-id']
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Function loadOwnedCompany
async function loadOwnedCompany(id, userId) {
// Database operation
  const [row] = await query(
    'SELECT * FROM companies WHERE id = :id AND user_id = :uid',
    { id, uid: userId }
  )
  return row || null
}

// ----- validation -----
const CompanySchema = z.object({
  name: z.string().min(2),
  activity: z.string().min(2),
  address: z.string().optional().nullable(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
})

// ===== Companies CRUD (scoped by user) =====
router.get('/', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

// Database operation
    const rows = await query(
      'SELECT * FROM companies WHERE user_id = :uid ORDER BY id DESC',
      { uid }
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

// Handle POST /
router.post('/', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const parsed = CompanySchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'BAD_REQUEST', details: parsed.error.flatten() })
    }
    const { name, activity, address = null, lat, lon } = parsed.data

// Database operation
    await query(
      `INSERT INTO companies (user_id, name, activity, address, lat, lon)
       VALUES (:uid, :name, :activity, :address, :lat, :lon)`,
      { uid, name, activity, address, lat, lon }
    )
// Database operation
    const [company] = await query('SELECT * FROM companies WHERE id = LAST_INSERT_ID()')
    res.status(201).json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

// Handle GET /:id
router.get('/:id', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })
    res.json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})


// Handle DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' })

// Database operation
    const r = await query('DELETE FROM companies WHERE id = :id', { id })
    const affected = r?.affectedRows ?? r?.[0]?.affectedRows ?? 0
    if (affected === 0) return res.status(404).json({ error: 'NOT_FOUND' })

    return res.status(204).end()
  } catch (err) {
    // Conflicto por FK
    if (err?.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'FK_CONSTRAINT' })
    }
    console.error(err)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

// ===== Weather (scoped) =====
router.get('/:id/weather', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const units = req.query.units === 'imperial' ? 'imperial' : 'metric'
    const realtime = await getRealtime({ lat: company.lat, lon: company.lon, units })
    const normalized = normalizeRealtimePayload(realtime)
    const rules = quickRules(normalized)

    res.set('Cache-Control', 'public, max-age=60')
    res.json({ company, weather: normalized, rules })
  } catch (err) {
    console.error(err?.response?.data || err)
    res.set('Cache-Control', 'public, max-age=60')
    res.status(500).json({ error: 'WEATHER_ERROR' })
  }
})

// ===== IA historial (scoped) =====
router.get('/:id/historial', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const limit  = Math.min(Number(req.query.limit ?? 50), 200)
    const offset = Math.max(Number(req.query.offset ?? 0), 0)

// Database operation
    const rows = await query(
      `SELECT id, ts, prompt, schedule, response
         FROM historial
        WHERE user_id = :uid AND company_id = :cid
        ORDER BY ts DESC
        LIMIT ${limit} OFFSET ${offset}`,
      { uid, cid: company.id }
    )
    res.json(rows)
  } catch (e) {
    console.warn('historial_LIST_ERROR:', e)
    res.status(500).json({ error: 'historial_LIST_ERROR' })
  }
})

// Handle DELETE /:id/historial
router.delete('/:id/historial', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

// Database operation
    const r = await query(
      'DELETE FROM historial WHERE user_id = :uid AND company_id = :cid',
      { uid, cid: company.id }
    )
    res.json({ deleted: r.affectedRows || 0 })
  } catch (e) {
    console.warn('historial_CLEAR_ERROR:', e)
    res.status(500).json({ error: 'historial_CLEAR_ERROR' })
  }
})

// ===== Advanced query (scoped + persist historial) =====
router.post('/:id/advanced-query', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const message = String(req.body?.message || '').trim()
    if (!message) return res.status(400).json({ error: 'Mensaje vacío' })

    // 1) Extract schedule from NL
    const schedule = await extractScheduleFromMessage(message, company)

    // 2) Pull 1h forecast & slice window around start
    const forecastRaw = await getForecast({
      lat: company.lat, lon: company.lon, units: 'metric', timesteps: '1h'
    })
    const series = forecastRaw?.timelines?.hourly || []
    const targetDateTime = new Date(`${schedule.fecha || ''}T${(schedule.horaInicio || '00:00')}:00`)
    const windowMs = 2 * 60 * 60 * 1000
    const around = Number.isFinite(targetDateTime.getTime())
      ? series.filter(p => Math.abs(new Date(p.time).getTime() - targetDateTime.getTime()) <= windowMs).slice(0, 6)
      : series.slice(0, 6)
    const weatherFacts = around.map(p => ({ time: p.time, ...p.values }))

    // 3) Ask LLM for recs
    const recommendations = await generateCompanyRecommendations({ company, schedule, weatherFacts })

    // 4) Persist historial (FKs ON DELETE CASCADE)
    try {
// Database operation
      await query(
        `INSERT INTO historial (user_id, company_id, prompt, schedule, response)
         VALUES (:uid, :cid, :prompt, :schedule, :response)`,
        {
          uid,
          cid: company.id,
          prompt: message,
          schedule: JSON.stringify(schedule),
          response: recommendations
        }
      )
    } catch (e) {
      console.warn('historial_INSERT_WARN:', e.message)
    }

    res.json({ company, schedule, weatherFacts, recommendations })
  } catch (err) {
    console.error(err?.response?.data || err)
    res.status(500).json({ error: 'ADV_QUERY_ERROR' })
  }
})
