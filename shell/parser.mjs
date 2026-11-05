/* Interprete de los mails de SHELL ("Recorrido DD.MM.YYYY") de la carpeta Shell de Outlook.
   Formato (abril-noviembre 2026): texto + tabla con columnas WH UTE / Fecha Requerida / Desde / Hasta / Numero de PO /
   Vendor / Direccion / Horario de atencion / Persona de contacto / Detalle / Cantidad de bultos / Peso Aprox / Medidas.
   - Desde = "Vendor" y Hasta = "WH SB" / "WH BAN": se RETIRA en el proveedor y se DESCARGA en ese deposito.
   - Desde = "WH SB" y Hasta = "Vendor": se CARGA en el deposito y se ENTREGA en el proveedor (ej. material a inspeccionar).
   - En el texto: "debe estar en el primer punto a las 08:00hs" o "que la unidad se encuentre manana 08:30 en el WH SB"
     (hora de llegada al primer punto) y a veces el orden de descarga: "Primer destino: WH BAN, segundo destino: WH SB".
   - Las respuestas (RE:) pueden traer la tabla completa con un proveedor agregado ("sumar al itinerario ... Faro") o solo
     el orden de descarga. Solo se lee la parte NUEVA del mail (lo citado abajo de "De: ..." no). */

export function textoPlano(html){
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, '\u00e1').replace(/&eacute;/gi, '\u00e9').replace(/&iacute;/gi, '\u00ed').replace(/&oacute;/gi, '\u00f3').replace(/&uacute;/gi, '\u00fa').replace(/&ntilde;/gi, '\u00f1').replace(/&Ntilde;/g, '\u00d1')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/[ \t\u00a0]+/g, ' ');
}
function celda(html){ return textoPlano(html).replace(/\s+/g, ' ').trim(); }
export function norm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }

