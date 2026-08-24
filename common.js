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

GV.fmtDurMin = function(ms){ if(ms == null || isNaN(ms) || ms < 0) return '0min'; var totalMin = Math.floor(ms/60000); var h = Math.floor(totalMin/60), m = totalMin%60; return h > 0 ? (h + 'h ' + m + 'min') : (m + 'min'); }; GV.SITE_GEOFENCE_M = 150; GV.siteNameFor = function(loc){ if(!loc || typeof loc.lat !== 'number') return (loc && loc.direccion) || ''; var sitios = (GV.Storage && GV.Storage.getSitios) ? GV.Storage.getSitios() : []; var best = null, bestD = null; sitios.forEach(function(s){ var d = GV.distKm({lat:loc.lat,lng:loc.lng},{lat:s.lat,lng:s.lng}); if(d != null && d*1000 <= GV.SITE_GEOFENCE_M){ if(bestD == null || d < bestD){ bestD = d; best = s; } } }); if(best && best.nombre) return best.nombre; return loc.direccion || ''; }; /* ---------------- CSS compartido ---------------- */
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
+ '.gv-radio-pair button{padding:6px 14px;border-radius:var(--gv-radius-pill);border:1.5px solid var(--gv-border);background:#fff;cursor:pointer;font-size:.8rem;font-weight:600;font-family:inherit}'
+ '.gv-radio-pair button.gv-r-yes-sel{background:#d1fae5;border-color:#059669;color:#065f46}'
+ '.gv-radio-pair button.gv-r-no-sel{background:#fee2e2;border-color:#dc2626;color:#991b1b}'
+ '.gv-req{color:#dc2626;font-size:.75rem;margin-left:4px}'
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
+ '@keyframes gvLivePulse{0%{box-shadow:0 0 0 4px rgba(var(--gv-accent-rgb),.3),0 1px 4px rgba(0,0,0,.4)}50%{box-shadow:0 0 0 8px rgba(var(--gv-accent-rgb),.05),0 1px 4px rgba(0,0,0,.4)}100%{box-shadow:0 0 0 4px rgba(var(--gv-accent-rgb),.3),0 1px 4px rgba(0,0,0,.4)}}'+'.gv-vehicle-marker{transition:transform 1s linear}'+'.gv-live-banner{display:inline-block;padding:4px 10px;border-radius:8px;font-size:.78rem;font-weight:700;margin:4px 0}'+'.gv-live-moving{background:#d1fae5;color:#065f46}'+'.gv-live-stopped{background:#fef3c7;color:#78350f}'+'.gv-live-nocomm{background:#fee2e2;color:#991b1b}'+'.gv-live-unknown{background:#f3f4f6;color:#6b7280}';

GV.injectCSS = function(containerId){
  var el = document.getElementById(containerId || 'gv-style-container');
  if(el && !el.querySelector('style')){
    el.insertAdjacentHTML('beforeend', '<style>' + GV.CSS + '</style>');
  }
};

