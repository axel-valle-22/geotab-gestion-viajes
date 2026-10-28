/* ===================================================================
 * Gestion de Viajes DP - Modulo comun
 * Compartido por el panel del coordinador (index.html) y el add-in
 * del chofer para MyGeotab Drive (chofer.html).
 * Provee: CSS compartido, mapas (Leaflet/OpenStreetMap), geocoding,
 * selector de ubicacion en mapa, y almacenamiento compartido via
 * AddInData de Geotab (con respaldo en localStorage).
 * =================================================================== */
window.GV = window.GV || {};
(function(GV){
'use strict';

var LS_KEY = 'gv_dp_viajes_v2';

/* ---------------- Utilidades basicas ---------------- */
GV.genId = function(p){ return (p||'v') + Date.now() + Math.random().toString(36).substr(2,6); };

GV.fmtDate = function(d){
  if(!d) return '';
  var dt = d instanceof Date ? d : new Date(d);
  if(isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('es-AR') + ' ' + dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false});
};

GV.dateStr = function(d){
var dt = d instanceof Date ? d : new Date(d);
if(isNaN(dt.getTime())) return '';
return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
};

/* Inversa de GV.dateStr: arma una fecha LOCAL (no UTC) a partir de un string 'YYYY-MM-DD', con la
   hora que se le pida (0:00 por defecto). OJO: new Date('YYYY-MM-DD') sin hora lo interpreta el
   navegador como medianoche UTC, lo que en Argentina (UTC-3) cae en el DIA ANTERIOR a las 21:00 --
   por eso hace falta esta funcion en vez de parsear el string directo, para todo lo que necesite
   "medianoche local de tal dia" o "las 8 de la mañana de tal dia". */
GV.dateFromDateStr = function(str, hour, min, sec){
  var p = String(str).split('-');
  return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10), hour||0, min||0, sec||0, 0);
};

GV.statusLabel = function(s){
  return {planificado:'Planificado',en_curso:'En Curso',completado:'Completado',demorado:'Demorado',cancelado:'Cancelado'}[s] || s;
};

/* Ajuste 15/10: duracion en horas y minutos (se sigue guardando en minutos). 90 -> "1 h 30 min". */
GV.fmtMin = function(m){ m = Math.round(Number(m) || 0); if(m < 60) return m + ' min'; var h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : ''); };
GV.tipoParadaLabel = function(t){ if(t === 'espera') return 'Espera (permanece cargado)'; if(t === 'opera') return 'Opera'; return t === 'descarga' ? 'Descarga' : (t === 'ambos' ? 'Carga y Descarga' : 'Carga'); };

GV.fmtRuta = function(origenTxt, destinoTxt){
  if(destinoTxt) return GV.escapeHtml(origenTxt) + ' &rarr; ' + GV.escapeHtml(destinoTxt);
  return GV.escapeHtml(origenTxt) + ' <span style="color:#9ca3af;font-style:italic">(sin destino programado)</span>';
};

GV.distKm = function(a,b){
  if(!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return null;
  var R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  var la1=a.lat*Math.PI/180, la2=b.lat*Math.PI/180;
  var h = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
};

GV.escapeHtml = function(s){
  return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
};

GV.fmtDurMin = function(ms){ if(ms == null || isNaN(ms) || ms < 0) return '0min'; var totalMin = Math.floor(ms/60000); var h = Math.floor(totalMin/60), m = totalMin%60; return h > 0 ? (h + 'h ' + m + 'min') : (m + 'min'); }; GV.SITE_GEOFENCE_M = 300; /* Radio (en metros) del circulo automatico de deteccion de sitios. Duplicado desde el valor original (150m). */
/* Punto dentro de un poligono (ray casting). poly: array de {lat,lng} (o [lat,lng]). pt: {lat,lng}. */
GV.pointInPolygon = function(pt, poly){
  if(!pt || !poly || poly.length < 3) return false;
  var x = pt.lng, y = pt.lat, inside = false;
  for(var i = 0, j = poly.length - 1; i < poly.length; j = i++){
    var pi = poly[i], pj = poly[j];
    var xi = (pi.lng != null ? pi.lng : pi[1]), yi = (pi.lat != null ? pi.lat : pi[0]);
    var xj = (pj.lng != null ? pj.lng : pj[1]), yj = (pj.lat != null ? pj.lat : pj[0]);
    var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
};
/* Determina si un punto esta dentro de un sitio: usa el poligono dibujado a mano si existe,
   o el circulo automatico (GV.SITE_GEOFENCE_M) en caso contrario. siteLike: {lat,lng,poligono?}. */
/* 20/10: geocerca efectiva de un sitio de un viaje. Si el sitio del viaje no tiene poligono propio pero esta en
   el mismo lugar (a 30 m o menos) que un sitio GUARDADO que tiene la geocerca dibujada a mano, se usa la del sitio
   guardado. Asi todos los viajes (los ya cargados y los futuros) toman la geocerca dibujada (ej. RAO SLB) en lugar
   del circulo por defecto, y si despues se redibuja en el sitio guardado, los viajes la siguen solos. */
GV.__poliCache = { t: 0, n: -1, m: {} };
GV.poligonoDeSitio = function(siteLike){
  if(!siteLike || typeof siteLike.lat !== 'number') return null;
  if(siteLike.poligono && siteLike.poligono.length >= 3) return siteLike.poligono;
  var sitios = (GV.Storage && GV.Storage.getSitios) ? (GV.Storage.getSitios() || []) : [];
  if(!Array.isArray(sitios)) sitios = Object.values(sitios);
  var C = GV.__poliCache, ahora = Date.now();
  if(ahora - C.t > 30000 || C.n !== sitios.length){ C.t = ahora; C.n = sitios.length; C.m = {}; }
  var k = siteLike.lat.toFixed(5) + ',' + siteLike.lng.toFixed(5);
  if(Object.prototype.hasOwnProperty.call(C.m, k)) return C.m[k];
  var best = null, bestD = null;
  sitios.forEach(function(s){
    if(!s || typeof s.lat !== 'number' || !s.poligono || s.poligono.length < 3) return;
    var d = GV.distKm(siteLike, s);
    if(d != null && d * 1000 <= 30 && (bestD == null || d < bestD)){ bestD = d; best = s.poligono; }
  });
  C.m[k] = best;
  return best;
};
GV.isWithinSite = function(pt, siteLike){
  if(!pt || !siteLike || typeof siteLike.lat !== 'number') return false;
  var __pg = GV.poligonoDeSitio(siteLike);
  if(__pg) return GV.pointInPolygon(pt, __pg);
  var d = GV.distKm(pt, siteLike);
  return d != null && d*1000 <= GV.SITE_GEOFENCE_M;
};
/* --- Sitios cercanos: radio efectivo y desambiguacion -----------------------------------------
   Dos sitios de un mismo viaje pueden quedar mas cerca que el diametro del circulo automatico de
   deteccion (300 m). En ese caso las geocercas se superponen, una misma posicion GPS cae "dentro"
   de los dos sitios y los ingresos/egresos se cruzan entre uno y otro. Para evitarlo se recorta el
   radio de cada sitio a la mitad de la distancia al sitio hermano mas cercano (menos un margen),
   con un piso de GV.SITE_MIN_RADIUS_M, y se elige siempre UN solo sitio (el mas "adentro"). */
GV.SITE_MIN_RADIUS_M = 80;
GV.SITE_NEAR_WARN_M = 600;
GV.SITE_EXIT_HYSTERESIS_M = 50;
GV.MIN_DWELL_MIN = 3;

/* ---------------- Jornada del chofer: constantes ----------------
   Usadas para calcular, de forma automatica, a que hora arranco REALMENTE la jornada de un
   chofer -- no la hora en la que Coordinacion cargo el viaje en el sistema, que puede ser bastante
   despues (o directamente un dia entero despues si se olvidaron). Ver detectarInicioJornada() en
   index.html. */
GV.MIN_MOTOR_SOSTENIDO_MIN = 10; /* minutos que el motor tiene que quedar prendido sin apagarse para
   contarlo como inicio real de jornada, y no como un encendido breve de rutina (calentar la
   cabina, cargar bateria, etc. mientras la unidad pernocta en el campo). Valor de arranque, sin
   calibrar todavia contra casos reales de esta flota -- conviene revisarlo despues de ver un par
   de semanas de datos y ajustarlo si hace falta. */
GV.HORA_JORNADA_DEFECTO = 8; /* hora (0-23) que se usa como ultimo recurso cuando ni el movimiento
   sostenido ni el motor sostenido permiten detectar un inicio real (por ejemplo, sin historial
   disponible todavia para ese dispositivo). Se marca SIEMPRE como estimado/sin confirmar -- nunca
   se muestra como si fuera un horario medido de verdad. */
GV.HS_CHOFER_ALERTA_MIN = 12 * 60; /* umbral en minutos para la alerta de "chofer lleva mas de 12
   horas en servicio". */
GV.siteBaseRadiusM = function(loc){
  var r = loc ? (typeof loc.radioM === "number" ? loc.radioM : null) : null;
  return (r != null && r > 0) ? r : GV.SITE_GEOFENCE_M;
};
GV.effectiveRadiusM = function(loc, others){
  var base = GV.siteBaseRadiusM(loc);
  if(!loc || typeof loc.lat !== "number") return base;
  var eff = base;
  (others||[]).forEach(function(o){
    if(!o || typeof o.lat !== "number") return;
    if(o === loc) return;
    if(o.id != null && loc.id != null && o.id === loc.id) return;
    var d = GV.distKm(loc, o);
    if(d == null) return;
    var m = d*1000;
    if(m <= 5) return;
    var lim = m/2 - 25;
    if(lim < eff) eff = lim;
  });
  if(eff < GV.SITE_MIN_RADIUS_M) eff = GV.SITE_MIN_RADIUS_M;
  if(eff > base) eff = base;
  return Math.round(eff);
};
GV.isWithinSiteEx = function(pt, siteLike, others, extraM){
  if(!pt || !siteLike || typeof siteLike.lat !== "number") return false;
  var __pg = GV.poligonoDeSitio(siteLike);
  if(__pg) return GV.pointInPolygon(pt, __pg);
  var d = GV.distKm(pt, siteLike);
  return d != null && d*1000 <= GV.effectiveRadiusM(siteLike, others) + (extraM || 0);
};
/* Pares de sitios de un mismo viaje demasiado cerca entre si (para avisarle al coordinador). */
GV.sitiosCercanos = function(sites){
  var out = [], list = sites || [];
  list.forEach(function(a, i){
    list.forEach(function(b, j){
      if(j <= i) return;
      if(!a || !b || typeof a.lat !== "number" || typeof b.lat !== "number") return;
      var d = GV.distKm(a, b);
      if(d == null) return;
      var m = d*1000;
      if(m > 5 && m < GV.SITE_NEAR_WARN_M) out.push({ a: a, b: b, metros: Math.round(m) });
    });
  });
  return out;
};
/* Devuelve a que sitio del viaje corresponde una posicion GPS (o null). Reglas, en orden:
   1) el poligono dibujado a mano gana sobre el circulo automatico;
   2) si ya hay una permanencia abierta en un sitio candidato, se queda en ese (con histeresis de
      salida) para no rebotar entre dos sitios vecinos;
   3) entre los candidatos se prefieren los que todavia no fueron completados (sin egreso);
   4) desempate por el mas "adentro" (distancia / radio) y, si empatan, por orden de itinerario. */
GV.pickSiteAt = function(pt, sites, opts){
  opts = opts || {};
  var cands = [];
  (sites||[]).forEach(function(s, idx){
    if(!s || typeof s.lat !== "number") return;
    var __pgS = GV.poligonoDeSitio(s);
    var poly = !!__pgS;
    var extra = (opts.stickyId && opts.stickyId === s.id) ? GV.SITE_EXIT_HYSTERESIS_M : 0;
    var rEff = GV.effectiveRadiusM(s, sites);
    var dKm = GV.distKm(pt, s);
    var dM = (dKm == null) ? null : dKm*1000;
    var dentro = poly ? GV.pointInPolygon(pt, __pgS) : (dM != null && dM <= rEff + extra);
    if(!dentro) return;
    cands.push({ site: s, idx: idx, poly: poly, norm: (poly || dM == null) ? 0 : (dM/Math.max(rEff, 1)), done: !!(opts.doneIds && opts.doneIds.indexOf(s.id) >= 0) });
  });
  if(!cands.length) return null;
  /* 20/10: sitio repetido en el recorrido (ej. carga en Solalique ... descarga final en Solalique). La segunda
     aparicion no cuenta mientras haya puntos intermedios pendientes (sin ingreso): la unidad esta en la primera. */
  if(opts.sitiosReal){
    var __vis = function(id){ var x = opts.sitiosReal[id]; return !!(x && (x.ingreso || x.egreso)); };
    cands = cands.filter(function(c){
      if(String(c.site.id || '').indexOf('parada') !== 0) return true;
      for(var j = 0; j < c.idx; j++){
        var sj = sites[j]; if(!sj || typeof sj.lat !== 'number') continue;
        var dj = GV.distKm(sj, c.site);
        var igual = cands.some(function(o){ return o.idx === j; }) || (dj != null && dj * 1000 <= 300);
        if(!igual) continue;
        for(var m = j + 1; m < c.idx; m++){ var sm = sites[m]; if(sm && !__vis(sm.id)) return false; }
      }
      return true;
    });
    if(!cands.length) return null;
  }
  var conPoly = cands.filter(function(x){ return x.poly; });
  if(conPoly.length) cands = conPoly;
  if(opts.stickyId){
    var st = cands.filter(function(x){ return x.site.id === opts.stickyId; })[0];
    if(st) return st.site;
  }
  var pend = cands.filter(function(x){ return !x.done; });
  /* 20/10: si todos los sitios donde esta la unidad ya estan terminados (con egreso), no se vuelve a "abrir" ninguno:
     antes se tomaba igual uno terminado y se pisaba su ingreso real (ej. volver a pasar por Solalique a la tarde
     cambiaba el ingreso de la manana). Con sitios repetidos, la segunda pasada tiene su propio punto pendiente. */
  if(!pend.length) return null;
  /* 23/10: sitio repetido (ej. HASA AÑELO en los puntos 1, 3, 5 y 7). Si ya hay puntos POSTERIORES visitados,
     la unidad esta en la aparicion que sigue a lo ultimo visitado, no en la primera pendiente (que quedo sin
     registrar). Bug real: M349 Brandt, el ingreso del 21/10 07:44 se cargo en el punto 1 en vez del 3. */
  if(opts.sitiosReal && pend.length > 1){
    var __ultVis = -1;
    (sites || []).forEach(function(sx, ix){ var x = sx && opts.sitiosReal[sx.id]; if(x && (x.ingreso || x.egreso) && String(sx.id || '').indexOf('parada') === 0) __ultVis = Math.max(__ultVis, ix); });
    var __despues = pend.filter(function(c){ return c.idx > __ultVis; });
    if(__despues.length) pend = __despues;
  }
  var pool = pend;
  pool.sort(function(a, b){
    if(Math.abs(a.norm - b.norm) > 0.05) return a.norm - b.norm;
    return a.idx - b.idx;
  });
  return pool[0].site;
};
GV.siteNameFor = function(loc){ if(!loc || typeof loc.lat !== 'number') return (loc && loc.direccion) || ''; var sitios = (GV.Storage && GV.Storage.getSitios) ? GV.Storage.getSitios() : []; var best = null, bestD = null; sitios.forEach(function(s){ var d = GV.distKm({lat:loc.lat,lng:loc.lng},{lat:s.lat,lng:s.lng}); var within = GV.isWithinSite({lat:loc.lat,lng:loc.lng}, s) || (d !== null && d * 1000 <= 30); if(within){ if(bestD == null || d < bestD){ bestD = d; best = s; } } }); if(best && best.nombre) return best.nombre; return loc.direccion || ''; }; /* ---------------- CSS compartido ---------------- */
GV.CSS = ""
+ "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');"
+ ':root{--gv-accent:#00A6E0;--gv-accent-rgb:0,166,224;--gv-accent-dark:#0078A1;--gv-accent-darker:#005674;--gv-accent-light:#E3F5FB;--gv-page-bg:#F4F5F8;--gv-border:#ECEDF2;--gv-shadow:0 2px 10px rgba(17,24,39,.06),0 1px 2px rgba(17,24,39,.05);--gv-shadow-md:0 10px 28px rgba(17,24,39,.10);--gv-radius:14px;--gv-radius-lg:18px;--gv-radius-pill:999px}'
+ 'body{background:var(--gv-page-bg);font-family:"Poppins",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
+ '#gv-app{font-family:"Poppins",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:none;width:100%;box-sizing:border-box;margin:0 auto;padding:16px 28px;color:#20232B;background:var(--gv-page-bg)}'
+ '#gv-header-row{display:flex;gap:18px;margin-bottom:18px;align-items:flex-start;flex-wrap:wrap}'
  + '#gv-header{background:#fff;color:#20232B;padding:20px 24px;border-radius:var(--gv-radius-lg);margin-bottom:18px;box-shadow:var(--gv-shadow);border:1px solid var(--gv-border)}'
  + '#gv-header-row #gv-header{margin-bottom:0;flex:0 0 calc(50% - 9px);width:calc(50% - 9px);box-sizing:border-box}'
        + '.gv-events-col{flex:0 0 calc(50% - 9px);width:calc(50% - 9px);position:relative;height:148px}'
  + '.gv-events-mini{background:#fff;border:1px solid var(--gv-border);border-radius:var(--gv-radius-lg);box-shadow:var(--gv-shadow);padding:14px 16px;position:absolute;top:0;left:0;right:0;box-sizing:border-box;max-height:148px;overflow:hidden;transition:max-height .25s ease,box-shadow .25s ease;z-index:5}'
          + '.gv-events-mini:hover{max-height:480px;overflow-y:auto;box-shadow:0 16px 32px rgba(0,0,0,.18)}'
          + '.gv-events-mini h4{margin:0 0 8px;font-size:.8rem;font-weight:700;color:var(--gv-accent);display:flex;align-items:center;justify-content:space-between}'
          + '.gv-events-mini h4 .gv-events-hint{font-size:.66rem;font-weight:500;color:#9ca3af}'
    + '.gv-events-mini-item{font-size:.74rem;color:#374151;padding:5px 0;border-bottom:1px solid #f3f4f6;line-height:1.35}'
  + '.gv-events-mini-item:last-child{border-bottom:none}'
  + '.gv-events-mini-time{color:#9ca3af;font-size:.66rem;display:block;margin-top:1px}'
  + '.gv-events-group:last-child > .gv-events-mini-item{border-bottom:none}'
  + '.gv-events-group-head{cursor:pointer}'
  + '.gv-events-head-main{display:flex;align-items:flex-start;gap:8px}'
  + '.gv-events-head-main .gv-events-head-msg{flex:1 1 auto}'
  + '.gv-events-count{flex:0 0 auto;background:var(--gv-accent-light);color:var(--gv-accent-dark);font-size:.62rem;font-weight:700;padding:2px 7px;border-radius:var(--gv-radius-pill);white-space:nowrap;margin-top:1px}'
  + '.gv-events-stacked:not(.gv-events-open) .gv-events-group-head{position:relative;box-shadow:0 3px 0 -1px #f4f5f7,0 6px 0 -2px #e9ecf1;border-radius:6px;margin-bottom:3px}'
  + '.gv-events-stacked.gv-events-open .gv-events-group-head{border-bottom-color:#e5e7eb}'
  + '.gv-events-sub{margin:2px 0 4px 4px;padding-left:9px;border-left:2px solid #eef0f3}'
  + '.gv-events-sub .gv-events-mini-item{font-size:.7rem;color:#6b7280;padding:4px 0}'
+ '#gv-header h1{margin:0 0 4px;font-size:1.5rem;font-weight:700;color:#20232B}#gv-header p{margin:0;opacity:1;font-size:.88rem;color:#8A8F9C}'
+ '#gv-tabs{display:flex;gap:4px;margin-bottom:18px;background:#fff;border-radius:var(--gv-radius-pill);padding:6px;box-shadow:var(--gv-shadow);border:1px solid var(--gv-border);flex-wrap:wrap}'
+ '.gv-tab-btn{background:none;border:none;padding:10px 18px;cursor:pointer;font-size:.88rem;font-weight:600;color:#8A8F9C;border-radius:var(--gv-radius-pill);transition:all .2s;font-family:inherit}'
+ '.gv-tab-btn:hover{background:var(--gv-accent-light);color:var(--gv-accent-dark)}.gv-tab-btn.gv-active{background:var(--gv-accent);color:#fff;box-shadow:0 4px 12px rgba(var(--gv-accent-rgb),.35)}'
+ '.gv-tab-content{display:none}.gv-tab-content.gv-show{display:block}'
+ '.gv-badge{background:#ef4444;color:#fff;border-radius:var(--gv-radius-pill);padding:1px 7px;font-size:.72rem;font-weight:700;margin-left:4px}'
+ '.gv-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}'
+ '.gv-stat-card{background:#fff;border:1px solid var(--gv-border);border-radius:var(--gv-radius-lg);padding:18px 14px;text-align:center;box-shadow:var(--gv-shadow);transition:transform .15s,box-shadow .15s}.gv-stat-card:hover{transform:translateY(-2px);box-shadow:var(--gv-shadow-md)}'
+ '.gv-stat-card[data-stat-filter]{cursor:pointer}'
+ '.gv-stat-card.gv-stat-active{border-color:var(--gv-accent);box-shadow:0 0 0 3px rgba(var(--gv-accent-rgb),.25),var(--gv-shadow-md)}'
+ '.gv-stat-num{font-size:2rem;font-weight:800;color:var(--gv-accent)}.gv-stat-num.gv-blue{color:#0891b2}.gv-stat-num.gv-green{color:#059669}.gv-stat-num.gv-red{color:#dc2626}'
+ '.gv-stat-lbl{font-size:.78rem;color:#8A8F9C;margin-top:4px;font-weight:500}'
+ '.gv-trip-card{background:#fff;border:1px solid var(--gv-border);border-radius:var(--gv-radius-lg);padding:18px;margin-bottom:14px;box-shadow:var(--gv-shadow);transition:box-shadow .15s}.gv-trip-card:hover{box-shadow:var(--gv-shadow-md)}'
+ '.gv-trip-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px;flex-wrap:wrap}'
+ '.gv-trip-title{font-weight:700;font-size:1rem;color:#20232B}'
+ '.gv-status{padding:4px 12px;border-radius:var(--gv-radius-pill);font-size:.76rem;font-weight:700;white-space:nowrap}'
+ '.gv-s-planificado{background:#dbeafe;color:#1e40af}.gv-s-en_curso{background:#d1fae5;color:#065f46}'
+ '.gv-s-completado{background:#f3f4f6;color:#6b7280}.gv-s-demorado{background:#fee2e2;color:#991b1b}.gv-s-cancelado{background:#f3f4f6;color:#9ca3af}'
+ '.gv-trip-info{font-size:.85rem;color:#6b7280;margin-bottom:8px}'
+ '.gv-stops{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}'
+ '.gv-stop-block{display:flex;flex-direction:column;align-items:flex-start;gap:4px}'
+ '.gv-plate-box{background:#fff;border:1px solid var(--gv-border);border-radius:var(--gv-radius-lg);padding:10px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:76px;text-align:center;box-shadow:var(--gv-shadow)}'
+ '.gv-plate-interno{font-size:1.3rem;font-weight:800;color:#111827;line-height:1.15}'
+ '.gv-plate-patente{font-size:.78rem;font-weight:600;color:#374151;margin-top:6px}'
+ '.gv-stop-chip{background:#f3f4f6;border:1px solid #d1d5db;border-radius:10px;padding:3px 8px;font-size:.78rem;color:#374151}'
+ '.gv-stop-chip.gv-carga{border-color:var(--gv-accent);color:var(--gv-accent-dark);background:var(--gv-accent-light)}'
+ '.gv-stop-chip.gv-descarga{border-color:#d97706;color:#92400e;background:#fffbeb}' + '.gv-stop-chip.gv-ambos{border-color:#7c3aed;color:#5b21b6;background:#f5f3ff}' + '.gv-stop-chip.gv-opera{border-color:#0d9488;color:#115e59;background:#f0fdfa}'
+ '.gv-stop-chip.gv-espera{border-color:#64748b;color:#334155;background:#f1f5f9}'
+ '.gv-trip-actions{display:flex;gap:8px;margin-top:12px;justify-content:flex-end;flex-wrap:wrap}'
+ '.gv-btn{padding:9px 18px;border:none;border-radius:var(--gv-radius);cursor:pointer;font-size:.86rem;font-weight:600;transition:all .18s;font-family:inherit}'
+ '.gv-btn:disabled{opacity:.5;cursor:not-allowed}'
+ '.gv-btn-sm{padding:7px 14px;font-size:.8rem;border-radius:calc(var(--gv-radius) - 2px)}'
+ '.gv-btn-primary{background:var(--gv-accent);color:#fff;box-shadow:0 2px 8px rgba(var(--gv-accent-rgb),.3)}.gv-btn-primary:hover{background:var(--gv-accent-dark)}'
+ '.gv-btn-sec{background:#F5F6F9;color:#3A3F4B;border:1px solid var(--gv-border)}.gv-btn-sec:hover{background:#ECEDF2}'
+ '.gv-btn-suc{background:#059669;color:#fff;box-shadow:0 2px 8px rgba(5,150,105,.25)}.gv-btn-suc:hover{background:#047857}'
+ '.gv-btn-danger{background:#dc2626;color:#fff;box-shadow:0 2px 8px rgba(220,38,38,.25)}.gv-btn-danger:hover{background:#b91c1c}'
+ '.gv-btn-warn{background:#d97706;color:#fff;box-shadow:0 2px 8px rgba(217,119,6,.25)}.gv-btn-warn:hover{background:#b45309}'
+ '.gv-form-card{background:#fff;border:1px solid var(--gv-border);border-radius:var(--gv-radius-lg);padding:26px;box-shadow:var(--gv-shadow)}'
+ '.gv-form-card h2{margin:0 0 20px;font-size:1.2rem;font-weight:700;color:var(--gv-accent)}'
+ '.gv-form-row{margin-bottom:14px}.gv-form-row label{display:block;font-size:.85rem;font-weight:600;color:#3A3F4B;margin-bottom:5px}'
+ '.gv-form-row input,.gv-form-row select,.gv-form-row textarea{width:100%;padding:10px 14px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);font-size:.88rem;color:#20232B;box-sizing:border-box;font-family:inherit;background:#fff}'
+ '.gv-form-row input:focus,.gv-form-row select:focus,.gv-form-row textarea:focus{outline:none;border-color:var(--gv-accent);box-shadow:0 0 0 3px rgba(var(--gv-accent-rgb),.15)}'
+ '.gv-two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
+ '.gv-alert-card{background:#fff;border-left:4px solid #ef4444;border-radius:var(--gv-radius-lg);padding:14px 16px;margin-bottom:10px;box-shadow:var(--gv-shadow);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}'
+ '.gv-alert-card.gv-alert-warn{border-left-color:#d97706}'
+ '.gv-alert-text{font-size:.9rem}.gv-alert-time{font-size:.78rem;color:#6b7280;margin-top:3px}'
/* Ajuste 5/10: agrupado "estilo notificaciones apiladas" (iOS) en Alertas, igual que en
   Ultimos eventos -- ver gv-events-count/gv-events-stacked mas arriba, de donde se copia
   el mismo criterio visual (la insignia "+N" y el efecto de tarjetas apiladas detras). */
+ '.gv-alert-group-head{cursor:pointer}'
+ '.gv-alert-head-row{display:flex;align-items:flex-start;gap:8px}'
+ '.gv-alert-count{flex:0 0 auto;background:var(--gv-accent-light);color:var(--gv-accent-dark);font-size:.62rem;font-weight:700;padding:2px 7px;border-radius:var(--gv-radius-pill);white-space:nowrap;margin-top:1px}'
+ '.gv-alert-stacked:not(.gv-alert-open) .gv-alert-group-head > .gv-alert-card{position:relative;box-shadow:var(--gv-shadow),0 7px 0 -3px #f4f5f7,0 13px 0 -6px #e9ecf1}'
+ '.gv-alert-sub{margin:2px 0 10px 4px;padding-left:9px;border-left:2px solid #eef0f3}'
+ '.gv-alert-sub .gv-alert-card{margin-bottom:8px}'
+ '.gv-loc-display{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);background:#F8F9FB;font-size:.85rem;min-height:38px}'
+ '.gv-loc-display span{flex:1;color:#374151}'
+ '.gv-stop-item{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#F8F9FB;border:1px solid var(--gv-border);border-radius:var(--gv-radius);margin-bottom:6px}'
+ '.gv-stop-item span{flex:1;font-size:.85rem}.gv-stop-remove{background:none;border:none;cursor:pointer;color:#ef4444;font-size:1rem;padding:0 4px}'
+ '.gv-stop-badge{font-size:.7rem;font-weight:700;padding:2px 7px;border-radius:8px}'
+ '.gv-stop-badge.gv-carga{background:#dbeafe;color:#1e40af}.gv-stop-badge.gv-descarga{background:#fef3c7;color:#92400e}.gv-stop-badge.gv-ambos{background:#ede9fe;color:#5b21b6}.gv-stop-badge.gv-opera{background:#ccfbf1;color:#115e59}.gv-stop-badge.gv-espera{background:#e2e8f0;color:#334155}'
+ '.gv-modal-overlay{position:fixed;inset:0;background:rgba(17,24,39,.55);backdrop-filter:blur(2px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px}'
+ '.gv-modal{background:#fff;border-radius:var(--gv-radius-lg);max-width:540px;width:100%;max-height:92vh;overflow:auto;padding:26px;box-shadow:0 24px 60px rgba(17,24,39,.22)}'
+ '.gv-modal h3{margin:0 0 14px;color:var(--gv-accent);font-size:1.1rem;font-weight:700}'
+ '.gv-map-box{height:280px;border-radius:var(--gv-radius);margin-bottom:10px;border:1px solid var(--gv-border)}'
+ '.gv-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}'
+ '.gv-search-row{display:flex;gap:8px;margin-bottom:10px}'
+ '.gv-search-row input{flex:1;padding:9px 12px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);font-size:.88rem;font-family:inherit}'
+ '.gv-tipo-toggle{display:flex;gap:8px;margin-bottom:12px}'
+ '.gv-tipo-toggle button{flex:1;padding:9px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);background:#F8F9FB;cursor:pointer;font-weight:600;font-size:.85rem;font-family:inherit}'
+ '.gv-tipo-toggle button.gv-sel-carga{background:var(--gv-accent-light);border-color:var(--gv-accent);color:var(--gv-accent-dark)}'
+ '.gv-tipo-toggle button.gv-sel-descarga{background:#fef3c7;border-color:#d97706;color:#92400e}' + '.gv-tipo-toggle button.gv-sel-ambos{background:#ede9fe;border-color:#7c3aed;color:#5b21b6}' + '.gv-tipo-toggle button.gv-sel-opera{background:#ccfbf1;border-color:#0d9488;color:#115e59}'
+ /* Version compacta usada solo por el selector de ubicacion (GV.pickLocation), para que entren
     todas las opciones (buscador, mapa, area del sitio, tipo de parada) sin tener que scrollear. */
  '.gv-modal-loc{padding:12px;height:calc(100vh - 32px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-sizing:border-box}'
+ '.gv-modal-loc > *{flex-shrink:0}'
+ '.gv-modal-loc #gv-map-picker{flex:1 1 auto;height:auto !important;min-height:260px}'
+ '.gv-modal-loc h3{margin:0 0 6px;font-size:.95rem}'
+ '.gv-modal-loc .gv-search-row{margin-bottom:4px}'
+ '.gv-modal-loc .gv-search-row input{padding:6px 10px;font-size:.8rem}'
+ '.gv-modal-loc .gv-tipo-toggle{margin-bottom:4px}'
+ '.gv-modal-loc .gv-tipo-toggle button{padding:5px;font-size:.78rem}'
+ '.gv-modal-loc .gv-form-row{margin-bottom:4px}'
+ '.gv-modal-loc .gv-form-row label{margin-bottom:2px;font-size:.76rem}'
+ '.gv-modal-loc .gv-form-row input{padding:5px 10px;font-size:.8rem}'
+ '.gv-modal-loc .gv-modal-actions{margin-top:6px}'
+ '.gv-banner{border-radius:var(--gv-radius-lg);padding:16px 18px;margin-bottom:16px}'
+ '.gv-banner h3{margin:0 0 6px;font-size:1rem}'
+ '.gv-banner p{margin:0;font-size:.88rem}'
+ '.gv-banner-info{background:#dbeafe;border:1px solid #93c5fd;color:#1e3a8a}'
+ '.gv-banner-warn{background:#fef3c7;border:1px solid #fcd34d;color:#78350f}'
+ '.gv-banner-danger{background:#fee2e2;border:1px solid #fca5a5;color:#7f1d1d}'
+ '.gv-banner-ok{background:#d1fae5;border:1px solid #6ee7b7;color:#065f46}'
+ '.gv-wizard-step{margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #f3f4f6}'
+ '.gv-wizard-step h4{margin:0 0 10px;font-size:.95rem;color:var(--gv-accent);font-weight:700}'
+ '.gv-wizard-progress{display:flex;gap:6px;margin-bottom:16px}'
+ '.gv-wizard-progress span{flex:1;height:6px;border-radius:3px;background:#e5e7eb}'
+ '.gv-wizard-progress span.gv-done{background:var(--gv-accent)}'
+ '.gv-check-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f3f4f6;font-size:.88rem;gap:10px}'
+ '.gv-radio-pair{display:flex;gap:8px}'
+ '.gv-radio-pair button{padding:6px 14px;border-radius:var(--gv-radius-pill);border:1.5px solid #d1d5db;background:#f3f4f6;color:#6b7280;cursor:pointer;font-size:.8rem;font-weight:600;font-family:inherit}'
+ '.gv-radio-pair button.gv-r-yes-sel{background:#d1fae5;border-color:#059669;color:#065f46}'
+ '.gv-radio-pair button.gv-r-no-sel{background:#fee2e2;border-color:#dc2626;color:#991b1b}'
+ '.gv-req{color:#dc2626;font-size:.75rem;margin-left:4px}'
+ '.gv-fatiga-list label{display:flex;align-items:center;gap:10px;padding:12px;border:1.5px solid var(--gv-border);border-left-width:5px;border-radius:var(--gv-radius);margin-bottom:8px;cursor:pointer;font-size:.88rem}'
+ '.gv-fatiga-list input{width:auto}'
+ '.gv-fatiga-alto{border-left-color:#dc2626}'
+ '.gv-fatiga-medio{border-left-color:#d97706}'
+ '.gv-fatiga-verde{border-left-color:#059669}'
+ '.gv-result-box{border-radius:var(--gv-radius-lg);padding:22px;text-align:center;margin-bottom:16px}'
+ '.gv-result-verde{background:#d1fae5;border:2px solid #059669;color:#065f46}'
+ '.gv-result-amarillo{background:#fef3c7;border:2px solid #d97706;color:#78350f}'
+ '.gv-result-rojo{background:#fee2e2;border:2px solid #dc2626;color:#7f1d1d}'
+ '.gv-result-box h2{margin:0 0 8px;font-size:1.3rem}'
+ '.gv-driver-trip{background:#fff;border:1px solid var(--gv-border);border-radius:var(--gv-radius-lg);padding:18px;margin-bottom:14px;box-shadow:var(--gv-shadow)}'
+ '.gv-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}'
+ '.gv-motivo-list label{display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);margin-bottom:8px;cursor:pointer;font-size:.88rem}'
+ '.gv-motivo-list input{width:auto}'
+ '.gv-select-driver{margin-bottom:16px;padding:12px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:var(--gv-radius-lg);font-size:.85rem}'
+ '.gv-view-btn.gv-active{background:var(--gv-accent);color:#fff;border-color:var(--gv-accent)}'
+ '.gv-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}'
+ '.gv-cal-dow{text-align:center;font-size:.72rem;font-weight:700;color:#6b7280;padding:4px 0}'
+ '.gv-cal-day{background:#fff;border:1px solid var(--gv-border);border-radius:var(--gv-radius);padding:6px;min-height:62px;cursor:pointer;transition:all .15s}'
+ '.gv-cal-day:hover{border-color:var(--gv-accent)}'
+ '.gv-cal-day.gv-cal-empty{background:transparent;border:none;cursor:default}'
+ '.gv-cal-day.gv-cal-today{border-color:var(--gv-accent);box-shadow:0 0 0 2px rgba(var(--gv-accent-rgb),.15)}'
+ '.gv-cal-day.gv-cal-sel{background:var(--gv-accent-light);border-color:var(--gv-accent)}'
+ '.gv-cal-daynum{font-size:.76rem;font-weight:700;color:#374151}'
+ '.gv-cal-count{font-size:1.05rem;font-weight:700;color:var(--gv-accent);margin-top:6px}'
+ '.gv-cal-sub{font-size:.66rem;color:#6b7280;margin-top:2px}'
+ '.gv-filter-chip{display:inline-flex;align-items:center;gap:8px;background:#eff6ff;border:1px solid #93c5fd;color:#1e3a8a;border-radius:var(--gv-radius-pill);padding:6px 12px;font-size:.82rem;margin-bottom:10px}'
+ '.gv-det-table{width:100%;border-collapse:collapse;font-size:.82rem}'
+ '.gv-det-table th{text-align:left;color:#6b7280;border-bottom:1px solid var(--gv-border);padding:6px 4px}'
+ '.gv-det-table td{padding:6px 4px;border-bottom:1px solid #f3f4f6}'
+ '.gv-site-marker-lbl{color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}'
+ '.gv-live-marker-lbl{background:var(--gv-accent);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 0 0 4px rgba(var(--gv-accent-rgb),.3),0 1px 4px rgba(0,0,0,.4);animation:gvLivePulse 1.6s infinite}'
+ '@keyframes gvLivePulse{0%{box-shadow:0 0 0 4px rgba(var(--gv-accent-rgb),.3),0 1px 4px rgba(0,0,0,.4)}50%{box-shadow:0 0 0 8px rgba(var(--gv-accent-rgb),.05),0 1px 4px rgba(0,0,0,.4)}100%{box-shadow:0 0 0 4px rgba(var(--gv-accent-rgb),.3),0 1px 4px rgba(0,0,0,.4)}}'+'.gv-vehicle-marker{transition:transform 1s linear}'+'.gv-live-banner{display:inline-block;padding:4px 10px;border-radius:8px;font-size:.78rem;font-weight:700;margin:4px 0}'+'.gv-live-moving{background:#d1fae5;color:#065f46}'+'.gv-live-stopped{background:#fef3c7;color:#78350f}'+'.gv-live-nocomm{background:#fee2e2;color:#991b1b}'+'.gv-live-unknown{background:#f3f4f6;color:#6b7280}'
+'.gv-truck-label-ov{position:absolute;transform:translate(-50%,calc(-100% - 14px));background:#152238;color:#fff;font-weight:700;font-size:12px;font-family:inherit;padding:5px 11px;border-radius:7px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.45);opacity:.96;pointer-events:none;z-index:1}'
+'.gv-label-leader{position:absolute;height:0;border-top:2px dashed rgba(255,255,255,.85);transform-origin:0 0;pointer-events:none;z-index:0;filter:drop-shadow(0 0 1.5px rgba(0,0,0,.65))}';

GV.injectCSS = function(containerId){
  var el = document.getElementById(containerId || 'gv-style-container');
  if(el && !el.querySelector('style')){
    el.insertAdjacentHTML('beforeend', '<style>' + GV.CSS + '</style>');
  }
};

/* ---------------- Google Maps loader ---------------- */
/* Antes esta app usaba Leaflet + capas gratuitas de Esri/OpenStreetMap para imitar el look del
 * mapa nativo de Geotab (que usa Google Maps) sin necesitar una clave de API propia. Ahora se usa
 * directamente Google Maps JavaScript API -- el mismo proveedor que usa Geotab -- para tener el
 * selector real de Mapa/Satelite y la capa de Trafico en tiempo real de Google.
 * IMPORTANTE: reemplazar GOOGLE_MAPS_API_KEY por una clave real de Google Cloud Console (con
 * "Maps JavaScript API" habilitada y facturacion activa), restringida por HTTP referrer a los
 * dominios donde corre este complemento (por ejemplo https://my.geotab.com/* y el dominio donde
 * este alojado index.html/chofer.html, si estan afuera de Geotab). Sin una clave valida el mapa
 * no va a cargar y se va a mostrar un aviso en su lugar. */
GV.GOOGLE_MAPS_API_KEY = 'AIzaSyAxnEKemi5U2aADw1y6FfEA2vuwgFovEPQ';

GV.loadGoogleMaps = function(){
  /* Arreglo 25/9: se devuelve siempre el window.google VIGENTE, no el que habia cuando se cargo
     por primera vez -- MyGeotab puede reemplazarlo al abrir una pantalla nativa con mapa y
     mezclar clases de dos copias distintas rompe los mapas ("setMap: not an instance of Map"). */
  if(GV._gmapsPromise) return GV._gmapsPromise.then(function(){ return window.google; });
  GV._gmapsPromise = new Promise(function(resolve, reject){
    if(window.google && window.google.maps){ resolve(window.google); return; }
    if(!GV.GOOGLE_MAPS_API_KEY || GV.GOOGLE_MAPS_API_KEY.indexOf('TU_CLAVE') === 0){
      reject(new Error('Falta configurar GV.GOOGLE_MAPS_API_KEY (en common.js) con una clave real de Google Maps JavaScript API.'));
      return;
    }
    var cbName = '__gvGMapsReady' + Date.now();
    window[cbName] = function(){ delete window[cbName]; resolve(window.google); };
    var script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GV.GOOGLE_MAPS_API_KEY) + '&callback=' + cbName + '&loading=async&v=weekly';
    script.async = true;
    script.onerror = function(){ reject(new Error('No se pudo cargar Google Maps (revisa la clave de API, la facturacion y las restricciones de dominio en Google Cloud Console).')); };
    document.head.appendChild(script);
  });
  return GV._gmapsPromise.then(function(){ return window.google; });
};

/* ---------------- Grupo de overlays (equivalente al LayerGroup de Leaflet) ---------------- */
/* Google Maps no tiene un contenedor nativo de "capa": cada Marker/Polygon/Circle/Polyline se
 * agrega o quita del mapa individualmente con setMap(). Este helper junta un conjunto de overlays
 * para poder limpiarlos todos juntos en cada re-render, igual que hacia L.layerGroup(). */
GV.layerGroup = function(map){
  var items = [];
  return {
    map: map,
    add: function(overlay){ overlay.setMap(map); items.push(overlay); return overlay; },
    removeLayer: function(overlay){ try{ overlay.setMap(null); }catch(e){} var i = items.indexOf(overlay); if(i >= 0) items.splice(i, 1); },
    hasLayer: function(overlay){ return items.indexOf(overlay) !== -1; },
    clearLayers: function(){ items.forEach(function(o){ try{ o.setMap(null); }catch(e){} }); items = []; }
  };
};

/* ---------------- Mapa base (selector Mapa/Satelite + capa de Trafico, como en el Mapa nativo
   de Geotab -- ahora con el Google Maps real, no una imitacion). ---------------- */
/* ---------------- Clientes: recuadro de color (Ajuste 16/10) ----------------
   Colores de cada cliente (grupos "Clientes" de MyGeotab). Se reconoce el cliente aunque el grupo tenga otro texto
   alrededor (ej. "SLB Neuquen"). Los que no estan en la lista se muestran en gris neutro. */
GV.CLIENTE_COLORES = GV.CLIENTE_COLORES || [
  { clave: 'SLB', fondo: '#2563eb', texto: '#ffffff', borde: '#1e3a8a' },
  { clave: 'HALLIBURTON', fondo: '#dc2626', texto: '#ffffff', borde: '#7f1d1d' },
  { clave: 'SHELL', fondo: '#facc15', texto: '#dc2626', borde: '#a16207' },
  { clave: 'SIDERCA', fondo: '#d1d5db', texto: '#15803d', borde: '#6b7280' },
  { clave: 'ON CALL', fondo: '#000000', texto: '#ffffff', borde: '#000000' }
];
GV.clienteBadgeHtml = function(nombre){
  var n = String(nombre || '').trim(), u = n.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-_]+/g, ' ');
  var c = null;
  for(var i = 0; i < GV.CLIENTE_COLORES.length; i++){ if(u.indexOf(GV.CLIENTE_COLORES[i].clave) >= 0){ c = GV.CLIENTE_COLORES[i]; break; } }
  if(!c) c = { fondo: '#f3f4f6', texto: '#374151', borde: '#9ca3af' };
  return '<span style="display:inline-block;background:' + c.fondo + ';color:' + c.texto + ';border:1.5px solid ' + c.borde + ';border-radius:6px;padding:1px 8px;font-size:.72rem;font-weight:700;line-height:1.5;white-space:nowrap">' + GV.escapeHtml(n) + '</span>';
};

