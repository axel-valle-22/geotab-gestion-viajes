// Actualiza la copia de datos del Portal SIG de la Subsecretaria de Hidrocarburos de Neuquen
// (pozos, locaciones e instalaciones) que usa el buscador del selector de sitios de Gestion de Viajes.
// Lo corre la tarea programada .github/workflows/actualizar-sig-nqn.yml (una vez por mes).
// Genera datos-nqn/nqn-locaciones.json, nqn-pozos.json y nqn-instalaciones.json con el mismo
// formato compacto que lee GV.NQN (common.js).
//
// Uso: node scripts/actualizar-sig-nqn.mjs [carpeta-con-geojson-de-prueba]
//  - sin argumento descarga los datos del GeoServer de la provincia.
//  - con una carpeta, lee locaciones.geojson / pozos.geojson / instalaciones.geojson de ahi (para probar).
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'datos-nqn');
const WFS = 'https://hidrocarburos.energianeuquen.gob.ar/geoserver/Hidrocarburos/ows';
const FUENTE = 'Subsecretaria de Hidrocarburos de Neuquen - Portal SIG (datos publicos)';

async function descargar(capa, props) {
  const u = WFS + '?service=WFS&version=1.0.0&request=GetFeature&typeName=Hidrocarburos:' + capa +
    '&outputFormat=application/json&srsName=EPSG:4326&propertyName=' + props;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'TDP-GestionViajes/1.0 (actualizacion mensual)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.features)) throw new Error('respuesta sin features');
      console.log(capa + ': ' + j.features.length + ' registros');
      return j;
    } catch (e) {
      console.log(capa + ': intento ' + intento + ' fallo (' + e.message + ')');
      if (intento === 3) throw e;
      await new Promise(res => setTimeout(res, 15000));
    }
  }
}

// ---- utilidades geometricas (iguales a las usadas para la primera copia) ----
function enc(pts) {
  let o = '', pl = 0, pg = 0;
  const e = v => { v = v < 0 ? ~(v << 1) : (v << 1); let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const p of pts) { const la = Math.round(p[0] * 1e5), ln = Math.round(p[1] * 1e5); o += e(la - pl) + e(ln - pg); pl = la; pg = ln; }
  return o;
}
function dp(arr, tol) {
  if (arr.length < 3) return arr;
  const a = arr[0], b = arr[arr.length - 1]; let idx = -1, mx = 0;
  const dx = b[1] - a[1], dy = b[0] - a[0], L = Math.hypot(dx, dy) || 1e-12;
  for (let i = 1; i < arr.length - 1; i++) { const d = Math.abs(dy * arr[i][1] - dx * arr[i][0] + b[1] * a[0] - b[0] * a[1]) / L; if (d > mx) { mx = d; idx = i; } }
  if (mx <= tol) return [a, b];
  return dp(arr.slice(0, idx + 1), tol).slice(0, -1).concat(dp(arr.slice(idx), tol));
}
function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; s += r[i][0] * r[j][1] - r[j][0] * r[i][1]; } return Math.abs(s / 2); }
function pip(pt, r) { const x = pt[1], y = pt[0]; let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][1], yi = r[i][0], xj = r[j][1], yj = r[j][0]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
function dict() { const m = new Map(), a = []; return { i(s) { s = (s == null ? '' : String(s)).trim(); if (!m.has(s)) { m.set(s, a.length); a.push(s); } return m.get(s); }, a }; }

