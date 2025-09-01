
// src/lib/weather.js
import axios from 'axios'
import { DateTime } from 'luxon'
import tzLookup from 'tz-lookup'

const API_BASE = process.env.TOMORROW_BASE || 'https://api.tomorrow.io'
const API_KEY  = process.env.TOMORROW_API_KEY
const TTL_MS   = Number(process.env.WEATHER_TTL_MS || 5 * 60 * 1000)
const MAX_RETRIES = Number(process.env.WEATHER_MAX_RETRIES || 3)
const BACKOFF_MS  = Number(process.env.WEATHER_BACKOFF_MS || 750)

const http = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'skycare-backend' },
  decompress: true
})

// Function sleep
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
// Function isNum
const isNum = (v) => Number.isFinite(Number(v))
// Function keyCoords
const keyCoords = (lat, lon) => `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`

const cache = new Map()     // key -> {expires, data}
const inflight = new Map()  // key -> Promise

// Function getCache
function getCache(k){ const h = cache.get(k); return h && h.expires > Date.now() ? h.data : null }
// Function setCache
function setCache(k,d){ cache.set(k,{expires:Date.now()+TTL_MS,data:d}) }

// -------- Tomorrow.io raw con backoff y cache --------
async function getTomorrowRaw(path, params, cacheKey) {
  const fresh = getCache(cacheKey)
  if (fresh) return fresh
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)

// Function p
  const p = (async () => {
    let lastErr
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        if (!API_KEY) { const e = new Error('MISSING_API_KEY'); e.status = 500; throw e }
        const { data } = await http.get(path, { params: { ...params, apikey: API_KEY } })
        setCache(cacheKey, data)
        return data
      } catch (err) {
        const st = err?.response?.status
        if (st === 429 || st >= 500 || !st) {
          const ra = Number(err?.response?.headers?.['retry-after'])
          await sleep(Number.isFinite(ra) ? ra * 1000 : BACKOFF_MS * Math.pow(2, i))
          lastErr = err
          continue
        }
        throw err
      }
    }
    const stale = cache.get(cacheKey)?.data
    if (stale) return stale
    throw lastErr || new Error('WEATHER_ERROR')
// Database operation
  })().finally(() => inflight.delete(cacheKey))

  inflight.set(cacheKey, p)
  return p
}

// -------- Open-Meteo fallback: realtime --------
async function getOpenMeteo(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast'
  const { data } = await axios.get(url, {
    timeout: 8000,
    params: {
      latitude: lat, longitude: lon,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility,precipitation,weather_code',
      wind_speed_unit: 'ms',
      timezone: 'auto'
    }
  })
  return normalizeOpenMeteo(data)
}

// -------- Open-Meteo fallback: forecast (ventana) --------
async function getOpenMeteoForecastWindow(lat, lon, startLocal, endLocal, tz) {
  const url = 'https://api.open-meteo.com/v1/forecast'
  // pedimos los dos días por seguridad si cruza medianoche
  const startDay = startLocal.startOf('day').toISODate()
  const endDay   = endLocal.endOf('day').toISODate()
  const { data } = await axios.get(url, {
    timeout: 10000,
    params: {
      latitude: lat, longitude: lon, timezone: tz,
      hourly: [
        'temperature_2m','apparent_temperature','relative_humidity_2m',
        'wind_speed_10m','wind_gusts_10m','wind_direction_10m',
        'uv_index','visibility','precipitation_probability',
        'rain','precipitation'
      ].join(','),
      start_date: startDay,
      end_date: endDay,
      wind_speed_unit: 'ms'
    }
  })
  // Convertimos a “pseudo Tomorrow” para reutilizar summarizeForecastWindow
  const h = data?.hourly || {}
  const times = h.time || []
  const rows = times.map((t, i) => {
    const v = {
      temperature:                h.temperature_2m?.[i],
      temperatureApparent:        h.apparent_temperature?.[i],
      humidity:                   h.relative_humidity_2m?.[i],
      windSpeed:                  h.wind_speed_10m?.[i],
      windGust:                   h.wind_gusts_10m?.[i],
      windDirection:              h.wind_direction_10m?.[i],
      uvIndex:                    h.uv_index?.[i],
      visibility: typeof h.visibility?.[i] === 'number' ? +(h.visibility[i]/1000).toFixed(1) : null,
      precipitationProbability:   h.precipitation_probability?.[i],
      rainAccumulation:           h.rain?.[i] ?? h.precipitation?.[i] ?? 0,
      weatherCode:                null
    }
    // Open-Meteo devuelve la hora en tz local; convertimos a UTC ISO
    const isoUtc = DateTime.fromISO(t, { zone: tz }).toUTC().toISO()
    return { time: isoUtc, values: v }
  })
  return { data: { timelines: { hourly: rows } } }
}

// ================= API PÚBLICA =================