/* ---------------- Coordenadas con clic derecho (Ajuste 16/10) ----------------
   Clic derecho sobre cualquier mapa del modulo, o sobre un punto de carga/descarga (elementos con data-gv-coords),
   muestra las coordenadas como texto para copiarlas y compartirlas, con un link a Google Maps. */
GV.mostrarCoordenadas = function(lat, lng, x, y, titulo){
  var ant = document.getElementById('gv-coords-pop'); if(ant) ant.remove();
  var txt = Number(lat).toFixed(6) + ', ' + Number(lng).toFixed(6);
  var url = 'https://www.google.com/maps?q=' + Number(lat).toFixed(6) + ',' + Number(lng).toFixed(6);
  var d = document.createElement('div');
  d.id = 'gv-coords-pop';
  d.style.cssText = 'position:fixed;z-index:200000;background:#fff;border:1px solid #d1d5db;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:10px 12px;font:13px Poppins,Arial,sans-serif;color:#20232B;width:290px';
  d.innerHTML = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b style="flex:1;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + GV.escapeHtml(titulo || 'Coordenadas') + '</b><button type="button" data-gv-cp="x" style="background:#dc2626;color:#fff;border:0;border-radius:4px;width:20px;height:20px;cursor:pointer;line-height:1">&times;</button></div>' +
    '<input type="text" readonly value="' + txt + '" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-family:monospace;font-size:.85rem">' +
    '<div style="display:flex;gap:6px;margin-top:8px"><button type="button" data-gv-cp="copiar" class="gv-btn gv-btn-primary gv-btn-sm" style="flex:1">Copiar</button><button type="button" data-gv-cp="link" class="gv-btn gv-btn-sec gv-btn-sm" style="flex:1">Copiar link Maps</button><a href="' + url + '" target="_blank" rel="noopener" class="gv-btn gv-btn-sec gv-btn-sm" style="text-decoration:none">Abrir</a></div>';
  document.body.appendChild(d);
  var W = window.innerWidth, H = window.innerHeight;
  var px = (typeof x === 'number') ? x : W / 2 - 145, py = (typeof y === 'number') ? y : H / 2 - 60;
  d.style.left = Math.max(8, Math.min(px, W - 300)) + 'px'; d.style.top = Math.max(8, Math.min(py, H - d.offsetHeight - 8)) + 'px';
  var inp = d.querySelector('input'); try{ inp.select(); }catch(e){}
  function copiar(t, btn){
    var ok = function(){ var o = btn.textContent; btn.textContent = 'Copiado'; setTimeout(function(){ btn.textContent = o; }, 1200); };
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(ok, function(){ inp.value = t; inp.select(); try{ document.execCommand('copy'); ok(); }catch(e){} }); }
    else { inp.value = t; inp.select(); try{ document.execCommand('copy'); ok(); }catch(e){} }
  }
  d.addEventListener('click', function(e){
    var b = e.target.closest('[data-gv-cp]'); if(!b) return;
    var a = b.getAttribute('data-gv-cp');
    if(a === 'x'){ cerrar(); } else if(a === 'copiar'){ copiar(txt, b); } else if(a === 'link'){ copiar(url, b); }
  });
  function cerrar(){ d.remove(); document.removeEventListener('mousedown', fuera, true); document.removeEventListener('keydown', esc, true); }
  function fuera(e){ if(!d.contains(e.target)) cerrar(); }
  function esc(e){ if(e.key === 'Escape') cerrar(); }
  setTimeout(function(){ document.addEventListener('mousedown', fuera, true); document.addEventListener('keydown', esc, true); }, 0);
};
if(!GV.__coordsCtxBound){
  GV.__coordsCtxBound = true;
  document.addEventListener('contextmenu', function(e){
    var el = e.target && e.target.closest ? e.target.closest('[data-gv-coords]') : null;
    if(!el) return;
    var p = String(el.getAttribute('data-gv-coords')).split(',');
    var la = parseFloat(p[0]), ln = parseFloat(p[1]);
    if(isNaN(la) || isNaN(ln)) return;
    e.preventDefault();
    GV.mostrarCoordenadas(la, ln, e.clientX, e.clientY, el.getAttribute('data-gv-coords-tit') || '');
  });
}

GV.createMap = function(containerId, opts){
  opts = opts || {};
  var google = window.google;
  var map = new google.maps.Map(document.getElementById(containerId), {
    center: opts.center || { lat: -38.951, lng: -68.059 },
    zoom: opts.zoom || 9,
    mapTypeId: 'hybrid',
    mapTypeControl: true,
    mapTypeControlOptions: {
      mapTypeIds: ['roadmap', 'hybrid'],
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      position: google.maps.ControlPosition.TOP_RIGHT
    },
    fullscreenControl: true,
    streetViewControl: false,
    zoomControl: true
  });
  map.addListener('rightclick', function(e){ try{ var ev = e.domEvent || {}; GV.mostrarCoordenadas(e.latLng.lat(), e.latLng.lng(), ev.clientX, ev.clientY, 'Punto del mapa'); }catch(__eRc){} });
  /* Capa de Trafico real de Google (equivalente a la capa "Trafico" del panel de capas de
     Geotab). Arranca apagada y se prende con el boton que se agrega arriba a la derecha. */
  var trafficLayer = new google.maps.TrafficLayer();
  var trafficOn = false;
  var trafficBtn = document.createElement('button');
  trafficBtn.type = 'button';
  trafficBtn.textContent = 'Trafico';
  trafficBtn.title = 'Mostrar/ocultar trafico en tiempo real (Google)';
  trafficBtn.style.cssText = 'background:#fff;border:0;border-radius:2px;box-shadow:0 1px 4px -1px rgba(0,0,0,.3);margin:10px 10px 0 0;padding:0 12px;height:29px;font:500 13px Roboto,Arial,sans-serif;cursor:pointer;color:#565656';
  trafficBtn.addEventListener('click', function(){
    trafficOn = !trafficOn;
    trafficLayer.setMap(trafficOn ? map : null);
    trafficBtn.style.color = trafficOn ? '#1a73e8' : '#565656';
    trafficBtn.style.fontWeight = trafficOn ? '700' : '500';
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(trafficBtn);
  map.__gvTrafficLayer = trafficLayer;
  return map;
};

/* Equivalente a map.invalidateSize() de Leaflet: fuerza que Google Maps recalcule el tamano del
 * contenedor cuando este estaba oculto (display:none) y recien se muestra. */
GV.fixMapSize = function(map, center){
  try{
    window.google.maps.event.trigger(map, 'resize');
    if(center) map.setCenter(center);
  }catch(e){}
};

/* Ajusta el mapa para que se vean todos los puntos de la lista (equivalente a
 * map.fitBounds([[lat,lng],...], {padding:[30,30]}) de Leaflet). Acepta puntos {lat,lng}. */
GV.fitBoundsArr = function(map, points, paddingPx){
  if(!points || !points.length) return;
  var google = window.google;
  if(points.length === 1){ map.setCenter(points[0]); map.setZoom(16); return; }
  var b = new google.maps.LatLngBounds();
  points.forEach(function(p){ b.extend(new google.maps.LatLng(p.lat, p.lng)); });
  map.fitBounds(b, paddingPx || 30);
};

/* ---------------- Iconos de marcadores (equivalentes a los L.divIcon usados antes) ---------- */
/* Circulo de color con una letra/numero adentro: usado para origen (O), destino (D) y paradas
 * numeradas (1, 2, 3...). */
GV.stopIcon = function(label, color){
  var google = window.google;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<circle cx="13" cy="13" r="11" fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
    '<text x="13" y="14" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#fff">' + GV.escapeHtml(String(label)) + '</text>' +
    '</svg>';
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(26, 26),
    anchor: new google.maps.Point(13, 13)
  };
};

/* ---------------- Marcador de "aca hay un evento real de camara" en el mapa ---------------- */
/* Mismo estilo que GV.stopIcon (circulo de color con algo adentro) pero con un pictograma de
 * camara en vez de un numero/letra. Se usa para marcar, sobre el recorrido del detalle de viaje,
 * los puntos donde SI hay un CameraEvent real (y por lo tanto imagen disponible al pasar el
 * mouse) -- igual que el Historial de viajes nativo de Geotab, que solo marca con una camarita
 * los eventos de su lista que tienen grabacion, no cualquier punto del recorrido. */
GV.cameraIcon = function(color){
  var google = window.google;
  var c = color || '#7c3aed';
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
    '<circle cx="11" cy="11" r="10" fill="' + c + '" stroke="#fff" stroke-width="1.6"/>' +
    '<path d="M6.3 8.6c0-.5.4-.9.9-.9h1l.5-.9c.15-.28.44-.45.76-.45h2.9c.32 0 .61.17.76.45l.5.9h1c.5 0 .9.4.9.9v5c0 .5-.4.9-.9.9H7.2c-.5 0-.9-.4-.9-.9v-5z" fill="#fff"/>' +
    '<circle cx="11" cy="11.3" r="1.9" fill="' + c + '"/>' +
    '</svg>';
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(22, 22),
    anchor: new google.maps.Point(11, 11)
  };
};