/* Parte nueva del mail: todo lo anterior al primer encabezado de mail citado ("De: / Enviado el:" o "From:"). */
export function parteNueva(html){
  const h = String(html || '');
  const marcas = [/<b>\s*De:\s*<\/b>/i, /<b>\s*From:\s*<\/b>/i, /-----\s*Original Message/i, /-----\s*Mensaje original/i, /<div[^>]*id="?divRplyFwdMsg/i, /<div[^>]*border-top:\s*solid #E1E1E1/i];
  let corte = h.length;
  for(const re of marcas){ const m = re.exec(h); if(m && m.index < corte) corte = m.index; }
  return h.slice(0, corte);
}

export function tablas(html){
  const out = [];
  const reT = /<table[\s\S]*?<\/table>/gi; let mt;
  while((mt = reT.exec(String(html || '')))){
    const filas = []; const reR = /<tr[\s\S]*?<\/tr>/gi; let mr;
    while((mr = reR.exec(mt[0]))){
      const celdas = []; const reC = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi; let mc;
      while((mc = reC.exec(mr[0]))) celdas.push(celda(mc[1]));
      if(celdas.length) filas.push(celdas);
    }
    if(filas.length) out.push(filas);
  }
  return out;
}

const COLS = {
  wh: ['wh ute', 'wh'], fecha: ['fecha requerida', 'fecha'], desde: ['desde'], hasta: ['hasta'], po: ['numero de po', 'nro de po', 'po'],
  vendor: ['vendor', 'proveedor'], direccion: ['direccion', 'domicilio'], horario: ['horario de atencion', 'horario'],
  contacto: ['persona de contacto', 'contacto'], detalle: ['detalle'], bultos: ['cantidad de bultos', 'bultos'], peso: ['peso aprox', 'peso'], medidas: ['medidas']
};
function mapear(fila){
  const idx = {};
  fila.forEach((t, i) => { const n = norm(t); for(const k of Object.keys(COLS)){ if(idx[k] == null && COLS[k].some(c => n === c)){ idx[k] = i; return; } } });
  fila.forEach((t, i) => { const n = norm(t); if(Object.values(idx).includes(i)) return; for(const k of Object.keys(COLS)){ if(idx[k] == null && COLS[k].some(c => c.length > 3 && n.indexOf(c) === 0)){ idx[k] = i; return; } } });
  return idx;
}

/* "WH SB", "WH Sierras Blancas" -> "SB"; "WH BAN", "WH Bajada de Anelo", "Bajo Anelo" -> "BAN"; otra cosa -> null */
export function codigoWH(txt){
  const n = norm(txt).replace(/[:.]/g, ' ');
  if(/sierra|\bsb\b|\bsbl\b/.test(n)) return 'SB';
  if(/\bban\b|a[n\u00f1]elo|bajada|bajo/.test(n)) return 'BAN';
  return null;
}

/* "4/11/2026", "04.11.2026", "06-05-2026" -> "2026-11-04" */
export function fechaISO(txt){
  const m = String(txt || '').match(/\b(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})\b/);
  if(!m) return null;
  let d = +m[1], mo = +m[2], a = +m[3]; if(a < 100) a += 2000;
  if(mo > 12 && d <= 12){ const x = d; d = mo; mo = x; }
  if(!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return null;
  return a + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/* Orden de las descargas en los depositos: "Primer destino: WH BAN, segundo destino: WH: Sierras Blancas" -> ['BAN','SB'] */
export function ordenWH(texto){
  const t = String(texto || '');
  const p = t.match(/primer\s+destino\s*:?\s*([^,.;\n]+)/i);
  if(!p) return null;
  const a = codigoWH(p[1]);
  const s = t.match(/segundo\s+destino\s*:?\s*([^,.;\n]+)/i);
  let b = s ? codigoWH(s[1]) : null;
  if(!a) return null;
  if(!b || b === a) b = a === 'SB' ? 'BAN' : 'SB';
  return [a, b];
}

/* Hora a la que la unidad tiene que estar en el primer punto (del texto, sin las tablas: ahi estan los horarios de atencion). */
export function horaPrimerPunto(texto){
  /* "08:00", "8:30hs", "08.30 hs" (con punto solo si dice hs: "04.11.2026" es una fecha) */
  const m = String(texto || '').match(/(?:^|[^\d.\/])([01]?\d|2[0-3])(?::([0-5]\d)|\.([0-5]\d)(?=\s*h))/i);
  if(!m) return null;
  return String(m[1]).padStart(2, '0') + ':' + (m[2] || m[3]);
}

export function parseMailShell(html, recibidoIso, asunto){
  const nuevo = parteNueva(html);
  const sinTablas = textoPlano(nuevo.replace(/<table[\s\S]*?<\/table>/gi, ' '));
  const res = { filas: [], fecha: null, hora: horaPrimerPunto(sinTablas), ordenWH: ordenWH(sinTablas), texto: sinTablas.replace(/\s+/g, ' ').trim().slice(0, 600) };
  for(const tb of tablas(nuevo)){
    const hi = tb.findIndex(f => { const n = f.map(norm); return n.includes('desde') && n.includes('hasta') && n.some(x => x === 'vendor' || x === 'proveedor'); });
    if(hi < 0) continue;
    const idx = mapear(tb[hi]);
    const val = (f, k) => (idx[k] != null && f[idx[k]] != null) ? String(f[idx[k]]).trim() : '';
    for(const f of tb.slice(hi + 1)){
      const desde = val(f, 'desde'), hasta = val(f, 'hasta'), vendor = val(f, 'vendor');
      if(!desde && !hasta && !vendor) continue;
      if(!vendor && !codigoWH(desde) && !codigoWH(hasta)) continue;
      res.filas.push({
        wh: val(f, 'wh'), fecha: fechaISO(val(f, 'fecha')), desde, hasta, po: val(f, 'po'), vendor, direccion: val(f, 'direccion'),
        horario: val(f, 'horario'), contacto: val(f, 'contacto'), detalle: val(f, 'detalle'), bultos: val(f, 'bultos'), peso: val(f, 'peso'), medidas: val(f, 'medidas')
      });
    }
  }
  /* fecha del servicio: la columna Fecha Requerida; si no, la del asunto ("Recorrido 04.11.2026"); si no, la del texto */
  const fCol = res.filas.map(f => f.fecha).filter(Boolean).sort()[0];
  res.fecha = fCol || fechaISO(asunto) || fechaISO(sinTablas) || null;
  res.filas.forEach(f => { if(!f.fecha) f.fecha = res.fecha; });
  return res;
}
