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

GV.statusLabel = function(s){
  return {planificado:'Planificado',en_curso:'En Curso',completado:'Completado',demorado:'Demorado',cancelado:'Cancelado'}[s] || s;
};

GV.tipoParadaLabel = function(t){ return t === 'descarga' ? 'Descarga' : (t === 'ambos' ? 'Carga y Descarga' : 'Carga'); };

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
GV.isWithinSite = function(pt, siteLike){
  if(!pt || !siteLike || typeof siteLike.lat !== 'number') return false;
  if(siteLike.poligono && siteLike.poligono.length >= 3) return GV.pointInPolygon(pt, siteLike.poligono);
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
  if(siteLike.poligono && siteLike.poligono.length >= 3) return GV.pointInPolygon(pt, siteLike.poligono);
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
    var poly = !!(s.poligono && s.poligono.length >= 3);
    var extra = (opts.stickyId && opts.stickyId === s.id) ? GV.SITE_EXIT_HYSTERESIS_M : 0;
    var rEff = GV.effectiveRadiusM(s, sites);
    var dKm = GV.distKm(pt, s);
    var dM = (dKm == null) ? null : dKm*1000;
    var dentro = poly ? GV.pointInPolygon(pt, s.poligono) : (dM != null && dM <= rEff + extra);
    if(!dentro) return;
    cands.push({ site: s, idx: idx, poly: poly, norm: (poly || dM == null) ? 0 : (dM/Math.max(rEff, 1)), done: !!(opts.doneIds && opts.doneIds.indexOf(s.id) >= 0) });
  });
  if(!cands.length) return null;
  var conPoly = cands.filter(function(x){ return x.poly; });
  if(conPoly.length) cands = conPoly;
  if(opts.stickyId){
    var st = cands.filter(function(x){ return x.site.id === opts.stickyId; })[0];
    if(st) return st.site;
  }
  var pend = cands.filter(function(x){ return !x.done; });
  var pool = pend.length ? pend : cands;
  pool.sort(function(a, b){
    if(Math.abs(a.norm - b.norm) > 0.05) return a.norm - b.norm;
    return a.idx - b.idx;
  });
  return pool[0].site;
};
GV.siteNameFor = function(loc){ if(!loc || typeof loc.lat !== 'number') return (loc && loc.direccion) || ''; var sitios = (GV.Storage && GV.Storage.getSitios) ? GV.Storage.getSitios() : []; var best = null, bestD = null; sitios.forEach(function(s){ var within = GV.isWithinSite({lat:loc.lat,lng:loc.lng}, s); var d = GV.distKm({lat:loc.lat,lng:loc.lng},{lat:s.lat,lng:s.lng}); if(within){ if(bestD == null || d < bestD){ bestD = d; best = s; } } }); if(best && best.nombre) return best.nombre; return loc.direccion || ''; }; /* ---------------- CSS compartido ---------------- */
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
+ '.gv-stop-chip.gv-descarga{border-color:#d97706;color:#92400e;background:#fffbeb}' + '.gv-stop-chip.gv-ambos{border-color:#7c3aed;color:#5b21b6;background:#f5f3ff}'
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
+ '.gv-loc-display{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);background:#F8F9FB;font-size:.85rem;min-height:38px}'
+ '.gv-loc-display span{flex:1;color:#374151}'
+ '.gv-stop-item{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#F8F9FB;border:1px solid var(--gv-border);border-radius:var(--gv-radius);margin-bottom:6px}'
+ '.gv-stop-item span{flex:1;font-size:.85rem}.gv-stop-remove{background:none;border:none;cursor:pointer;color:#ef4444;font-size:1rem;padding:0 4px}'
+ '.gv-stop-badge{font-size:.7rem;font-weight:700;padding:2px 7px;border-radius:8px}'
+ '.gv-stop-badge.gv-carga{background:#dbeafe;color:#1e40af}.gv-stop-badge.gv-descarga{background:#fef3c7;color:#92400e}.gv-stop-badge.gv-ambos{background:#ede9fe;color:#5b21b6}'
+ '.gv-modal-overlay{position:fixed;inset:0;background:rgba(17,24,39,.55);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}'
+ '.gv-modal{background:#fff;border-radius:var(--gv-radius-lg);max-width:540px;width:100%;max-height:92vh;overflow:auto;padding:26px;box-shadow:0 24px 60px rgba(17,24,39,.22)}'
+ '.gv-modal h3{margin:0 0 14px;color:var(--gv-accent);font-size:1.1rem;font-weight:700}'
+ '.gv-map-box{height:280px;border-radius:var(--gv-radius);margin-bottom:10px;border:1px solid var(--gv-border)}'
+ '.gv-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}'
+ '.gv-search-row{display:flex;gap:8px;margin-bottom:10px}'
+ '.gv-search-row input{flex:1;padding:9px 12px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);font-size:.88rem;font-family:inherit}'
+ '.gv-tipo-toggle{display:flex;gap:8px;margin-bottom:12px}'
+ '.gv-tipo-toggle button{flex:1;padding:9px;border:1.5px solid var(--gv-border);border-radius:var(--gv-radius);background:#F8F9FB;cursor:pointer;font-weight:600;font-size:.85rem;font-family:inherit}'
+ '.gv-tipo-toggle button.gv-sel-carga{background:var(--gv-accent-light);border-color:var(--gv-accent);color:var(--gv-accent-dark)}'
+ '.gv-tipo-toggle button.gv-sel-descarga{background:#fef3c7;border-color:#d97706;color:#92400e}' + '.gv-tipo-toggle button.gv-sel-ambos{background:#ede9fe;border-color:#7c3aed;color:#5b21b6}'
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
+'.gv-truck-label-ov{position:absolute;transform:translate(-50%,calc(-100% - 14px));background:#152238;color:#fff;font-weight:700;font-size:12px;font-family:inherit;padding:5px 11px;border-radius:7px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.45);opacity:.96;pointer-events:none;z-index:1}';

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
  if(GV._gmapsPromise) return GV._gmapsPromise;
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
  return GV._gmapsPromise;
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
    if(pt){ this.__div.style.left = pt.x + 'px'; this.__div.style.top = pt.y + 'px'; }
  };
  ov.onRemove = function(){ if(this.__div && this.__div.parentNode){ this.__div.parentNode.removeChild(this.__div); } this.__div = null; };
  ov.setPosition = function(pos){ this.__pos = pos; this.draw(); };
  ov.setContent = function(newHtml){ if(this.__div) this.__div.innerHTML = newHtml; };
  return ov;
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