/* ---------------- Etiqueta flotante sobre un marcador ---------------- */
/* Google Maps no tiene un equivalente nativo al tooltip "permanent" de Leaflet (una etiqueta
 * siempre visible, no solo al pasar el mouse). Este overlay dibuja un div posicionado sobre el
 * mapa, igual que hacia el tooltip permanente con la etiqueta de cada camion en el mapa de
 * seguimiento. */
/* No recibe el mapa ni se auto-agrega: el que la crea la agrega con overlay.setMap(map) o con un
 * GV.layerGroup(map).add(overlay), igual que con cualquier Marker/Polygon/Circle de este archivo. */
GV.makeLabelOverlay = function(position, html){
  var google = window.google;
  function Ov(){}
  Ov.prototype = new google.maps.OverlayView();
  var ov = new Ov();
  ov.__pos = position;
  ov.__div = null;
  ov.__offX = 0;
  ov.__offY = 0;
  ov.onAdd = function(){
    var div = document.createElement('div');
    div.className = 'gv-truck-label-ov';
    div.innerHTML = html;
    this.__div = div;
    this.getPanes().floatPane.appendChild(div);
  };
  ov.draw = function(){
    if(!this.__div) return;
    var proj = this.getProjection();
    if(!proj) return;
    var pt = proj.fromLatLngToDivPixel(new google.maps.LatLng(this.__pos.lat, this.__pos.lng));
    /* __offX/__offY: corrimiento en pixeles de pantalla respecto del punto real (0,0 = arriba del
       marcador, como siempre). Lo usa GV.declutterLabels para separar del marcador las etiquetas
       que quedarian superpuestas con otra, sin perder la posicion real del punto (para eso esta
       tambien GV.makeLeaderLine: dibuja la lineita que conecta el sitio con su etiqueta corrida). */
    if(pt){ this.__div.style.left = (pt.x + this.__offX) + 'px'; this.__div.style.top = (pt.y + this.__offY) + 'px'; }
  };
  ov.onRemove = function(){ if(this.__div && this.__div.parentNode){ this.__div.parentNode.removeChild(this.__div); } this.__div = null; };
  ov.setPosition = function(pos){ this.__pos = pos; this.draw(); };
  ov.setContent = function(newHtml){ if(this.__div) this.__div.innerHTML = newHtml; };
  ov.getDiv = function(){ return this.__div; };
  ov.setOffset = function(dx, dy){ this.__offX = dx; this.__offY = dy; this.draw(); };
  return ov;
};

/* ---------------- Linea que conecta un sitio con su etiqueta corrida ----------------
Se usa junto con GV.makeLabelOverlay + setOffset: cuando una etiqueta se corre a un costado para
no superponerse con otra (ver GV.declutterLabels), esta lineita conecta el punto real del sitio en
el mapa con la etiqueta ya corrida, para que se siga entendiendo a que sitio pertenece. */
GV.makeLeaderLine = function(){
  var google = window.google;
  function Ov(){}
  Ov.prototype = new google.maps.OverlayView();
  var ov = new Ov();
  ov.__div = null;
  ov.onAdd = function(){
    var div = document.createElement('div');
    div.className = 'gv-label-leader';
    div.style.display = 'none';
    this.__div = div;
    this.getPanes().floatPane.appendChild(div);
  };
  /* La posicion la fija setEndpoints() (llamado desde GV.declutterLabels, que ya sabe donde va
     cada punta) -- no hace falta recalcular nada en el draw() automatico de Google Maps. */
  ov.draw = function(){};
  ov.onRemove = function(){ if(this.__div && this.__div.parentNode){ this.__div.parentNode.removeChild(this.__div); } this.__div = null; };
  ov.setEndpoints = function(x1, y1, x2, y2){
    if(!this.__div) return;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if(len < 1){ this.__div.style.display = 'none'; return; }
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    this.__div.style.display = 'block';
    this.__div.style.width = len + 'px';
    this.__div.style.left = x1 + 'px';
    this.__div.style.top = y1 + 'px';
    this.__div.style.transform = 'rotate(' + angle + 'deg)';
  };
  ov.hide = function(){ if(this.__div) this.__div.style.display = 'none'; };
  return ov;
};

/* ---------------- Des-solapado de etiquetas fijas del mapa (origen/paradas/destino) ----------------
Pedido: que el origen y los puntos de carga/descarga del detalle de un viaje muestren su nombre
siempre (no solo al pasar el mouse), y que al alejar o acercar el zoom esas etiquetas no queden
una encima de la otra, sino que se puedan leer bien -- SIN ocultar ninguna (a diferencia de la
version anterior, que ocultaba la de menor prioridad cuando se superponian). Ahora, si la posicion
por defecto (centrada arriba del marcador) quedaria pisando otra etiqueta ya ubicada, esta se corre
a uno de varios costados posibles (CANDIDATES, de mas cerca a mas lejos) hasta encontrar un lugar
libre, y se dibuja una lineita (GV.makeLeaderLine) que la conecta de nuevo con su sitio real. Si
ningun candidato queda del todo libre (sitios muy amontonados), se deja igual en el candidato mas
alejado -- el nombre nunca desaparece, en el peor caso queda un poco encimado.

Google Maps no trae un mecanismo nativo de "evitar superposicion" para overlays HTML propios (a
diferencia de los labels nativos de algunos mapas vectoriales), asi que esto se resuelve a mano:
en cada 'idle'/'zoom_changed' del mapa se mide el rectangulo real en pantalla de cada etiqueta
(getBoundingClientRect) probando cada candidato, y se elige el primero que no pisa a ninguna de
las ya ubicadas (procesando primero las de mayor prioridad -- origen/destino antes que las
paradas). Se llama una sola vez por grupo de etiquetas, pasandole la lista completa:
[{overlay, leader, lat, lng, priority}, ...] (leader es opcional, un GV.makeLeaderLine()). */
GV.declutterLabels = function(map, entries){
  if(!map || !entries || !entries.length) return;
  var google = window.google;
  var CANDIDATES = [
    { dx: 0, dy: 0 },
    { dx: 62, dy: -6 }, { dx: -62, dy: -6 },
    { dx: 98, dy: 20 }, { dx: -98, dy: 20 },
    { dx: 0, dy: -46 },
    { dx: 132, dy: -6 }, { dx: -132, dy: -6 },
    { dx: 0, dy: 46 },
    { dx: 168, dy: 20 }, { dx: -168, dy: 20 }
  ];
  var pending = null;
  function run(){
    pending = null;
    entries.forEach(function(e){ var div = e.overlay.getDiv(); if(div) div.style.visibility = 'visible'; });
    var sorted = entries.slice().sort(function(a, b){ return a.priority - b.priority; });
    var kept = [];
    sorted.forEach(function(e){
      var div = e.overlay.getDiv();
      if(!div) return;
      var proj = e.overlay.getProjection();
      var sitePt = proj ? proj.fromLatLngToDivPixel(new google.maps.LatLng(e.lat, e.lng)) : null;
      var chosen = CANDIDATES[0], chosenRect = null;
      for(var i = 0; i < CANDIDATES.length; i++){
        var c = CANDIDATES[i];
        e.overlay.setOffset(c.dx, c.dy);
        var r = div.getBoundingClientRect();
        var solapa = kept.some(function(k){
          return !(r.right < k.left || r.left > k.right || r.bottom < k.top || r.top > k.bottom);
        });
        chosen = c; chosenRect = r;
        if(!solapa) break; // libre: nos quedamos con este candidato
        // si es el ultimo candidato y todos se superponian, igual se deja puesto (nunca se oculta)
      }
      e.overlay.setOffset(chosen.dx, chosen.dy);
      kept.push({ left: chosenRect.left, right: chosenRect.right, top: chosenRect.top, bottom: chosenRect.bottom });
      if(e.leader){
        if((chosen.dx !== 0 || chosen.dy !== 0) && sitePt){
          e.leader.setEndpoints(sitePt.x, sitePt.y, sitePt.x + chosen.dx, sitePt.y + chosen.dy);
        } else {
          e.leader.hide();
        }
      }
    });
  }
  /* Pequeno margen (un frame) para que Google Maps ya haya reposicionado (draw()) las etiquetas
     tras el cambio de zoom/paneo antes de medirlas. */
  function schedule(){ if(pending) clearTimeout(pending); pending = setTimeout(run, 30); }
  map.addListener('idle', schedule);
  map.addListener('zoom_changed', schedule);
  schedule();
};

GV.FIREBASE_CONFIG = { apiKey: "AIzaSyC8e7EGfwvxZkCkmqG59OA2yRTcsAXkamE", authDomain: "gestion-de-viajes-f5f65.firebaseapp.com", projectId: "gestion-de-viajes-f5f65", storageBucket: "gestion-de-viajes-f5f65.firebasestorage.app", messagingSenderId: "147508872002", appId: "1:147508872002:web:ca2d0c8ee51eca0f81fedb", measurementId: "G-ECF2NS0YBY" }; GV.loadFirebase = function(){ if(GV._firebasePromise) return GV._firebasePromise; GV._firebasePromise = new Promise(function(resolve, reject){ if(window.firebase && window.firebase.firestore){ resolve(window.firebase); return; } var s1 = document.createElement('script'); s1.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js'; s1.onload = function(){ var s2 = document.createElement('script'); s2.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'; s2.onload = function(){ resolve(window.firebase); }; s2.onerror = function(){ reject(new Error('No se pudo cargar Firebase Firestore')); }; document.head.appendChild(s2); }; s1.onerror = function(){ reject(new Error('No se pudo cargar Firebase App')); }; document.head.appendChild(s1); }); return GV._firebasePromise; }; /* ---------------- Geocoding (Nominatim / OpenStreetMap) ---------------- */
GV.geocodeSearch = function(q){
  if(!q) return Promise.resolve([]);
  return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q))
    .then(function(r){ return r.json(); })
    .then(function(list){
      return (list || []).map(function(it){
        return { lat: parseFloat(it.lat), lng: parseFloat(it.lon), label: it.display_name };
      });
    })
    .catch(function(){ return []; });
};

GV.reverseGeocode = function(lat, lng){
  return fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng)
    .then(function(r){ return r.json(); })
    .then(function(d){ return (d && d.display_name) ? d.display_name : (lat.toFixed(5) + ', ' + lng.toFixed(5)); })
    .catch(function(){ return lat.toFixed(5) + ', ' + lng.toFixed(5); });
};

/* Interpreta lo que el usuario pego en el buscador de direccion (del selector de ubicacion mas
   abajo) como coordenadas sueltas ("-38.916399, -68.0968307") o como un link de Google Maps de
   escritorio -- ya sea con el segmento "@lat,lng,zoom" que trae cualquier vista del mapa, o con
   "!3d..!4d.." que es el que trae puntualmente el PIN de un lugar (mas preciso que el "@" cuando
   difieren, por eso se prueba primero). Si reconoce algo devuelve {lat, lng, label}, con label
   igual al nombre del lugar si se lo pudo sacar del link (el pedacito entre "/maps/place/" y la
   siguiente "/"), o null si no. Si el texto CLARAMENTE es un link de Maps pero no se le pudo sacar
   ninguna coordenada -- el caso mas comun es un link CORTO tipo maps.app.goo.gl o goo.gl/maps/...,
   que no trae las coordenadas adentro sino un codigo que solo el servidor de Google puede resolver
   -- devuelve {error:true} para que quien llama le avise al usuario que pegue el link COMPLETO
   (el que se ve en la barra de direcciones despues de abrirlo), no el corto. Si el texto no tiene
   nada que ver con coordenadas ni con Maps devuelve null, y quien llama sigue con la busqueda de
   direccion de siempre (Nominatim). */
GV.parseCoordsOrGmapsLink = function(text){
  text = (text || '').trim();
  if(!text) return null;
  var coordMatch = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if(coordMatch){
    var lat0 = parseFloat(coordMatch[1]), lng0 = parseFloat(coordMatch[2]);
    if(Math.abs(lat0) <= 90 && Math.abs(lng0) <= 180) return { lat: lat0, lng: lng0, label: null };
  }
  if(!/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) return null;
  var m3d4d = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  var mAt = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  var mQ = text.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  var mLl = text.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  var pair = m3d4d || mAt || mQ || mLl;
  if(!pair) return { error: true };
  var placeName = null;
  var mPlace = text.match(/\/maps\/place\/([^/@]+)/);
  if(mPlace){ try{ placeName = decodeURIComponent(mPlace[1].replace(/\+/g, ' ')); }catch(e){ placeName = mPlace[1].replace(/\+/g, ' '); } }
  return { lat: parseFloat(pair[1]), lng: parseFloat(pair[2]), label: placeName };
};

/* Lee el texto de un archivo .KML (el formato de Google Earth / Google My Maps, es XML) y devuelve
   la lista de puntos marcados: cada Placemark con <Point> pasa a ser {nombre, lat, lng}. Si un
   Placemark es en cambio una linea o un poligono se usa su primer vertice como ubicacion
   representativa -- alcanza para el caso de uso real (una lista de sitios/equipos, que son puntos
   sueltos). OJO: esto NO lee .KMZ (que es un .zip con el .kml adentro) para no tener que sumar una
   libreria de descompresion aparte -- Google My Maps deja exportar directamente en KML sin
   comprimir con solo tildar esa opcion al exportar, que es lo que se le pide al usuario. */
GV.parseKmlPlacemarks = function(xmlText){
  var out = [];
  try{
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if(doc.querySelector('parsererror')) return out;
    var placemarks = doc.getElementsByTagName('Placemark');
    for(var i = 0; i < placemarks.length; i++){
      var pm = placemarks[i];
      var nameEl = pm.getElementsByTagName('name')[0];
      var nombre = nameEl ? nameEl.textContent.trim() : '';
      var coordsEl = pm.getElementsByTagName('coordinates')[0];
      if(!coordsEl) continue;
      var raw = (coordsEl.textContent || '').trim();
      var firstTuple = raw.split(/\s+/)[0];
      if(!firstTuple) continue;
      var parts = firstTuple.split(',');
      if(parts.length < 2) continue;
      var lngK = parseFloat(parts[0]), latK = parseFloat(parts[1]); // KML: orden lng,lat (al reves de lo usual)
      if(isNaN(latK) || isNaN(lngK)) continue;
      out.push({ nombre: nombre, lat: latK, lng: lngK });
    }
  }catch(e){}
  return out;
};

/* Saca el "mid" (el identificador del mapa) de cualquier link de Google My Maps que el usuario
   pegue -- tanto el de "ver" (/maps/d/viewer?mid=...) como el de "editar" (/maps/d/edit?mid=...)
   lo traen como parametro ?mid=. Devuelve el mid (string) o null si el link no tiene uno. */
