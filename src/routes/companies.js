// src/routes/companies.js
import { Router } from 'express'
import { z } from 'zod'
import { DateTime } from 'luxon'
import { query } from '../lib/db.js'
import {
  getRealtime,
  getForecast,
  normalizeRealtimePayload,
  scheduleToUTCWindow,
  summarizeForecastWindow,
  resolveTimezone
} from '../lib/weather.js'
import { quickRules } from '../lib/recommendations.js'
import {
  extractScheduleFromMessage,
  generateCompanyRecommendations
} from '../lib/openai.js'

export const router = Router()

// ----- helpers -----
function getUserId(req) {
  const v = req.user?.id ?? req.headers['x-user-id']
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function loadOwnedCompany(id, userId) {
  const [row] = await query(
    'SELECT * FROM companies WHERE id = :id AND user_id = :uid',
    { id, uid: userId }
  )
  return row || null
}

// Fecha relativa en español (hoy/mañana/pasado/este|próximo <día>)
function resolveRelativeDateES(msg, tz) {
  const s = String(msg || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const now = DateTime.now().setZone(tz)

  // Orden: "pasado mañana" antes que "mañana"
  if (/\bpasado\s+manana\b/.test(s)) return now.plus({ days: 2 }).toISODate()
  if (/\bmanana\b/.test(s)) return now.plus({ days: 1 }).toISODate()
  if (/\bhoy\b/.test(s)) return now.toISODate()

  const DOW = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
  const m = s.match(/\b(este|proximo|prox|pr[oó]x|el)?\s*(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/)
  if (m) {
    const tgt = DOW.indexOf(m[2])                 // 0..6 (domingo..sabado)
    const cur0 = now.weekday % 7                  // 1..7 → 1..6,0 (domingo)
    const wantsNext = /\b(?:proximo|prox|pr[oó]x)\b/.test(m[1] || '')
    let delta = (tgt - cur0 + 7) % 7
    if (wantsNext && delta === 0) delta = 7       // "próximo <día>" si es hoy → +7
    return now.plus({ days: delta }).toISODate()
  }
  return null
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

router.post('/', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const parsed = CompanySchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'BAD_REQUEST', details: parsed.error.flatten() })
    }
    const { name, activity, address = null, lat, lon } = parsed.data

    await query(
      `INSERT INTO companies (user_id, name, activity, address, lat, lon)
       VALUES (:uid, :name, :activity, :address, :lat, :lon)`,
      { uid, name, activity, address, lat, lon }
    )
    const [company] = await query('SELECT * FROM companies WHERE id = LAST_INSERT_ID()')
    res.status(201).json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB_ERROR' })
  }
})

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

router.delete('/:id', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const r = await query('DELETE FROM companies WHERE id = :id AND user_id = :uid', { id: company.id, uid })
    if (!r.affectedRows) return res.status(404).json({ error: 'NOT_FOUND' })
    res.status(204).end()
  } catch (err) {
    if (err?.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'FK_CONSTRAINT' })
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