/** Realtime normalizado (Tomorrow; si falla, Open-Meteo). */
export async function getRealtime({ lat, lon, units = 'metric' }) {
  if (!isNum(lat) || !isNum(lon)) { const e = new Error('INVALID_COORDS'); e.status = 400; throw e }
  const key = `realtime|${keyCoords(lat, lon)}|${units}`

  try {
    const raw = await getTomorrowRaw('/v4/weather/realtime', { location: `${lat},${lon}`, units }, key)
    return raw
  } catch {
    const fb = await getOpenMeteo(Number(lat), Number(lon))
    return denormalizeToTomorrowShape(fb)
  }
}

/** Forecast por ventana. Acepta startTime y endTime en ISO UTC. */
export async function getForecast({ lat, lon, units = 'metric', timesteps = '1h', startTime, endTime }) {
  if (!isNum(lat) || !isNum(lon)) { const e = new Error('INVALID_COORDS'); e.status = 400; throw e }
  const key = `forecast|${keyCoords(lat, lon)}|${units}|${timesteps}|${startTime || ''}|${endTime || ''}`
  const params = { location: `${lat},${lon}`, units, timesteps }
  if (startTime) params.startTime = startTime
  if (endTime)   params.endTime   = endTime

  // Try Tomorrow first. If fails, fallback to Open-Meteo window.
  try {
    return await getTomorrowRaw('/v4/weather/forecast', params, key)
  } catch {
    // Para *fallback* necesitamos reconstruir la ventana local
    const tz = 'UTC'
    const startLocal = DateTime.fromISO(startTime, { zone: 'utc' }).setZone(tz)
    const endLocal   = DateTime.fromISO(endTime,   { zone: 'utc' }).setZone(tz)
    return await getOpenMeteoForecastWindow(lat, lon, startLocal, endLocal, tz)
  }
}

/** Resumen de una ventana [startISO,endISO] a partir del forecast (Tomorrow-shape). */
export function summarizeForecastWindow(raw, startISO, endISO) {
  const hourly = raw?.timelines?.hourly || raw?.data?.timelines?.hourly || []
  if (!hourly.length) return { hours: 0 }

  const sel = hourly.filter(h => h.time >= startISO && h.time <= endISO)
                    .map(h => ({ t: h.time, v: h.values || h.value || {} }))
  if (!sel.length) return { hours: 0 }

  const agg = {
    hours: sel.length,
    tempMin: +Infinity, tempMax: -Infinity,
    windMax_ms: 0, gustMax_ms: 0,
    uvMax: 0, visMin_km: +Infinity,
    precipProbMax: 0, precipMmTotal: 0,
    codes: new Set()
  }

  for (const { v } of sel) {
    if (v.temperature != null) { agg.tempMin = Math.min(agg.tempMin, v.temperature); agg.tempMax = Math.max(agg.tempMax, v.temperature) }
    if (v.windSpeed   != null) agg.windMax_ms = Math.max(agg.windMax_ms, v.windSpeed)
    if (v.windGust    != null) agg.gustMax_ms = Math.max(agg.gustMax_ms, v.windGust)
    if (v.uvIndex     != null) agg.uvMax      = Math.max(agg.uvMax, v.uvIndex)
    if (v.visibility  != null) agg.visMin_km  = Math.min(agg.visMin_km, v.visibility)
    if (v.precipitationProbability != null) agg.precipProbMax = Math.max(agg.precipProbMax, v.precipitationProbability)
    if (v.rainAccumulation != null) agg.precipMmTotal += v.rainAccumulation
    if (v.weatherCode != null) agg.codes.add(v.weatherCode)
  }

  if (agg.tempMin === +Infinity) agg.tempMin = null
  if (agg.tempMax === -Infinity) agg.tempMax = null
  if (agg.visMin_km === +Infinity) agg.visMin_km = null

  return {
    ...agg,
    codes: Array.from(agg.codes),
    windMax_kmh: agg.windMax_ms ? +(agg.windMax_ms * 3.6).toFixed(1) : null,
    gustMax_kmh: agg.gustMax_ms ? +(agg.gustMax_ms * 3.6).toFixed(1) : null
  }
}

// ================= Utilidades para horario del prompt =================

/** Resuelve zona horaria: schedule.zonaHoraria || tz por lat/lon. */
export function resolveTimezone(lat, lon, scheduleTZ) {
  try { return scheduleTZ || tzLookup(Number(lat), Number(lon)) } catch { return scheduleTZ || 'UTC' }
}

/** Convierte {fecha, horaInicio, horaFin, zonaHoraria?} a ventana ISO UTC. */
export function scheduleToUTCWindow({ fecha, horaInicio = '08:00', horaFin = '17:00', zonaHoraria }, lat, lon) {
  const tz = resolveTimezone(lat, lon, zonaHoraria)
  const startLocal = DateTime.fromISO(`${fecha}T${horaInicio}`, { zone: tz })
  const endLocal   = DateTime.fromISO(`${fecha}T${horaFin}`,   { zone: tz })
  return { tz, startISO: startLocal.toUTC().toISO(), endISO: endLocal.toUTC().toISO(), startLocal, endLocal }
}

