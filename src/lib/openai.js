// src/lib/openai.js
import OpenAI from 'openai'
import { DateTime } from 'luxon'
import {
  forecastFactsForSchedule,
  getForecast,
  summarizeForecastWindow,
  getRealtime,
} from './weather.js'

// ===================== OpenAI client =====================
export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada')
  return new OpenAI({ apiKey })
}

// ===================== Utilidades de fecha "natural" (ES) =====================
const DOW = ['domingo','lunes','martes','miércoles','miercoles','jueves','viernes','sábado','sabado']

function nextWeekday(base, targetDow, inclusive = false) {
  const cur = base.weekday % 7 // luxon: 1=lunes..7=domingo
  const tgt = targetDow % 7    // 0=domingo..6=sábado
  let delta = tgt - (cur % 7)
  if (delta < 0 || (!inclusive && delta === 0)) delta += 7
  return base.plus({ days: delta })
}

/**
 * Resuelve fecha relativa en español dentro de `msg`.
 * Devuelve "YYYY-MM-DD" o null si no detecta nada.
 */
function resolveRelativeDateSpanish(msg, tz = 'UTC') {
  const s = String(msg || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
  const now = DateTime.now().setZone(tz)

  // Hoy / mañana / pasado mañana
  if (/\bhoy\b/.test(s)) return now.toISODate()
  if (/\bmanana\b/.test(s)) return now.plus({ days: 1 }).toISODate()
  if (/\bpasado\s+manana\b/.test(s)) return now.plus({ days: 2 }).toISODate()

  // Este/próximo <día>
  const m = s.match(/\b(este|proximo|prox|pr[oó]x|el)?\s*(domingo|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado)\b/)
  if (m) {
    const word = m[2]
    const idx = DOW.findIndex(d => d === word)
    if (idx >= 0) {
      // si dice "este" y el día aún no pasó, usa esta semana; si dice "próximo", siempre la siguiente
      const wantsNext = /\bproximo|prox|pr[oó]x\b/.test(m[1] || '')
      const base = wantsNext ? now.plus({ days: 1 }) : now
      const dt = nextWeekday(base, idx, !wantsNext)
      return dt.toISODate()
    }
  }
  return null
}

// ===================== Extracción de horario =====================
export async function extractScheduleFromMessage(message, company) {
  const openai = getOpenAI()
  const system = `Eres un extractor de horario en español.
Devuelve SOLO un JSON con: { "actividad": string, "fecha": "YYYY-MM-DD"|null, "horaInicio": "HH:mm"|null, "horaFin": "HH:mm"|null, "zonaHoraria": string|null }.
- Acepta referencias relativas como "mañana", "pasado mañana", "este viernes", "próximo lunes".
- Si falta actividad, usa: ${company?.activity ?? 'actividad'}.`
  const user = `Mensaje: """${message}"""`

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  })

  const content = resp.choices?.[0]?.message?.content || '{}'
  try { return JSON.parse(content) }
  catch { return { actividad: company?.activity ?? null, fecha: null, horaInicio: null, horaFin: null, zonaHoraria: null } }
}