/* ---------------- Leaflet loader ---------------- */
GV.loadLeaflet = function(){
  if(GV._leafletPromise) return GV._leafletPromise;
  GV._leafletPromise = new Promise(function(resolve, reject){
    if(window.L){ resolve(window.L); return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = function(){ resolve(window.L); };
    script.onerror = function(){ reject(new Error('No se pudo cargar el mapa (Leaflet)')); };
    document.head.appendChild(script);
  });
  return GV._leafletPromise;
};

/* ---------------- Capas base del mapa (satelite/hibrido como en el Mapa de Geotab) ---------------- */
/* Geotab usa Google Maps (vista hibrida: satelite + calles) en su interfaz nativa. Como esa
 * clave de API es privada de Geotab y esta restringida a su dominio, replicamos el mismo look
 * (satelite + calles + nombres) con capas gratuitas de Esri, que no requieren API key:
 * World_Imagery (fotos satelitales) + World_Transportation (calles y sus nombres) +
 * World_Boundaries_and_Places (nombres de localidades y limites). */
GV.addBaseLayers = function(map){
  var L = window.L;
  var satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, GIS User Community'
  });
  var calleNombres = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19
  });
  var etiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19
  });
  var hibrido = L.layerGroup([satelite, calleNombres, etiquetas]);
  var calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });
  hibrido.addTo(map);
  L.control.layers({ 'Satelite': hibrido, 'Calles': calles }, null, { position: 'topright', collapsed: true }).addTo(map);
  return { hibrido: hibrido, calles: calles };
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
  return GV.loadLeaflet().then(function(L){
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
          '<div class="gv-search-row"><input type="text" id="gv-site-search" placeholder="Buscar sitio guardado..."></div>' + '<div id="gv-site-list" style="display:none;max-height:160px;overflow:auto;margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;padding:4px;background:#f9fafb"></div>' + '<div id="gv-map-picker" class="gv-map-box"></div>' +
          '<div id="gv-map-addr" style="font-size:.85rem;color:#374151;margin-bottom:10px">Hace clic en el mapa para marcar el punto</div>' + '<div class="gv-search-row"><input type="text" id="gv-site-name" placeholder="Nombre para guardar este sitio (opcional)"><button type="button" class="gv-btn gv-btn-sec gv-btn-sm" id="gv-site-save-btn">Guardar sitio</button></div>' + '<div id="gv-site-edit-indicator" style="display:none;font-size:.78rem;color:#7c3aed;margin:-6px 0 10px 2px">Editando ubicacion del sitio guardado <button type="button" id="gv-site-edit-cancel" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:.78rem;text-decoration:underline;padding:0;margin-left:6px">Cancelar edicion</button></div>' +
          stopFieldsHtml +
          '<div class="gv-modal-actions">' +
            '<button type="button" class="gv-btn gv-btn-sec" id="gv-map-cancel">Cancelar</button>' +
            '<button type="button" class="gv-btn gv-btn-primary" id="gv-map-ok" disabled>Confirmar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var initial = (opts.initial && typeof opts.initial.lat === 'number') ? opts.initial : { lat: -38.951, lng: -68.059 };
      var map = L.map('gv-map-picker').setView([initial.lat, initial.lng], opts.initial ? 15 : 11);
      GV.addBaseLayers(map);

      var marker = null;
      var current = null;
      var tipo = 'carga'; var editingSiteId = null; function renderSiteList(filter){ var box = document.getElementById('gv-site-list'); if(!box) return; var list = (GV.Storage.getSitios ? GV.Storage.getSitios() : []) || []; var f = (filter||'').toLowerCase(); if(f){ list = list.filter(function(s){ return (s.nombre||'').toLowerCase().indexOf(f) !== -1 || (s.direccion||'').toLowerCase().indexOf(f) !== -1; }); } if(!list.length){ box.innerHTML = '<div style="font-size:.8rem;color:#9ca3af;padding:6px">Sin sitios guardados' + (f?' que coincidan':'') + '</div>'; return; } box.innerHTML = list.map(function(s){ return '<div class="gv-stop-item" data-site-id="' + s.id + '" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px"><span style="flex:1">' + GV.escapeHtml(s.nombre||s.direccion||'') + '</span><button type="button" class="gv-btn gv-btn-sec gv-btn-sm" data-edit-id="' + s.id + '" style="padding:2px 8px;font-size:.72rem;flex-shrink:0">Editar</button></div>'; }).join(''); box.querySelectorAll('[data-site-id]').forEach(function(el){ el.addEventListener('click', function(){ var id = el.getAttribute('data-site-id'); var site = list.find(function(s){ return s.id === id; }); if(!site) return; box.style.display='none'; setMarker(site.lat, site.lng); map.setView([site.lat, site.lng], 16); current = { lat: site.lat, lng: site.lng, direccion: site.direccion || site.nombre || '' }; var addrEl2 = document.getElementById('gv-map-addr'); if(addrEl2) addrEl2.textContent = current.direccion; var okBtn2 = document.getElementById('gv-map-ok'); if(okBtn2) okBtn2.disabled = false; if(opts.withStopFields && site.tipo){ var tb = document.getElementById('gv-tipo-' + site.tipo); if(tb) tb.click(); var durEl = document.getElementById('gv-map-duracion'); if(durEl && site.duracionMin != null) durEl.value = site.duracionMin; } }); }); box.querySelectorAll('[data-edit-id]').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var id = el.getAttribute('data-edit-id'); var site = list.find(function(s){ return s.id === id; }); if(!site) return; editingSiteId = site.id; setMarker(site.lat, site.lng); map.setView([site.lat, site.lng], 16); current = { lat: site.lat, lng: site.lng, direccion: site.direccion || site.nombre || '' }; var addrEl3 = document.getElementById('gv-map-addr'); if(addrEl3) addrEl3.textContent = current.direccion; var okBtn3 = document.getElementById('gv-map-ok'); if(okBtn3) okBtn3.disabled = false; var nameEl2 = document.getElementById('gv-site-name'); if(nameEl2) nameEl2.value = site.nombre || ''; var ind = document.getElementById('gv-site-edit-indicator'); if(ind) ind.style.display = 'block'; var saveBtn2 = document.getElementById('gv-site-save-btn'); if(saveBtn2) saveBtn2.textContent = 'Actualizar sitio'; }); }); }

      function setMarker(lat, lng){
        if(marker){ map.removeLayer(marker); }
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', function(){ var p = marker.getLatLng(); onPoint(p.lat, p.lng); });
      }

      function onPoint(lat, lng){
        current = { lat: lat, lng: lng, direccion: 'Buscando direccion...' };
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
        var addrEl0 = document.getElementById('gv-map-addr');
        if(addrEl0) addrEl0.textContent = current.direccion || 'Punto seleccionado';
        document.getElementById('gv-map-ok').disabled = false;
      }

      map.on('click', function(e){
        setMarker(e.latlng.lat, e.latlng.lng);
        onPoint(e.latlng.lat, e.latlng.lng);
      });

      function doSearch(){
        var q = document.getElementById('gv-map-search').value.trim();
        if(!q) return;
        GV.geocodeSearch(q).then(function(list){
          if(list && list.length){
            setMarker(list[0].lat, list[0].lng);
            map.setView([list[0].lat, list[0].lng], 15);
            current = { lat: list[0].lat, lng: list[0].lng, direccion: list[0].label };
            document.getElementById('gv-map-addr').textContent = list[0].label;
            document.getElementById('gv-map-ok').disabled = false;
          }
        });
      }
      document.getElementById('gv-map-search-btn').addEventListener('click', doSearch); var siteSearchEl = document.getElementById('gv-site-search'); var siteListBox = document.getElementById('gv-site-list'); if(siteSearchEl) siteSearchEl.addEventListener('input', function(){ if(siteListBox) siteListBox.style.display='block'; renderSiteList(siteSearchEl.value); }); if(siteSearchEl) siteSearchEl.addEventListener('focus', function(){ if(siteListBox) siteListBox.style.display='block'; renderSiteList(siteSearchEl.value); }); if(siteSearchEl) siteSearchEl.addEventListener('blur', function(){ setTimeout(function(){ if(siteListBox) siteListBox.style.display='none'; }, 250); }); renderSiteList(''); var siteSaveBtn = document.getElementById('gv-site-save-btn'); if(siteSaveBtn) siteSaveBtn.addEventListener('click', function(){ if(!current) return; var nameEl = document.getElementById('gv-site-name'); var nombre = (nameEl && nameEl.value.trim()) || current.direccion || 'Sitio sin nombre'; if(editingSiteId){ var patch = { nombre: nombre, direccion: current.direccion || '', lat: current.lat, lng: current.lng }; GV.Storage.updateSitio(editingSiteId, patch).then(function(){ editingSiteId = null; if(nameEl) nameEl.value=''; var ind = document.getElementById('gv-site-edit-indicator'); if(ind) ind.style.display='none'; siteSaveBtn.textContent = 'Guardar sitio'; renderSiteList(siteSearchEl ? siteSearchEl.value : ''); }); return; } var siteObj = { id: GV.genId('site'), nombre: nombre, direccion: current.direccion || '', lat: current.lat, lng: current.lng }; if(opts.withStopFields){ siteObj.tipo = tipo; var durInp = document.getElementById('gv-map-duracion'); siteObj.duracionMin = durInp ? (parseInt(durInp.value,10) || 0) : 0; } GV.Storage.addSitio(siteObj).then(function(){ if(nameEl) nameEl.value=''; renderSiteList(siteSearchEl ? siteSearchEl.value : ''); }); }); var siteEditCancelBtn = document.getElementById('gv-site-edit-cancel'); if(siteEditCancelBtn) siteEditCancelBtn.addEventListener('click', function(){ editingSiteId = null; var nameEl3 = document.getElementById('gv-site-name'); if(nameEl3) nameEl3.value=''; var ind2 = document.getElementById('gv-site-edit-indicator'); if(ind2) ind2.style.display='none'; var saveBtn3 = document.getElementById('gv-site-save-btn'); if(saveBtn3) saveBtn3.textContent = 'Guardar sitio'; });
      document.getElementById('gv-map-search').addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); doSearch(); }
      });

      if(opts.withStopFields){
        var bc = document.getElementById('gv-tipo-carga');
        var bd = document.getElementById('gv-tipo-descarga'); var ba = document.getElementById('gv-tipo-ambos'); function selectTipo(t){ tipo = t; bc.classList.toggle('gv-sel-carga', t==='carga'); bd.classList.toggle('gv-sel-descarga', t==='descarga'); ba.classList.toggle('gv-sel-ambos', t==='ambos'); }
        bc.addEventListener('click', function(){ selectTipo('carga'); });
        bd.addEventListener('click', function(){ selectTipo('descarga'); }); ba.addEventListener('click', function(){ selectTipo('ambos'); }); if(opts.initial && opts.initial.tipo){ selectTipo(opts.initial.tipo); } else { selectTipo('carga'); } if(opts.initial && typeof opts.initial.duracionMin === 'number'){ document.getElementById('gv-map-duracion').value = opts.initial.duracionMin; }
      }

      function cleanup(){ try{ map.remove(); }catch(e){} overlay.remove(); }

      document.getElementById('gv-map-cancel').addEventListener('click', function(){ cleanup(); resolve(null); });
      document.getElementById('gv-map-ok').addEventListener('click', function(){
        if(!current) return;
        var result = { lat: current.lat, lng: current.lng, direccion: current.direccion };
        if(opts.withStopFields){
          result.tipo = tipo;
          result.duracionMin = parseInt(document.getElementById('gv-map-duracion').value, 10) || 0;
        }
        cleanup();
        resolve(result);
      });

      function gvFixMapSize(){ try{ map.invalidateSize(false); }catch(e){} }
      if (window.requestAnimationFrame) { requestAnimationFrame(function(){ requestAnimationFrame(gvFixMapSize); }); }
      setTimeout(gvFixMapSize, 60);
      setTimeout(gvFixMapSize, 150);
      setTimeout(gvFixMapSize, 350);
      setTimeout(gvFixMapSize, 700);
      setTimeout(gvFixMapSize, 1200);
    });
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
GV.vehicleIcon = function(L, heading, color){
var deg = (typeof heading === 'number' && !isNaN(heading)) ? heading : 0;
var c = color || '#00A6E0';
var html = '<div style="width:28px;height:28px;transform:rotate(' + deg + 'deg)">' +
'<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">' +
'<circle cx="14" cy="14" r="12.5" fill="' + c + '" stroke="#fff" stroke-width="2"/>' +
'<path d="M14 6.5 L19 18.5 L14 15.3 L9 18.5 Z" fill="#fff"/>' +
'</svg></div>';
return L.divIcon({ className: 'gv-vehicle-marker', html: html, iconSize: [28,28], iconAnchor: [14,14] });
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
      findAddInId(function(id){
        _addInId = id;
        if(!id){ resolve(_data); return; }
        pullAddInData(function(){ notify(); resolve(_data); });
      });
    });
  }

  function refresh(){
    return new Promise(function(resolve){
      if(!_api || !_addInId){ resolve(_data); return; }
      pullAddInData(function(){ notify(); resolve(_data); });
    });
  }

  function persist(){ if(_fbReady && _fbDocRef){ _fbDocRef.set({ viajes: _data.viajes, alertas: _data.alertas, sitios: _data.sitios, conductores: _data.conductores, gerenciamientos: _data.gerenciamientos }).catch(function(){}); }
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
    addViaje: function(v){ _data.viajes.push(v); return persist(); },
    updateViaje: function(id, patch){
      var v = _data.viajes.find(function(x){ return x.id === id; });
      if(v){ Object.keys(patch).forEach(function(k){ v[k] = patch[k]; }); }
      return persist();
    },
    removeViaje: function(id){
      _data.viajes = _data.viajes.filter(function(v){ return v.id !== id; });
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