GV.extractMyMapsMid = function(text){
  text = (text || '').trim();
  if(!text) return null;
  var m = text.match(/[?&]mid=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

/* Pide directamente a Google los datos ACTUALIZADOS de un mapa de My Maps (sin que el usuario
   tenga que exportar y volver a subir un archivo cada vez que la lista cambia). Usa el mismo
   endpoint que exporta un KML descargable, pidiendole "forcekml=1" para que devuelva el XML del
   KML en texto plano en vez del wrapper .kmz. OJO: esto depende de que el navegador pueda leer la
   respuesta de ese endpoint de Google (politica CORS del lado de Google) -- si Google no lo
   permite para pedidos hechos desde otras paginas, el fetch va a fallar y quien llama tiene que
   avisarle al usuario que use la exportacion a archivo de siempre en su lugar. */
GV.fetchMyMapsKml = function(mid){
  var url = 'https://www.google.com/maps/d/kml?mid=' + encodeURIComponent(mid) + '&forcekml=1';
  return fetch(url).then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
};

/* Crea un sitio nuevo, o si ya existe uno guardado con exactamente el mismo nombre le actualiza
   la ubicacion, en vez de crear un duplicado. La usan tanto la sincronizacion automatica diaria
   de mas abajo como (en su momento) la importacion manual de KML. */
GV.upsertSitioPorNombre = function(nombre, lat, lng){
  var existentes = (GV.Storage.getSitios ? GV.Storage.getSitios() : []) || [];
  var nombreNorm = (nombre || '').trim().toLowerCase();
  var existente = existentes.find(function(s){ return (s.nombre || '').trim().toLowerCase() === nombreNorm; });
  if(existente){
    return GV.Storage.updateSitio(existente.id, { lat: lat, lng: lng, direccion: nombre }).then(function(){ return { creado: false }; });
  }
  return GV.Storage.addSitio({ id: GV.genId('site'), nombre: nombre, direccion: nombre, lat: lat, lng: lng }).then(function(){ return { creado: true }; });
};

/* Mapas de My Maps de proveedores que se mantienen sincronizados solos, en segundo plano, sin que
   nadie tenga que importar nada a mano. Cada entrada es el "mid" que Google le pone a un mapa
   (el pedacito ?mid=... de su link para compartir). Para agregar otro proveedor con su propia
   lista de sitios, alcanza con sumar otra entrada aca. */
GV.SITIOS_AUTOSYNC_MIDS = [
  '1weSqIhCycpP0XMub-RENyry0XNgAcKc', /* HP - Equipos y Lugares (equipos de perforacion) */
  /* 20/10: DLS - Ver Equipos. En el mapa figuran como "Equipo 4163" y en los pedidos como "DLS 163":
     se guardan como "DLS 163" (el 4 de adelante es el prefijo de DLS). "Base DLS" queda igual. */
  { mid: '1RstH1PUHyNfyMUr0KSTgThfmuDLvGwIs', renombrar: function(n){
      var t = String(n || '').trim(), m = t.match(/^equipo\s+4(\d{3})$/i);
      if(m) return 'DLS ' + m[1];
      m = t.match(/^equipo\s+(.+)$/i);
      if(m) return 'DLS ' + m[1].toUpperCase();
      return t;
  } }
];

/* Se fija una vez por dia (por navegador) si hay que traer de nuevo las listas de arriba, y si
   corresponde las trae y actualiza los sitios guardados calladamente, sin ningun cartel ni accion
   del usuario -- para que el buscador de "sitio guardado" del selector de ubicacion siempre tenga
   la version mas reciente sin que nadie tenga que acordarse de actualizarla. Si un dia Google no
   responde (por ejemplo sin conexion, o el mapa dejo de ser publico) se reintenta solo al abrir
   la app otro dia; no hace falta avisarle a nadie porque los sitios ya guardados de antes se
   siguen viendo igual mientras tanto. */
GV.autoSyncSitiosDiario = function(){
  var mids = GV.SITIOS_AUTOSYNC_MIDS || [];
  /* la marca del dia incluye la cantidad de mapas: al sumar un mapa nuevo se sincroniza ese mismo dia */
  var LS_KEY_SYNC = 'gv_dp_autosync_sitios_fecha' + (mids.length > 1 ? '_' + mids.length : '');
  var hoy = new Date().toISOString().slice(0, 10);
  try{ if(localStorage.getItem(LS_KEY_SYNC) === hoy) return; }catch(e){}
  if(!mids.length) return;
  var chain = Promise.resolve();
  mids.forEach(function(ent){
    var mid = (typeof ent === 'string') ? ent : ent.mid;
    var ren = (ent && typeof ent.renombrar === 'function') ? ent.renombrar : function(n){ return n; };
    chain = chain.then(function(){
      return GV.fetchMyMapsKml(mid).then(function(xmlText){
        var puntos = GV.parseKmlPlacemarks(xmlText);
        var puntosChain = Promise.resolve();
        puntos.forEach(function(p){
          if(!p.nombre) return; /* sin nombre no se puede saber con cual sitio ya guardado corresponde, se lo salta */
          puntosChain = puntosChain.then(function(){ return GV.upsertSitioPorNombre(ren(p.nombre), p.lat, p.lng); });
        });
        return puntosChain;
      })['catch'](function(){ /* fallo silencioso: se reintenta la proxima vez que se abra la app */ });
    });
  });
  chain.then(function(){
    try{ localStorage.setItem(LS_KEY_SYNC, hoy); }catch(e){}
  });
};

/* ---------------- Selector de ubicacion en mapa ---------------- */
/* opts: { title, initial:{lat,lng,direccion}, withStopFields:boolean, withEsperaField:boolean } */
/* Devuelve una Promise que resuelve con {lat,lng,direccion[,tipo,duracionMin | tipo:'espera',permaneceHasta]} o null si se cancela */
/* ---------------- SIG Neuquen: pozos, locaciones e instalaciones (Ajuste 15/10) ----------------
   Copia de los datos publicos del Portal SIG de la Subsecretaria de Hidrocarburos de Neuquen
   (hidrocarburos.energianeuquen.gob.ar/portalgis), guardada junto a este modulo en datos-nqn/.
   El servidor de la provincia no permite consultas desde otras paginas, por eso se usa una copia
   que se actualiza cada tanto. Se carga recien cuando se usa el buscador del selector de sitios.
   Locaciones: contorno real del predio (poligono). Pozos e instalaciones: punto, y si caen dentro
   de una locacion se usa el contorno de esa locacion como area del sitio. */
GV.NQN_SIG_ENABLED = (typeof GV.NQN_SIG_ENABLED === 'boolean') ? GV.NQN_SIG_ENABLED : true;
GV.__baseUrl = (function(){ try{ var cs = document.currentScript; if(cs && cs.src) return cs.src.replace(/[^\/]*$/, ''); }catch(e){} return ''; })();
GV.NQN = (function(){
  var _p = null, D = null;
  function norm(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function compact(t){ return norm(t).replace(/[^a-z0-9]/g, ''); }
  function dec(s){ var i = 0, la = 0, ln = 0, o = []; while(i < s.length){ var b, sh = 0, r = 0; do{ b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; }while(b >= 32); la += (r & 1) ? ~(r >> 1) : (r >> 1); sh = 0; r = 0; do{ b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; }while(b >= 32); ln += (r & 1) ? ~(r >> 1) : (r >> 1); o.push({ lat: la / 1e5, lng: ln / 1e5 }); } return o; }
  function load(){
    if(_p) return _p;
    var base = (GV.NQN_BASE_URL || (GV.__baseUrl + 'datos-nqn/'));
    function j(f){ return fetch(base + f).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
    _p = Promise.all([j('nqn-locaciones.json'), j('nqn-pozos.json'), j('nqn-instalaciones.json')]).then(function(res){
      var L = res[0], P = res[1], I = res[2], items = [];
      var locs = L.L.map(function(r, idx){ return { idx: idx, nombre: r[0], tipo: L.tipos[r[1]] || '', enc: r[2], poly: null }; });
      locs.forEach(function(l){
        var t = 'Locacion ' + l.nombre + ' ' + l.tipo;
        items.push({ k: 'loc', nombre: l.nombre, det: (l.tipo || '').trim() || 'Locacion', li: l.idx, n: norm(t), c: compact(l.nombre) });
      });
      P.P.forEach(function(r){
        var yac = P.yac[r[1]] || '', area = P.areas[r[2]] || '', op = P.ops[r[3]] || '', est = P.est[r[4]] || '';
        items.push({ k: 'pozo', nombre: r[0], det: [yac, area !== yac ? area : '', op, est].filter(function(x){ return x && x.trim(); }).join(' · '), lat: r[5] / 1e5, lng: r[6] / 1e5, li: r[7], n: norm(r[0] + ' ' + yac + ' ' + area + ' ' + op), c: compact(r[0]) });
      });
      I.I.forEach(function(r){
        var tipo = I.tipos[r[1]] || '', area = I.areas[r[2]] || '', op = I.ops[r[3]] || '';
        items.push({ k: 'inst', nombre: r[0], det: [tipo, area, op].filter(function(x){ return x && x.trim(); }).join(' · '), lat: r[4] / 1e5, lng: r[5] / 1e5, li: (r.length > 6 ? r[6] : -1), n: norm(r[0] + ' ' + tipo + ' ' + area + ' ' + op), c: compact(r[0]) });
      });
      D = { locs: locs, items: items, version: L.v, fuente: L.fuente };
      return D;
    });
    _p['catch'](function(){ _p = null; });
    return _p;
  }
  function polyDe(li){ if(!D || li == null || li < 0 || !D.locs[li]) return null; var l = D.locs[li]; if(!l.poly) l.poly = dec(l.enc); return l.poly; }
  function centro(poly){ var a = 0, b = 0; poly.forEach(function(p){ a += p.lat; b += p.lng; }); return { lat: a / poly.length, lng: b / poly.length }; }
  /* Busca por todas las palabras escritas (en cualquier orden). Ej.: "lca a-15", "borde mocho 14", "ypf bateria". */
  function search(q, limit){
    if(!D) return [];
    var toks = norm(q).split(/\s+/).filter(Boolean); if(!toks.length) return [];
    var qc = compact(q), out = [];
    for(var i = 0; i < D.items.length && out.length < 400; i++){
      var it = D.items[i], ok = true;
      for(var t = 0; t < toks.length; t++){ if(it.n.indexOf(toks[t]) < 0 && it.c.indexOf(compact(toks[t])) < 0){ ok = false; break; } }
      if(!ok && qc.length >= 3 && it.c.indexOf(qc) >= 0) ok = true;
      if(ok) out.push(it);
    }
    function score(it){ var s = 0; if(it.c === qc) s -= 100; else if(it.c.indexOf(qc) === 0) s -= 50; else if(it.c.indexOf(qc) >= 0) s -= 20; if(it.k === 'loc') s -= 3; else if(it.k === 'inst') s -= 2; return s; }
    out.sort(function(a, b){ return score(a) - score(b) || (a.nombre.length - b.nombre.length); });
    return out.slice(0, limit || 40);
  }
  /* Devuelve { lat, lng, poligono|null, nombre, etiqueta } listo para usar como sitio. */
  function resolver(it){
    var poly = polyDe(it.li);
    if(it.k === 'loc'){ var c = centro(poly); return { lat: c.lat, lng: c.lng, poligono: poly, nombre: it.nombre, etiqueta: 'Locacion ' + it.nombre }; }
    var locN = (it.li >= 0 && D.locs[it.li]) ? D.locs[it.li].nombre : '';
    return { lat: it.lat, lng: it.lng, poligono: poly, nombre: it.nombre, etiqueta: (it.k === 'pozo' ? 'Pozo ' : '') + it.nombre + (locN && locN !== it.nombre ? ' (locacion ' + locN + ')' : '') };
  }
  /* Locaciones cuyo centro cae dentro de un rectangulo (para dibujarlas en el mapa). */
  function enVista(s, w, n, e, max){
    if(!D) return [];
    var out = [];
    for(var i = 0; i < D.locs.length && out.length < (max || 400); i++){
      var l = D.locs[i];
      if(!l.c0){ var p = polyDe(i); l.c0 = centro(p); }
      if(l.c0.lat >= s && l.c0.lat <= n && l.c0.lng >= w && l.c0.lng <= e) out.push(l);
    }
    return out;
  }
  return { load: load, search: search, resolver: resolver, polyDe: polyDe, enVista: enVista, datos: function(){ return D; } };
})();

GV.pickLocation = function(opts){
  opts = opts || {};
  return GV.loadGoogleMaps().then(function(google){
    return new Promise(function(resolve){
      var overlay = document.createElement('div');
      overlay.className = 'gv-modal-overlay';
      var stopFieldsHtml = '';
      if(opts.withStopFields){
        stopFieldsHtml =
          '<div class="gv-tipo-toggle">' +
            '<button type="button" id="gv-tipo-carga">Carga</button>' +
            '<button type="button" id="gv-tipo-descarga">Descarga</button>' + '<button type="button" id="gv-tipo-ambos">Ambos</button>' + '<button type="button" id="gv-tipo-opera">Opera</button>' +
          '</div>' +
          '<div class="gv-form-row"><label>Tiempo programado en el sitio<span class="gv-req">*</span></label>' +
          '<div style="display:flex;gap:8px;align-items:center"><input type="number" id="gv-map-dur-h" min="0" step="1" value="0" style="width:90px"> <span style="font-size:.8rem;color:#6b7280">horas</span> <input type="number" id="gv-map-dur-m" min="0" max="59" step="5" value="30" style="width:90px"> <span style="font-size:.8rem;color:#6b7280">minutos</span></div>' +
          '<input type="hidden" id="gv-map-duracion" value="30"></div>';
      }
      /* Campo para la parada "Espera" (permanece cargado en el sitio hasta un dia/horario
         puntual -- por ejemplo la unidad vuelve a la base a esperar hasta el dia siguiente
         porque el cliente no puede recibir la descarga hoy). A diferencia de una parada de
         carga/descarga normal (minutos fijos), aca se carga un limite de fecha/hora absoluto:
         GV.pickLocation lo resuelve como { tipo:'espera', permaneceHasta:<ISO> } en vez de
         { tipo, duracionMin }. */
      if(opts.withEsperaField){
        stopFieldsHtml =
          '<div class="gv-form-row"><label>Permanece cargado hasta<span class="gv-req">*</span></label>' +
          '<input type="datetime-local" id="gv-map-permanece-hasta"></div>';
      }
      overlay.innerHTML =
        '<div class="gv-modal gv-modal-loc" style="max-width:min(880px, 94vw)">' +
          '<h3>' + GV.escapeHtml(opts.title || 'Seleccionar ubicacion') + '</h3>' +
          '<div class="gv-search-row">' +
            '<input type="text" id="gv-map-search" placeholder="Direccion, coordenadas (lat,lng) o link de Google Maps...">' +
            '<button type="button" class="gv-btn gv-btn-sec gv-btn-sm" id="gv-map-search-btn">Buscar</button>' +
          '</div>' +
          '<div class="gv-search-row"><input type="text" id="gv-site-search" placeholder="Buscar sitio guardado..."></div>' + '<div id="gv-site-list" style="display:none;max-height:160px;overflow:auto;margin-bottom:6px;border:1px solid #e5e7eb;border-radius:8px;padding:4px;background:#f9fafb"></div>' +
          (GV.NQN_SIG_ENABLED ? ('<div class="gv-search-row"><input type="text" id="gv-nqn-search" placeholder="Buscar pozo, locacion o instalacion de Neuquen (SIG provincial)..." style="border-color:#0d9488"></div>' + '<div id="gv-nqn-list" style="display:none;max-height:200px;overflow:auto;margin-bottom:6px;border:1px solid #99f6e4;border-radius:8px;padding:4px;background:#f0fdfa"></div>') : '') +
          (opts.vehiculoId ? '<div class="gv-search-row"><button type="button" id="gv-btn-ultima-pos" class="gv-btn gv-btn-sec gv-btn-sm" style="width:100%">Usar ultima posicion del camion</button></div>' : '') +
          '<div id="gv-map-picker" class="gv-map-box" style="height:200px;margin-bottom:4px"></div>' +
          '<div id="gv-map-addr" style="font-size:.78rem;color:#374151;margin-bottom:4px">Hace clic en el mapa para marcar el punto</div>' +
          '<div id="gv-truck-info" style="display:none;font-size:.74rem;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:4px 8px;margin-bottom:4px"></div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap"><span style="font-size:.72rem;color:#6b7280">Area del sitio:</span><button type="button" id="gv-shape-circulo" class="gv-btn gv-btn-sec gv-btn-sm" style="padding:3px 8px;font-size:.68rem">Circulo automatico</button><button type="button" id="gv-shape-manual" class="gv-btn gv-btn-sec gv-btn-sm" style="padding:3px 8px;font-size:.68rem">Dibujar manualmente</button></div>' +
          '<div id="gv-shape-manual-hint" style="display:none;font-size:.72rem;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:4px 8px;margin-bottom:4px">Hace clic en el mapa para agregar los vertices del area del sitio (minimo 3 puntos). <button type="button" id="gv-shape-undo" style="background:none;border:none;color:#7c3aed;text-decoration:underline;cursor:pointer;font-size:.72rem;padding:0;margin-left:6px">Deshacer ultimo punto</button><button type="button" id="gv-shape-clear" style="background:none;border:none;color:#dc2626;text-decoration:underline;cursor:pointer;font-size:.72rem;padding:0;margin-left:6px">Borrar forma</button></div>' +
          '<div id="gv-area-info" style="display:none;font-size:.72rem;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:4px 8px;margin-bottom:4px"></div>' +
          '<div class="gv-search-row"><input type="text" id="gv-site-name" placeholder="Nombre para guardar este sitio (opcional)"><button type="button" class="gv-btn gv-btn-sec gv-btn-sm" id="gv-site-save-btn">Guardar sitio</button></div>' + '<div id="gv-site-edit-indicator" style="display:none;font-size:.74rem;color:#7c3aed;margin:-2px 0 4px 2px">Editando ubicacion del sitio guardado <button type="button" id="gv-site-edit-cancel" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:.74rem;text-decoration:underline;padding:0;margin-left:6px">Cancelar edicion</button></div>' +
          stopFieldsHtml +
          '<div class="gv-modal-actions">' +
            '<button type="button" class="gv-btn gv-btn-sec" id="gv-map-cancel">Cancelar</button>' +
            '<button type="button" class="gv-btn gv-btn-primary" id="gv-map-ok" disabled>Confirmar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var initial = (opts.initial && typeof opts.initial.lat === 'number') ? opts.initial : { lat: -38.951, lng: -68.059 };
      var map = GV.createMap('gv-map-picker', { center: { lat: initial.lat, lng: initial.lng }, zoom: opts.initial ? 15 : 11 });

      var marker = null;
      var current = null;
      var __ultimaPos = null; /* se llena solo cuando el punto salio del boton "Usar ultima posicion del camion" */
      var shapeMode = 'circulo'; var manualPoly = []; var manualPolyLayer = null;
      function redrawManualPoly(){
        if(manualPolyLayer){ try{ manualPolyLayer.setMap(null); }catch(e){} manualPolyLayer = null; }
        if(manualPoly.length >= 3){
          manualPolyLayer = new google.maps.Polygon({ paths: manualPoly, strokeColor:'#7c3aed', strokeWeight:2, fillColor:'#7c3aed', fillOpacity:.15, map: map });
        } else if(manualPoly.length === 2){
          manualPolyLayer = new google.maps.Polyline({ path: manualPoly, strokeColor:'#7c3aed', strokeWeight:2, map: map });
        } else if(manualPoly.length === 1){
          manualPolyLayer = new google.maps.Marker({ position: manualPoly[0], map: map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor:'#7c3aed', fillOpacity:1, strokeWeight:0 } });
        }
      }
      function updateManualPoly(){
        if(current) current.poligono = (shapeMode === 'manual' && manualPoly.length >= 3) ? manualPoly.slice() : null;
        /* Ajuste 15/10: con el area dibujada a mano, el punto del sitio era el primer vertice (el borde de la forma):
           al estar justo en el borde, el viaje no reconocia el sitio guardado y mostraba la direccion en vez del nombre.
           Ahora el punto se mueve al centro del poligono. */
        if(current && shapeMode === 'manual' && manualPoly.length >= 3){
          var __cLat = 0, __cLng = 0; manualPoly.forEach(function(pp){ __cLat += pp.lat; __cLng += pp.lng; });
          __cLat /= manualPoly.length; __cLng /= manualPoly.length;
          if(!GV.isWithinSite({ lat: current.lat, lng: current.lng }, { lat: __cLat, lng: __cLng, poligono: manualPoly }) || manualPoly.some(function(pp){ return Math.abs(pp.lat - current.lat) < 1e-7 && Math.abs(pp.lng - current.lng) < 1e-7; })){
            current.lat = __cLat; current.lng = __cLng;
            if(marker){ try{ marker.setPosition({ lat: __cLat, lng: __cLng }); }catch(e){} }
          }
        }
        scheduleAreaPreview();
        redrawManualPoly();
      }
      /* Vista previa del area de deteccion del sitio: se dibuja siempre sobre el mapa el poligono
         dibujado a mano (si el sitio tiene uno) o el circulo automatico, con su radio en metros, para
         que el coordinador vea exactamente donde se va a detectar el ingreso/egreso de la unidad. */
      var areaLayer = null, areaBaseLayer = null;
      function redrawAreaPreview(){
        if(areaLayer){ try{ areaLayer.setMap(null); }catch(e){} areaLayer = null; }
        if(areaBaseLayer){ try{ areaBaseLayer.setMap(null); }catch(e){} areaBaseLayer = null; }
        var info = document.getElementById("gv-area-info");
        if(!current || typeof current.lat !== "number"){ if(info){ if(shapeMode === "manual"){ info.style.display = "block"; info.innerHTML = "Dibujando el area a mano: " + manualPoly.length + " de minimo 3 puntos. Hace clic en el mapa para agregar los vertices."; } else { info.style.display = "none"; } } return; }
        /* Ajuste 15/10: en "Dibujar manualmente" nunca se muestra el circulo automatico (antes aparecia igual
           mientras se marcaban los primeros puntos, y confundia). */
        if(shapeMode === "manual" && manualPoly.length < 3){
          if(info){ info.style.display = "block"; info.innerHTML = "Dibujando el area a mano: " + manualPoly.length + " de minimo 3 puntos. Hace clic en el mapa para agregar los vertices."; }
          return;
        }
        var poly = (shapeMode === "manual" && manualPoly.length >= 3) ? manualPoly : ((current.poligono && current.poligono.length >= 3) ? current.poligono : null);
        if(info) info.style.display = "block";
        if(poly){
          if(shapeMode !== "manual"){
            areaLayer = new google.maps.Polygon({ paths: poly.map(function(pp){ return { lat: pp.lat != null ? pp.lat : pp[0], lng: pp.lng != null ? pp.lng : pp[1] }; }), strokeColor:"#7c3aed", strokeWeight:2, fillColor:"#7c3aed", fillOpacity:.15, map: map });
          }
          if(info) info.innerHTML = (current.sigNqn && shapeMode !== "manual") ? ("Area de deteccion: <b>contorno de la locacion " + GV.escapeHtml(current.sigNqn) + "</b> segun el SIG de Neuquen (" + poly.length + " vertices). El ingreso y el egreso se detectan cuando la unidad entra o sale del predio.") : ("Area de deteccion: <b>poligono dibujado a mano</b> (" + poly.length + " vertices). El ingreso y el egreso del sitio se detectan cuando la unidad entra o sale de esa forma.");
          return;
        }
        var otros = (opts.otros || []).filter(function(o){ return o && typeof o.lat === "number"; });
        var base = GV.siteBaseRadiusM(current);
        var eff = GV.effectiveRadiusM({ lat: current.lat, lng: current.lng }, otros);
        if(eff < base){
          areaBaseLayer = new google.maps.Circle({ center: { lat: current.lat, lng: current.lng }, radius: base, strokeColor:"#9ca3af", strokeWeight:1, fillOpacity:0, map: map });
        }
        areaLayer = new google.maps.Circle({ center: { lat: current.lat, lng: current.lng }, radius: eff, strokeColor:"#2563eb", strokeWeight:2, fillColor:"#2563eb", fillOpacity:.12, map: map });
        if(info) info.innerHTML = "Area de deteccion: <b>circulo automatico de " + eff + " m de radio</b>" + (eff < base ? (" &mdash; recortado desde " + base + " m porque hay otro sitio de este viaje a menos de " + (2*(eff+25)) + " m; asi no se cruzan los horarios de ingreso/egreso entre los dos sitios. Si el sitio real es mas grande, conviene dibujar el area a mano.") : ".");
      }
      function scheduleAreaPreview(){ setTimeout(redrawAreaPreview, 0); }
      function setShapeMode(mode){
        shapeMode = mode;
        var bC = document.getElementById('gv-shape-circulo'), bM = document.getElementById('gv-shape-manual');
        var hint = document.getElementById('gv-shape-manual-hint');
        if(bC){ bC.style.background = mode === 'circulo' ? 'var(--gv-accent)' : '#fff'; bC.style.color = mode === 'circulo' ? '#fff' : '#20232B'; }
        if(bM){ bM.style.background = mode === 'manual' ? '#7c3aed' : '#fff'; bM.style.color = mode === 'manual' ? '#fff' : '#20232B'; }
        if(hint) hint.style.display = mode === 'manual' ? 'block' : 'none';
        if(mode === 'circulo'){ manualPoly = []; }
        updateManualPoly();
      }
      var tipo = 'carga'; var editingSiteId = null; function renderSiteList(filter){ var box = document.getElementById('gv-site-list'); if(!box) return; var list = (GV.Storage.getSitios ? GV.Storage.getSitios() : []) || []; var f = (filter||'').toLowerCase(); if(f){ /* 20/10: se ignoran espacios, guiones, puntos y acentos ("DLS165" = "DLS 165", "rig-217" = "RIG 217") */ var __cmpS = function(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }; var fc = __cmpS(f); list = list.filter(function(s){ return (s.nombre||'').toLowerCase().indexOf(f) !== -1 || (s.direccion||'').toLowerCase().indexOf(f) !== -1 || (fc && (__cmpS(s.nombre).indexOf(fc) !== -1 || __cmpS(s.direccion).indexOf(fc) !== -1)); }); } if(!list.length){ box.innerHTML = '<div style="font-size:.8rem;color:#9ca3af;padding:6px">Sin sitios guardados' + (f?' que coincidan':'') + '</div>'; return; } box.innerHTML = list.map(function(s){ return '<div class="gv-stop-item" data-site-id="' + s.id + '" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px"><span style="flex:1">' + GV.escapeHtml(s.nombre||s.direccion||'') + '</span><button type="button" class="gv-btn gv-btn-sec gv-btn-sm" data-edit-id="' + s.id + '" style="padding:2px 8px;font-size:.72rem;flex-shrink:0">Editar</button><button type="button" class="gv-btn gv-btn-sm" data-del-id="' + s.id + '" style="padding:2px 8px;font-size:.72rem;flex-shrink:0;background:#fee2e2;color:#b91c1c;border:1px solid #fecaca">Borrar</button></div>'; }).join(''); box.querySelectorAll('[data-site-id]').forEach(function(el){ el.addEventListener('click', function(){ var id = el.getAttribute('data-site-id'); var site = list.find(function(s){ return s.id === id; }); if(!site) return; box.style.display='none'; setMarker(site.lat, site.lng); map.setCenter({ lat: site.lat, lng: site.lng }); map.setZoom(16); current = { lat: site.lat, lng: site.lng, direccion: site.nombre || site.direccion || '', nombreSitio: site.nombre || null }; /* 20/10: se muestra la geocerca del sitio ELEGIDO (antes quedaba dibujada la del sitio anterior) */ editingSiteId = null; if(site.poligono && site.poligono.length >= 3){ manualPoly = site.poligono.map(function(pt){ return { lat: pt.lat, lng: pt.lng }; }); setShapeMode('manual'); current.poligono = site.poligono; } else { manualPoly = []; setShapeMode('circulo'); } var addrEl2 = document.getElementById('gv-map-addr'); if(addrEl2) addrEl2.textContent = current.direccion; var okBtn2 = document.getElementById('gv-map-ok'); if(okBtn2) okBtn2.disabled = false; if(opts.withStopFields && site.tipo){ var tb = document.getElementById('gv-tipo-' + site.tipo); if(tb) tb.click(); var durEl = document.getElementById('gv-map-duracion'); if(durEl && site.duracionMin != null) durEl.value = site.duracionMin; if(GV.__pickSyncDur) GV.__pickSyncDur(); } }); }); box.querySelectorAll('[data-edit-id]').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var id = el.getAttribute('data-edit-id'); var site = list.find(function(s){ return s.id === id; }); if(!site) return; editingSiteId = site.id; setMarker(site.lat, site.lng); map.setCenter({ lat: site.lat, lng: site.lng }); map.setZoom(16); current = { lat: site.lat, lng: site.lng, direccion: site.direccion || site.nombre || '' }; var addrEl3 = document.getElementById('gv-map-addr'); if(addrEl3) addrEl3.textContent = current.direccion; var okBtn3 = document.getElementById('gv-map-ok'); if(okBtn3) okBtn3.disabled = false; var nameEl2 = document.getElementById('gv-site-name'); if(nameEl2) nameEl2.value = site.nombre || ''; var ind = document.getElementById('gv-site-edit-indicator'); if(ind) ind.style.display = 'block'; var saveBtn2 = document.getElementById('gv-site-save-btn'); if(saveBtn2) saveBtn2.textContent = 'Actualizar sitio'; if(site.poligono && site.poligono.length >= 3){ manualPoly = site.poligono.map(function(pt){ return { lat: pt.lat, lng: pt.lng }; }); setShapeMode('manual'); } else { manualPoly = []; setShapeMode('circulo'); } }); }); box.querySelectorAll('[data-del-id]').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var id = el.getAttribute('data-del-id'); var site = list.find(function(s){ return s.id === id; }); if(!site) return; if(!confirm('Borrar el sitio "' + (site.nombre || site.direccion || 'sin nombre') + '"?')) return; GV.Storage.removeSitio(id).then(function(){ if(editingSiteId === id){ editingSiteId = null; var nameElD = document.getElementById('gv-site-name'); if(nameElD) nameElD.value=''; var indD = document.getElementById('gv-site-edit-indicator'); if(indD) indD.style.display='none'; var saveBtnD = document.getElementById('gv-site-save-btn'); if(saveBtnD) saveBtnD.textContent = 'Guardar sitio'; } renderSiteList(filter); }); }); }); }

      function setMarker(lat, lng){
        if(marker){ marker.setMap(null); }
        marker = new google.maps.Marker({ position: { lat: lat, lng: lng }, map: map, draggable: true });
        marker.addListener('dragend', function(e){ onPoint(e.latLng.lat(), e.latLng.lng()); });
        scheduleAreaPreview();
      }

      function onPoint(lat, lng){
        __ultimaPos = null;
        var __prevPoligono = current && current.poligono, __prevSig = current && current.sigNqn;
        current = { lat: lat, lng: lng, direccion: 'Buscando direccion...' };
        /* 20/10: editando un sitio de un viaje (mantenerNombre): al mover el punto se conserva el nombre del sitio. */
        var __nmKeep = opts.mantenerNombre ? ((document.getElementById('gv-site-name') || {}).value || '').trim() : '';
        if(__nmKeep){ current.direccion = __nmKeep; current.nombreSitio = __nmKeep; }
        /* Contorno tomado del SIG de Neuquen: se conserva solo si el punto nuevo sigue adentro de esa locacion. */
        /* 26/10 (caso H337 Sañudo, PH 359): el area anterior (contorno del SIG o poligono dibujado a mano) se conserva SOLO si
           el punto nuevo sigue adentro de ella. Antes un poligono dibujado a mano se conservaba siempre: se movia el punto a
           2,5 km pero la geocerca quedaba en el lugar viejo y la unidad nunca figuraba "en sitio". */
        if(__prevPoligono && GV.pointInPolygon({ lat: lat, lng: lng }, __prevPoligono)){ current.poligono = __prevPoligono; if(__prevSig) current.sigNqn = __prevSig; }
        else if(__prevPoligono && !__prevSig && shapeMode === 'manual'){ manualPoly = []; try{ updateManualPoly(); }catch(__eMP){} setShapeMode('circulo'); }
        else if(__prevSig && shapeMode === 'circulo'){ var __bC2 = document.getElementById('gv-shape-circulo'); if(__bC2){ __bC2.style.background = 'var(--gv-accent)'; __bC2.style.color = '#fff'; } }
        scheduleAreaPreview();
        var addrEl = document.getElementById('gv-map-addr');
        if(addrEl) addrEl.textContent = current.direccion;
        var okBtn = document.getElementById('gv-map-ok');
        if(okBtn) okBtn.disabled = false;
        if(__nmKeep){ if(addrEl) addrEl.textContent = __nmKeep + ' (punto movido: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')'; return; }
        GV.reverseGeocode(lat, lng).then(function(label){
          current.direccion = label;
          if(addrEl) addrEl.textContent = label;
        });
      }

      if(opts.initial && typeof opts.initial.lat === 'number'){
        setMarker(opts.initial.lat, opts.initial.lng);
        current = { lat: opts.initial.lat, lng: opts.initial.lng, direccion: opts.initial.direccion || '' };
        /* Si el sitio que se esta editando ya tenia un area dibujada a mano, se conserva y se muestra. */
        if(opts.initial.poligono && opts.initial.poligono.length >= 3) current.poligono = opts.initial.poligono;
        var addrEl0 = document.getElementById('gv-map-addr');
        if(addrEl0) addrEl0.textContent = current.direccion || 'Punto seleccionado';
        document.getElementById('gv-map-ok').disabled = false;
      }
      /* 20/10: editar la ubicacion de un sitio de un viaje. El nombre queda fijo (se puede mover el punto sin perderlo)
         y se muestra el camion en el mapa: clic en el camion = poner el sitio ahi. "Guardar sitio" guarda el sitio
         con el nombre y la ubicacion nueva y ya la aplica al viaje. */
      var __truckMarker = null;
      if(opts.mantenerNombre){
        var __nmInit = String(opts.nombreSitio || (opts.initial && opts.initial.direccion) || '').replace(/\s*\(?\s*ubicaci[oó]n a confirmar\s*\)?/ig, '').replace(/\s*-\s*a confirmar\s*$/i, '').trim();
        var __nmIn = document.getElementById('gv-site-name');
        if(__nmIn && __nmInit){ __nmIn.value = __nmInit; if(current){ current.nombreSitio = __nmInit; current.direccion = __nmInit; } var __a0 = document.getElementById('gv-map-addr'); if(__a0) __a0.textContent = __nmInit + ' - arrastra el marcador (o hace clic en el camion) para corregir la ubicacion'; }
      }
      if(opts.mostrarCamion && opts.api && opts.vehiculoId){
        opts.api.call('Get', { typeName: 'DeviceStatusInfo', search: { deviceSearch: { id: opts.vehiculoId } } }, function(res){
          var r = res && res[0]; if(!r || r.latitude == null) return;
          var tp = { lat: r.latitude, lng: r.longitude };
          __truckMarker = new google.maps.Marker({ position: tp, map: map, zIndex: 999, title: 'Camion: clic para poner el sitio en esta posicion',
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#f59e0b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }, label: { text: 'C', color: '#fff', fontSize: '11px', fontWeight: '700' } });
          __truckMarker.addListener('click', function(){ setShapeMode('circulo'); setMarker(tp.lat, tp.lng); onPoint(tp.lat, tp.lng); });
          try{ var bb = new google.maps.LatLngBounds(); bb.extend(tp); if(current) bb.extend({ lat: current.lat, lng: current.lng }); map.fitBounds(bb, 60); if(map.getZoom() > 16) map.setZoom(16); }catch(e){}
          var d = current ? GV.distKm(tp, current) : null;
          var info = document.getElementById('gv-truck-info');
          if(info){ info.style.display = 'block'; info.innerHTML = '<b style="color:#d97706">&#9679; Camion</b> ' + ((r.speed || 0) >= 5 ? ('circulando a ' + Math.round(r.speed) + ' km/h') : 'detenido') + (d != null ? (' - a ' + (d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km') + ' del sitio') : '') + '. Hace clic en el camion para poner el sitio en su posicion.'; }
        });
      }

      map.addListener('click', function(e){
        if(shapeMode === 'manual'){
          manualPoly.push({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          if(manualPoly.length === 1 && !marker){ setMarker(e.latLng.lat(), e.latLng.lng()); onPoint(e.latLng.lat(), e.latLng.lng()); }
          updateManualPoly();
          return;
        }
        setMarker(e.latLng.lat(), e.latLng.lng());
        onPoint(e.latLng.lat(), e.latLng.lng());
      });

      function applyPoint(lat, lng, label, placeName){
        setMarker(lat, lng);
        map.setCenter({ lat: lat, lng: lng });
        map.setZoom(16);
        current = { lat: lat, lng: lng, direccion: label || (lat.toFixed(5) + ', ' + lng.toFixed(5)) };
        document.getElementById('gv-map-addr').textContent = current.direccion;
        document.getElementById('gv-map-ok').disabled = false;
        setShapeMode('circulo');
        if(placeName){
          var nameElS = document.getElementById('gv-site-name');
          if(nameElS && !nameElS.value.trim()) nameElS.value = placeName;
        }
        if(!label){
          GV.reverseGeocode(lat, lng).then(function(rl){
            current.direccion = rl;
            var addrElS = document.getElementById('gv-map-addr');
            if(addrElS) addrElS.textContent = rl;
          });
        }
      }
      function doSearch(){
        var q = document.getElementById('gv-map-search').value.trim();
        if(!q) return;
        var parsed = GV.parseCoordsOrGmapsLink(q);
        if(parsed && parsed.error){
          alert('Ese parece ser un link corto de Google Maps (tipo maps.app.goo.gl o goo.gl/maps), que no trae las coordenadas adentro. Abrilo en el navegador y pega aca el link completo que aparece en la barra de direcciones (por ejemplo, el que tiene "@lat,lng" o "!3d..!4d..").');
          return;
        }
        if(parsed){
          applyPoint(parsed.lat, parsed.lng, parsed.label, parsed.label);
          return;
        }
        GV.geocodeSearch(q).then(function(list){
          if(list && list.length){
            applyPoint(list[0].lat, list[0].lng, list[0].label, null);
          } else {
            alert('No se encontro ninguna direccion, coordenada o link valido para "' + q + '".');
          }
        });
      }
      document.getElementById('gv-map-search-btn').addEventListener('click', doSearch); var siteSearchEl = document.getElementById('gv-site-search'); var siteListBox = document.getElementById('gv-site-list'); if(siteSearchEl) siteSearchEl.addEventListener('input', function(){ if(siteListBox) siteListBox.style.display='block'; renderSiteList(siteSearchEl.value); }); if(siteSearchEl) siteSearchEl.addEventListener('focus', function(){ if(siteListBox) siteListBox.style.display='block'; renderSiteList(siteSearchEl.value); }); if(siteSearchEl) siteSearchEl.addEventListener('blur', function(){ setTimeout(function(){ if(siteListBox) siteListBox.style.display='none'; }, 250); }); renderSiteList(''); var siteSaveBtn = document.getElementById('gv-site-save-btn'); if(siteSaveBtn) siteSaveBtn.addEventListener('click', function(){ if(!current) return; if(shapeMode === 'manual' && manualPoly.length > 0 && manualPoly.length < 3){ alert('Dibuja al menos 3 puntos para definir el area del sitio, o cambia a "Circulo automatico".'); return; } var nameEl = document.getElementById('gv-site-name'); var nombre = (nameEl && nameEl.value.trim()) || current.direccion || 'Sitio sin nombre'; if(editingSiteId){ var patch = { nombre: nombre, direccion: current.direccion || '', lat: current.lat, lng: current.lng, poligono: current.poligono || null }; current.nombreSitio = nombre; GV.Storage.updateSitio(editingSiteId, patch).then(function(){ editingSiteId = null; if(nameEl) nameEl.value=''; var ind = document.getElementById('gv-site-edit-indicator'); if(ind) ind.style.display='none'; siteSaveBtn.textContent = 'Guardar sitio'; renderSiteList(siteSearchEl ? siteSearchEl.value : ''); }); return; } if(opts.mantenerNombre){ var __cmp = function(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }; var __todos = (GV.Storage.getSitios ? GV.Storage.getSitios() : []) || []; if(!Array.isArray(__todos)) __todos = Object.values(__todos); var __ini = opts.initial || {}; var __ex = __todos.filter(function(s){ return __cmp(s.nombre) === __cmp(nombre); })[0] || __todos.filter(function(s){ var dd = GV.distKm({ lat: __ini.lat, lng: __ini.lng }, s); return dd != null && dd * 1000 <= 30 && /confirmar/i.test(s.nombre || ''); })[0]; current.nombreSitio = nombre; current.direccion = nombre; var __fin = function(){ var okB = document.getElementById('gv-map-ok'); if(okB){ okB.disabled = false; okB.click(); } }; if(__ex){ GV.Storage.updateSitio(__ex.id, { nombre: nombre, direccion: nombre, lat: current.lat, lng: current.lng, poligono: current.poligono || null }).then(__fin); } else { var __so = { id: GV.genId('site'), nombre: nombre, direccion: nombre, lat: current.lat, lng: current.lng }; if(current.poligono) __so.poligono = current.poligono; if(opts.withStopFields){ __so.tipo = tipo; var __di = document.getElementById('gv-map-duracion'); __so.duracionMin = __di ? (parseInt(__di.value, 10) || 0) : 0; } GV.Storage.addSitio(__so).then(__fin); } return; } var siteObj = { id: GV.genId('site'), nombre: nombre, direccion: current.direccion || '', lat: current.lat, lng: current.lng }; if(current.poligono) siteObj.poligono = current.poligono; if(opts.withStopFields){ siteObj.tipo = tipo; var durInp = document.getElementById('gv-map-duracion'); siteObj.duracionMin = durInp ? (parseInt(durInp.value,10) || 0) : 0; } current.nombreSitio = nombre; GV.Storage.addSitio(siteObj).then(function(){ if(nameEl) nameEl.value=''; renderSiteList(siteSearchEl ? siteSearchEl.value : ''); var __adr = document.getElementById('gv-map-addr'); if(__adr) __adr.textContent = 'Sitio guardado: ' + nombre; }); }); var siteEditCancelBtn = document.getElementById('gv-site-edit-cancel'); if(siteEditCancelBtn) siteEditCancelBtn.addEventListener('click', function(){ editingSiteId = null; var nameEl3 = document.getElementById('gv-site-name'); if(nameEl3) nameEl3.value=''; var ind2 = document.getElementById('gv-site-edit-indicator'); if(ind2) ind2.style.display='none'; var saveBtn3 = document.getElementById('gv-site-save-btn'); if(saveBtn3) saveBtn3.textContent = 'Guardar sitio'; }); var shapeCirculoBtn = document.getElementById('gv-shape-circulo'); if(shapeCirculoBtn) shapeCirculoBtn.addEventListener('click', function(){ setShapeMode('circulo'); }); var shapeManualBtn = document.getElementById('gv-shape-manual'); if(shapeManualBtn) shapeManualBtn.addEventListener('click', function(){ setShapeMode('manual'); }); var shapeUndoBtn = document.getElementById('gv-shape-undo'); if(shapeUndoBtn) shapeUndoBtn.addEventListener('click', function(){ manualPoly.pop(); updateManualPoly(); }); var shapeClearBtn = document.getElementById('gv-shape-clear'); if(shapeClearBtn) shapeClearBtn.addEventListener('click', function(){ manualPoly = []; updateManualPoly(); }); if(opts.initial && opts.initial.poligono && opts.initial.poligono.length >= 3){ manualPoly = opts.initial.poligono.map(function(pt){ return { lat: pt.lat, lng: pt.lng }; }); setShapeMode('manual'); } else { setShapeMode('circulo'); }
      document.getElementById('gv-map-search').addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); doSearch(); }
      });

      /* Buscador SIG Neuquen (pozos, locaciones, instalaciones) + capa de locaciones en el mapa. */
      (function(){
        var inp = document.getElementById('gv-nqn-search'), box = document.getElementById('gv-nqn-list');
        if(!inp || !box) return;
        var tmr = null, ult = [], capa = [];
        var KL = { loc: ['Locacion', '#0d9488'], pozo: ['Pozo', '#2563eb'], inst: ['Instalacion', '#d97706'] };
        function elegir(it){
          var r = GV.NQN.resolver(it);
          applyPoint(r.lat, r.lng, r.etiqueta, null);
          var nm = document.getElementById('gv-site-name'); if(nm) nm.value = r.nombre;
          if(r.poligono && r.poligono.length >= 3){
            current.poligono = r.poligono.slice(); current.sigNqn = (it.k === 'loc') ? r.nombre : (GV.NQN.datos().locs[it.li] || {}).nombre || r.nombre;
            var __bC = document.getElementById('gv-shape-circulo'); if(__bC){ __bC.style.background = '#fff'; __bC.style.color = '#20232B'; }
            try{ var bb = new google.maps.LatLngBounds(); r.poligono.forEach(function(p){ bb.extend(p); }); map.fitBounds(bb); if(map.getZoom() > 18) map.setZoom(18); }catch(e){}
          } else { current.sigNqn = null; }
          scheduleAreaPreview();
          box.style.display = 'none';
        }
        function pintar(q){
          ult = GV.NQN.search(q, 40);
          if(!ult.length){ box.innerHTML = '<div style="font-size:.8rem;color:#6b7280;padding:6px">Sin resultados para "' + GV.escapeHtml(q) + '"</div>'; return; }
          box.innerHTML = ult.map(function(it, i){ var kl = KL[it.k]; return '<div data-nqn-i="' + i + '" style="cursor:pointer;padding:5px 6px;border-bottom:1px solid #ccfbf1;font-size:.8rem"><span style="display:inline-block;font-size:.66rem;font-weight:700;color:#fff;background:' + kl[1] + ';border-radius:4px;padding:1px 5px;margin-right:6px">' + kl[0] + '</span><b>' + GV.escapeHtml(it.nombre) + '</b>' + (it.li >= 0 && it.k !== 'loc' ? ' <span style="color:#0d9488;font-size:.7rem">(con contorno de locacion)</span>' : '') + (it.det ? '<div style="color:#6b7280;font-size:.72rem;margin-left:2px">' + GV.escapeHtml(it.det) + '</div>' : '') + '</div>'; }).join('');
        }
        inp.addEventListener('input', function(){
          var q = inp.value.trim(); box.style.display = 'block';
          if(q.length < 2){ box.innerHTML = '<div style="font-size:.8rem;color:#6b7280;padding:6px">Escribi al menos 2 letras (nombre del pozo, locacion, yacimiento, area u operadora).</div>'; return; }
          if(!GV.NQN.datos()) box.innerHTML = '<div style="font-size:.8rem;color:#6b7280;padding:6px">Cargando datos del SIG de Neuquen...</div>';
          clearTimeout(tmr);
          tmr = setTimeout(function(){ GV.NQN.load().then(function(){ if(inp.value.trim() === q) pintar(q); dibujarCapa(); })['catch'](function(e){ box.innerHTML = '<div style="font-size:.8rem;color:#dc2626;padding:6px">No se pudieron cargar los datos del SIG (' + GV.escapeHtml(e.message) + ').</div>'; }); }, 200);
        });
        box.addEventListener('mousedown', function(e){ var el = e.target.closest('[data-nqn-i]'); if(!el) return; e.preventDefault(); var it = ult[parseInt(el.getAttribute('data-nqn-i'), 10)]; if(it) elegir(it); });
        inp.addEventListener('blur', function(){ setTimeout(function(){ box.style.display = 'none'; }, 200); });
        inp.addEventListener('focus', function(){ if(inp.value.trim().length >= 2 && ult.length) box.style.display = 'block'; });
        /* Capa: con zoom 14 o mas se dibujan los contornos de las locaciones a la vista; tocando una se elige. */
        function dibujarCapa(){
          capa.forEach(function(p){ p.setMap(null); }); capa = [];
          if(!GV.NQN.datos() || map.getZoom() < 14) return;
          var b = map.getBounds(); if(!b) return;
          var sw = b.getSouthWest(), ne = b.getNorthEast();
          GV.NQN.enVista(sw.lat(), sw.lng(), ne.lat(), ne.lng(), 300).forEach(function(l){
            var pg = new google.maps.Polygon({ paths: GV.NQN.polyDe(l.idx), strokeColor: '#0d9488', strokeWeight: 1, fillColor: '#14b8a6', fillOpacity: .08, map: map, zIndex: 1 });
            pg.addListener('click', function(){ if(shapeMode === 'manual') return; elegir({ k: 'loc', nombre: l.nombre, li: l.idx }); });
            pg.addListener('mouseover', function(){ pg.setOptions({ fillOpacity: .25 }); var a = document.getElementById('gv-map-addr'); if(a && !current) a.textContent = 'Locacion ' + l.nombre + (l.tipo ? ' (' + l.tipo + ')' : ''); });
            pg.addListener('mouseout', function(){ pg.setOptions({ fillOpacity: .08 }); });
            capa.push(pg);
          });
        }
        map.addListener('idle', function(){ if(GV.NQN.datos()) dibujarCapa(); });
        GV.NQN.load().then(function(){ dibujarCapa(); })['catch'](function(){});
      })();

      /* La importacion desde KML (por archivo o por el link de My Maps) ya no se muestra aca --
         se saco del selector de ubicacion para que al elegir el punto de un viaje solo se vea el
         buscador de "sitio guardado". La lista de sitios de proveedores como HP se mantiene al
         dia sola, en segundo plano, con GV.autoSyncSitiosDiario() (ver mas abajo en este archivo,
         se llama una vez por dia desde index.html al iniciar el panel). */

      var ultimaPosBtn = document.getElementById('gv-btn-ultima-pos');
      if(ultimaPosBtn){
        ultimaPosBtn.addEventListener('click', function(){
          if(!opts.api || !opts.vehiculoId){ alert('Selecciona primero un vehiculo.'); return; }
          var textoOriginal = ultimaPosBtn.textContent;
          ultimaPosBtn.disabled = true;
          ultimaPosBtn.textContent = 'Buscando posicion...';
          function restaurarBtn(){ ultimaPosBtn.disabled = false; ultimaPosBtn.textContent = textoOriginal; }
          opts.api.call('Get', { typeName: 'DeviceStatusInfo', search: { deviceSearch: { id: opts.vehiculoId } } }, function(res){
            restaurarBtn();
            if(res && res.length && res[0].latitude != null && res[0].longitude != null){
              setMarker(res[0].latitude, res[0].longitude);
              map.setCenter({ lat: res[0].latitude, lng: res[0].longitude });
              map.setZoom(16);
              setShapeMode('circulo');
              onPoint(res[0].latitude, res[0].longitude);
              __ultimaPos = { lat: res[0].latitude, lng: res[0].longitude, vel: (res[0].speed > 0 ? res[0].speed : (res[0].isDriving === true ? 5 : 0)) };
              if(current){ delete current.nombreSitio; delete current.poligono; current.direccion = 'Posicion actual del camion'; }
              var __adU = document.getElementById('gv-map-addr'); if(__adU) __adU.textContent = 'Posicion actual del camion (se guarda como origen con la hora)';
            } else {
              alert('No se pudo obtener la ultima posicion del vehiculo.');
            }
          }, function(){ restaurarBtn(); alert('No se pudo obtener la ultima posicion del vehiculo.'); });
        });
      }

      if(opts.withStopFields){
        var bc = document.getElementById('gv-tipo-carga');
        var bd = document.getElementById('gv-tipo-descarga'); var ba = document.getElementById('gv-tipo-ambos'); var bo = document.getElementById('gv-tipo-opera'); function selectTipo(t){ tipo = t; bc.classList.toggle('gv-sel-carga', t==='carga'); bd.classList.toggle('gv-sel-descarga', t==='descarga'); ba.classList.toggle('gv-sel-ambos', t==='ambos'); if(bo) bo.classList.toggle('gv-sel-opera', t==='opera'); }
        if(bo) bo.addEventListener('click', function(){ selectTipo('opera'); });
        /* horas + minutos visibles; el total en minutos queda en el campo oculto gv-map-duracion (lo que se guarda) */
        var __dh = document.getElementById('gv-map-dur-h'), __dm = document.getElementById('gv-map-dur-m'), __dt = document.getElementById('gv-map-duracion');
        var __durDesdeVisibles = function(){ var h = parseInt(__dh.value, 10) || 0, m = parseInt(__dm.value, 10) || 0; if(h < 0) h = 0; if(m < 0) m = 0; __dt.value = h * 60 + m; };
        GV.__pickSyncDur = function(){ var t = parseInt(__dt.value, 10) || 0; __dh.value = Math.floor(t / 60); __dm.value = t % 60; };
        __dh.addEventListener('input', __durDesdeVisibles); __dm.addEventListener('input', __durDesdeVisibles);
        bc.addEventListener('click', function(){ selectTipo('carga'); });
        bd.addEventListener('click', function(){ selectTipo('descarga'); }); ba.addEventListener('click', function(){ selectTipo('ambos'); }); if(opts.initial && opts.initial.tipo){ selectTipo(opts.initial.tipo); } else { selectTipo('carga'); } if(opts.initial && typeof opts.initial.duracionMin === 'number'){ document.getElementById('gv-map-duracion').value = opts.initial.duracionMin; GV.__pickSyncDur(); }
      }

      if(opts.withEsperaField && opts.initial && opts.initial.permaneceHasta){
        var __phInit = new Date(opts.initial.permaneceHasta);
        if(!isNaN(__phInit.getTime())){
          var __pad2 = function(n){ return (n < 10 ? '0' : '') + n; };
          var __phInitEl = document.getElementById('gv-map-permanece-hasta');
          if(__phInitEl) __phInitEl.value = __phInit.getFullYear() + '-' + __pad2(__phInit.getMonth()+1) + '-' + __pad2(__phInit.getDate()) + 'T' + __pad2(__phInit.getHours()) + ':' + __pad2(__phInit.getMinutes());
        }
      }

      function cleanup(){ overlay.remove(); }

      document.getElementById('gv-map-cancel').addEventListener('click', function(){ cleanup(); resolve(null); });
      document.getElementById('gv-map-ok').addEventListener('click', function(){
        if(!current) return;
        var __nmEl = document.getElementById('gv-site-name');
        var __nm = current.nombreSitio || (__nmEl && __nmEl.value.trim()) || '';
        /* 21/10: si el punto salio de "Usar ultima posicion del camion", NO se conserva el nombre del sitio anterior
           (antes quedaba "HASA CANAL V" con las coordenadas del camion y parecia que no lo tomaba). */
        var __ultPosAhora = !!(__ultimaPos && __ultimaPos.lat === current.lat && __ultimaPos.lng === current.lng);
        if(__ultPosAhora){ var __hn = new Date(); __nm = 'Posicion del camion a las ' + ('0' + __hn.getHours()).slice(-2) + ':' + ('0' + __hn.getMinutes()).slice(-2); }
        var result = { lat: current.lat, lng: current.lng, direccion: __nm || current.direccion };
        if(current.poligono && !__ultPosAhora) result.poligono = current.poligono;
        /* Origen = ultima posicion del camion: se deja marcado para que el viaje nazca "en curso" (ver Guardar Viaje). */
        if(opts.vehiculoId){
          var __esUltPos = (__ultimaPos && __ultimaPos.lat === current.lat && __ultimaPos.lng === current.lng) ||
            (opts.initial && opts.initial.ultimaPos && opts.initial.ultimaPosVeh === opts.vehiculoId && opts.initial.lat === current.lat && opts.initial.lng === current.lng);
          if(__esUltPos){
            result.ultimaPos = true; result.ultimaPosVeh = opts.vehiculoId;
            result.ultimaPosVel = (__ultimaPos && __ultimaPos.lat === current.lat && __ultimaPos.lng === current.lng) ? __ultimaPos.vel : ((opts.initial && opts.initial.ultimaPosVel) || 0);
          }
        }
        if(opts.withStopFields){
          result.tipo = tipo;
          result.duracionMin = parseInt(document.getElementById('gv-map-duracion').value, 10) || 0;
        }
        if(opts.withEsperaField){
          var __phEl = document.getElementById('gv-map-permanece-hasta');
          var __phVal = __phEl ? __phEl.value : '';
          if(!__phVal){ alert('Ingresa hasta que dia y horario permanece cargado en el sitio.'); return; }
          var __phDate = new Date(__phVal);
          if(isNaN(__phDate.getTime())){ alert('Fecha u horario invalido.'); return; }
          result.tipo = 'espera';
          result.permaneceHasta = __phDate.toISOString();
        }
        cleanup();
        resolve(result);
      });

      function gvFixMapSize(){ GV.fixMapSize(map); }
      if (window.requestAnimationFrame) { requestAnimationFrame(function(){ requestAnimationFrame(gvFixMapSize); }); }
      setTimeout(gvFixMapSize, 60);
      setTimeout(gvFixMapSize, 150);
      setTimeout(gvFixMapSize, 350);
      setTimeout(gvFixMapSize, 700);
      setTimeout(gvFixMapSize, 1200);
    });
  }).catch(function(err){
    alert('No se pudo abrir el mapa: ' + (err && err.message ? err.message : err));
    return null;
  });
};