/* ---------------- Selector de ubicacion en mapa ---------------- */
/* opts: { title, initial:{lat,lng,direccion}, withStopFields:boolean } */
/* Devuelve una Promise que resuelve con {lat,lng,direccion[,tipo,duracionMin]} o null si se cancela */
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
            '<button type="button" id="gv-tipo-descarga">Descarga</button>' + '<button type="button" id="gv-tipo-ambos">Ambos</button>' +
          '<div class="gv-form-row"><label>Tiempo programado para carga/descarga (minutos)<span class="gv-req">*</span></label>' +
          '<input type="number" id="gv-map-duracion" min="0" step="5" value="30"></div>';
      }
      overlay.innerHTML =
        '<div class="gv-modal">' +
          '<h3>' + GV.escapeHtml(opts.title || 'Seleccionar ubicacion') + '</h3>' +
          '<div class="gv-search-row">' +
            '<input type="text" id="gv-map-search" placeholder="Buscar direccion...">' +
            '<button type="button" class="gv-btn gv-btn-sec gv-btn-sm" id="gv-map-search-btn">Buscar</button>' +
          '</div>' +
          '<div class="gv-search-row"><input type="text" id="gv-site-search" placeholder="Buscar sitio guardado..."></div>' + '<div id="gv-site-list" style="display:none;max-height:160px;overflow:auto;margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;padding:4px;background:#f9fafb"></div>' +
          (opts.vehiculoId ? '<div class="gv-search-row"><button type="button" id="gv-btn-ultima-pos" class="gv-btn gv-btn-sec gv-btn-sm" style="width:100%">Usar ultima posicion del camion</button></div>' : '') +
          '<div id="gv-map-picker" class="gv-map-box"></div>' +
          '<div id="gv-map-addr" style="font-size:.85rem;color:#374151;margin-bottom:10px">Hace clic en el mapa para marcar el punto</div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span style="font-size:.78rem;color:#6b7280">Area del sitio:</span><button type="button" id="gv-shape-circulo" class="gv-btn gv-btn-sec gv-btn-sm" style="padding:4px 10px;font-size:.72rem">Circulo automatico</button><button type="button" id="gv-shape-manual" class="gv-btn gv-btn-sec gv-btn-sm" style="padding:4px 10px;font-size:.72rem">Dibujar manualmente</button></div>' +
          '<div id="gv-shape-manual-hint" style="display:none;font-size:.76rem;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:6px 10px;margin-bottom:10px">Hace clic en el mapa para agregar los vertices del area del sitio (minimo 3 puntos). <button type="button" id="gv-shape-undo" style="background:none;border:none;color:#7c3aed;text-decoration:underline;cursor:pointer;font-size:.76rem;padding:0;margin-left:6px">Deshacer ultimo punto</button><button type="button" id="gv-shape-clear" style="background:none;border:none;color:#dc2626;text-decoration:underline;cursor:pointer;font-size:.76rem;padding:0;margin-left:6px">Borrar forma</button></div>' +
          '<div id="gv-area-info" style="display:none;font-size:.76rem;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 10px;margin-bottom:10px"></div>' +
          '<div class="gv-search-row"><input type="text" id="gv-site-name" placeholder="Nombre para guardar este sitio (opcional)"><button type="button" class="gv-btn gv-btn-sec gv-btn-sm" id="gv-site-save-btn">Guardar sitio</button></div>' + '<div id="gv-site-edit-indicator" style="display:none;font-size:.78rem;color:#7c3aed;margin:-6px 0 10px 2px">Editando ubicacion del sitio guardado <button type="button" id="gv-site-edit-cancel" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:.78rem;text-decoration:underline;padding:0;margin-left:6px">Cancelar edicion</button></div>' +
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
        if(!current || typeof current.lat !== "number"){ if(info) info.style.display = "none"; return; }
        var poly = (shapeMode === "manual" && manualPoly.length >= 3) ? manualPoly : ((current.poligono && current.poligono.length >= 3) ? current.poligono : null);
        if(info) info.style.display = "block";
        if(poly){
          if(shapeMode !== "manual"){
            areaLayer = new google.maps.Polygon({ paths: poly.map(function(pp){ return { lat: pp.lat != null ? pp.lat : pp[0], lng: pp.lng != null ? pp.lng : pp[1] }; }), strokeColor:"#7c3aed", strokeWeight:2, fillColor:"#7c3aed", fillOpacity:.15, map: map });
          }
          if(info) info.innerHTML = "Area de deteccion: <b>poligono dibujado a mano</b> (" + poly.length + " vertices). El ingreso y el egreso del sitio se detectan cuando la unidad entra o sale de esa forma.";
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
      var tipo = 'carga'; var editingSiteId = null; function renderSiteList(filter){ var box = document.getElementById('gv-site-list'); if(!box) return; var list = (GV.Storage.getSitios ? GV.Storage.getSitios() : []) || []; var f = (filter||'').toLowerCase(); if(f){ list = list.filter(function(s){ return (s.nombre||'').toLowerCase().indexOf(f) !== -1 || (s.direccion||'').toLowerCase().indexOf(f) !== -1; }); } if(!list.length){ box.innerHTML = '<div style="font-size:.8rem;color:#9ca3af;padding:6px">Sin sitios guardados' + (f?' que coincidan':'') + '</div>'; return; } box.innerHTML = list.map(function(s){ return '<div class="gv-stop-item" data-site-id="' + s.id + '" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px"><span style="flex:1">' + GV.escapeHtml(s.nombre||s.direccion||'') + '</span><button type="button" class="gv-btn gv-btn-sec gv-btn-sm" data-edit-id="' + s.id + '" style="padding:2px 8px;font-size:.72rem;flex-shrink:0">Editar</button></div>'; }).join(''); box.querySelectorAll('[data-site-id]').forEach(function(el){ el.addEventListener('click', function(){ var id = el.getAttribute('data-site-id'); var site = list.find(function(s){ return s.id === id; }); if(!site) return; box.style.display='none'; setMarker(site.lat, site.lng); map.setCenter({ lat: site.lat, lng: site.lng }); map.setZoom(16); current = { lat: site.lat, lng: site.lng, direccion: site.direccion || site.nombre || '' }; if(site.poligono && site.poligono.length >= 3){ current.poligono = site.poligono; } var addrEl2 = document.getElementById('gv-map-addr'); if(addrEl2) addrEl2.textContent = current.direccion; var okBtn2 = document.getElementById('gv-map-ok'); if(okBtn2) okBtn2.disabled = false; if(opts.withStopFields && site.tipo){ var tb = document.getElementById('gv-tipo-' + site.tipo); if(tb) tb.click(); var durEl = document.getElementById('gv-map-duracion'); if(durEl && site.duracionMin != null) durEl.value = site.duracionMin; } }); }); box.querySelectorAll('[data-edit-id]').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var id = el.getAttribute('data-edit-id'); var site = list.find(function(s){ return s.id === id; }); if(!site) return; editingSiteId = site.id; setMarker(site.lat, site.lng); map.setCenter({ lat: site.lat, lng: site.lng }); map.setZoom(16); current = { lat: site.lat, lng: site.lng, direccion: site.direccion || site.nombre || '' }; var addrEl3 = document.getElementById('gv-map-addr'); if(addrEl3) addrEl3.textContent = current.direccion; var okBtn3 = document.getElementById('gv-map-ok'); if(okBtn3) okBtn3.disabled = false; var nameEl2 = document.getElementById('gv-site-name'); if(nameEl2) nameEl2.value = site.nombre || ''; var ind = document.getElementById('gv-site-edit-indicator'); if(ind) ind.style.display = 'block'; var saveBtn2 = document.getElementById('gv-site-save-btn'); if(saveBtn2) saveBtn2.textContent = 'Actualizar sitio'; if(site.poligono && site.poligono.length >= 3){ manualPoly = site.poligono.map(function(pt){ return { lat: pt.lat, lng: pt.lng }; }); setShapeMode('manual'); } else { manualPoly = []; setShapeMode('circulo'); } }); }); }

      function setMarker(lat, lng){
        if(marker){ marker.setMap(null); }
        marker = new google.maps.Marker({ position: { lat: lat, lng: lng }, map: map, draggable: true });
        marker.addListener('dragend', function(e){ onPoint(e.latLng.lat(), e.latLng.lng()); });
        scheduleAreaPreview();
      }

      function onPoint(lat, lng){
        var __prevPoligono = current && current.poligono;
        current = { lat: lat, lng: lng, direccion: 'Buscando direccion...' };
        if(__prevPoligono) current.poligono = __prevPoligono;
        scheduleAreaPreview();
        var addrEl = document.getElementById('gv-map-addr');
        if(addrEl) addrEl.textContent = current.direccion;
        var okBtn = document.getElementById('gv-map-ok');
        if(okBtn) okBtn.disabled = false;
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

      function doSearch(){
        var q = document.getElementById('gv-map-search').value.trim();
        if(!q) return;
        GV.geocodeSearch(q).then(function(list){
          if(list && list.length){
            setMarker(list[0].lat, list[0].lng);
            map.setCenter({ lat: list[0].lat, lng: list[0].lng });
            map.setZoom(15);
            current = { lat: list[0].lat, lng: list[0].lng, direccion: list[0].label };
            document.getElementById('gv-map-addr').textContent = list[0].label;
            document.getElementById('gv-map-ok').disabled = false;
            setShapeMode('circulo');
          }
        });
      }
      document.getElementById('gv-map-search-btn').addEventListener('click', doSearch); var siteSearchEl = document.getElementById('gv-site-search'); var siteListBox = document.getElementById('gv-site-list'); if(siteSearchEl) siteSearchEl.addEventListener('input', function(){ if(siteListBox) siteListBox.style.display='block'; renderSiteList(siteSearchEl.value); }); if(siteSearchEl) siteSearchEl.addEventListener('focus', function(){ if(siteListBox) siteListBox.style.display='block'; renderSiteList(siteSearchEl.value); }); if(siteSearchEl) siteSearchEl.addEventListener('blur', function(){ setTimeout(function(){ if(siteListBox) siteListBox.style.display='none'; }, 250); }); renderSiteList(''); var siteSaveBtn = document.getElementById('gv-site-save-btn'); if(siteSaveBtn) siteSaveBtn.addEventListener('click', function(){ if(!current) return; if(shapeMode === 'manual' && manualPoly.length > 0 && manualPoly.length < 3){ alert('Dibuja al menos 3 puntos para definir el area del sitio, o cambia a "Circulo automatico".'); return; } var nameEl = document.getElementById('gv-site-name'); var nombre = (nameEl && nameEl.value.trim()) || current.direccion || 'Sitio sin nombre'; if(editingSiteId){ var patch = { nombre: nombre, direccion: current.direccion || '', lat: current.lat, lng: current.lng, poligono: current.poligono || null }; GV.Storage.updateSitio(editingSiteId, patch).then(function(){ editingSiteId = null; if(nameEl) nameEl.value=''; var ind = document.getElementById('gv-site-edit-indicator'); if(ind) ind.style.display='none'; siteSaveBtn.textContent = 'Guardar sitio'; renderSiteList(siteSearchEl ? siteSearchEl.value : ''); }); return; } var siteObj = { id: GV.genId('site'), nombre: nombre, direccion: current.direccion || '', lat: current.lat, lng: current.lng }; if(current.poligono) siteObj.poligono = current.poligono; if(opts.withStopFields){ siteObj.tipo = tipo; var durInp = document.getElementById('gv-map-duracion'); siteObj.duracionMin = durInp ? (parseInt(durInp.value,10) || 0) : 0; } GV.Storage.addSitio(siteObj).then(function(){ if(nameEl) nameEl.value=''; renderSiteList(siteSearchEl ? siteSearchEl.value : ''); }); }); var siteEditCancelBtn = document.getElementById('gv-site-edit-cancel'); if(siteEditCancelBtn) siteEditCancelBtn.addEventListener('click', function(){ editingSiteId = null; var nameEl3 = document.getElementById('gv-site-name'); if(nameEl3) nameEl3.value=''; var ind2 = document.getElementById('gv-site-edit-indicator'); if(ind2) ind2.style.display='none'; var saveBtn3 = document.getElementById('gv-site-save-btn'); if(saveBtn3) saveBtn3.textContent = 'Guardar sitio'; }); var shapeCirculoBtn = document.getElementById('gv-shape-circulo'); if(shapeCirculoBtn) shapeCirculoBtn.addEventListener('click', function(){ setShapeMode('circulo'); }); var shapeManualBtn = document.getElementById('gv-shape-manual'); if(shapeManualBtn) shapeManualBtn.addEventListener('click', function(){ setShapeMode('manual'); }); var shapeUndoBtn = document.getElementById('gv-shape-undo'); if(shapeUndoBtn) shapeUndoBtn.addEventListener('click', function(){ manualPoly.pop(); updateManualPoly(); }); var shapeClearBtn = document.getElementById('gv-shape-clear'); if(shapeClearBtn) shapeClearBtn.addEventListener('click', function(){ manualPoly = []; updateManualPoly(); }); if(opts.initial && opts.initial.poligono && opts.initial.poligono.length >= 3){ manualPoly = opts.initial.poligono.map(function(pt){ return { lat: pt.lat, lng: pt.lng }; }); setShapeMode('manual'); } else { setShapeMode('circulo'); }
      document.getElementById('gv-map-search').addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); doSearch(); }
      });

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
            } else {
              alert('No se pudo obtener la ultima posicion del vehiculo.');
            }
          }, function(){ restaurarBtn(); alert('No se pudo obtener la ultima posicion del vehiculo.'); });
        });
      }

      if(opts.withStopFields){
        var bc = document.getElementById('gv-tipo-carga');
        var bd = document.getElementById('gv-tipo-descarga'); var ba = document.getElementById('gv-tipo-ambos'); function selectTipo(t){ tipo = t; bc.classList.toggle('gv-sel-carga', t==='carga'); bd.classList.toggle('gv-sel-descarga', t==='descarga'); ba.classList.toggle('gv-sel-ambos', t==='ambos'); }
        bc.addEventListener('click', function(){ selectTipo('carga'); });
        bd.addEventListener('click', function(){ selectTipo('descarga'); }); ba.addEventListener('click', function(){ selectTipo('ambos'); }); if(opts.initial && opts.initial.tipo){ selectTipo(opts.initial.tipo); } else { selectTipo('carga'); } if(opts.initial && typeof opts.initial.duracionMin === 'number'){ document.getElementById('gv-map-duracion').value = opts.initial.duracionMin; }
      }

      function cleanup(){ overlay.remove(); }

      document.getElementById('gv-map-cancel').addEventListener('click', function(){ cleanup(); resolve(null); });
      document.getElementById('gv-map-ok').addEventListener('click', function(){
        if(!current) return;
        var result = { lat: current.lat, lng: current.lng, direccion: current.direccion };
        if(current.poligono) result.poligono = current.poligono;
        if(opts.withStopFields){
          result.tipo = tipo;
          result.duracionMin = parseInt(document.getElementById('gv-map-duracion').value, 10) || 0;
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
    api.call('Get', { typeName: 'Camera', search: { deviceSearch: { deviceIds: deviceId } } }, function(res){
      var cam = (res && res.length) ? res[0] : null;
      GV._camCache[deviceId] = cam;
      resolve(cam);
    }, function(){ GV._camCache[deviceId] = null; resolve(null); });
  });
};

