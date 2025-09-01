
export function quickRules(rec) {
  const out = []
  const t = Number(rec.temperatura ?? 0)
  const uv = Number(rec.uv ?? 0)
  const wind = Number(rec.viento ?? 0)
  const rain = Number(rec.precipitacion ?? 0)

  if (t >= 35) {
    out.push('🔥 Alerta por calor extremo: reprogramar turnos físicos al amanecer o tarde; priorizar tareas bajo techo; monitorear signos de golpe de calor.')
  } else if (t >= 30) {
    out.push('🌡️ Calor moderado: aumentar pausas, habilitar puntos de hidratación cercanos, rotar al personal en exteriores.')
  } else if (t <= 5) {
    out.push('🥶 Frío severo: reducir exposición en exteriores, implementar pausas activas, garantizar ropa térmica certificada.')
  }

  // Radiación UV
  if (uv >= 6) {
    out.push('☀️ UV alto: restringir tareas expuestas prolongadas (soldaduras, techos, navegación); dotar de EPP adecuados; trabajar en sombra o bajo toldos.')
  }

  // Viento (transformado a km/h)
  const windKmh = wind * 3.6
  if (windKmh >= 60) {
    out.push('🛑 Viento muy fuerte (>60 km/h): suspender TODA operación con grúas, izajes o en altura. Replegar personal y asegurar maquinaria.')
  } else if (windKmh >= 45) {
    out.push('💨 Viento fuerte: prohibir izajes; usar líneas de vida; asegurar estructuras temporales; revisar amarres.')
  } else if (windKmh >= 30) {
    out.push('🌬️ Viento moderado: supervisión reforzada en tareas con herramientas manuales o andamios; revisar toldos y señalización.')
  }

  // Lluvia
  if (rain >= 30) {
    out.push('⛈️ Lluvia intensa: postergar trabajos de excavación, electricidad o soldadura. Proveer iluminación y zonas de resguardo.')
  } else if (rain > 0) {
    out.push('🌧️ Lluvia ligera: extremar precaución por superficies resbaladizas; uso obligatorio de calzado antiderrapante; revisar sistemas de drenaje.')
  }

  // Si todo está dentro de condiciones seguras
  if (!out.length) {
    out.push('✅ Condiciones normales: aplicar rutina estándar de seguridad, monitoreo continuo y chequeo de clima cada 3 horas.')
  }

  return out
}