/* ---------------- Wrapper de API directa (fallback fuera de Geotab) ---------------- */
GV.makeDirectApi = function(){
  return {
    call: function(method, params, success, failure){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/apiv1');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function(){
        try{
          var r = JSON.parse(xhr.responseText);
          if(r.result !== undefined){ if(success) success(r.result); }
          else { if(failure) failure(r.error || r); }
        }catch(e){ if(failure) failure(e); }
      };
      xhr.onerror = function(){ if(failure) failure('network error'); };
      xhr.withCredentials = true;
      xhr.send(JSON.stringify({ method: method, params: params || {} }));
    }
  };
};

/* ---------------- Sesion / identificacion de usuario ---------------- */
GV.getSession = function(api){
  return new Promise(function(resolve){
    if(api && typeof api.getSession === 'function'){
      api.getSession(function(session){ resolve(session || {}); });
    } else {
      resolve({});
    }
  });
};

/* ---------------- Camara del vehiculo (Geotab Video / dashcam) ----------------
Reutiliza la MISMA sesion de MyGeotab (api.getSession) que ya usa el resto de la app -- el
API de Video de Geotab (camaras propias y de socios: Lytx, Netradyne, Surfsight, etc.) no
necesita una clave ni una autenticacion separada, es el mismo apiv1 con typeName "Camera". */
GV._camCache = {};
GV.getCameraForDevice = function(api, deviceId){
  if(!api || !deviceId) return Promise.resolve(null);
  if(Object.prototype.hasOwnProperty.call(GV._camCache, deviceId)) return Promise.resolve(GV._camCache[deviceId]);
  return new Promise(function(resolve){
    api.call('Get', { typeName: 'Camera', search: { deviceSearch: { deviceIds: [deviceId] } } }, function(res){
      var cam = (res && res.length) ? res[0] : null;
      GV._camCache[deviceId] = cam;
      resolve(cam);
    }, function(){ GV._camCache[deviceId] = null; resolve(null); });
  });
};

/* ---------------- Numero de serie de camara REALMENTE activo (fix imagenes de camara) ----------------
Bug encontrado y confirmado en vivo (probado directamente contra la API de MyGeotab, no solo en
teoria): el objeto "Camera" que Geotab asocia a una unidad puede quedar desactualizado cuando se
reemplaza el equipo fisico de la dashcam (recambio de hardware, garantia, etc.) -- el numero de
serie que devuelve GV.getCameraForDevice sigue siendo el de la camara VIEJA, mientras que la
camara nueva instalada en el vehiculo es la que realmente esta generando eventos y grabaciones.
Con el numero de serie viejo, el reproductor <gvp-video-player> ni siquiera intenta pedir la
grabacion (no genera ningun pedido de red) y se queda cargando para siempre -- por eso nunca
aparecia ninguna imagen. La forma confiable de saber cual es el numero de serie realmente activo
es mirar los eventos reales de camara (CameraEvent) de la unidad: el mas reciente trae el numero
de serie correcto. CameraEvent no admite filtrar por dispositivo del lado del servidor (el
parametro deviceSearch se ignora), asi que se trae una tanda reciente de toda la flota y se
filtra por deviceId del lado del cliente. Si no aparece ningun evento propio en la ventana
reciente, se usa como respaldo el numero de serie del registro "Camera" (comportamiento anterior). */
GV._activeCamSerialCache = {};
GV.getActiveCameraSerial = function(api, deviceId, fallbackSerial){
  if(!api || !deviceId) return Promise.resolve(fallbackSerial || null);
  if(Object.prototype.hasOwnProperty.call(GV._activeCamSerialCache, deviceId)){
    return Promise.resolve(GV._activeCamSerialCache[deviceId] || fallbackSerial || null);
  }
  var to = new Date(), from = new Date(to.getTime() - 2 * 24 * 3600 * 1000);
  return new Promise(function(resolve){
    api.call('Get', { typeName: 'CameraEvent', search: { fromDate: from.toISOString(), toDate: to.toISOString() } }, function(res){
      var best = null;
      (res || []).forEach(function(ev){
        if(ev.deviceId !== deviceId || !ev.cameraSerialNumber) return;
        var t = new Date(ev.recordingStart || ev.eventStart || 0).getTime();
        if(!best || t > best.t){ best = { t: t, serial: ev.cameraSerialNumber }; }
      });
      var serial = (best && best.serial) || fallbackSerial || null;
      GV._activeCamSerialCache[deviceId] = serial;
      resolve(serial);
    }, function(){ resolve(fallbackSerial || null); });
  });
};

/* ---------------- Lista de eventos reales de camara de un viaje (para "enganchar" el hover) ----------------
Motivo de este agregado: comparando con el Historial de viajes NATIVO de Geotab (mismo vehiculo,
mismo dia), se vio que ahi SI aparece imagen real y en nuestro hover a veces no, aun con el numero
de serie correcto. Se confirmo en vivo, probando directamente contra la API de Video con el mismo
numero de serie: pedir la grabacion de un instante donde SI hubo un CameraEvent real (el mismo
que mostraba el historial nativo) funciona y trae una imagen real -- pero pedir la grabacion de un
instante arbitrario del GPS a solo 9 minutos de diferencia, sin evento real ahi, no trae nada (ni
siquiera con el numero de serie correcto). Esto no es un bug de nuestro codigo: la "Recording
Playback" bajo demanda de Geotab Video no garantiza tener grabacion guardada para cualquier
instante del pasado, solo para los instantes de eventos reales (los que Geotab ya sincronizo).
Por eso el historial nativo, cuando muestra imagenes, en realidad esta mostrando esos eventos
reales (los numeritos agrupados que se ven en su reproductor), no cualquier punto del recorrido.
Con esta funcion se trae la lista completa de esos eventos reales del vehiculo en el rango de
fechas del viaje, para que el hover pueda "engancharse" al evento real mas cercano en el tiempo
en vez de pedir siempre el instante arbitrario donde cayo el mouse.

Actualizacion (comparando en vivo, red de por medio, contra el Historial de viajes nativo): el
propio Geotab, para un punto cualquiera del recorrido que NO sea uno de estos eventos reales,
tampoco muestra ninguna imagen -- al pasar el mouse por la linea del recorrido nativo solo se ve
un cartel de estado (velocidad, detenido, etc.), nunca una foto. Las fotos/videos nativos SOLO
aparecen para estos eventos reales marcados con camarita en su lista de "Eventos", y ahi las trae
de un archivo ya subido a un servicio propio de Geotab (no del mismo componente <gvp-video-player>
que usamos aca, que solo sabe pedir grabacion en vivo/on-demand a la camara -- probamos varios
nombres de objeto de la API publica -- MediaFile, ExceptionEvent, CameraMediaFile -- y ninguno
expone ese archivo ya subido). Por eso ahora, si el mouse esta lejos en el tiempo de todo evento
real, directamente NO se intenta mostrar nada (antes se insistia con el instante arbitrario del
GPS, que en la enorme mayoria de los casos termina en "Imagen no disponible" despues de una
espera larga -- igual de "vacio" para el usuario pero con una demora y un cartel de error de mas).
Ver detCamNearestIdx/renderCamEventMarkers en index.html: ahi se dibuja ademas una camarita en el
mapa sobre la posicion de cada evento real, para que quede claro DONDE sí hay imagen disponible. */
GV.getCameraEventsForDevice = function(api, deviceId, fromISO, toISO){
  if(!api || !deviceId) return Promise.resolve([]);
  return new Promise(function(resolve){
    api.call('Get', { typeName: 'CameraEvent', search: { fromDate: fromISO, toDate: toISO } }, function(res){
      var out = (res || [])
        .filter(function(ev){ return ev.deviceId === deviceId && ev.cameraSerialNumber; })
        .map(function(ev){
          return { ts: Math.floor(new Date(ev.recordingStart || ev.eventStart).getTime() / 1000), serial: ev.cameraSerialNumber, eventType: ev.eventType, ruleName: ev.ruleName || ev.eventType };
        })
        .sort(function(a, b){ return a.ts - b.ts; });
      resolve(out);
    }, function(){ resolve([]); });
  });
};

