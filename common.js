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
  return dt.toLocaleDateString('es-AR') + ' ' + dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
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

/* ---------------- CSS compartido ---------------- */
GV.CSS = ""
+ '#gv-app{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:960px;margin:0 auto;padding:16px;color:#222}'
+ '#gv-header{background:linear-gradient(135deg,#1a56db,#7e3af2);color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:16px}'
+ '#gv-header h1{margin:0 0 4px;font-size:1.6rem}#gv-header p{margin:0;opacity:.85;font-size:.9rem}'
+ '#gv-tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid #e5e7eb;padding-bottom:4px;flex-wrap:wrap}'
+ '.gv-tab-btn{background:none;border:none;padding:10px 18px;cursor:pointer;font-size:.95rem;color:#6b7280;border-radius:8px 8px 0 0;transition:all .2s}'
+ '.gv-tab-btn:hover{background:#f3f4f6;color:#374151}.gv-tab-btn.gv-active{background:#1a56db;color:#fff}'
+ '.gv-tab-content{display:none}.gv-tab-content.gv-show{display:block}'
+ '.gv-badge{background:#ef4444;color:#fff;border-radius:10px;padding:1px 6px;font-size:.75rem;margin-left:4px}'
+ '.gv-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}'
+ '.gv-stat-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.05)}'
+ '.gv-stat-num{font-size:2rem;font-weight:700;color:#1a56db}.gv-stat-num.gv-blue{color:#0891b2}.gv-stat-num.gv-green{color:#059669}.gv-stat-num.gv-red{color:#dc2626}'
+ '.gv-stat-lbl{font-size:.8rem;color:#6b7280;margin-top:4px}'
+ '.gv-trip-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}'
+ '.gv-trip-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px;flex-wrap:wrap}'
+ '.gv-trip-title{font-weight:600;font-size:1rem}'
+ '.gv-status{padding:4px 10px;border-radius:20px;font-size:.78rem;font-weight:600;white-space:nowrap}'
+ '.gv-s-planificado{background:#dbeafe;color:#1e40af}.gv-s-en_curso{background:#d1fae5;color:#065f46}'
+ '.gv-s-completado{background:#f3f4f6;color:#6b7280}.gv-s-demorado{background:#fee2e2;color:#991b1b}.gv-s-cancelado{background:#f3f4f6;color:#9ca3af}'
+ '.gv-trip-info{font-size:.85rem;color:#6b7280;margin-bottom:8px}'
+ '.gv-stops{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}'
+ '.gv-stop-chip{background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:3px 8px;font-size:.78rem;color:#374151}'
+ '.gv-stop-chip.gv-carga{border-color:#1a56db;color:#1a56db;background:#eff6ff}'
+ '.gv-stop-chip.gv-descarga{border-color:#d97706;color:#92400e;background:#fffbeb}' + '.gv-stop-chip.gv-ambos{border-color:#7c3aed;color:#5b21b6;background:#f5f3ff}'
+ '.gv-trip-actions{display:flex;gap:8px;margin-top:12px;justify-content:flex-end;flex-wrap:wrap}'
+ '.gv-btn{padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:.88rem;font-weight:500;transition:all .2s}'
+ '.gv-btn:disabled{opacity:.5;cursor:not-allowed}'
+ '.gv-btn-sm{padding:6px 12px;font-size:.82rem}'
+ '.gv-btn-primary{background:#1a56db;color:#fff}.gv-btn-primary:hover{background:#1648c0}'
+ '.gv-btn-sec{background:#f3f4f6;color:#374151;border:1px solid #d1d5db}.gv-btn-sec:hover{background:#e5e7eb}'
+ '.gv-btn-suc{background:#059669;color:#fff}.gv-btn-suc:hover{background:#047857}'
+ '.gv-btn-danger{background:#dc2626;color:#fff}.gv-btn-danger:hover{background:#b91c1c}'
+ '.gv-btn-warn{background:#d97706;color:#fff}.gv-btn-warn:hover{background:#b45309}'
+ '.gv-form-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.05)}'
+ '.gv-form-card h2{margin:0 0 20px;font-size:1.2rem;color:#1a56db}'
+ '.gv-form-row{margin-bottom:14px}.gv-form-row label{display:block;font-size:.85rem;font-weight:600;color:#374151;margin-bottom:5px}'
+ '.gv-form-row input,.gv-form-row select,.gv-form-row textarea{width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:.9rem;color:#111;box-sizing:border-box}'
+ '.gv-form-row input:focus,.gv-form-row select:focus,.gv-form-row textarea:focus{outline:none;border-color:#1a56db;box-shadow:0 0 0 3px rgba(26,86,219,.15)}'
+ '.gv-two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
+ '.gv-alert-card{background:#fff;border-left:4px solid #ef4444;border-radius:8px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.05);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}'
+ '.gv-alert-card.gv-alert-warn{border-left-color:#d97706}'
+ '.gv-alert-text{font-size:.9rem}.gv-alert-time{font-size:.78rem;color:#6b7280;margin-top:3px}'
+ '.gv-loc-display{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;font-size:.85rem;min-height:38px}'
+ '.gv-loc-display span{flex:1;color:#374151}'
+ '.gv-stop-item{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px}'
+ '.gv-stop-item span{flex:1;font-size:.85rem}.gv-stop-remove{background:none;border:none;cursor:pointer;color:#ef4444;font-size:1rem;padding:0 4px}'
+ '.gv-stop-badge{font-size:.7rem;font-weight:700;padding:2px 6px;border-radius:4px}'
+ '.gv-stop-badge.gv-carga{background:#dbeafe;color:#1e40af}.gv-stop-badge.gv-descarga{background:#fef3c7;color:#92400e}.gv-stop-badge.gv-ambos{background:#ede9fe;color:#5b21b6}'
+ '.gv-modal-overlay{position:fixed;inset:0;background:rgba(17,24,39,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}'
+ '.gv-modal{background:#fff;border-radius:12px;max-width:540px;width:100%;max-height:92vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3)}'
+ '.gv-modal h3{margin:0 0 14px;color:#1a56db;font-size:1.1rem}'
+ '.gv-map-box{height:280px;border-radius:8px;margin-bottom:10px;border:1px solid #d1d5db}'
+ '.gv-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}'
+ '.gv-search-row{display:flex;gap:8px;margin-bottom:10px}'
+ '.gv-search-row input{flex:1;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:.88rem}'
+ '.gv-tipo-toggle{display:flex;gap:8px;margin-bottom:12px}'
+ '.gv-tipo-toggle button{flex:1;padding:9px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;cursor:pointer;font-weight:600;font-size:.85rem}'
+ '.gv-tipo-toggle button.gv-sel-carga{background:#dbeafe;border-color:#1a56db;color:#1a56db}'
+ '.gv-tipo-toggle button.gv-sel-descarga{background:#fef3c7;border-color:#d97706;color:#92400e}' + '.gv-tipo-toggle button.gv-sel-ambos{background:#ede9fe;border-color:#7c3aed;color:#5b21b6}'
+ '.gv-banner{border-radius:10px;padding:16px 18px;margin-bottom:16px}'
+ '.gv-banner h3{margin:0 0 6px;font-size:1rem}'
+ '.gv-banner p{margin:0;font-size:.88rem}'
+ '.gv-banner-info{background:#dbeafe;border:1px solid #93c5fd;color:#1e3a8a}'
+ '.gv-banner-warn{background:#fef3c7;border:1px solid #fcd34d;color:#78350f}'
+ '.gv-banner-danger{background:#fee2e2;border:1px solid #fca5a5;color:#7f1d1d}'
+ '.gv-banner-ok{background:#d1fae5;border:1px solid #6ee7b7;color:#065f46}'
+ '.gv-wizard-step{margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #f3f4f6}'
+ '.gv-wizard-step h4{margin:0 0 10px;font-size:.95rem;color:#1a56db}'
+ '.gv-wizard-progress{display:flex;gap:6px;margin-bottom:16px}'
+ '.gv-wizard-progress span{flex:1;height:6px;border-radius:3px;background:#e5e7eb}'
+ '.gv-wizard-progress span.gv-done{background:#1a56db}'
+ '.gv-check-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f3f4f6;font-size:.88rem;gap:10px}'
+ '.gv-radio-pair{display:flex;gap:8px}'
+ '.gv-radio-pair button{padding:6px 14px;border-radius:20px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-size:.8rem;font-weight:600}'
+ '.gv-radio-pair button.gv-r-yes-sel{background:#d1fae5;border-color:#059669;color:#065f46}'
+ '.gv-radio-pair button.gv-r-no-sel{background:#fee2e2;border-color:#dc2626;color:#991b1b}'
+ '.gv-req{color:#dc2626;font-size:.75rem;margin-left:4px}'
+ '.gv-result-box{border-radius:12px;padding:22px;text-align:center;margin-bottom:16px}'
+ '.gv-result-verde{background:#d1fae5;border:2px solid #059669;color:#065f46}'
+ '.gv-result-amarillo{background:#fef3c7;border:2px solid #d97706;color:#78350f}'
+ '.gv-result-rojo{background:#fee2e2;border:2px solid #dc2626;color:#7f1d1d}'
+ '.gv-result-box h2{margin:0 0 8px;font-size:1.3rem}'
+ '.gv-driver-trip{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.06)}'
+ '.gv-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}'
+ '.gv-motivo-list label{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;cursor:pointer;font-size:.88rem}'
+ '.gv-motivo-list input{width:auto}'
+ '.gv-select-driver{margin-bottom:16px;padding:10px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;font-size:.85rem}'
+ '.gv-view-btn.gv-active{background:#1a56db;color:#fff;border-color:#1a56db}'
+ '.gv-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}'
+ '.gv-cal-dow{text-align:center;font-size:.72rem;font-weight:700;color:#6b7280;padding:4px 0}'
+ '.gv-cal-day{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px;min-height:62px;cursor:pointer;transition:all .15s}'
+ '.gv-cal-day:hover{border-color:#1a56db}'
+ '.gv-cal-day.gv-cal-empty{background:transparent;border:none;cursor:default}'
+ '.gv-cal-day.gv-cal-today{border-color:#1a56db;box-shadow:0 0 0 2px rgba(26,86,219,.15)}'
+ '.gv-cal-day.gv-cal-sel{background:#eff6ff;border-color:#1a56db}'
+ '.gv-cal-daynum{font-size:.76rem;font-weight:700;color:#374151}'
+ '.gv-cal-count{font-size:1.05rem;font-weight:700;color:#1a56db;margin-top:6px}'
+ '.gv-cal-sub{font-size:.66rem;color:#6b7280;margin-top:2px}'
+ '.gv-filter-chip{display:inline-flex;align-items:center;gap:8px;background:#eff6ff;border:1px solid #93c5fd;color:#1e3a8a;border-radius:20px;padding:6px 12px;font-size:.82rem;margin-bottom:10px}'
+ '.gv-det-table{width:100%;border-collapse:collapse;font-size:.82rem}'
+ '.gv-det-table th{text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;padding:6px 4px}'
+ '.gv-det-table td{padding:6px 4px;border-bottom:1px solid #f3f4f6}'
+ '.gv-site-marker-lbl{color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}'
+ '.gv-live-marker-lbl{background:#1a56db;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 0 0 4px rgba(26,86,219,.3),0 1px 4px rgba(0,0,0,.4);animation:gvLivePulse 1.6s infinite}'
+ '@keyframes gvLivePulse{0%{box-shadow:0 0 0 4px rgba(26,86,219,.3),0 1px 4px rgba(0,0,0,.4)}50%{box-shadow:0 0 0 8px rgba(26,86,219,.05),0 1px 4px rgba(0,0,0,.4)}100%{box-shadow:0 0 0 4px rgba(26,86,219,.3),0 1px 4px rgba(0,0,0,.4)}}'+'.gv-vehicle-marker{transition:transform 1s linear}';

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