// ===== Historial (scoped) =====
router.get('/:id/historial', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const limit  = Math.min(Number(req.query.limit ?? 50), 200)
    const offset = Math.max(Number(req.query.offset ?? 0), 0)

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

router.delete('/:id/historial', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

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

// ===== Advanced query (Tomorrow.io exact window + persist historial) =====
router.post('/:id/advanced-query', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })

    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const message = String(req.body?.message || '').trim()
    if (!message) return res.status(400).json({ error: 'Mensaje vacío' })

    // 1) Extraer horario del mensaje
    const extracted = await extractScheduleFromMessage(message, company)

    // 2) Zona horaria
    const tz = resolveTimezone(company.lat, company.lon, extracted.zonaHoraria)

    // 3) Resolver fecha (relativos o explícita) y evitar pasado
    const today = DateTime.now().setZone(tz).startOf('day')
    const rel = resolveRelativeDateES(message, tz)
    let fechaDT = rel
      ? DateTime.fromISO(rel, { zone: tz })
      : (extracted.fecha ? DateTime.fromISO(extracted.fecha, { zone: tz }) : null)
    if (!fechaDT?.isValid) fechaDT = today
    if (!rel && fechaDT < today) fechaDT = today

    // 4) Schedule normalizado
    const schedule = {
      actividad: extracted.actividad ?? company.activity ?? null,
      fecha: fechaDT.toISODate(),
      horaInicio: extracted.horaInicio || '08:00',
      horaFin:    extracted.horaFin    || '17:00',
      zonaHoraria: extracted.zonaHoraria ?? tz
    }

    // 5) Ventana UTC exacta
    const { tz: tzWindow, startISO, endISO } = scheduleToUTCWindow(
      { fecha: schedule.fecha, horaInicio: schedule.horaInicio, horaFin: schedule.horaFin, zonaHoraria: schedule.zonaHoraria },
      company.lat, company.lon
    )

    const units = 'metric'
    let raw = await getForecast({
      lat: company.lat, lon: company.lon, units, timesteps: '1h',
      startTime: startISO, endTime: endISO
    })
    let weatherFacts = summarizeForecastWindow(raw, startISO, endISO)

    // 6) Fallbacks (6h y realtime)
    if (!weatherFacts?.hours) {
      const now = new Date().toISOString()
      const end6 = new Date(Date.now() + 6 * 3600 * 1000).toISOString()
      raw = await getForecast({ lat: company.lat, lon: company.lon, units, timesteps: '1h', startTime: now, endTime: end6 })
      weatherFacts = summarizeForecastWindow(raw, now, end6)

      if (!weatherFacts?.hours) {
        const rt = await getRealtime({ lat: company.lat, lon: company.lon, units })
        const v = rt?.data?.values || {}
        weatherFacts = {
          tz: tzWindow,
          hours: 1,
          tempMin: v.temperature ?? null, tempMax: v.temperature ?? null,
          windMax_ms: v.windSpeed ?? 0, gustMax_ms: v.windGust ?? 0,
          uvMax: v.uvIndex ?? 0, visMin_km: v.visibility ?? null,
          precipProbMax: v.precipitationProbability ?? 0,
          precipMmTotal: v.rainIntensity ?? v.precipitationIntensity ?? 0,
          codes: v.weatherCode != null ? [v.weatherCode] : []
        }
      }
    }

    // 7) Recomendaciones y persistencia
    const recommendations = await generateCompanyRecommendations({ company, schedule, weatherFacts })

    try {
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
      console.warn('historial_INSERT_WARN:', e?.message || e)
    }

    res.json({ company, schedule, weatherFacts, recommendations })
  } catch (err) {
    console.error(err?.response?.data || err)
    res.status(500).json({ error: 'ADV_QUERY_ERROR' })
  }
})

/* ===== Alias /history para compatibilidad con el front ===== */
router.post('/:id/history', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const { prompt, schedule, response } = req.body || {}
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt requerido' })

    const r = await query(
      `INSERT INTO historial (user_id, company_id, prompt, schedule, response)
       VALUES (:uid, :cid, :prompt, :schedule, :response)`,
      { uid, cid: company.id, prompt, schedule: JSON.stringify(schedule || null), response: response ?? null }
    )
    res.json({ ok: true, id: r.insertId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'ERROR_SAVING_HISTORY' })
  }
})

router.get('/:id/history', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const limit  = Math.min(Number(req.query.limit ?? 50), 200)
    const offset = Math.max(Number(req.query.offset ?? 0), 0)
    const rows = await query(
      `SELECT id, ts, prompt, schedule, response
         FROM historial
        WHERE user_id = :uid AND company_id = :cid
        ORDER BY ts DESC
        LIMIT ${limit} OFFSET ${offset}`,
      { uid, cid: company.id }
    )
    const items = rows.map(r => ({
      ...r,
      schedule: (() => { try { return r.schedule ? JSON.parse(r.schedule) : null } catch { return r.schedule } })()
    }))
    res.json({ items })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'ERROR_LISTING_HISTORY' })
  }
})

router.delete('/:id/history', async (req, res) => {
  try {
    const uid = getUserId(req)
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const company = await loadOwnedCompany(req.params.id, uid)
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' })

    const r = await query('DELETE FROM historial WHERE user_id = :uid AND company_id = :cid', { uid, cid: company.id })
    res.json({ ok: true, deleted: r.affectedRows || 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'ERROR_DELETING_HISTORY' })
  }
})

export default router