/* ---------------- Fotos periodicas de la camara a lo largo del recorrido (23/10) ----------------
Mismo mecanismo que usa el Historial de viajes "Nuevos" de MyGeotab (relevado en vivo): la lista de
paquetes de miniaturas se pide a media-services.geotab.com/api/SmarterAi/Thumbnails/serialNumber/<serie
del equipo GO> con fromTime/toTime, autenticando con la sesion de MyGeotab en encabezados X-MyGeotab-*.
Cada paquete (.thm, URL firmada de Google Storage que vence) es un TAR con varias fotos JPEG cuyo nombre
es el instante en milisegundos ("1792753906976.vid_1"). MyGeotab ademas manda un token Bearer propio que
un add-in no recibe: si el servicio lo exige, esto devuelve [] y el detalle sigue como antes. */
GV._devSerialCache = {};
GV.getDeviceSerial = function(api, deviceId){
  if(!api || !deviceId) return Promise.resolve(null);
  if(GV._devSerialCache[deviceId] !== undefined) return Promise.resolve(GV._devSerialCache[deviceId]);
  return new Promise(function(resolve){
    api.call('Get', { typeName: 'Device', search: { id: deviceId } }, function(res){
      var s = (res && res[0] && res[0].serialNumber) || null; GV._devSerialCache[deviceId] = s; resolve(s);
    }, function(){ resolve(null); });
  });
};
GV._thumbAuthFail = false;
GV.getCameraThumbPacks = function(api, deviceId, fromISO, toISO){
  if(!api || !deviceId || GV._thumbAuthFail) return Promise.resolve([]);
  return Promise.all([GV.getDeviceSerial(api, deviceId), GV.getSession(api)]).then(function(r){
    var serial = r[0], ses = r[1] || {};
    if(!serial || !ses.sessionId) return [];
    var headers = { 'X-MyGeotab-Database': ses.database || '', 'X-MyGeotab-Username': ses.userName || '', 'X-MyGeotab-SessionId': ses.sessionId, 'X-MyGeotab-Path': ses.server || 'my.geotab.com' };
    var base = 'https://media-services.geotab.com/api/SmarterAi/Thumbnails/serialNumber/' + encodeURIComponent(serial);
    /* Probado en vivo: fromTime/toTime van en milisegundos (el formato ISO da 400) y la ventana maxima es de 6 h,
       asi que el rango del viaje se pide en tramos de hasta 6 h. */
    var desde = new Date(fromISO).getTime(), hasta = new Date(toISO).getTime(), VENT = 6 * 3600 * 1000 - 60000;
    var tramos = []; for(var t0 = desde; t0 < hasta; t0 += VENT) tramos.push([t0, Math.min(hasta, t0 + VENT)]);
    if(tramos.length > 12) tramos = tramos.slice(-12); /* tope: ultimas 72 h */
    /* 23/10: los tramos se piden de a 4 en paralelo (antes de a uno: en un viaje de 3 dias tardaba 10-15 s). */
    var porTramo = [], sig = 0;
    function trabajador(){
      if(sig >= tramos.length || GV._thumbAuthFail) return Promise.resolve();
      var i = sig++;
      var url = base + '?fromTime=' + tramos[i][0] + '&toTime=' + tramos[i][1];
      return fetch(url, { headers: headers }).then(function(resp){
        if(resp.status === 401 || resp.status === 403){ GV._thumbAuthFail = true; try{ console.info('Fotos de camara: el servicio de video no acepta la sesion del add-in (' + resp.status + ')'); }catch(_){} return null; }
        if(!resp.ok) return null;
        return resp.json();
      }).then(function(j){
        porTramo[i] = ((j && j.thumbnailPacks) || []).map(function(p){ return p && p.url; }).filter(Boolean);
      })['catch'](function(){}).then(trabajador);
    }
    return Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]).then(function(){
      var urls = []; porTramo.forEach(function(l){ if(l) urls = urls.concat(l); }); return urls;
    });
  })['catch'](function(){ return []; });
};
/* Abre un paquete .thm (TAR) y devuelve [{ms, url(blob)}] */
GV.unpackCameraThumbs = function(packUrl){
  return fetch(packUrl).then(function(r){ if(!r.ok) throw new Error('pack ' + r.status); return r.arrayBuffer(); }).then(function(buf){
    var u8 = new Uint8Array(buf), out = [], off = 0;
    function str(a, b){ var s = ''; for(var i = a; i < b && u8[i]; i++) s += String.fromCharCode(u8[i]); return s; }
    while(off + 512 <= u8.length){
      var name = str(off, off + 100);
      if(!name) break;
      var size = parseInt(str(off + 124, off + 136).trim() || '0', 8) || 0;
      var dataStart = off + 512;
      var m = name.match(/(\d{12,14})/);
      if(m && size > 0){
        var blob = new Blob([u8.subarray(dataStart, dataStart + size)], { type: 'image/jpeg' });
        out.push({ ms: parseInt(m[1], 10), url: URL.createObjectURL(blob), lente: (name.match(/vid_(\d+)/) || [])[1] || '1' });
      }
      off = dataStart + Math.ceil(size / 512) * 512;
    }
    return out;
  })['catch'](function(){ return []; });
};
/* Buscador "perezoso" de fotos (23/10): un viaje largo trae cientos de paquetes (~110 KB c/u), asi que NO se
   descargan todos. Los paquetes se ordenan por su ruta (.../<dia del año>/<equipo>/8/CAMERA/<n>-<x>-<orden>.thm,
   aproximadamente cronologico) y, para un instante pedido, se descargan solo los necesarios con una busqueda
   por interpolacion (2 a 6 paquetes la primera vez; despues quedan en memoria). */
GV.createThumbFinder = function(urls){
  function clave(u){
    var m = String(u).split('?')[0].match(/\/(\d{4})\/(\d{1,3})\/[^\/]+\/\d+\/CAMERA\/(\d+)-[^-\/]+-(\d+)\.thm$/i);
    if(!m) return [0, 0, 0, 0];
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10)];
  }
  var packs = urls.map(function(u){ return { url: u, k: clave(u), fotos: null, prom: null }; });
  packs.sort(function(a, b){ for(var i = 0; i < 4; i++){ if(a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; } return 0; });
  function cargar(i){
    var pk = packs[i];
    if(!pk) return Promise.resolve([]);
    if(pk.fotos) return Promise.resolve(pk.fotos);
    if(!pk.prom) pk.prom = GV.unpackCameraThumbs(pk.url).then(function(f){
      var l1 = f.filter(function(x){ return x.lente === '1'; });
      pk.fotos = (l1.length ? l1 : f).sort(function(a, b){ return a.ms - b.ms; });
      return pk.fotos;
    });
    return pk.prom;
  }
  function rango(i){ var f = packs[i] && packs[i].fotos; return (f && f.length) ? [f[0].ms, f[f.length - 1].ms] : null; }
  function cercana(t){
    var best = null, bd = Infinity;
    packs.forEach(function(pk){ (pk.fotos || []).forEach(function(x){ var d = Math.abs(x.ms - t); if(d < bd){ bd = d; best = x; } }); });
    return best ? { foto: best, diff: bd } : null;
  }
  function buscar(t, iter){
    var c = cercana(t);
    if(c && c.diff <= 45000) return Promise.resolve(c.foto);
    if(!packs.length || iter > 7) return Promise.resolve(c && c.diff <= 120000 ? c.foto : null);
    var lo = -1, hi = -1, tlo = null, thi = null;
    for(var i = 0; i < packs.length; i++){
      var r = rango(i); if(!r) continue;
      if(r[0] <= t && (tlo === null || r[0] >= tlo)){ lo = i; tlo = r[0]; }
      if(r[1] >= t && (thi === null || r[1] <= thi)){ hi = i; thi = r[1]; }
    }
    var sig;
    if(!rango(0) && packs[0].fotos === null) sig = 0;
    else if(!rango(packs.length - 1) && packs[packs.length - 1].fotos === null) sig = packs.length - 1;
    else if(lo >= 0 && hi >= 0){
      if(hi - lo <= 1) return Promise.resolve(c && c.diff <= 120000 ? c.foto : null);
      var r2 = rango(hi), r1 = rango(lo);
      var frac = (r2[0] - r1[1]) > 0 ? (t - r1[1]) / (r2[0] - r1[1]) : 0.5;
      sig = Math.min(hi - 1, Math.max(lo + 1, lo + Math.round(frac * (hi - lo))));
    } else return Promise.resolve(c && c.diff <= 120000 ? c.foto : null);
    var tope = 0; while(packs[sig] && packs[sig].fotos !== null && tope++ < packs.length){ sig++; if(sig >= packs.length) return Promise.resolve(c && c.diff <= 120000 ? c.foto : null); }
    return cargar(sig).then(function(){ return buscar(t, iter + 1); });
  }
  var ocupado = false, pendiente = null;
  return {
    total: packs.length,
    /* 23/10: precarga liviana de n paquetes repartidos a lo largo del viaje (de a 2), para que haya puntos
       violetas en todo el recorrido desde el principio. onCarga se llama despues de cada paquete. */
    preload: function(n, onCarga){
      if(!packs.length) return;
      var idx = [], k;
      for(k = 0; k < n; k++){ var i = Math.round(k * (packs.length - 1) / Math.max(1, n - 1)); if(idx.indexOf(i) < 0) idx.push(i); }
      var pos = 0;
      function sigue(){ if(pos >= idx.length) return Promise.resolve(); var i = idx[pos++]; return cargar(i).then(function(){ try{ if(onCarga) onCarga(); }catch(_){} }).then(sigue); }
      sigue(); sigue();
    },
    conocidas: function(){ var out = []; packs.forEach(function(pk){ out = out.concat(pk.fotos || []); }); return out.sort(function(a, b){ return a.ms - b.ms; }); },
    /* devuelve la foto mas cercana a t; si llega un pedido nuevo mientras busca, solo se atiende el ultimo */
    near: function(t){
      return new Promise(function(resolve){
        if(ocupado){ if(pendiente) pendiente.resolve(undefined); pendiente = { t: t, resolve: resolve }; return; }
        ocupado = true;
        (function correr(tt, res){
          buscar(tt, 0)['catch'](function(){ return null; }).then(function(f){
            res(f);
            if(pendiente){ var p = pendiente; pendiente = null; correr(p.t, p.resolve); } else ocupado = false;
          });
        })(t, resolve);
      });
    }
  };
};

/* ---------------- Reproductor de video de Geotab (web component <gvp-video-player>) ----------------
Biblioteca oficial de Geotab Video para insertar imagenes/reproduccion de la camara de un
vehiculo. Se carga una sola vez (CSS + JS) y despues cada <gvp-video-player> que se cree
recibe las credenciales de la sesion actual y, para "Recording Playback", el numero de serie
de la camara (GV.getCameraForDevice) y un timestamp UNIX (playback-start-timestamp). */
/* ---------------- Permiso para ver video/camara ----------------
No existe un API documentado de MyGeotab para preguntar directamente "tiene este usuario
el permiso ViewRecordedVideo?". Se probo una prueba de capacidad (intentar un Get real de
CameraEvent y usar el exito/fracaso como señal), pero esa llamada devuelve un error generico
del servidor (GenericException, no relacionado con permisos) incluso para cuentas con acceso
real a video -- por lo tanto no sirve para distinguir usuarios autorizados de no autorizados.

En su lugar se revisan los "securityGroups" (el/los perfiles de seguridad/clearance) del
usuario logueado -- MyGeotab siempre permite consultarlos vía User Get -- y se compara contra
una lista de clearances que se consideran autorizados para ver camara. Por defecto se incluyen
los dos clearances predefinidos de MyGeotab con mas privilegios (Administrador/"Everything" y
Supervisor); "Solo lectura" y "Ninguno" quedan afuera. Si esta empresa usa un grupo de
seguridad personalizado para dar acceso a video, agregar su id aqui. */
GV.VIDEO_ACCESS_GROUP_IDS = [
  'GroupEverythingSecurityId', // Administrador / acceso total
  'GroupSupervisorSecurityId'  // Supervisor
];
GV._camAccessCache = null; // null = aun no se sabe, true/false = ya resuelto
GV.hasVideoAccess = function(api){
  if(GV._camAccessCache !== null) return Promise.resolve(GV._camAccessCache);
  if(!api) return Promise.resolve(false);
  return new Promise(function(resolve){
    api.getSession(function(session){
      if(!session || !session.userName){ GV._camAccessCache = false; resolve(false); return; }
      api.call('Get', { typeName: 'User', search: { name: session.userName } }, function(res){
        var u = res && res[0];
        var groups = (u && u.securityGroups) || [];
        var allowed = groups.some(function(g){ return GV.VIDEO_ACCESS_GROUP_IDS.indexOf(g.id) !== -1; });
        GV._camAccessCache = allowed; resolve(allowed);
      }, function(){
        GV._camAccessCache = false; resolve(false);
      });
    });
  });
};

GV.GVP_VERSION = '2026.29.02';
GV._gvpLoadPromise = null;
GV.loadGvpPlayer = function(){
  if(GV._gvpLoadPromise) return GV._gvpLoadPromise;
  GV._gvpLoadPromise = new Promise(function(resolve){
    if(window.customElements && customElements.get('gvp-video-player')){ resolve(); return; }
    var base = 'https://storage.googleapis.com/gvp-web-libs/gvp-video-player/' + GV.GVP_VERSION + '/gvp-video-player.min.';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'css';
    document.head.appendChild(link);
    var script = document.createElement('script');
    script.src = base + 'js';
    script.onload = function(){ resolve(); };
    script.onerror = function(){ resolve(); };
    document.head.appendChild(script);
  });
  return GV._gvpLoadPromise;
};

/* ---------------- Almacenamiento compartido (AddInData + respaldo localStorage) ---------------- */
/* ---------------- Ruteo real por calles (OSRM) ---------------- */
/* Tiempos de manejo de CAMION (arreglo 29/9): OSRM calcula los tiempos para un auto, y los camiones
   de la flota (casi siempre cargados, con restriccion de velocidad y trafico) tardan bastante mas.
   Caso real que motivo el ajuste: T289 - Vera Luis Miguel, SIDERCA Senillosa -> Aguila Mora 2302
   (222 km): OSRM estimaba 3h02 y el camion tardo 3h46 (~59 km/h de promedio).
   La duracion de cada tramo es la MAYOR entre:
     - la de OSRM multiplicada por GV.FACTOR_TIEMPO_CAMION, y
     - la distancia recorrida a GV.VEL_PROMEDIO_MAX_CAMION_KMH (un camion no promedia mas que eso
       en ruta aunque OSRM diga que la ruta es rapida).
   Son valores de arranque: si los viajes siguen llegando antes o despues de lo estimado, se
   ajustan solo estos dos numeros y se recalculan todos los horarios estimados. */
GV.FACTOR_TIEMPO_CAMION = 1.3;
GV.VEL_PROMEDIO_MAX_CAMION_KMH = 60;
GV.duracionCamionSeg = function(distanciaM, duracionAutoSeg){
  var porFactor = (duracionAutoSeg || 0) * (GV.FACTOR_TIEMPO_CAMION || 1);
  var porVelocidad = (distanciaM || 0) / 1000 / (GV.VEL_PROMEDIO_MAX_CAMION_KMH || 60) * 3600;
  return Math.max(porFactor, porVelocidad);
};
GV.__getRouteOSRM = function(points){
return new Promise(function(resolve){
try{
if(!points || points.length < 2){ resolve(null); return; }
var coordStr = points.map(function(p){ return p.lng + ',' + p.lat; }).join(';');
var url = 'https://router.project-osrm.org/route/v1/driving/' + coordStr + '?overview=full&geometries=geojson&steps=false';
/* 21/10: el servidor publico de OSRM a veces se cuelga sin responder; sin limite de tiempo el detalle del viaje
   quedaba esperando y no mostraba el itinerario (origen y sitios). A los 8 s se corta y se usa linea recta. */
/* 21/10 (2): si OSRM ya fallo hace menos de 10 min no se lo vuelve a esperar (el detalle abre al instante con rutas
   aprendidas / linea recta), y las rutas que si respondieron quedan en memoria para no pedirlas de nuevo. */
GV.__osrmCache = GV.__osrmCache || {};
if(GV.__osrmCache[coordStr]){ resolve(GV.__osrmCache[coordStr]); return; }
if(GV.__osrmCaidoHasta && Date.now() < GV.__osrmCaidoHasta){ resolve(null); return; }
var __ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
var __to = setTimeout(function(){ try{ if(__ctl) __ctl.abort(); }catch(_){} GV.__osrmCaidoHasta = Date.now() + 10 * 60 * 1000; resolve(null); }, 4000);
fetch(url, __ctl ? { signal: __ctl.signal } : undefined).then(function(r){ return r.json(); }).then(function(data){
clearTimeout(__to);
if(data && data.code === 'Ok' && data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates){
var route = data.routes[0];
var coords = route.geometry.coordinates.map(function(c){ return [c[1], c[0]]; });
var legs = (route.legs || []).map(function(lg){ return { distance: lg.distance, duration: GV.duracionCamionSeg(lg.distance, lg.duration), durationAuto: lg.duration }; });
var durTotal = legs.reduce(function(acc, lg){ return acc + (lg.duration || 0); }, 0);
var __res = { coords: coords, distance: route.distance, duration: legs.length ? durTotal : GV.duracionCamionSeg(route.distance, route.duration), durationAuto: route.duration, legs: legs }; GV.__osrmCache[coordStr] = __res; GV.__osrmCaidoHasta = 0; resolve(__res);
} else { resolve(null); }
}).catch(function(){ clearTimeout(__to); resolve(null); });
}catch(e){ resolve(null); }
});
};

/* ---------------- Memoria de rutas (Ajuste 15/10) ----------------
   Cada vez que una unidad hace un tramo entre dos sitios (sale de A y entra a B), se guarda el
   recorrido REAL del GPS de ese tramo: km, minutos de manejo (sin contar paradas de 30 min o mas)
   y el camino. La proxima vez que se planifique un viaje entre esos mismos dos puntos (a menos de
   500 m de cada uno), GV.getRoute usa el PROMEDIO de los ultimos 5 recorridos reales para la
   distancia y el tiempo, y dibuja el camino del ultimo. Si no hay historial, calcula como antes. */
GV.RUTA_RADIO_KM = 0.5;
GV.rutaClave = function(a, b){
  function r(x){ return Number(x).toFixed(3); }
  return 'ruta_' + r(a.lat) + '_' + r(a.lng) + '__' + r(b.lat) + '_' + r(b.lng);
};
/* 19/10: al LEER la memoria de rutas se descartan las muestras que no pueden ser un recorrido directo entre los
   dos puntos (km mayores al doble de la linea recta + 20 km), y el promedio se recalcula con las que quedan. Asi
   una muestra mala ya guardada (ej. 366 km para dos sitios a 28 km) deja de afectar km y horarios estimados sin
   tener que borrar nada. Si no queda ninguna muestra valida, el tramo se calcula como si no tuviera memoria. */
/* 19/10: excluirVid = id de un viaje cuyas muestras NO se usan (al mostrar un viaje, sus propios recorridos no
   cuentan para estimar sus horarios; si no, el estimado coincide exacto con el real). */
GV.rutaMuestrasValidas = function(x, excluirVid){
  if(!x || !x.n || !x.a || !x.b) return null;
  var recta = GV.distKm(x.a, x.b);
  var todas = x.muestras || [];
  var ms = todas.filter(function(m){ return m && m.km > 0 && m.min > 0 && (recta === null || m.km <= recta * 2 + 20) && (!excluirVid || m.vid !== excluirVid); });
  if(!todas.length) return x;
  if(!ms.length) return null;
  if(ms.length === todas.length) return x;
  var km = 0, mn = 0; ms.forEach(function(m){ km += m.km; mn += m.min; });
  var y = Object.assign({}, x, { muestras: ms, n: ms.length, kmProm: Math.round(km / ms.length * 10) / 10, minProm: Math.round(mn / ms.length) });
  var ultimaValida = ms[ms.length - 1];
  if(x.geoFecha && ultimaValida && ultimaValida.fecha !== x.geoFecha){ delete y.geo; delete y.geoFecha; }
  return y;
};
GV.buscarRutaAprendida = function(a, b, excluirVid){
  var R = (GV.Storage && GV.Storage.getRutas) ? GV.Storage.getRutas() : null;
  if(!R || !a || !b) return null;
  var k = GV.rutaClave(a, b);
  var __xk = R[k] ? GV.rutaMuestrasValidas(R[k], excluirVid) : null;
  if(__xk && __xk.n) return { id: k, r: __xk };
  var mejor = null, mejorD = 1e9;
  Object.keys(R).forEach(function(id){
    var x = GV.rutaMuestrasValidas(R[id], excluirVid); if(!x || !x.n || !x.a || !x.b) return;
    var da = GV.distKm(a, x.a), db = GV.distKm(b, x.b);
    if(da === null || db === null || da > GV.RUTA_RADIO_KM || db > GV.RUTA_RADIO_KM) return;
    if(da + db < mejorD){ mejorD = da + db; mejor = { id: id, r: x }; }
  });
  return mejor;
};
GV.rutaGeoDecode = function(s){
  if(!s) return [];
  return String(s).split(';').map(function(p){ var q = p.split(','); return [parseFloat(q[0]), parseFloat(q[1])]; }).filter(function(c){ return !isNaN(c[0]) && !isNaN(c[1]); });
};
GV.rutaGeoEncode = function(pts){
  /* Simplifica el recorrido (Douglas-Peucker, ~30 m) para que entre holgado en Firestore. */
  if(!pts || pts.length < 2) return '';
  var tol = 0.0003;
  function dps(arr){
    if(arr.length < 3) return arr;
    var a = arr[0], b = arr[arr.length - 1], idx = -1, maxD = 0;
    var dx = b[1] - a[1], dy = b[0] - a[0], L = Math.sqrt(dx * dx + dy * dy) || 1e-12;
    for(var i = 1; i < arr.length - 1; i++){
      var d = Math.abs(dy * arr[i][1] - dx * arr[i][0] + b[1] * a[0] - b[0] * a[1]) / L;
      if(d > maxD){ maxD = d; idx = i; }
    }
    if(maxD <= tol) return [a, b];
    var l = dps(arr.slice(0, idx + 1)), r = dps(arr.slice(idx));
    return l.slice(0, -1).concat(r);
  }
  var s = dps(pts);
  while(s.length > 400){ tol *= 2; s = dps(pts); }
  return s.map(function(c){ return c[0].toFixed(5) + ',' + c[1].toFixed(5); }).join(';');
};
GV.getRoute = function(points, opts){
  if(!points || points.length < 2) return Promise.resolve(null);
  var __excl = (opts && opts.excluirViajeId) || null;
  var mem = [];
  for(var i = 0; i < points.length - 1; i++){ mem.push(GV.buscarRutaAprendida(points[i], points[i + 1], __excl)); }
  if(!mem.some(function(m){ return !!m; })) return GV.__getRouteOSRM(points);
  return Promise.all(mem.map(function(m, i){
    if(m){
      var c = GV.rutaGeoDecode(m.r.geo);
      if(c.length < 2) c = [[points[i].lat, points[i].lng], [points[i + 1].lat, points[i + 1].lng]];
      return Promise.resolve({ coords: c, leg: { distance: (m.r.kmProm || 0) * 1000, duration: (m.r.minProm || 0) * 60, aprendida: { n: m.r.n, ultima: m.r.geoFecha || m.r.actualizado || null } } });
    }
    return GV.__getRouteOSRM([points[i], points[i + 1]]).then(function(rt){
      if(!rt) return null;
      return { coords: rt.coords, leg: (rt.legs && rt.legs[0]) || { distance: rt.distance, duration: rt.duration } };
    });
  })).then(function(parts){
    if(parts.some(function(p){ return !p; })){
      /* Si un tramo sin memoria no se pudo calcular, se arma igual con linea recta para ese tramo. */
      parts = parts.map(function(p, i){ return p || { coords: [[points[i].lat, points[i].lng], [points[i + 1].lat, points[i + 1].lng]], leg: { distance: (GV.distKm(points[i], points[i + 1]) || 0) * 1000, duration: GV.duracionCamionSeg((GV.distKm(points[i], points[i + 1]) || 0) * 1000, 0) } }; });
    }
    var coords = [], legs = [], dist = 0, dur = 0, apr = 0;
    parts.forEach(function(p){ coords = coords.concat(p.coords); legs.push(p.leg); dist += p.leg.distance || 0; dur += p.leg.duration || 0; if(p.leg.aprendida) apr++; });
    return { coords: coords, distance: dist, duration: dur, legs: legs, tramosAprendidos: apr };
  });
};

/* ---------------- Historial de posiciones (LogRecord) ---------------- */
GV.getHistory = function(api, deviceId, fromISO, toISO){
return new Promise(function(resolve){
if(!api || !deviceId){ resolve([]); return; }
api.call('Get', { typeName: 'LogRecord', search: { deviceSearch: { id: deviceId }, fromDate: fromISO, toDate: toISO } }, function(res){
resolve((res || []).slice().sort(function(a,b){ return new Date(a.dateTime) - new Date(b.dateTime); }));
}, function(e){ try{ GV.ultimoErrorHistorial = { msg: String((e && (e.message || e.name)) || e || 'error'), t: Date.now() }; console.warn('GV.getHistory', e); }catch(_){} resolve([]); });
});
};

/* ---------------- Historial de encendido de motor (StatusData / diagnostico de Ignicion) ----------------
   Complementa a GV.getHistory para el caso de una unidad que pernocta en el campo (no vuelve a la
   base) y al otro dia el chofer prende el motor bastante antes de mover el camion -- ahi el GPS
   solo no alcanza para saber cuando arranco realmente la jornada, hace falta el estado de
   encendido. DiagnosticIgnitionId es el diagnostico estandar de Geotab para esto, pero no esta
   confirmado en vivo que este disponible para todos los equipos de esta flota (no se pudo probar
   contra la API real todavia). Por eso esta funcion nunca rompe nada si falla o si el diagnostico
   no existe para un equipo: ante cualquier error devuelve un array vacio, y detectarInicioJornada
   (en index.html) sigue funcionando solo con la señal de movimiento. */
GV.getIgnitionHistory = function(api, deviceId, fromISO, toISO){
return new Promise(function(resolve){
if(!api || !deviceId){ resolve([]); return; }
try{
api.call('Get', { typeName: 'StatusData', search: { deviceSearch: { id: deviceId }, diagnosticSearch: { id: 'DiagnosticIgnitionId' }, fromDate: fromISO, toDate: toISO } }, function(res){
resolve((res || []).slice().sort(function(a,b){ return new Date(a.dateTime) - new Date(b.dateTime); }));
}, function(){ resolve([]); });
}catch(e){ resolve([]); }
});
};

/* ---------------- Tramos de manejo reales del dia (entidad Trip de Geotab) ----------------
   Geotab ya separa, por dispositivo, cada tramo de manejo real (Trip: inicio, fin), descontando
   las paradas -- en vez de reconstruir eso a mano a partir de LogRecord, se suma directamente la
   duracion de los tramos de hoy. Se usa para la columna "HS Manejo" de Seguimiento. Devuelve la
   suma en milisegundos; ante cualquier error devuelve 0 (la columna simplemente queda en 0 en vez
   de romper el resto de la fila). */
GV.getTripsToday = function(api, deviceId, fromISO, toISO){
return new Promise(function(resolve){
if(!api || !deviceId){ resolve(0); return; }
try{
api.call('Get', { typeName: 'Trip', search: { deviceSearch: { id: deviceId }, fromDate: fromISO, toDate: toISO } }, function(res){
var totalMs = 0;
/* Ajuste 1/10: cada tramo se recorta a la ventana pedida [fromISO, toISO]. Asi, si la ventana arranca
   en el inicio de la jornada del chofer (por ejemplo 08:00 en un camion de 24 hs), un tramo que el
   chofer anterior empezo antes de esa hora solo suma la parte posterior. */
var __fromMs = new Date(fromISO).getTime(), __toMs = new Date(toISO).getTime();
(res || []).forEach(function(t){
if(!t.start || !t.stop) return;
var ini = Math.max(new Date(t.start).getTime(), __fromMs);
var fin = Math.min(new Date(t.stop).getTime(), __toMs);
var d = fin - ini;
if(!isNaN(d) && d > 0) totalMs += d;
});
resolve(totalMs);
}, function(){ resolve(0); });
}catch(e){ resolve(0); }
});
};