async function main() {
  const dirPrueba = process.argv[2];
  let loc, poz, ins;
  if (dirPrueba) {
    const rd = f => JSON.parse(fs.readFileSync(path.join(dirPrueba, f), 'utf8'));
    loc = rd('locaciones.geojson'); poz = rd('pozos.geojson'); ins = rd('instalaciones.geojson');
  } else {
    loc = await descargar('Locaciones', 'LOC_NOMBRE,LOC_TIPO,LOC_ESTADO,LOC_AGRUPA,SHAPE');
    poz = await descargar('Pozos', 'WELL_NAME,WELL_S_NAME,YACIMIENTO,AREA_LEGAL,OPERADOR,ESTADO_GIS,SHAPE');
    ins = await descargar('Instalaciones', 'NOMBRE,INSTALACIO,TIPO_INST,AREA,OPERADOR_I,Shape');
  }

  // Locaciones: contorno exterior del poligono mas grande, simplificado (~2 m, maximo 40 vertices).
  const T = dict(), LOC = [], grid = new Map();
  for (const f of loc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    let best = null, ba = -1;
    for (const p of polys) { const r = p[0].map(c => [c[1], c[0]]); const ar = ringArea(r); if (ar > ba) { ba = ar; best = r; } }
    if (!best || best.length < 3) continue;
    if (best.length > 3 && best[0][0] === best[best.length - 1][0] && best[0][1] === best[best.length - 1][1]) best = best.slice(0, -1);
    let tol = 0.00002, s = dp(best.concat([best[0]]), tol).slice(0, -1);
    if (s.length < 3) s = best;
    while (s.length > 40) { tol *= 2; s = dp(best.concat([best[0]]), tol).slice(0, -1); }
    const p = f.properties || {}, idx = LOC.length;
    LOC.push([String(p.LOC_NOMBRE || '').trim(), T.i(p.LOC_TIPO), enc(s)]);
    const la = s.map(q => q[0]), lo = s.map(q => q[1]);
    for (let gx = Math.floor(Math.min(...la) * 100); gx <= Math.floor(Math.max(...la) * 100); gx++)
      for (let gy = Math.floor(Math.min(...lo) * 100); gy <= Math.floor(Math.max(...lo) * 100); gy++) {
        const k = gx + '_' + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([idx, s]);
      }
  }
  const locDe = (lat, lng) => { for (const c of (grid.get(Math.floor(lat * 100) + '_' + Math.floor(lng * 100)) || [])) if (pip([lat, lng], c[1])) return c[0]; return -1; };

  // Pozos: punto + locacion que lo contiene (-1 si ninguna).
  const Y = dict(), A = dict(), O = dict(), E = dict(), POZ = [];
  for (const f of poz.features) {
    if (!f.geometry) continue;
    const c = f.geometry.coordinates, lat = c[1], lng = c[0], p = f.properties || {};
    POZ.push([String(p.WELL_NAME || '').trim(), Y.i(p.YACIMIENTO), A.i(p.AREA_LEGAL), O.i(p.OPERADOR), E.i(p.ESTADO_GIS), Math.round(lat * 1e5), Math.round(lng * 1e5), locDe(lat, lng)]);
  }
  // Instalaciones: punto + locacion que la contiene.
  const A2 = dict(), O2 = dict(), TI = dict(), INS = [];
  for (const f of ins.features) {
    if (!f.geometry) continue;
    let c = f.geometry.coordinates; if (f.geometry.type !== 'Point') c = c[0];
    const p = f.properties || {}, lat = c[1], lng = c[0];
    INS.push([String(p.NOMBRE || p.INSTALACIO || '').trim(), TI.i(p.TIPO_INST), A2.i(p.AREA), O2.i(p.OPERADOR_I), Math.round(lat * 1e5), Math.round(lng * 1e5), locDe(lat, lng)]);
  }

  // Control: si la descarga vino incompleta (menos del 80% de lo que ya habia), no se pisa la copia.
  const prev = f => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch (e) { return null; } };
  const pL = prev('nqn-locaciones.json'), pP = prev('nqn-pozos.json'), pI = prev('nqn-instalaciones.json');
  const chk = (nombre, nuevo, viejo) => { if (viejo && nuevo < viejo * 0.8) throw new Error(nombre + ': vinieron ' + nuevo + ' registros y la copia actual tiene ' + viejo + '. Se cancela para no perder datos.'); };
  chk('Locaciones', LOC.length, pL && pL.L.length);
  chk('Pozos', POZ.length, pP && pP.P.length);
  chk('Instalaciones', INS.length, pI && pI.I.length);

  const v = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'nqn-locaciones.json'), JSON.stringify({ v, fuente: FUENTE, tipos: T.a, L: LOC }));
  fs.writeFileSync(path.join(OUT, 'nqn-pozos.json'), JSON.stringify({ v, fuente: FUENTE, yac: Y.a, areas: A.a, ops: O.a, est: E.a, P: POZ }));
  fs.writeFileSync(path.join(OUT, 'nqn-instalaciones.json'), JSON.stringify({ v, fuente: FUENTE, tipos: TI.a, areas: A2.a, ops: O2.a, I: INS }));
  console.log('Listo: ' + LOC.length + ' locaciones, ' + POZ.length + ' pozos (' + POZ.filter(r => r[7] >= 0).length + ' dentro de una locacion), ' + INS.length + ' instalaciones.');
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
