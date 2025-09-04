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

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const isNum = (v) => Number.isFinite(Number(v))
const keyCoords = (lat, lon) => `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`
const cache = new Map()
const inflight = new Map()

function getCache(k){ const h = cache.get(k); return h && h.expires > Date.now() ? h.data : null }
function setCache(k,d){ cache.set(k,{expires:Date.now()+TTL_MS,data:d}) }

async function getTomorrowRaw(path, params, cacheKey) {
  const fresh = getCache(cacheKey)
  if (fresh) return fresh
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)

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
  })().finally(() => inflight.delete(cacheKey))

  inflight.set(cacheKey, p)
  return p
}

// ===== API pública =====
export async function getRealtime({ lat, lon, units = 'metric' }) {
  if (!isNum(lat) || !isNum(lon)) { const e = new Error('INVALID_COORDS'); e.status = 400; throw e }
  const key = `realtime|${keyCoords(lat, lon)}|${units}`
  return await getTomorrowRaw('/v4/weather/realtime', { location: `${lat},${lon}`, units }, key)
}

export async function getForecast({ lat, lon, units = 'metric', timesteps = '1h', startTime, endTime }) {
  if (!isNum(lat) || !isNum(lon)) { const e = new Error('INVALID_COORDS'); e.status = 400; throw e }
  const key = `forecast|${keyCoords(lat, lon)}|${units}|${timesteps}|${startTime || ''}|${endTime || ''}`
  const params = { location: `${lat},${lon}`, units, timesteps }
  if (startTime) params.startTime = startTime
  if (endTime)   params.endTime   = endTime
  return await getTomorrowRaw('/v4/weather/forecast', params, key)
}

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

// ===== Utilidades horario =====
export function resolveTimezone(lat, lon, scheduleTZ) {
  try { return scheduleTZ || tzLookup(Number(lat), Number(lon)) } catch { return scheduleTZ || 'UTC' }
}

export function scheduleToUTCWindow({ fecha, horaInicio = '08:00', horaFin = '17:00', zonaHoraria }, lat, lon) {
  const tz = resolveTimezone(lat, lon, zonaHoraria)
  const startLocal = DateTime.fromISO(`${fecha}T${horaInicio}`, { zone: tz })
  const endLocal   = DateTime.fromISO(`${fecha}T${horaFin}`,   { zone: tz })
  return { tz, startISO: startLocal.toUTC().toISO(), endISO: endLocal.toUTC().toISO(), startLocal, endLocal }
}

export async function forecastFactsForSchedule({ lat, lon, schedule, units = 'metric' }) {
  const { tz, startISO, endISO } = scheduleToUTCWindow(schedule, lat, lon)
  const raw = await getForecast({ lat, lon, units, timesteps: '1h', startTime: startISO, endTime: endISO })
  return { tz, ...summarizeForecastWindow(raw, startISO, endISO) }
}

// ===== Normalizadores =====
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