/* ---------------- Icono de vehiculo: circulo con flecha de rumbo ---------------- */
GV.computeBearing = function(lat1, lng1, lat2, lng2){
var toRad = Math.PI / 180, toDeg = 180 / Math.PI;
var y = Math.sin((lng2 - lng1) * toRad) * Math.cos(lat2 * toRad);
var x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lng2 - lng1) * toRad);
var brng = Math.atan2(y, x) * toDeg;
return (brng + 360) % 360;
};
GV.vehicleIcon = function(heading, color){
var google = window.google;
var deg = (typeof heading === 'number' && !isNaN(heading)) ? heading : 0;
var c = color || '#00A6E0';
var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' +
'<g transform="rotate(' + deg + ' 14 14)">' +
'<circle cx="14" cy="14" r="12.5" fill="' + c + '" stroke="#fff" stroke-width="2"/>' +
'<path d="M14 6.5 L19 18.5 L14 15.3 L9 18.5 Z" fill="#fff"/>' +
'</g></svg>';
return {
url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
scaledSize: new google.maps.Size(28, 28),
anchor: new google.maps.Point(14, 14)
};
};

/* ---------------- Alerta sonora breve ---------------- */
GV.playAlertSound = (function(){
  var ctx = null;
  function getCtx(){
    if(!ctx){
      try{ ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ ctx = null; }
    }
    return ctx;
  }
  try{
    ['click','touchstart','keydown'].forEach(function(evt){
      document.addEventListener(evt, function(){
        var c = getCtx();
        if(c && c.state === 'suspended'){ c.resume()['catch'](function(){}); }
      }, { passive: true });
    });
  }catch(e){}
  return function(){
    var c = getCtx();
    if(!c) return;
    if(c.state === 'suspended'){ c.resume()['catch'](function(){}); }
    var now = c.currentTime;
    function tone(freq, start, dur, peak){
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peak, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
    tone(880, 0, 0.14, 0.16);
    tone(1318.51, 0.11, 0.18, 0.13);
  };
})();

/* ---------------- 23/10: PROTECCION DE HORARIOS REGISTRADOS ----------------
   Pedido de Logistica ("el sistema tiene que ser fiable"): un ingreso/egreso ya registrado (por GPS, por el chofer o
   a mano) NUNCA se pierde por editar el viaje, corregir la ubicacion de un sitio, cambiar la permanencia, o por una
   pantalla con datos viejos que guarda encima. Caso real: T293 Pino (viaje de varios dias): al editar se borraron
   los horarios de los dias anteriores.
   Regla, aplicada en el UNICO lugar por el que pasan todas las escrituras (updateViaje local y el merge contra el
   servidor en persist): un cambio puede PONER o CORREGIR un horario, pero no BORRARLO. Las unicas excepciones:
   - se cambio la estructura de las paradas (se agrego/quito una parada o se reordenaron): ahi quien hace el cambio
     ya reubica los horarios de cada parada fisica (remapSitiosRealParaParadas);
   - se quito el destino (sus horarios ya no corresponden a nada);
   - un borrado pedido explicitamente por un usuario (patch.__borrarHorarios = ['parada2', ...]). */
GV.__HOR_CAMPOS = { ingreso: ['ingresoGps', 'ingresoManual'], egreso: ['egresoGps', 'egresoManual'], choferMarcoIngreso: [], choferMarcoEgreso: [] };
GV.__paradasReestructuradas = function(prevP, nextP){
  prevP = prevP || []; nextP = nextP || [];
  if(prevP.length !== nextP.length) return true;
  var dif = 0;
  for(var i = 0; i < prevP.length; i++){
    var a = prevP[i] || {}, b = nextP[i] || {};
    if(typeof a.lat !== 'number' || typeof b.lat !== 'number' || Math.abs(a.lat - b.lat) > 1e-5 || Math.abs(a.lng - b.lng) > 1e-5) dif++;
  }
  return dif >= 2; /* una sola parada movida = correccion de ubicacion (se conservan sus horarios) */
};
/* 27/10 (caso C348 Medrano: RAO SLB -> LCav174_2 -> RAO SLB): SITIOS REPETIDOS. La segunda aparicion de un mismo lugar
   NO puede tener ingreso mientras alguna parada intermedia siga sin visitar: la unidad esta en la primera. Antes,
   distintos chequeos (backfill de historial, refinamiento de ingreso, reevaluacion al editar) podian sellar el
   ingreso en la ultima aparicion; al salir de ese lugar el viaje (sin destino) se cerraba solo, con las paradas del
   medio sin hacer. Esta regla se aplica en el UNICO lugar por el que pasan todas las escrituras. */
GV.__mismoLugar = function(a, b){
  if(!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return false;
  var d = GV.distKm(a, b);
  return d != null && d * 1000 <= 300;
};
GV.__repetidaPrevia = function(paradas, k){
  for(var j = 0; j < k; j++){ if(GV.__mismoLugar(paradas[j], paradas[k])) return j; }
  return -1;
};
GV.sitioRepetidoAdelantado = function(paradas, sr, siteId){
  var m = /^parada(\d+)$/.exec(siteId || ''); if(!m) return false;
  var k = +m[1]; paradas = paradas || []; sr = sr || {};
  if(!paradas[k]) return false;
  for(var j = 0; j < k; j++){
    if(!GV.__mismoLugar(paradas[j], paradas[k])) continue;
    for(var q = j + 1; q < k; q++){
      if(!paradas[q] || !paradas[q].tipo) continue;
      var x = sr['parada' + q];
      if(!(x && (x.ingreso || x.egreso))) return true;
    }
  }
  return false;
};
/* Saca de un cambio los ingresos/egresos NUEVOS de una aparicion repetida adelantada (los ya guardados no se tocan:
   eso lo cuida protegerHorarios) y corrige la permanencia abierta si apunta a esa aparicion. */
GV.sanearSitiosRepetidos = function(prevV, nextView, patch){
  if(!patch) return patch;
  var paradas = (nextView && nextView.paradas) || (prevV && prevV.paradas) || [];
  if(paradas.length < 3) return patch;
  var prevSr = (prevV && prevV.sitiosReal) || {};
  if(patch.sitiosReal){
    var sr = Object.assign({}, patch.sitiosReal), quitados = [];
    Object.keys(sr).forEach(function(key){
      var x = sr[key]; if(!x) return;
      var antes = prevSr[key] || {};
      var nuevoIng = x.ingreso && !antes.ingreso, nuevoEg = x.egreso && !antes.egreso;
      if(!nuevoIng && !nuevoEg) return;
      if(x.ingresoManual || x.egresoManual || x.choferMarcoIngreso || x.choferMarcoEgreso) return;
      var simulado = Object.assign({}, prevSr, sr);
      if(!GV.sitioRepetidoAdelantado(paradas, simulado, key)) return;
      var y = Object.assign({}, x);
      if(nuevoIng){ delete y.ingreso; delete y.ingresoGps; }
      if(nuevoEg){ delete y.egreso; delete y.egresoGps; }
      sr[key] = y; quitados.push(key);
    });
    if(quitados.length){ try{ console.warn('[GV] sitio repetido: no se registra el horario en la aparicion adelantada', (prevV && prevV.vehiculo) || '', quitados.join(', ')); }catch(e){} }
    patch.sitiosReal = sr;
  }
  if(patch.dwellState && patch.dwellState.siteId){
    var srAll = Object.assign({}, prevSr, patch.sitiosReal || {});
    if(GV.sitioRepetidoAdelantado(paradas, srAll, patch.dwellState.siteId)){
      var k = +/^parada(\d+)$/.exec(patch.dwellState.siteId)[1], j = GV.__repetidaPrevia(paradas, k);
      var xj = srAll['parada' + j];
      patch.dwellState = (j >= 0 && !(xj && xj.egreso)) ? Object.assign({}, patch.dwellState, { siteId: 'parada' + j }) : null;
    }
  }
  return patch;
};
GV.protegerHorarios = function(prevV, nextView, nextSr, permitir){
  var prevSr = (prevV && prevV.sitiosReal) || {};
  var out = Object.assign({}, nextSr || {});
  var libresParadas = GV.__paradasReestructuradas(prevV && prevV.paradas, nextView && nextView.paradas);
  var sinDestino = !(nextView && nextView.destino);
  var restaurados = [];
  Object.keys(prevSr).forEach(function(k){
    var a = prevSr[k]; if(!a) return;
    if(permitir && permitir.indexOf(k) >= 0) return;
    if(libresParadas && /^parada\d+$/.test(k)) return;
    if(sinDestino && k === 'destino') return;
    var b = out[k], nb = null;
    Object.keys(GV.__HOR_CAMPOS).forEach(function(c){
      if(!a[c] || (b && b[c])) return;
      nb = nb || Object.assign({}, b || {});
      nb[c] = a[c];
      GV.__HOR_CAMPOS[c].forEach(function(f){ if(a[f] != null && nb[f] == null) nb[f] = a[f]; });
      restaurados.push(k + '.' + c);
    });
    if(nb) out[k] = nb;
  });
  if(restaurados.length){ try{ console.warn('[GV] horarios protegidos (se intento borrarlos):', (prevV && (prevV.vehiculo || prevV.id)) || '', restaurados.join(', ')); }catch(e){} }
  return out;
};
GV.Storage = (function(){
  var _api = null;
  var _addInId = null;
  var _addInDataId = null;
    var _data = { viajes: [], alertas: [], sitios: [], conductores: [], gerenciamientos: [] };
  var _listeners = [];
      var _pendingWrites = 0;
    var _dirtyViajeIds = {}; var _removedViajeIds = {};
    /* 26/10 (chequeo general): sitios, alertas y gerenciamientos tambien se guardan "por item" contra el servidor. Antes
       cada guardado reescribia esas listas COMPLETAS con la copia de esta pantalla: una pantalla con datos viejos borraba
       sitios o alertas que otra acababa de crear (ej. un sitio "a confirmar" recien creado, una alerta nueva). */
    var _dirtyLista = { sitios: {}, alertas: {}, gerenciamientos: {} }, _removedLista = { sitios: {}, alertas: {}, gerenciamientos: {} };
    var _reintentosEscritura = 0;
    function _marcarItem(lista, item){ if(!item || typeof item !== 'object') return; if(item.id == null) item.id = lista.slice(0, 3) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); _dirtyLista[lista][item.id] = true; }
    /* 28/10 (caso viaje 258 Veschi: se creo, aparecio, a los segundos DESAPARECIO y despues volvio): cuando el
       documento esta muy concurrido el guardado choca con otra pantalla y se reintenta; mientras tanto llegaba la
       version del servidor (todavia sin el viaje nuevo) y reemplazaba la lista local, asi que el viaje "desaparecia"
       hasta que el reintento entraba. Ahora los cambios propios que todavia no confirmo el servidor (altas, cambios y
       bajas de viajes, alertas, sitios y gerenciamientos) se mantienen visibles encima de lo que llega (max. 3 min). */
    var _pendV = {}, _pendDelV = {}, _pendL = { sitios: {}, alertas: {}, gerenciamientos: {} }, _pendDelL = { sitios: {}, alertas: {}, gerenciamientos: {} };
    function _superponerPendientes(local, server, pend, pendDel){
      server = Array.isArray(server) ? server : [];
      var ahora = Date.now(), lim = 180000, hay = false;
      Object.keys(pend).forEach(function(k){ if(ahora - pend[k] > lim) delete pend[k]; else hay = true; });
      Object.keys(pendDel).forEach(function(k){ if(ahora - pendDel[k] > lim) delete pendDel[k]; else hay = true; });
      if(!hay) return server;
      var porId = {}; (local || []).forEach(function(x){ if(x && x.id != null) porId[x.id] = x; });
      var out = server.filter(function(x){ return !(x && x.id != null && pendDel[x.id]); }).map(function(x){ return (x && x.id != null && pend[x.id] && porId[x.id]) ? porId[x.id] : x; });
      var vistos = {}; out.forEach(function(x){ if(x && x.id != null) vistos[x.id] = 1; });
      Object.keys(pend).forEach(function(id){ if(!vistos[id] && porId[id] && !pendDel[id]) out.push(porId[id]); });
      return out;
    }
    function _aplicarDelServidor(d){
      _data.viajes = _superponerPendientes(_data.viajes, d.viajes || [], _pendV, _pendDelV);
      ['alertas', 'sitios', 'gerenciamientos'].forEach(function(l){ _data[l] = _superponerPendientes(_data[l], d[l] || (l === 'gerenciamientos' ? _data.gerenciamientos : []) || [], _pendL[l], _pendDelL[l]); });
      _data.conductores = d.conductores || _data.conductores || [];
    }
    function _mergeLista(lista, server, local, dirty, removed){
      server = Array.isArray(server) ? server : [];
      local = Array.isArray(local) ? local : [];
      var localPorId = {}; local.forEach(function(x){ if(x && x.id != null) localPorId[x.id] = x; });
      var vistos = {};
      var out = [];
      server.forEach(function(x){
        if(!x) return;
        if(x.id != null && removed[x.id]) return;
        if(x.id != null) vistos[x.id] = true;
        out.push((x.id != null && dirty[x.id] && localPorId[x.id]) ? localPorId[x.id] : x);
      });
      Object.keys(dirty).forEach(function(id){ if(!vistos[id] && !removed[id] && localPorId[id]) out.push(localPorId[id]); });
      return out;
    }
    var REPO_MARK = 'geotab-gestion-viajes';
    /* Ajuste 4/10: marca de version que viaja en TODA escritura al documento principal (gv_data/main).
       Las reglas de seguridad de Firestore exigen este valor exacto para aceptar la escritura.
       Si en el futuro se necesita repetir este mecanismo (por otro bug similar), alcanza con subir
       este numero ACA y actualizar las reglas de Firestore con el mismo valor nuevo. */
    var SCHEMA_BUILD = 'ajuste4-2026-10-02';
    /* Ajuste 4/10 (parte 2): ademas de SCHEMA_BUILD, cada escritura manda un "_writeNonce" nuevo y
       distinto cada vez (fecha + numero al azar). Esto es lo que realmente bloquea a una pestana
       vieja: como Firestore completa con el merge los campos que un escrito NO manda, una pestana
       vieja que nunca llego a conocer este campo simplemente lo deja como estaba (no lo cambia) --
       y la regla de Firestore exige que el valor nuevo sea DISTINTO al que ya estaba guardado. Una
       pestana que no sabe que este campo existe jamas puede cumplir esa condicion. */
    function _genWriteNonce(){ return Date.now() + '_' + Math.random().toString(36).slice(2); }
    var _fbDb = null; var _fbDocRef = null; var _fbReady = false; function initFirebase(){ return GV.loadFirebase().then(function(firebase){ if(!firebase.apps || !firebase.apps.length){ firebase.initializeApp(GV.FIREBASE_CONFIG); } _fbDb = firebase.firestore(); _fbDocRef = _fbDb.collection('gv_data').doc('main'); cargarHistorico(); setTimeout(function(){ archivarAntiguos(); }, 30000); _fbDocRef.onSnapshot(function(snap){ _fbReady = true; var d = snap.exists ? snap.data() : null; if(d){ _aplicarDelServidor(d); saveToLS(); } notify(); }, function(err){}); return true; }); }

  /* ---------------- Archivo histórico ----------------
     Todo Gestion de Viajes vive en UN solo documento de Firestore (gv_data/main) y Firestore no
     deja que un documento pase de 1 MiB (aunque se pague). Para que nunca se llene, los viajes
     completados/cancelados con mas de DIAS_HISTORICO dias, y las alertas de mas de DIAS_HISTORICO
     dias, se mueven solos a gv_historico/AAAA-MM (un documento por mes; si un mes se llenara se
     sigue en AAAA-MM_2, _3...). No se pierde nada: se leen al abrir y getViajes()/getViaje() los
     siguen devolviendo, asi el calendario, la lista y las estadisticas muestran todo igual.
     Si alguien edita un viaje ya archivado, vuelve solo al documento principal. */
  var DIAS_HISTORICO = 30; /* 26/10: antes 90. El documento principal (que todas las pantallas leen y escriben a la vez) ya pesaba ~550 KB de 1 MB maximo; los viajes cerrados de mas de 30 dias pasan al historico (se siguen viendo igual). */
  var DIAS_HISTORICO_ALERTAS = 3; // las alertas se archivan mucho antes que los viajes: son ruido operativo del dia a dia, no un registro que haga falta conservar a mano en el Panel
  var MAX_POR_CORRIDA = 300; // tope de viajes/alertas movidos por vez (el resto en la proxima)
  var MAX_BYTES_MES = 800 * 1024; // margen bajo el limite de 1 MiB por documento
  var _hist = { viajes: [], alertaIds: {}, docDeViaje: {}, cargado: false };
  var _archivadoCorrido = false;
  var _rutas = {};
  /* Agrega una muestra (recorrido real de un tramo) a la memoria de rutas, dentro de una transaccion
     para que dos pestanas abiertas no la cuenten dos veces. Se guardan las ultimas 5 muestras; el
     promedio de km y minutos sale de esas 5. El camino que se dibuja es el del ultimo recorrido. */
  var RUTAS_SHARDS = 8;
  function shardDeRuta(key){ var h = 0; for(var i = 0; i < key.length; i++){ h = ((h << 5) - h + key.charCodeAt(i)) | 0; } return 'rutas_' + (Math.abs(h) % RUTAS_SHARDS); }
  function guardarMuestraRuta(docId, a, b, muestra, geo){
    if(!_fbDb) return Promise.resolve(false);
    var ref = _fbDb.collection('gv_historico').doc(shardDeRuta(docId));
    return _fbDb.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        var all = snap.exists ? (snap.data().rutas || {}) : {};
        var d = all[docId] || { a: a, b: b, muestras: [] };
        var ms = (d.muestras || []).slice();
        if(ms.some(function(x){ return x.vid === muestra.vid && x.leg === muestra.leg; })) return d;
        ms.push(muestra);
        ms.sort(function(x, y){ return (x.fecha < y.fecha) ? -1 : (x.fecha > y.fecha ? 1 : 0); });
        if(ms.length > 5) ms = ms.slice(ms.length - 5);
        var km = 0, mn = 0; ms.forEach(function(x){ km += x.km; mn += x.min; });
        var nuevo = { a: d.a || a, b: d.b || b, muestras: ms, n: ms.length, kmProm: Math.round(km / ms.length * 10) / 10, minProm: Math.round(mn / ms.length), actualizado: new Date().toISOString() };
        var esUltima = ms[ms.length - 1].vid === muestra.vid && ms[ms.length - 1].leg === muestra.leg;
        if(esUltima && geo){ nuevo.geo = geo; nuevo.geoFecha = muestra.fecha; } else if(d.geo){ nuevo.geo = d.geo; nuevo.geoFecha = d.geoFecha || null; }
        all[docId] = nuevo;
        tx.set(ref, { _reg: 'rutas', rutas: all, actualizado: nuevo.actualizado });
        return nuevo;
      });
    }).then(function(nuevo){ if(nuevo) _rutas[docId] = nuevo; return true; })['catch'](function(e){ try{ console.warn('[GV] memoria de rutas: no se pudo guardar', e && e.message); }catch(_e){} return false; });
  }

  function fechaDe(x){
    var t = Date.parse((x && (x.fechaSalida || x.fecha || x.creadoEn)) || '');
    return isNaN(t) ? null : t;
  }
  function claveMes(x){
    var t = fechaDe(x); var d = new Date(t == null ? Date.now() : t);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function viajeArchivable(v, limite){
    var t = fechaDe(v);
    return (v.estado === 'completado' || v.estado === 'cancelado') && t != null && t < limite;
  }
  function alertaArchivable(a, limite){
    var t = fechaDe(a);
    return t != null && t < limite;
  }

  function cargarHistorico(){
    if(!_fbDb) return Promise.resolve();
    return _fbDb.collection('gv_historico').get().then(function(qs){
      var viajes = [], ids = {}, docDe = {};
      qs.forEach(function(doc){
        var d = doc.data() || {};
        /* Ajuste 15/10: memoria de rutas, agrupada en 8 documentos (rutas_0 ... rutas_7, _reg:'rutas')
           para que abrir el panel lea 8 documentos y no uno por ruta. */
        if(d._reg === 'rutas'){ var R = d.rutas || {}; Object.keys(R).forEach(function(k){ _rutas[k] = R[k]; }); return; }
        (d.viajes || []).forEach(function(v){ viajes.push(v); docDe[v.id] = doc.id; });
        (d.alertas || []).forEach(function(a){ if(a && a.id) ids[a.id] = true; });
      });
      _hist.viajes = viajes; _hist.alertaIds = ids; _hist.docDeViaje = docDe; _hist.cargado = true;
      notify();
    })['catch'](function(){ /* sin historico: se sigue con lo del documento principal */ });
  }

  // Mueve al historico lo viejo. Una transaccion de Firestore garantiza que se saque del
  // documento principal y se agregue al mes al mismo tiempo (o nada, si algo falla).
  function archivarAntiguos(){
    if(_archivadoCorrido || !_fbDb || !_fbDocRef) return Promise.resolve(0);
    var limiteViajes = Date.now() - DIAS_HISTORICO * 24 * 3600 * 1000;
    var limiteAlertas = Date.now() - DIAS_HISTORICO_ALERTAS * 24 * 3600 * 1000;
    var hayAlgo = _data.viajes.some(function(v){ return viajeArchivable(v, limiteViajes); }) ||
                  _data.alertas.some(function(a){ return alertaArchivable(a, limiteAlertas); });
    if(!hayAlgo) return Promise.resolve(0);
    _archivadoCorrido = true;
    var movidos = 0;
    var histCol = _fbDb.collection('gv_historico');
    return _fbDb.runTransaction(function(tx){
      return tx.get(_fbDocRef).then(function(snap){
        var d = snap.exists ? snap.data() : {};
        var viajes = (d.viajes || []).slice(), alertas = (d.alertas || []).slice();
        var aMover = viajes.filter(function(v){ return viajeArchivable(v, limiteViajes); }).slice(0, MAX_POR_CORRIDA);
        var alMover = alertas.filter(function(a){ return alertaArchivable(a, limiteAlertas); }).slice(0, MAX_POR_CORRIDA);
        if(!aMover.length && !alMover.length) return null;
        var porMes = {};
        aMover.forEach(function(v){ var k = claveMes(v); (porMes[k] = porMes[k] || { viajes: [], alertas: [] }).viajes.push(v); });
        alMover.forEach(function(a){ var k = claveMes(a); (porMes[k] = porMes[k] || { viajes: [], alertas: [] }).alertas.push(a); });
        var meses = Object.keys(porMes);
        // Firestore exige hacer todas las lecturas antes de escribir: se leen hasta 5 documentos
        // por mes (AAAA-MM, AAAA-MM_2 ... _5) para elegir en cual entra.
        var refs = [];
        meses.forEach(function(k){ for(var n = 1; n <= 5; n++){ refs.push({ mes: k, ref: histCol.doc(n === 1 ? k : k + '_' + n) }); } });
        return Promise.all(refs.map(function(r){ return tx.get(r.ref); })).then(function(snaps){
          var destinos = {};
          meses.forEach(function(k){
            var nuevo = porMes[k];
            var tam = JSON.stringify(nuevo).length;
            var ultimo = null;
            for(var i = 0; i < refs.length; i++){
              if(refs[i].mes !== k) continue;
              var ex = snaps[i].exists ? snaps[i].data() : { viajes: [], alertas: [] };
              ultimo = { ref: refs[i].ref, ex: ex };
              if(JSON.stringify(ex).length + tam <= MAX_BYTES_MES){ destinos[k] = ultimo; break; }
            }
            if(!destinos[k]) destinos[k] = ultimo; // muy improbable: 5 documentos llenos en un mismo mes
          });
          meses.forEach(function(k){
            var dst = destinos[k]; if(!dst) return;
            var ex = dst.ex, nuevo = porMes[k];
            var idsV = {}; (ex.viajes || []).forEach(function(v){ idsV[v.id] = true; });
            var idsA = {}; (ex.alertas || []).forEach(function(a){ idsA[a.id] = true; });
            tx.set(dst.ref, {
              viajes: (ex.viajes || []).filter(function(v){ return !nuevo.viajes.some(function(n){ return n.id === v.id; }); }).concat(nuevo.viajes),
              alertas: (ex.alertas || []).concat(nuevo.alertas.filter(function(a){ return !idsA[a.id]; })),
              actualizadoEn: new Date().toISOString()
            });
          });
          var sacarV = {}; aMover.forEach(function(v){ sacarV[v.id] = true; });
          var sacarA = {}; alMover.forEach(function(a){ sacarA[a.id] = true; });
          tx.set(_fbDocRef, {
            viajes: viajes.filter(function(v){ return !sacarV[v.id]; }),
            alertas: alertas.filter(function(a){ return !sacarA[a.id]; }),
            _schemaBuild: SCHEMA_BUILD,
            _writeNonce: _genWriteNonce()
          }, { merge: true });
          movidos = aMover.length + alMover.length;
          return true;
        });
      });
    }).then(function(){ return cargarHistorico(); }).then(function(){ return movidos; })
      ['catch'](function(err){ try{ console.warn('No se pudo pasar al historico (se reintenta la proxima vez):', err); }catch(e){} _archivadoCorrido = false; return 0; });
  }

  // Si se toca un viaje archivado (editarlo, reabrirlo), vuelve al documento principal.
  function traerDelHistorico(id){
    var idx = -1;
    for(var i = 0; i < _hist.viajes.length; i++){ if(_hist.viajes[i].id === id){ idx = i; break; } }
    if(idx < 0 || _data.viajes.some(function(v){ return v.id === id; })) return null;
    var v = _hist.viajes[idx];
    _hist.viajes.splice(idx, 1);
    _data.viajes.push(v);
    var docId = _hist.docDeViaje[id]; delete _hist.docDeViaje[id];
    if(_fbDb && docId){
      var ref = _fbDb.collection('gv_historico').doc(docId);
      _fbDb.runTransaction(function(tx){
        return tx.get(ref).then(function(s){
          if(!s.exists) return;
          var d = s.data();
          tx.set(ref, { viajes: (d.viajes || []).filter(function(x){ return x.id !== id; }) }, { merge: true });
        });
      })['catch'](function(){});
    }
    return v;
  }

  function todosLosViajes(){
    if(!_hist.viajes.length) return _data.viajes;
    var activos = {}; _data.viajes.forEach(function(v){ activos[v.id] = true; });
    return _data.viajes.concat(_hist.viajes.filter(function(v){ return !activos[v.id]; }));
  }

  function loadFromLS(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(raw){
        var d = JSON.parse(raw);
        _data.viajes = d.viajes || [];
                _data.alertas = d.alertas || []; _data.sitios = d.sitios || []; _data.conductores = d.conductores || []; _data.gerenciamientos = d.gerenciamientos || [];
      }
    }catch(e){ _data = { viajes: [], alertas: [], sitios: [], conductores: [], gerenciamientos: [] }; }
  }

  function saveToLS(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(_data)); }
    catch(e){ /* ignore */ }
  }

  function notify(){
    _listeners.forEach(function(fn){ try{ fn(_data); }catch(e){} });
  }

  function findAddInId(cb){
    if(!_api){ cb(null); return; }
    _api.call('Get', { typeName: 'AddIn' }, function(list){
      var mine = (list || []).find(function(a){
        return (a.items || []).some(function(it){ return it.url && it.url.indexOf(REPO_MARK) !== -1; });
      });
      cb(mine ? mine.id : null);
    }, function(){ cb(null); });
  }

  function pullAddInData(cb){
    if(!_api || !_addInId){ cb(false); return; }
    _api.call('Get', { typeName: 'AddInData', search: { addInId: _addInId } }, function(rows){
      if(rows && rows.length){
        var rec = rows[0];
        _addInDataId = rec.id;
        try{
          var details = typeof rec.details === 'string' ? JSON.parse(rec.details) : rec.details;
          if(details){
            _data.viajes = details.viajes || [];
            _data.alertas = details.alertas || []; _data.sitios = details.sitios || []; _data.conductores = details.conductores || _data.conductores || []; _data.gerenciamientos = details.gerenciamientos || _data.gerenciamientos || [];
            saveToLS();
          }
        }catch(e){}
        cb(true);
      } else {
        cb(false);
      }
    }, function(){ cb(false); });
  }

  function init(api){
    _api = api; initFirebase()['catch'](function(){});
    loadFromLS();
    return new Promise(function(resolve){
      if(!api){ resolve(_data); return; }
      /* Se identifica el AddIn (para poder seguir escribiendo un respaldo en AddInData via
         persist()), pero ya NO se usa AddInData como fuente de lectura: era un dato legacy,
         propio de cada dispositivo, que quedaba desactualizado apenas el coordinador cargaba
         un viaje nuevo (eso solo se publica a Firebase). Si se lo dejaba pisar _data aca, un
         viaje recien creado podia "desaparecer" de la app del chofer en cuanto esta consultaba
         su AddInData viejo. La fuente de verdad es Firebase (con localStorage como cache). */
      findAddInId(function(id){
        _addInId = id;
        resolve(_data);
      });
    });
  }

  function refresh(){
    return new Promise(function(resolve){
      /* Igual que en init(): no se relee AddInData (quedaba desactualizado y pisaba viajes
         nuevos). En su lugar se fuerza una lectura fresca a Firestore directo al servidor,
         por si el listener en tiempo real (onSnapshot) se hubiera perdido algun cambio. */
            /* Si en este momento hay un persist() propio todavia en vuelo (el commit al servidor no
                     termino), esta lectura 'source: server' puede llegar y devolver una version del
                              documento anterior a ese commit. Si eso pasa, se pisaria _data completo con datos
                                       viejos, y si CUALQUIER otro cambio (por ejemplo el chequeo periodico de otro vehiculo)
                                                llama a persist() poco despues, ese write reenviaria el documento entero con la
                                                         version vieja y el cambio recien hecho se perderia en el servidor sin ningun error
                                                                  visible. Bug real detectado el 4/9/2026: reabrir el viaje 258 quedaba pisado por este
                                                                           refresh periodico (cada 60s en el panel, cada 20s en la app del chofer) mientras el
                                                                                    commit todavia estaba en vuelo. Mientras haya una escritura propia en curso se evita
                                                                                             este refresh: el listener en tiempo real (onSnapshot) ya refleja el commit apenas el
                                                                                                      servidor lo confirma. */
            if(_pendingWrites > 0){ resolve(_data); return; }
      if(_fbDocRef){
        _fbDocRef.get({ source: 'server' }).then(function(snap){
          var d = snap.exists ? snap.data() : null;
          if(d){
            _aplicarDelServidor(d);
            saveToLS();
          }
          notify();
          resolve(_data);
        }).catch(function(){ resolve(_data); });
      } else {
        resolve(_data);
      }
    });
  }

  function persist(){
    /* Ajuste 2/10 (bug real: viaje de Torres T278 volviendo solo a "En curso" minutos despues de
       cerrarse bien, con el sitio editado y los horarios recien registrados vueltos a su valor
       viejo): el panel (index.html) y la app del chofer (chofer.html) son dos pestañas/dispositivos
       separados, cada uno con su PROPIA copia en memoria del viaje (cada <script> de common.js arma
       su propio _data). Antes, persist() escribia siempre el OBJETO COMPLETO del viaje tal cual
       estaba en la memoria de esta sesion (serverViajes[idx] = copia local entera), pisando TODOS
       los campos server-side, incluidos los que esta sesion ni toco. Si el telefono del chofer
       tenia una copia vieja del viaje (por ejemplo la pestaña quedo en segundo plano y el celular
       pauso su timer de actualizacion cada 20s, o el GPS tardo en refrescar), y el chofer tocaba
       cualquier boton de su app (Llegue, Sali, Iniciar, Completar, etc.), esa escritura reemplazaba
       TODO el viaje -estado, horarios ya registrados, hasta la ubicacion del sitio- por los datos
       viejos que tenia guardados, deshaciendo cualquier cambio que el coordinador hubiera hecho
       mientras tanto en el panel (y viceversa). Ahora cada cambio via updateViaje(id, patch) guarda
       tambien el patch puntual, y el merge contra el servidor (abajo) solo pisa los campos que ESTA
       sesion realmente toco (sitiosReal ademas se mergea sitio por sitio); el resto de los campos
       queda tal cual los tenga el servidor en ese momento, sin importar que tan vieja sea la copia
       local del resto del viaje. markDirtyViaje/addViaje (cambios que mutan el objeto directamente
       sin pasar por un patch explicito) siguen escribiendo el objeto completo, como antes. */
    var _dirtyEntriesSnapshot = _dirtyViajeIds; _dirtyViajeIds = {};
    var _dirtyIdsSnapshot = Object.keys(_dirtyEntriesSnapshot);
    var _removedIdsSnapshot = Object.keys(_removedViajeIds); _removedViajeIds = {};
    if(_fbReady && _fbDocRef){
      _pendingWrites++;
      var _dirtyListaSnap = _dirtyLista, _removedListaSnap = _removedLista;
      var __marca = Date.now() + Math.random();
      _dirtyIdsSnapshot.forEach(function(id){ _pendV[id] = __marca; });
      _removedIdsSnapshot.forEach(function(id){ _pendDelV[id] = __marca; delete _pendV[id]; });
      ['sitios', 'alertas', 'gerenciamientos'].forEach(function(l){ Object.keys(_dirtyListaSnap[l] || {}).forEach(function(id){ _pendL[l][id] = __marca; }); Object.keys(_removedListaSnap[l] || {}).forEach(function(id){ _pendDelL[l][id] = __marca; }); });
      var __limpiarPend = function(){
        var lim = function(m){ Object.keys(m).forEach(function(k){ if(m[k] === __marca) delete m[k]; }); };
        lim(_pendV); lim(_pendDelV); ['sitios', 'alertas', 'gerenciamientos'].forEach(function(l){ lim(_pendL[l]); lim(_pendDelL[l]); });
      };
      /* copia de los items modificados TAL COMO ESTAN AHORA (si antes de guardar llega una actualizacion de otra pantalla
         que reemplaza las listas locales, igual se guarda lo que esta pantalla cambio) */
      var _itemsListaSnap = {};
      ['sitios', 'alertas', 'gerenciamientos'].forEach(function(l){ _itemsListaSnap[l] = (_data[l] || []).filter(function(x){ return x && x.id != null && _dirtyListaSnap[l][x.id]; }); });
      _dirtyLista = { sitios: {}, alertas: {}, gerenciamientos: {} }; _removedLista = { sitios: {}, alertas: {}, gerenciamientos: {} };
      var _otherFields = { alertas: _data.alertas, sitios: _data.sitios, conductores: _data.conductores, gerenciamientos: _data.gerenciamientos, _schemaBuild: SCHEMA_BUILD, _writeNonce: _genWriteNonce() };
      var _listasDesdeServidor = function(d){
        var o = Object.assign({}, _otherFields);
        ['sitios', 'alertas', 'gerenciamientos'].forEach(function(l){ o[l] = _mergeLista(l, d && d[l], _itemsListaSnap[l], _dirtyListaSnap[l], _removedListaSnap[l]); });
        return o;
      };
      var _writeOp;
            if(_fbDb){
        var _localFullById = {};
        _dirtyIdsSnapshot.forEach(function(id){ var v = _data.viajes.find(function(x){ return x.id === id; }); if(v) _localFullById[id] = v; });
        _writeOp = _fbDb.runTransaction(function(tx){
          return tx.get(_fbDocRef).then(function(doc){
            var serverViajes = (doc.exists && doc.data().viajes) || [];
            serverViajes = serverViajes.slice();
            if(_removedIdsSnapshot.length){ serverViajes = serverViajes.filter(function(v){ return _removedIdsSnapshot.indexOf(v.id) < 0; }); }
            _dirtyIdsSnapshot.forEach(function(id){
              var entry = _dirtyEntriesSnapshot[id];
              var idx = -1;
              for(var i = 0; i < serverViajes.length; i++){ if(serverViajes[i].id === id){ idx = i; break; } }
              var serverViaje = idx >= 0 ? serverViajes[idx] : null;
              var finalViaje;
              /* Ajuste 3/10 (bug real: viajes de Torres y Soto reabriendose solos UN DIA despues de
                 cerrados, sin que nadie tocara nada, ni el chofer ni el coordinador): el merge por
                 campo de arriba (Ajuste 2/10) evita que una sesion con datos viejos borre campos que
                 no toco, pero no alcanza cuando esa sesion vieja SI decide, por su cuenta, pisar
                 "estado" -- por ejemplo una pestaña del Panel olvidada abierta desde el dia anterior,
                 que nunca se entero de que el viaje ya se completo: su chequeo automatico de cada 60s
                 (checkDwellAlerts/checkDestinoLlegadas) sigue viendo el GPS real del camion y, con su
                 copia vieja del viaje todavia en "planificado"/"demorado"/"en_curso", "detecta" que la
                 unidad ya salio o que llego a destino y manda un patch (autoIniciado:true, o
                 llegadaDestinoPendienteEn) perfectamente valido COMO PATCH -- el problema es que la
                 DECISION de fondo esta basada en una copia local obsoleta, no en el estado real.
                 No se puede confiar en que todas las pantallas que haya abiertas en algun lado se
                 actualicen solas, asi que el limite se pone aca, en el UNICO lugar por el que pasan
                 todas las escrituras (de cualquier pestaña, cualquier dispositivo): un viaje que el
                 SERVIDOR ya tiene como completado/cancelado (estado terminal) no puede salir de ahi ni
                 quedar "a la espera de confirmacion" (llegadaDestinoPendienteEn) por un patch que no
                 sea, el mismo, una reafirmacion de un estado terminal. La UNICA excepcion es un patch
                 que lleve reaperturaExplicita:true -- la marca que pone el boton "Reabrir viaje" (una
                 decision tomada por un humano mirando ESE viaje puntual en pantalla, no una deduccion
                 automatica sobre una copia vieja); cualquier otro intento de mover el estado se recorta
                 antes de aplicar el patch. */
              if(!serverViaje || !entry || entry === 'full'){
                finalViaje = _localFullById[id] || serverViaje;
                /* 23/10: una escritura completa (pantalla con copia vieja) tampoco puede borrar horarios ya guardados */
                if(serverViaje && finalViaje && finalViaje !== serverViaje){
                  var __sanF = GV.sanearSitiosRepetidos(serverViaje, finalViaje, { sitiosReal: finalViaje.sitiosReal || {}, dwellState: finalViaje.dwellState || null });
                  finalViaje = Object.assign({}, finalViaje, { sitiosReal: GV.protegerHorarios(serverViaje, finalViaje, __sanF.sitiosReal || {}, null), dwellState: __sanF.dwellState || null });
                }
              } else {
                var _entryAplicado = (entry.sitiosReal || entry.dwellState) ? GV.sanearSitiosRepetidos(serverViaje, { paradas: ('paradas' in entry) ? entry.paradas : serverViaje.paradas }, Object.assign({}, entry)) : entry;
                var _esTerminalEnServidor = serverViaje.estado === 'completado' || serverViaje.estado === 'cancelado';
                if(_esTerminalEnServidor && entry.reaperturaExplicita !== true){
                  var _estadoPatchNoTerminal = ('estado' in entry) && entry.estado !== 'completado' && entry.estado !== 'cancelado';
                  var _reabrePendiente = ('llegadaDestinoPendienteEn' in entry) && !!entry.llegadaDestinoPendienteEn;
                  if(_estadoPatchNoTerminal || _reabrePendiente){
                    _entryAplicado = Object.assign({}, _entryAplicado);
                    delete _entryAplicado.estado; delete _entryAplicado.iniciadoEn; delete _entryAplicado.autoIniciado;
                    delete _entryAplicado.salioConDemora; delete _entryAplicado.demoraSalidaMin; delete _entryAplicado.dwellState;
                    delete _entryAplicado.llegadaDestinoPendienteEn;
                  }
                }
                finalViaje = Object.assign({}, serverViaje, _entryAplicado);
                if(_entryAplicado.sitiosReal){
                  finalViaje.sitiosReal = Object.assign({}, serverViaje.sitiosReal || {}, _entryAplicado.sitiosReal);
                  /* Ajuste 16/10 (casos T280 Cruces y C258 Veschi): un sitio con valor null en el patch se BORRA. Antes el
                     merge sitio por sitio no podia borrar nada: al reordenar las paradas, el horario de una parada quedaba
                     tambien en su posicion vieja (que ahora era otra parada) y figuraban dos "en sitio". */
                  Object.keys(finalViaje.sitiosReal).forEach(function(k){ if(finalViaje.sitiosReal[k] === null) delete finalViaje.sitiosReal[k]; });
                  /* 23/10: lo que ya estaba registrado en el SERVIDOR no se borra (aunque esta pantalla tuviera una copia vieja) */
                  finalViaje.sitiosReal = GV.protegerHorarios(serverViaje, finalViaje, finalViaje.sitiosReal, entry.__borrarHorarios || null);
                }
                delete finalViaje.__borrarHorarios;
              }
              if(finalViaje){
                if(idx >= 0){ serverViajes[idx] = finalViaje; } else { serverViajes.push(finalViaje); }
              }
            });
            tx.set(_fbDocRef, Object.assign({ viajes: serverViajes }, _listasDesdeServidor(doc.exists ? doc.data() : null)), { merge: true });
          });
        });
      } else {
        _writeOp = _fbDocRef.set(_otherFields, { merge: true });
      }
      /* 26/10: si el guardado falla (conflicto con otra pantalla que guardo al mismo tiempo, corte de red), los cambios
         vuelven a la cola y se reintenta solo (1, 2, 4... hasta 30 s). Antes se perdian en silencio y el viaje "volvia"
         al estado anterior con la siguiente actualizacion. */
      _writeOp.then(function(){ _pendingWrites--; _reintentosEscritura = 0; __limpiarPend(); }).catch(function(err){
        _pendingWrites--;
        _dirtyIdsSnapshot.forEach(function(id){
          var vieja = _dirtyEntriesSnapshot[id], nueva = _dirtyViajeIds[id];
          if(!nueva) _dirtyViajeIds[id] = vieja;
          else if(vieja === 'full' || nueva === 'full') _dirtyViajeIds[id] = 'full';
          else _dirtyViajeIds[id] = Object.assign({}, vieja, nueva);
        });
        _removedIdsSnapshot.forEach(function(id){ _removedViajeIds[id] = true; });
        ['sitios', 'alertas', 'gerenciamientos'].forEach(function(l){ Object.assign(_dirtyLista[l], _dirtyListaSnap[l]); Object.assign(_removedLista[l], _removedListaSnap[l]); });
        _reintentosEscritura++;
        try{ console.warn('[GV] no se pudo guardar (' + ((err && err.code) || err) + '), reintento ' + _reintentosEscritura); }catch(e){}
        if(_reintentosEscritura <= 12) setTimeout(function(){ persist(); }, Math.min(30000, 1000 * Math.pow(2, _reintentosEscritura - 1)));
      });
    }
    saveToLS();
    notify();
    return new Promise(function(resolve){
      if(!_api || !_addInId){ resolve(false); return; }
            var detailsStr = JSON.stringify({ viajes: _data.viajes, alertas: _data.alertas, sitios: _data.sitios, conductores: _data.conductores, gerenciamientos: _data.gerenciamientos });
      if(_addInDataId){
        _api.call('Set', { typeName: 'AddInData', entity: { id: _addInDataId, addInId: _addInId, details: detailsStr } },
          function(){ resolve(true); }, function(){ resolve(false); });
      } else {
        _api.call('Add', { typeName: 'AddInData', entity: { addInId: _addInId, details: detailsStr } },
          function(newId){ _addInDataId = newId; resolve(true); }, function(){ resolve(false); });
      }
    });
  }

  return {
    init: init,
    refresh: refresh,
    onChange: function(fn){ _listeners.push(fn); },
    getViajes: function(){ return todosLosViajes(); },
    getRutas: function(){ return _rutas; },
    rutasCargadas: function(){ return !!_hist.cargado; },
    guardarMuestraRuta: guardarMuestraRuta,
    archivarAntiguos: function(){ _archivadoCorrido = false; return archivarAntiguos(); },
    historicoCargado: function(){ return _hist.cargado; },
    getConductores: function(){ return _data.conductores; },
    setConductores: function(list){ _data.conductores = list || []; return persist(); },
    getAlertas: function(){ /* arreglo 1/10: alertas viejas de 12hs guardadas con creadoEn/texto en vez de fecha/mensaje rompian el orden de la lista de Alertas */ _data.alertas.forEach(function(a){ if(a && !a.fecha && a.creadoEn) a.fecha = a.creadoEn; if(a && !a.mensaje && a.texto) a.mensaje = a.texto; }); return _data.alertas; }, getSitios: function(){ return _data.sitios; }, addSitio: function(s){ _data.sitios.push(s); _marcarItem('sitios', s); return persist(); }, updateSitio: function(id, patch){ var s = _data.sitios.find(function(x){ return x.id === id; }); if(s){ Object.keys(patch).forEach(function(k){ s[k] = patch[k]; }); _marcarItem('sitios', s); } return persist(); }, removeSitio: function(id){ _data.sitios = _data.sitios.filter(function(x){ return x.id !== id; }); if(id != null) _removedLista.sitios[id] = true; return persist(); },
    addViaje: function(v){ _data.viajes.push(v); if(v && v.id) _dirtyViajeIds[v.id] = 'full'; return persist(); },
    updateViaje: function(id, patch){
      var v = _data.viajes.find(function(x){ return x.id === id; }) || traerDelHistorico(id);
      var __permitir = patch && patch.__borrarHorarios;
      if(patch && '__borrarHorarios' in patch){ patch = Object.assign({}, patch); delete patch.__borrarHorarios; }
      if(v && patch && (patch.sitiosReal || patch.dwellState)){
        patch = GV.sanearSitiosRepetidos(v, { paradas: ('paradas' in patch) ? patch.paradas : v.paradas }, Object.assign({}, patch));
      }
      if(v && patch && patch.sitiosReal){
        patch = Object.assign({}, patch);
        patch.sitiosReal = GV.protegerHorarios(v, { paradas: ('paradas' in patch) ? patch.paradas : v.paradas, destino: ('destino' in patch) ? patch.destino : v.destino }, patch.sitiosReal, __permitir);
        /* las claves en null del patch (borrado) que se restauraron ya no van en null */
      }
      if(v){ Object.keys(patch).forEach(function(k){
        if(k === 'sitiosReal' && patch.sitiosReal){ var __srL = {}; Object.keys(patch.sitiosReal).forEach(function(s){ if(patch.sitiosReal[s] !== null) __srL[s] = patch.sitiosReal[s]; }); v.sitiosReal = __srL; }
        else v[k] = patch[k];
      }); }
      if(id){
        var _prevEntry = _dirtyViajeIds[id];
        _dirtyViajeIds[id] = (_prevEntry === 'full') ? 'full' : Object.assign({}, (_prevEntry && typeof _prevEntry === 'object') ? _prevEntry : {}, patch);
        if(__permitir && _dirtyViajeIds[id] !== 'full') _dirtyViajeIds[id].__borrarHorarios = __permitir;
      }
      return persist();
    },
    markDirtyViaje: function(id){ if(id){ traerDelHistorico(id); _dirtyViajeIds[id] = 'full'; } },
    removeViaje: function(id){
      traerDelHistorico(id);
      _data.viajes = _data.viajes.filter(function(v){ return v.id !== id; });
      if(id){ _removedViajeIds[id] = true; delete _dirtyViajeIds[id]; }
      return persist();
    },
    getViaje: function(id){ return _data.viajes.find(function(v){ return v.id === id; }) || _hist.viajes.find(function(v){ return v.id === id; }); },
    addAlerta: function(a){
      if(_data.alertas.some(function(x){ return x.id === a.id; }) || _hist.alertaIds[a.id]) return Promise.resolve(false);
      _data.alertas.push(a); _marcarItem('alertas', a); return persist();
    },
    removeAlerta: function(id){
      _data.alertas = _data.alertas.filter(function(a){ return a.id !== id; }); if(id != null) _removedLista.alertas[id] = true;
      return persist();
    },
    /* 27/10: "Descartar todas" - borra varias alertas con UNA sola escritura. Antes se llamaba removeAlerta una por una:
       eran decenas de escrituras simultaneas al mismo documento que chocaban entre si, varias fallaban y las alertas
       "volvian" a aparecer hasta que se reintentaban. */
    removeAlertas: function(ids){
      var set = {}; (ids || []).forEach(function(id){ if(id != null){ set[id] = true; _removedLista.alertas[id] = true; } });
      _data.alertas = _data.alertas.filter(function(a){ return !(a && set[a.id]); });
      return persist();
    },
getGerenciamientos: function(){ return _data.gerenciamientos; },
    addGerenciamiento: function(g){ _data.gerenciamientos.push(g); _marcarItem('gerenciamientos', g); return persist(); },
    updateGerenciamiento: function(id, patch){ var g = _data.gerenciamientos.find(function(x){ return x.id === id; }); if(g){ Object.keys(patch || {}).forEach(function(k){ g[k] = patch[k]; }); _marcarItem('gerenciamientos', g); } return persist(); },
    isConnected: function(){ return !!_addInId; },
    pushCompartido: function(token, payload){
      if(!token) return Promise.resolve(false);
      var doPush = function(){
        if(!_fbDb) return false;
        return _fbDb.collection('gv_compartidos').doc(token).set(Object.assign({ actualizadoEn: new Date().toISOString() }, payload), { merge: true }).then(function(){ return true; })['catch'](function(){ return false; });
      };
      if(_fbDb) return doPush();
      return initFirebase().then(doPush)['catch'](function(){ return false; });
    },
    stopCompartido: function(token){
      if(!token) return Promise.resolve(false);
      var doStop = function(){
        if(!_fbDb) return false;
        return _fbDb.collection('gv_compartidos').doc(token).set({ activo: false, actualizadoEn: new Date().toISOString() }, { merge: true }).then(function(){ return true; })['catch'](function(){ return false; });
      };
      if(_fbDb) return doStop();
      return initFirebase().then(doStop)['catch'](function(){ return false; });
    }
  };
})();