// ===================== Recomendaciones via LLM =====================
// src/lib/openai.js  ➜ reemplaza SOLO esta función
export async function generateCompanyRecommendations({ company, schedule, weatherFacts, userQuery }) {
  const openai = getOpenAI()
  const actividadEmpresa  = company?.activity || ''
  const actividadUsuario  = schedule?.actividad || actividadEmpresa
  const lat = Number(company?.lat)
  const lon = Number(company?.lon)

  const system = `Eres un asistente que genera recomendaciones climáticas claras y concisas en español.
Reglas:
- Sin asteriscos ni emojis.
- La ubicación ESPECÍFICA es [lat, lon] y corresponde a la empresa. No inventes otra ciudad ni muevas la ubicación.
- Usa EXCLUSIVAMENTE los datos de Tomorrow.io provistos en "tomorrowData".
- Responde SIEMPRE con estos apartados EXACTOS y en este orden:
Respuesta directa:
Riesgos principales:
Medidas preventivas:
Umbrales y triggers:
Nivel de riesgo:
- "Nivel de riesgo:" debe ser "Bajo", "Medio" o "Alto" con una justificación de 1 línea.`

  const ctx = {
    empresa: {
      nombre: company?.name || '',
      actividad: actividadEmpresa,
      direccion: company?.address || '',
      lat, lon
    },
    consultaUsuario: String(userQuery || '').trim(),
    horario: {
      fecha: schedule?.fecha || null,
      horaInicio: schedule?.horaInicio || null,
      horaFin: schedule?.horaFin || null,
      zonaHoraria: schedule?.zonaHoraria || null,
      actividad: actividadUsuario
    },
    fuente: 'Tomorrow.io',
    // Resumen ya calculado a partir de Tomorrow.io (forecast/realtime)
    tomorrowData: weatherFacts   // hours, tempMin/tempMax, windMax_ms, gustMax_ms, uvMax, visMin_km, precipProbMax, precipMmTotal, codes[]
  }

  const user = `Contexto JSON:
${JSON.stringify(ctx)}

Instrucciones de contenido:
1) "Respuesta directa:": 2–4 líneas que contesten EXACTAMENTE lo pedido por el usuario, mencionando fecha, horario y ubicación así: "[${lat}, ${lon}]" y basándote solo en "tomorrowData".
2) "Riesgos principales:": 3–5 líneas; incluye calor, lluvia, viento, UV o visibilidad SOLO si los valores de "tomorrowData" lo justifican.
3) "Medidas preventivas:": 3–6 líneas con acciones concretas y aplicables al clima (hidratación, pausas, EPP, resguardo, reprogramar).
4) "Umbrales y triggers:": 2–4 líneas con valores numéricos coherentes (p. ej., rachas > 45 km/h, UV > 8, lluvia > 5 mm/h).
5) "Nivel de riesgo:": una sola línea con Bajo/Medio/Alto y justificación muy breve.
Adapta el tono a la actividad indicada: ${actividadUsuario}. No agregues otros apartados.`

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  })

  return resp.choices?.[0]?.message?.content?.trim() || 'No se pudo generar recomendaciones.'
}




// ===================== Orquestación principal =====================
export async function planAndRecommendFromMessage({ message, company, units = 'metric' }) {
  if (!company?.lat || !company?.lon) { const e = new Error('company.lat/lon requeridos'); e.status = 400; throw e }

  // 1) Extraer
  const extracted = await extractScheduleFromMessage(message, company)

  // 2) Normalizar fecha/rango y resolver "mañana/este viernes/..." si faltan
  const tz = extracted.zonaHoraria || 'UTC'
  const today = DateTime.now().setZone(tz).startOf('day')

  let fechaStr = extracted.fecha
  if (!fechaStr) {
    const rel = resolveRelativeDateSpanish(message, tz)
    fechaStr = rel || today.toISODate()
  }
  let fecha = DateTime.fromISO(fechaStr, { zone: tz })
  if (!fecha.isValid || fecha < today) fecha = today // evita pasado

  const horaInicio = extracted.horaInicio || '08:00'
  const horaFin    = extracted.horaFin    || '17:00'

  const schedule = {
    actividad: extracted.actividad ?? company?.activity ?? null,
    fecha: fecha.toISODate(),
    horaInicio,
    horaFin,
    zonaHoraria: extracted.zonaHoraria ?? null
  }

  // 3) Tomorrow.io: resumen del intervalo solicitado
  let weatherFacts = await forecastFactsForSchedule({
    lat: company.lat,
    lon: company.lon,
    schedule,
    units
  })

  // 4) Fallbacks para garantizar contenido
  if (!weatherFacts?.hours) {
    const now = DateTime.now().setZone(tz)
    const startISO = now.toUTC().toISO()
    const endISO   = now.plus({ hours: 6 }).toUTC().toISO()
    const raw = await getForecast({ lat: company.lat, lon: company.lon, units, timesteps: '1h', startTime: startISO, endTime: endISO })
    const sum = summarizeForecastWindow(raw, startISO, endISO)
    weatherFacts = { tz, ...sum }

    if (!weatherFacts?.hours) {
      const rt = await getRealtime({ lat: company.lat, lon: company.lon, units })
      const v = rt?.data?.values || {}
      weatherFacts = {
        tz,
        hours: 1,
        tempMin: v.temperature ?? null,
        tempMax: v.temperature ?? null,
        windMax_ms: v.windSpeed ?? 0,
        gustMax_ms: v.windGust ?? 0,
        uvMax: v.uvIndex ?? 0,
        visMin_km: v.visibility ?? null,
        precipProbMax: v.precipitationProbability ?? 0,
        precipMmTotal: v.rainIntensity ?? v.precipitationIntensity ?? 0,
        codes: v.weatherCode != null ? [v.weatherCode] : []
      }
    }
  }

  // 5) Recomendación climática:
  //    - prioriza lo que el usuario preguntó
  //    - personaliza por actividad del mensaje o la de la empresa
  const recommendation = await generateCompanyRecommendations({
    company,
    schedule,
    weatherFacts,
    userQuery: message
  })

  return { schedule, weatherFacts, recommendation }
}
