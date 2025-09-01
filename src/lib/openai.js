
import OpenAI from 'openai'

// Export for other files
export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada')
  return new OpenAI({ apiKey })
}

export async function extractScheduleFromMessage(message, company) {
  const openai = getOpenAI()
  const system = `Eres un asistente que extrae información de horario de mensajes en español para operaciones en campo.
Devuelve SOLO un JSON con este esquema: { "actividad": string, "fecha": "YYYY-MM-DD", "horaInicio": "HH:mm", "horaFin": "HH:mm", "zonaHoraria": string|null }.
- Si falta alguno, infiérelo razonablemente o deja null.
- Usa formato de 24 horas.
- Si el usuario no especifica actividad, asume la actividad principal de la empresa: ${company?.activity ?? 'actividad'}.`
  const user = `Mensaje del usuario: """${message}"""`
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  })
  const content = resp.choices?.[0]?.message?.content || '{}'
  try {
    return JSON.parse(content)
  } catch {
    return { actividad: company?.activity ?? null, fecha: null, horaInicio: null, horaFin: null, zonaHoraria: null }
  }
}

export async function generateCompanyRecommendations({ company, schedule, weatherFacts }) {
  const openai = getOpenAI()
  const prompt = [
    { role: 'system', content: `Eres SkyCare, un asistente de seguridad operativa para empresas que trabajan a la intemperie. 
Respondes en español con recomendaciones claras, priorizadas y accionables. Siempre incluye:
- Riesgos principales (calor, tormentas, viento, rayos UV, lluvia, visibilidad, frío, etc.)
- Medidas preventivas (PPE/EPP, pausas, hidratación, resguardo, reprogramación)
- Umbrales y triggers (por ejemplo: "si rachas > 45 km/h suspender izaje")
- Checklist breve (4–6 ítems)
- Nivel de riesgo (Bajo/Medio/Alto) y justificación
Personaliza la respuesta a la actividad de la empresa y al horario indicado.` },
    { role: 'user', content: `Empresa: ${company.name} (${company.activity})
Ubicación: ${company.address} [${company.lat}, ${company.lon}]
Horario: ${schedule.fecha} de ${schedule.horaInicio} a ${schedule.horaFin} (TZ: ${schedule.zonaHoraria || 'local'})
Datos meteorológicos (resumen JSON): ${JSON.stringify(weatherFacts)}

No des las respuestas con caracteres especiales ni asteriscos, para que la respuestas sea más clara y estetica.


Redacta recomendaciones.` }
  ]
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: prompt
  })
  return resp.choices?.[0]?.message?.content?.trim() || 'No se pudo generar recomendaciones.'
}