/* ---------------- Reproductor de video de Geotab (web component <gvp-video-player>) ----------------
Biblioteca oficial de Geotab Video para insertar imagenes/reproduccion de la camara de un
vehiculo. Se carga una sola vez (CSS + JS) y despues cada <gvp-video-player> que se cree
recibe las credenciales de la sesion actual y, para "Recording Playback", el numero de serie
de la camara (GV.getCameraForDevice) y un timestamp UNIX (playback-start-timestamp). */
/* ---------------- Permiso para ver video/camara ----------------
No existe un API documentado de MyGeotab para preguntar directamente "tiene este usuario
el permiso ViewRecordedVideo?", asi que se usa una prueba de capacidad: se intenta un Get
real de CameraEvent (acotado a los ultimos 60 segundos, para que sea liviano) y se toma el
exito/fracaso de esa llamada como la señal de autorizacion. El resultado se cachea (una sola
llamada por sesion) para no repetir la prueba en cada hover. */
GV._camAccessCache = null; // null = aun no se sabe, true/false = ya resuelto
GV.hasVideoAccess = function(api){
  if(GV._camAccessCache !== null) return Promise.resolve(GV._camAccessCache);
  if(!api) return Promise.resolve(false);
  return new Promise(function(resolve){
    var now = new Date();
    var from = new Date(now.getTime() - 60000).toISOString();
    var to = now.toISOString();
    api.call('Get', { typeName: 'CameraEvent', search: { fromDate: from, toDate: to } }, function(){
      GV._camAccessCache = true; resolve(true);
    }, function(){
      GV._camAccessCache = false; resolve(false);
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
GV.getRoute = function(points){
return new Promise(function(resolve){
try{
if(!points || points.length < 2){ resolve(null); return; }
var coordStr = points.map(function(p){ return p.lng + ',' + p.lat; }).join(';');
var url = 'https://router.project-osrm.org/route/v1/driving/' + coordStr + '?overview=full&geometries=geojson&steps=false';
fetch(url).then(function(r){ return r.json(); }).then(function(data){
if(data && data.code === 'Ok' && data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates){
var route = data.routes[0];
var coords = route.geometry.coordinates.map(function(c){ return [c[1], c[0]]; });
var legs = (route.legs || []).map(function(lg){ return { distance: lg.distance, duration: lg.duration }; });
resolve({ coords: coords, distance: route.distance, duration: route.duration, legs: legs });
} else { resolve(null); }
}).catch(function(){ resolve(null); });
}catch(e){ resolve(null); }
});
};

/* ---------------- Historial de posiciones (LogRecord) ---------------- */
GV.getHistory = function(api, deviceId, fromISO, toISO){
return new Promise(function(resolve){
if(!api || !deviceId){ resolve([]); return; }
api.call('Get', { typeName: 'LogRecord', search: { deviceSearch: { id: deviceId }, fromDate: fromISO, toDate: toISO } }, function(res){
resolve((res || []).slice().sort(function(a,b){ return new Date(a.dateTime) - new Date(b.dateTime); }));
}, function(){ resolve([]); });
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

GV.Storage = (function(){
  var _api = null;
  var _addInId = null;
  var _addInDataId = null;
    var _data = { viajes: [], alertas: [], sitios: [], conductores: [], gerenciamientos: [] };
  var _listeners = [];
      var _pendingWrites = 0;
    var _dirtyViajeIds = {}; var _removedViajeIds = {};
    var REPO_MARK = 'geotab-gestion-viajes'; var _fbDb = null; var _fbDocRef = null; var _fbReady = false; function initFirebase(){ return GV.loadFirebase().then(function(firebase){ if(!firebase.apps || !firebase.apps.length){ firebase.initializeApp(GV.FIREBASE_CONFIG); } _fbDb = firebase.firestore(); _fbDocRef = _fbDb.collection('gv_data').doc('main'); _fbDocRef.onSnapshot(function(snap){ _fbReady = true; var d = snap.exists ? snap.data() : null; if(d){ _data.viajes = d.viajes || []; _data.alertas = d.alertas || []; _data.sitios = d.sitios || []; _data.conductores = d.conductores || _data.conductores || []; _data.gerenciamientos = d.gerenciamientos || _data.gerenciamientos || []; saveToLS(); } notify(); }, function(err){}); return true; }); }

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
            _data.viajes = d.viajes || []; _data.alertas = d.alertas || []; _data.sitios = d.sitios || [];
            _data.conductores = d.conductores || _data.conductores || []; _data.gerenciamientos = d.gerenciamientos || _data.gerenciamientos || [];
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
    var _dirtyIdsSnapshot = Object.keys(_dirtyViajeIds); _dirtyViajeIds = {};
    var _removedIdsSnapshot = Object.keys(_removedViajeIds); _removedViajeIds = {};
    if(_fbReady && _fbDocRef){
      _pendingWrites++;
      var _otherFields = { alertas: _data.alertas, sitios: _data.sitios, conductores: _data.conductores, gerenciamientos: _data.gerenciamientos };
      var _writeOp;
            if((_dirtyIdsSnapshot.length || _removedIdsSnapshot.length) && _fbDb){
        var _localViajesById = {};
        _dirtyIdsSnapshot.forEach(function(id){ var v = _data.viajes.find(function(x){ return x.id === id; }); if(v) _localViajesById[id] = v; });
        _writeOp = _fbDb.runTransaction(function(tx){
          return tx.get(_fbDocRef).then(function(doc){
            var serverViajes = (doc.exists && doc.data().viajes) || [];
            serverViajes = serverViajes.slice();
            if(_removedIdsSnapshot.length){ serverViajes = serverViajes.filter(function(v){ return _removedIdsSnapshot.indexOf(v.id) < 0; }); }
            Object.keys(_localViajesById).forEach(function(id){
              var idx = -1;
              for(var i = 0; i < serverViajes.length; i++){ if(serverViajes[i].id === id){ idx = i; break; } }
              if(idx >= 0){ serverViajes[idx] = _localViajesById[id]; } else { serverViajes.push(_localViajesById[id]); }
            });
            tx.set(_fbDocRef, Object.assign({ viajes: serverViajes }, _otherFields), { merge: true });
          });
        });
      } else {
        _writeOp = _fbDocRef.set(_otherFields, { merge: true });
      }
      _writeOp.then(function(){ _pendingWrites--; }).catch(function(){ _pendingWrites--; });
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
    getViajes: function(){ return _data.viajes; },
    getConductores: function(){ return _data.conductores; },
    setConductores: function(list){ _data.conductores = list || []; return persist(); },
    getAlertas: function(){ return _data.alertas; }, getSitios: function(){ return _data.sitios; }, addSitio: function(s){ _data.sitios.push(s); return persist(); }, updateSitio: function(id, patch){ var s = _data.sitios.find(function(x){ return x.id === id; }); if(s){ Object.keys(patch).forEach(function(k){ s[k] = patch[k]; }); } return persist(); }, removeSitio: function(id){ _data.sitios = _data.sitios.filter(function(x){ return x.id !== id; }); return persist(); },
    addViaje: function(v){ _data.viajes.push(v); if(v && v.id) _dirtyViajeIds[v.id] = true; return persist(); },
    updateViaje: function(id, patch){
      var v = _data.viajes.find(function(x){ return x.id === id; });
      if(v){ Object.keys(patch).forEach(function(k){ v[k] = patch[k]; }); }
      if(id) _dirtyViajeIds[id] = true;
      return persist();
    },
    markDirtyViaje: function(id){ if(id) _dirtyViajeIds[id] = true; },
    removeViaje: function(id){
      _data.viajes = _data.viajes.filter(function(v){ return v.id !== id; });
      if(id){ _removedViajeIds[id] = true; delete _dirtyViajeIds[id]; }
      return persist();
    },
    getViaje: function(id){ return _data.viajes.find(function(v){ return v.id === id; }); },
    addAlerta: function(a){
      if(_data.alertas.some(function(x){ return x.id === a.id; })) return Promise.resolve(false);
      _data.alertas.push(a); return persist();
    },
    removeAlerta: function(id){
      _data.alertas = _data.alertas.filter(function(a){ return a.id !== id; });
      return persist();
    },
getGerenciamientos: function(){ return _data.gerenciamientos; },
    addGerenciamiento: function(g){ _data.gerenciamientos.push(g); return persist(); },
    isConnected: function(){ return !!_addInId; }
  };
})();

})(window.GV);