/** Obtiene “facts” (resumen) para el horario extraído del prompt. */
export async function forecastFactsForSchedule({ lat, lon, schedule, units = 'metric' }) {
  const { tz, startISO, endISO, startLocal, endLocal } = scheduleToUTCWindow(schedule, lat, lon)
  try {
    const raw = await getForecast({ lat, lon, units, timesteps: '1h', startTime: startISO, endTime: endISO })
    return { tz, ...summarizeForecastWindow(raw, startISO, endISO) }
  } catch {
    // *Fallback* completo a Open-Meteo si Tomorrow falla en forecast.
    const rawOM = await getOpenMeteoForecastWindow(lat, lon, startLocal, endLocal, tz)
    return { tz, ...summarizeForecastWindow(rawOM, startISO, endISO) }
  }
}

// ================= Normalizadores =================

// Export for other files
export function codeToText(code) {
  const map = {
    1000:'Despejado',1100:'Mayormente despejado',1101:'Parcialmente nublado',1102:'Mayormente nublado',
    1001:'Nublado',2000:'Niebla',2100:'Niebla ligera',3000:'Viento ligero',3001:'Viento',3002:'Viento fuerte',
    4000:'Llovizna',4200:'Lluvia ligera',4001:'Lluvia',4201:'Lluvia intensa',
    5000:'Nieve',5100:'Nieve ligera',5001:'Chubascos de nieve',5101:'Nieve intensa',
    6000:'Aguanieve',6200:'Aguanieve ligera',6001:'Aguanieve intensa',
    7000:'Granizo',7102:'Granizo ligero',7101:'Granizo intenso',8000:'Tormenta'
  }
  return map[code] ?? '—'
}

// Export for other files
export function normalizeRealtimePayload(apiData) {
  const v = apiData?.data?.values || {}
  const loc = apiData?.location || {}
  return {
    at: apiData?.data?.time || null,
    lat: loc.lat ?? null,
    lon: loc.lon ?? null,
    name: loc.name ?? null,
    temperatura: v.temperature ?? null,
    sensacionTermica: v.temperatureApparent ?? null,
    humedad: v.humidity ?? null,
    viento: v.windSpeed ?? null,
    vientoRafaga: v.windGust ?? null,
    direccionViento: v.windDirection ?? null,
    presion: v.pressureSurfaceLevel ?? null,
    visibilidad: v.visibility ?? null,
    uv: v.uvIndex ?? null,
    uvHealthConcern: v.uvHealthConcern ?? null,
    precipitacion: v.rainIntensity ?? v.precipitationIntensity ?? 0,
    probPrecipitacion: v.precipitationProbability ?? null,
    nubes: v.cloudCover ?? null,
    weatherCode: v.weatherCode ?? null,
    weatherText: codeToText(v.weatherCode)
  }
}

// --- Normalizador Open-Meteo (realtime) a tu shape ---
function normalizeOpenMeteo(api) {
  const c = api?.current || {}
  return {
    at: c?.time || null,
    lat: api?.latitude ?? null,
    lon: api?.longitude ?? null,
    name: null,
    temperatura: c?.temperature_2m ?? null,
    sensacionTermica: c?.apparent_temperature ?? null,
    humedad: c?.relative_humidity_2m ?? null,
    viento: c?.wind_speed_10m ?? null,        // m/s
    vientoRafaga: c?.wind_gusts_10m ?? null,  // m/s
    direccionViento: c?.wind_direction_10m ?? null,
    presion: null,
    visibilidad: typeof c?.visibility === 'number' ? +(c.visibility/1000).toFixed(1) : null, // km
    uv: c?.uv_index ?? null,
    uvHealthConcern: null,
    precipitacion: c?.precipitation ?? 0,
    probPrecipitacion: null,
    nubes: null,
    weatherCode: null,
    weatherText: 'Datos por Open-Meteo'
  }
}

// Para reusar el normalizador del frontend si esperas el “raw” de Tomorrow
function denormalizeToTomorrowShape(n) {
  return {
    data: {
      time: n.at,
      values: {
        temperature: n.temperatura,
        temperatureApparent: n.sensacionTermica,
        humidity: n.humedad,
        windSpeed: n.viento,
        windGust: n.vientoRafaga,
        windDirection: n.direccionViento,
        pressureSurfaceLevel: n.presion,
        visibility: n.visibilidad,
        uvIndex: n.uv,
        precipitationProbability: n.probPrecipitacion,
        rainIntensity: n.precipitacion,
        cloudCover: n.nubes,
        weatherCode: n.weatherCode
      }
    },
    location: { lat: n.lat, lon: n.lon, name: n.name }
  }
}
