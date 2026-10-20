/* Interprete de los mails de SLB que confirman servicios de transporte.
   Busca en el cuerpo HTML la tabla con columnas CVU / BL / Fecha / Hora Carga / Origen / Destino /
   Tipo Unidad / Proveedor / Contrato / Chofer / Patente, se queda con las filas de Dolores Parra y
   lee las lineas de abajo de la tabla del tipo "AF576JA 8hs rao - ypf ... // TR2600591149" para
   saber que numero de solicitud (TR) corresponde a cada patente.
   No crea viajes: solo devuelve los datos; el armado del viaje lo hace el panel con las reglas. */

const MESES = { ene:1, jan:1, feb:2, mar:3, abr:4, apr:4, may:5, jun:6, jul:7, ago:8, aug:8, sep:9, set:9, oct:10, nov:11, dic:12, dec:12 };

export function textoPlano(html){
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/[ \t ]+/g, ' ');
}
function celdaTexto(html){ return textoPlano(html).replace(/\s+/g, ' ').trim(); }
function norm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

/* Devuelve las tablas del HTML como arreglos de filas (cada fila = arreglo de textos de celda). */
export function tablas(html){
  const out = [];
  const reT = /<table[\s\S]*?<\/table>/gi;
  let mt;
  while((mt = reT.exec(String(html || '')))){
    const filas = [];
    const reR = /<tr[\s\S]*?<\/tr>/gi; let mr;
    while((mr = reR.exec(mt[0]))){
      const celdas = []; const reC = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi; let mc;
      while((mc = reC.exec(mr[0]))){ celdas.push(celdaTexto(mc[1])); }
      if(celdas.length) filas.push(celdas);
    }
    if(filas.length) out.push(filas);
  }
  return out;
}

const COLS = { cvu: ['cvu'], bl: ['bl'], fecha: ['fecha'], hora: ['hora carga', 'hora'], origen: ['origen'], destino: ['destino'], tipoUnidad: ['tipo unidad', 'tipo'], proveedor: ['proveedor'], contrato: ['contrato'], chofer: ['chofer', 'conductor'], patente: ['patente', 'dominio'] };

function mapearEncabezado(fila){
  const idx = {};
  fila.forEach((t, i) => {
    const n = norm(t);
    for(const k of Object.keys(COLS)){
      if(idx[k] != null) continue;
      if(COLS[k].some(c => n === c)) { idx[k] = i; return; }
    }
  });
  fila.forEach((t, i) => {
    const n = norm(t);
    for(const k of Object.keys(COLS)){
      if(idx[k] != null) continue;
      if(COLS[k].some(c => n.indexOf(c) === 0) && !Object.values(idx).includes(i)) { idx[k] = i; return; }
    }
  });
  return idx;
}

/* "20-Oct" / "20/10" / "20/10/2026" -> "2026-10-20" (el anio sale de la fecha del mail). */
export function fechaISO(txt, refIso){
  const ref = refIso ? new Date(refIso) : new Date();
  const anioRef = ref.getUTCFullYear();
  const t = norm(txt);
  let d, m, a;
  let mm = t.match(/^(\d{1,2})[\-\/ ]([a-z]{3})[a-z]*\.?(?:[\-\/ ](\d{2,4}))?$/);
  if(mm){ d = +mm[1]; m = MESES[mm[2]]; a = mm[3] ? +mm[3] : null; }
  else { mm = t.match(/^(\d{1,2})[\-\/\.](\d{1,2})(?:[\-\/\.](\d{2,4}))?$/); if(mm){ d = +mm[1]; m = +mm[2]; a = mm[3] ? +mm[3] : null; } }
  if(!d || !m) return null;
  if(a != null && a < 100) a += 2000;
  if(a == null){ a = anioRef; if(m === 1 && ref.getUTCMonth() === 11) a = anioRef + 1; }
  return a + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export function horaHHMM(txt){
  const mm = norm(txt).match(/(\d{1,2})[:\.h](\d{2})/) || norm(txt).match(/^(\d{1,2})\s*(?:hs?)?$/);
  if(!mm) return null;
  return String(+mm[1]).padStart(2, '0') + ':' + (mm[2] ? mm[2] : '00');
}
function patenteNorm(p){ return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export function parseMailSLB(html, recibidoIso){
  const filas = [];
  for(const tabla of tablas(html)){
    let enc = null, idx = null;
    for(const f of tabla){
      if(!idx){
        const m = mapearEncabezado(f);
        if(m.origen != null && m.destino != null && m.patente != null && (m.hora != null || m.fecha != null)){ idx = m; enc = f; }
        continue;
      }
      const g = k => (idx[k] != null && f[idx[k]] != null) ? f[idx[k]] : '';
      const fila = {
        cvu: g('cvu'), bl: g('bl'), fechaTxt: g('fecha'), fecha: fechaISO(g('fecha'), recibidoIso), hora: horaHHMM(g('hora')),
        origen: g('origen'), destino: g('destino'), tipoUnidad: g('tipoUnidad'), proveedor: g('proveedor'),
        contrato: g('contrato'), chofer: g('chofer'), patente: patenteNorm(g('patente'))
      };
      if(!fila.patente || !fila.origen) continue;
      if(fila.proveedor && !/dolores|parra|tdp/i.test(fila.proveedor)) continue;
      filas.push(fila);
    }
  }
  /* TR por patente, de las lineas de abajo de la tabla. */
  const trs = {};
  const texto = textoPlano(html);
  const lineas = texto.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const patentes = [...new Set(filas.map(f => f.patente))];
  for(const l of lineas){
    const tr = l.match(/\bTR\s*-?\s*(\d{6,})\b/i);
    if(!tr) continue;
    const lp = patenteNorm(l);
    for(const p of patentes){ if(lp.indexOf(p) >= 0 && !trs[p]) trs[p] = 'TR' + tr[1]; }
  }
  /* Si hay un solo TR en todo el mail y no se pudo asociar, se usa para todas las patentes. */
  const todosTR = [...new Set((texto.match(/\bTR\s*-?\s*\d{6,}\b/gi) || []).map(x => 'TR' + x.replace(/\D/g, '')))];
  if(todosTR.length === 1) patentes.forEach(p => { if(!trs[p]) trs[p] = todosTR[0]; });
  return { filas, trs };
}