/* ---------------- Geocoding (Nominatim / OpenStreetMap) ---------------- */
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
gv-sel-ambos          '<div class="gv-form-row"><label>Tiempo programado para carga/descarga (minutos)<span class="gv-req">*</span></label>' +
          '<input type="number" id="gv-map-duracion" min="0" step="5" value="30"></div>';
      }
      overlay.innerHTML =
        '<div class="gv-modal">' +
          '<h3>' + GV.escapeHtml(opts.title || 'Seleccionar ubicacion') + '</h3>' +
          '<div class="gv-search-row">' +
            '<input type="text" id="gv-map-search" placeholder="Buscar direccion...">' +
            '<button type="button" class="gv-btn gv-btn-sec gv-btn-sm" id="gv-map-search-btn">Buscar</button>' +
          '</div>' +
          '<div id="gv-map-picker" class="gv-map-box"></div>' +
          '<div id="gv-map-addr" style="font-size:.85rem;color:#374151;margin-bottom:10px">Hace clic en el mapa para marcar el punto</div>' +
          stopFieldsHtml +
          '<div class="gv-modal-actions">' +
            '<button type="button" class="gv-btn gv-btn-sec" id="gv-map-cancel">Cancelar</button>' +
            '<button type="button" class="gv-btn gv-btn-primary" id="gv-map-ok" disabled>Confirmar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var initial = (opts.initial && typeof opts.initial.lat === 'number') ? opts.initial : { lat: -38.951, lng: -68.059 };
      var map = L.map('gv-map-picker').setView([initial.lat, initial.lng], opts.initial ? 15 : 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      var marker = null;
      var current = null;
      var tipo = 'carga';

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
      document.getElementById('gv-map-search-btn').addEventListener('click', doSearch);
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

GV.Storage = (function(){
  var _api = null;
  var _addInId = null;
  var _addInDataId = null;
  var _data = { viajes: [], alertas: [] };
  var _listeners = [];
  var REPO_MARK = 'geotab-gestion-viajes';

  function loadFromLS(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(raw){
        var d = JSON.parse(raw);
        _data.viajes = d.viajes || [];
        _data.alertas = d.alertas || [];
      }
    }catch(e){ _data = { viajes: [], alertas: [] }; }
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
            _data.alertas = details.alertas || [];
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
    _api = api;
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

  function persist(){
    saveToLS();
    notify();
    return new Promise(function(resolve){
      if(!_api || !_addInId){ resolve(false); return; }
      var detailsStr = JSON.stringify({ viajes: _data.viajes, alertas: _data.alertas });
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
    getAlertas: function(){ return _data.alertas; },
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
    isConnected: function(){ return !!_addInId; }
  };
})();

})(window.GV);