/* ---------------- Ajuste 15/10: boton de cierre unico en todas las ventanas ----------------
   Pedido: que cerrar cualquier ventana (detalle del viaje, gerenciamiento, mapa, reprogramar, etc.)
   sea siempre un boton chico rojo con una cruz blanca en la esquina superior derecha, como cerrar
   una pestaña de Windows. Se agrega solo a cada ventana (.gv-modal dentro de .gv-modal-overlay) apenas
   se abre, sin tocar cada pantalla: el boton dispara la accion de cierre que ya tenia esa ventana
   ("Cerrar", o si no tiene, "Cancelar"), asi se respeta lo que hacia antes al cerrarse. Los botones
   de texto "Cerrar" se ocultan porque los reemplaza la cruz. */
(function(){
  if(typeof document === 'undefined' || GV.__modalXInit) return;
  GV.__modalXInit = true;
  function css(){
    if(document.getElementById('gv-modal-x-css')) return;
    var st = document.createElement('style');
    st.id = 'gv-modal-x-css';
    st.textContent = '.gv-modal-x{position:sticky;top:0;float:right;z-index:20;width:30px;height:24px;margin:-6px -6px 4px 8px;padding:0;border:none;border-radius:4px;background:#e81123;color:#fff;font:400 18px/24px Arial,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.2)}'
      + '.gv-modal-x{align-self:flex-end}.gv-modal-loc > .gv-modal-x{margin-bottom:-22px}'
      + '.gv-modal-x:hover{background:#c50f1f}.gv-modal-x:active{background:#a00d1a}'
      + '.gv-modal-x-oculto{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
  }
  function txt(b){ return String(b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function preparar(ov){
    var m = ov.querySelector('.gv-modal');
    if(!m || m.querySelector(':scope > .gv-modal-x')) return;
    css();
    var cerrar = null, cancelar = null;
    m.querySelectorAll('button').forEach(function(b){
      var t = txt(b), id = b.id || '';
      if(!cerrar && (t === 'cerrar' || t === '×' || /-close$/.test(id))) cerrar = b;
      if(!cancelar && t === 'cancelar' && id !== 'gv-site-edit-cancel') cancelar = b;
    });
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'gv-modal-x'; x.title = 'Cerrar'; x.setAttribute('aria-label', 'Cerrar'); x.innerHTML = '&#x2715;';
    x.addEventListener('click', function(e){
      e.stopPropagation();
      var b = cerrar || cancelar;
      if(b && document.body.contains(b)){ b.click(); } else { ov.remove(); }
    });
    m.insertBefore(x, m.firstChild);
    if(cerrar && txt(cerrar) === 'cerrar') cerrar.classList.add('gv-modal-x-oculto');
  }
  function revisar(nodo){
    if(!nodo || nodo.nodeType !== 1) return;
    if(nodo.classList && nodo.classList.contains('gv-modal-overlay')) preparar(nodo);
    if(nodo.querySelectorAll) nodo.querySelectorAll('.gv-modal-overlay').forEach(preparar);
  }
  function iniciar(){
    if(!document.body) return;
    revisar(document.body);
    new MutationObserver(function(muts){
      muts.forEach(function(mu){
        mu.addedNodes.forEach(revisar);
        /* ventanas que se arman con innerHTML despues de agregarse al documento */
        if(mu.type === 'childList' && mu.target && mu.target.closest){ var ov = mu.target.closest('.gv-modal-overlay'); if(ov) preparar(ov); }
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

})(window.GV);
