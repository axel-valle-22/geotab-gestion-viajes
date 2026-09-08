/**
 * Motor de datos de Gestión Documental — reescrito para seguir EXACTAMENTE
 * el mismo patrón que ya usa "Gestión de Viajes" (common.js) en vez de
 * Firestore por colecciones + Cloud Functions:
 *
 *   1. Un único documento en Firestore (`gd_data/main`) con TODO adentro
 *      (entidades, tiposDocumento, funciones, alertas, reportes, choferes,
 *      auditoria), sincronizado en tiempo real con `onSnapshot`.
 *   2. Respaldo en Geotab AddInData (`api.call('Set'/'Add', {typeName:
 *      'AddInData', ...})`), igual que hace GV con el mismo mecanismo.
 *   3. Caché en localStorage para que la pantalla no arranque vacía.
 *
 * No usa Firebase Auth ni Cloud Functions: igual que Gestión de Viajes,
 * todo corre del lado del cliente. Por eso el cálculo de estado
 * (vigente/preaviso/vencido/faltante) se hace acá mismo, en JS.
 *
 * NOTA sobre adjuntos: Firebase Storage en este proyecto pide pasar a plan
 * Blaze (lo mismo que Cloud Functions), así que por ahora los documentos
 * se "adjuntan" como un LINK (a Drive, WhatsApp Web, un mail, etc.) en vez
 * de subir el archivo. El día que activen Storage, esto se puede cambiar
 * a subida real sin tocar el resto de las pantallas.
 */

const LS_KEY = "gd_dp_documental_v1";
const ADDIN_ID_GD = "gestionDocumental"; // debe coincidir con el id que Geotab asigna al Add-In

const ESTADOS = { VIGENTE: "vigente", PREAVISO: "preaviso", VENCIDO: "vencido", FALTANTE: "faltante" };

function vacio() {
  return {
    entidades: [], // { id, tipo, descripcion, geotabId, funciones:[], activo }
    documentos: [], // { id, entidadId, tipoDocumentoId, tipoDocumentoNombre, fechaDesde, fechaHasta, sinVencimiento, diasPreaviso, link, activo, actualizadoPor, actualizadoEn, eliminadoPor, eliminadoEn }
    tiposDocumento: [], // { id, nombre, tipoEntidad, diasPreaviso, usoGlobal, sinVencimiento, activo }
    funciones: [], // { id, nombre, tipoEntidad, tiposDocumentoIds:[] }
    alertas: [], // { id, destinatarios:[], funcionesIds:[], frecuencia, activa, notificarmeEmail, ultimaCorrida }
    reportes: [], // { id, destinatarios:[], tipo, tiposDocumentoIds:[], frecuencia, diaSemana, activo, ultimaCorrida }
    choferes: [], // { id, nombre, entidadId } — igual criterio que GV.Storage.getConductores()
    auditoria: [], // { id, entidadId, documentoId, accion, usuario, fecha, estadoAnterior, estadoNuevo }
  };
}

function calcularEstado(doc, hoy = new Date()) {
  if (!doc || doc.activo === false) return null;
  if (doc.sinVencimiento) return ESTADOS.VIGENTE;
  if (!doc.fechaHasta) return ESTADOS.FALTANTE;

  const vencimiento = new Date(doc.fechaHasta);
  const diasPreaviso = Number.isFinite(doc.diasPreaviso) ? doc.diasPreaviso : 30;
  const inicioPreaviso = new Date(vencimiento);
  inicioPreaviso.setDate(inicioPreaviso.getDate() - diasPreaviso);

  if (hoy.getTime() > vencimiento.getTime()) return ESTADOS.VENCIDO;
  if (hoy.getTime() >= inicioPreaviso.getTime()) return ESTADOS.PREAVISO;
  return ESTADOS.VIGENTE;
}

function uid(prefijo = "id") {
  return `${prefijo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const GD = (function () {
  let _data = vacio();
  let _api = null;
  let _sessionUserName = null;
  let _addInDataId = null;
  let _fbDb = null;
  let _fbDocRef = null;
  let _fbReady = false;
  let _listeners = [];

  function saveToLS() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(_data));
    } catch (e) {
      /* localStorage puede fallar (privado/lleno); no es crítico, seguimos con memoria */
    }
  }

  function loadFromLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) _data = Object.assign(vacio(), JSON.parse(raw));
    } catch (e) {
      /* ignorar caché corrupta */
    }
  }

  function notify() {
    _listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error("Error en listener de GD", e);
      }
    });
  }

  function onChange(cb) {
    _listeners.push(cb);
  }

  // ── Carga de Firebase (mismo CDN/versión que usa Gestión de Viajes) ─────
  let _fbPromise = null;
  function loadFirebase() {
    if (_fbPromise) return _fbPromise;
    _fbPromise = new Promise((resolve, reject) => {
      if (window.firebase && window.firebase.firestore) return resolve(window.firebase);
      const s1 = document.createElement("script");
      s1.src = "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js";
      s1.onload = () => {
        const s2 = document.createElement("script");
        s2.src = "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js";
        s2.onload = () => resolve(window.firebase);
        s2.onerror = () => reject(new Error("No se pudo cargar Firebase Firestore"));
        document.head.appendChild(s2);
      };
      s1.onerror = () => reject(new Error("No se pudo cargar Firebase App"));
      document.head.appendChild(s1);
    });
    return _fbPromise;
  }

  function initFirebase() {
    return loadFirebase().then((firebase) => {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      _fbDb = firebase.firestore();
      _fbDocRef = _fbDb.collection("gd_data").doc("main");
      _fbDocRef.onSnapshot(
        (snap) => {
          _fbReady = true;
          const d = snap.exists ? snap.data() : null;
          if (d) {
            _data = Object.assign(vacio(), d);
            saveToLS();
          }
          notify();
        },
        (err) => console.error("Firestore onSnapshot error", err)
      );
      return true;
    });
  }

  // ── Respaldo en Geotab AddInData (igual mecanismo que GV) ───────────────
  function cargarAddInData() {
    if (!_api) return Promise.resolve();
    return new Promise((resolve) => {
      _api.call("Get", { typeName: "AddInData", search: { addInId: ADDIN_ID_GD } }, (rows) => {
        const rec = (rows || [])[0];
        if (rec) {
          _addInDataId = rec.id;
          if (!_fbReady) {
            try {
              _data = Object.assign(vacio(), JSON.parse(rec.details));
              notify();
            } catch (e) {
              /* AddInData vacío o corrupto: seguimos con lo que haya en Firestore/localStorage */
            }
          }
        }
        resolve();
      }, () => resolve());
    });
  }

  function guardarAddInDataBackup() {
    if (!_api) return;
    const detailsStr = JSON.stringify(_data);
    if (_addInDataId) {
      _api.call("Set", { typeName: "AddInData", entity: { id: _addInDataId, addInId: ADDIN_ID_GD, details: detailsStr } }, () => {}, () => {});
    } else {
      _api.call("Add", { typeName: "AddInData", entity: { addInId: ADDIN_ID_GD, details: detailsStr } }, (newId) => { _addInDataId = newId; }, () => {});
    }
  }

  async function persistir() {
    saveToLS();
    guardarAddInDataBackup();
    if (_fbDocRef) {
      try {
        await _fbDocRef.set(_data, { merge: false });
      } catch (err) {
        console.error("No se pudo guardar en Firestore (queda el respaldo en AddInData/localStorage)", err);
      }
    }
  }

  async function init(api) {
    _api = api || null;
    loadFromLS();
    if (_api) {
      await new Promise((resolve) => _api.getSession((session) => { _sessionUserName = session?.userName || null; resolve(); }));
    }
    await cargarAddInData();
    try {
      await initFirebase();
    } catch (err) {
      console.error("No se pudo conectar a Firestore, sigo con AddInData/localStorage", err);
    }
    notify();
  }

  function usuarioActual() {
    return _sessionUserName || "desconocido";
  }

  function registrarAuditoria(entidadId, documentoId, accion, extra = {}) {
    _data.auditoria.unshift({
      id: uid("aud"),
      entidadId,
      documentoId,
      accion,
      usuario: usuarioActual(),
      fecha: Date.now(),
      ...extra,
    });
    if (_data.auditoria.length > 500) _data.auditoria.length = 500; // no crecer sin límite
  }

  // ── Entidades ────────────────────────────────────────────────────────────
  async function listarEntidades({ tipo = null, estado = null, texto = null } = {}) {
    let items = _data.entidades.filter((e) => e.activo !== false);
    if (tipo) items = items.filter((e) => e.tipo === tipo);
    if (texto) {
      const t = texto.toLowerCase();
      items = items.filter((e) => (e.descripcion || "").toLowerCase().includes(t));
    }
    if (estado) {
      items = items.filter((e) =>
        _data.documentos.some((d) => d.entidadId === e.id && d.activo !== false && calcularEstado(d) === estado)
      );
    }
    return items;
  }

  async function getEntidad(entidadId) {
    return _data.entidades.find((e) => e.id === entidadId) || null;
  }

  async function crearEntidad(datos) {
    const ent = { id: uid("ent"), activo: true, funciones: [], ...datos };
    _data.entidades.push(ent);
    await persistir();
    return ent.id;
  }

  // ── Documentos (antes subcolección, ahora array del mismo doc) ──────────
  async function listarDocumentosDeEntidad(entidadId) {
    return _data.documentos
      .filter((d) => d.entidadId === entidadId && d.activo !== false)
      .map((d) => ({ ...d, estado: calcularEstado(d) }));
  }

  /**
   * `archivos` ya no se sube a Storage (requiere plan Blaze). En su lugar
   * `datos.link` es una URL que la persona pega a mano (Drive, mail, etc.).
   */
  async function guardarDocumento(entidadId, documentoId, datos) {
    let doc = documentoId ? _data.documentos.find((d) => d.id === documentoId) : null;
    const esNuevo = !doc;
    if (!doc) {
      doc = { id: uid("doc"), entidadId, activo: true };
      _data.documentos.push(doc);
    }
    Object.assign(doc, datos, {
      actualizadoEn: Date.now(),
      actualizadoPor: usuarioActual(),
    });
    registrarAuditoria(entidadId, doc.id, esNuevo ? "creado" : "editado", {
      estadoNuevo: calcularEstado(doc),
    });
    await persistir();
    return doc.id;
  }

  async function eliminarDocumento(entidadId, documentoId) {
    const doc = _data.documentos.find((d) => d.id === documentoId);
    if (!doc) return;
    doc.activo = false;
    doc.eliminadoPor = usuarioActual();
    doc.eliminadoEn = Date.now();
    registrarAuditoria(entidadId, documentoId, "eliminado");
    await persistir();
  }

  async function restaurarDocumento(entidadId, documentoId) {
    const doc = _data.documentos.find((d) => d.id === documentoId);
    if (!doc) return;
    doc.activo = true;
    delete doc.eliminadoPor;
    delete doc.eliminadoEn;
    registrarAuditoria(entidadId, documentoId, "restaurado");
    await persistir();
  }

  async function eliminarDocumentoDefinitivo(entidadId, documentoId) {
    registrarAuditoria(entidadId, documentoId, "eliminado_definitivo");
    _data.documentos = _data.documentos.filter((d) => d.id !== documentoId);
    await persistir();
  }

  async function listarEliminados() {
    return _data.documentos
      .filter((d) => d.activo === false)
      .map((d) => {
        const entidad = _data.entidades.find((e) => e.id === d.entidadId);
        return { ...d, entidadDescripcion: entidad?.descripcion || d.entidadId };
      });
  }

  // ── Tipos de documento ───────────────────────────────────────────────────
  async function listarTiposDocumento() {
    return _data.tiposDocumento.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }

  async function crearTipoDocumento(data) {
    const t = { id: uid("tdoc"), activo: true, diasPreaviso: 30, usoGlobal: false, sinVencimiento: false, ...data };
    _data.tiposDocumento.push(t);
    await persistir();
    return t.id;
  }

  // ── Funciones ────────────────────────────────────────────────────────────
  async function listarFunciones() {
    return _data.funciones.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }

  async function crearFuncion(data) {
    const f = { id: uid("fun"), tiposDocumentoIds: [], ...data };
    _data.funciones.push(f);
    await persistir();
    return f.id;
  }

  // ── Alertas / Reportes (la ejecución periódica la hace GitHub Actions,
  //    acá solo se guarda la configuración) ────────────────────────────────
  async function listarAlertas() {
    return _data.alertas.slice().sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  }
  async function crearAlerta(data) {
    const a = { id: uid("ale"), destinatarios: [], funcionesIds: [], frecuencia: "diario", activa: true, creadoEn: Date.now(), ...data };
    _data.alertas.push(a);
    await persistir();
    return a.id;
  }
  async function toggleAlerta(id, activa) {
    const a = _data.alertas.find((x) => x.id === id);
    if (a) a.activa = activa;
    await persistir();
  }
  async function eliminarAlerta(id) {
    _data.alertas = _data.alertas.filter((a) => a.id !== id);
    await persistir();
  }

  async function listarReportes() {
    return _data.reportes.slice().sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  }
  async function crearReporte(data) {
    const r = { id: uid("rep"), destinatarios: [], tiposDocumentoIds: [], tipo: "completo", frecuencia: "semanal", diaSemana: 1, activo: true, creadoEn: Date.now(), ...data };
    _data.reportes.push(r);
    await persistir();
    return r.id;
  }
  async function toggleReporte(id, activo) {
    const r = _data.reportes.find((x) => x.id === id);
    if (r) r.activo = activo;
    await persistir();
  }
  async function eliminarReporte(id) {
    _data.reportes = _data.reportes.filter((r) => r.id !== id);
    await persistir();
  }

  // ── Choferes (para "Mis Documentos"): mismo criterio que GV.Storage
  //    guarda la lista de conductores, matcheando por session.userName ────
  async function listarUsuarios() {
    return _data.choferes.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }
  async function actualizarUsuario(id, datos) {
    let ch = _data.choferes.find((c) => c.id === id);
    if (!ch) {
      ch = { id: id || uid("cho") };
      _data.choferes.push(ch);
    }
    Object.assign(ch, datos);
    await persistir();
  }

  // ── Auditoría ────────────────────────────────────────────────────────────
  async function listarAuditoria({ entidadId = null, limite = 100 } = {}) {
    let items = _data.auditoria;
    if (entidadId) items = items.filter((a) => a.entidadId === entidadId);
    return items.slice(0, limite);
  }

  // ── Indicadores ──────────────────────────────────────────────────────────
  async function contarPorEstado() {
    const counts = { vigente: 0, preaviso: 0, vencido: 0, faltante: 0 };
    _data.documentos
      .filter((d) => d.activo !== false)
      .forEach((d) => {
        const e = calcularEstado(d);
        if (e) counts[e] = (counts[e] || 0) + 1;
      });
    return counts;
  }

  async function recalcularEstados() {
    // El estado se calcula al vuelo en cada lectura (calcularEstado), así
    // que "recalcular" es solo forzar un re-render + re-guardar el
    // respaldo con la fecha de hoy tenida en cuenta.
    await persistir();
    notify();
    return { actualizados: _data.documentos.filter((d) => d.activo !== false).length };
  }

  // ── Sync con Geotab (Vehículos y Choferes) ──────────────────────────────
  // Se dispara al abrir el Add-In (en vez de una Cloud Function nocturna),
  // porque no tenemos backend. Usa la sesión de Geotab que ya nos dio el
  // Add-In (mismo objeto `api` que MyGeotab inyecta).
  async function sincronizarConGeotab() {
    if (!_api) return { vehiculos: 0, choferes: 0 };
    const [devices, users] = await Promise.all([
      new Promise((resolve) => _api.call("Get", { typeName: "Device", search: {} }, resolve, () => resolve([]))),
      new Promise((resolve) => _api.call("Get", { typeName: "User", search: {} }, resolve, () => resolve([]))),
    ]);

    let nuevosVehiculos = 0;
    (devices || []).forEach((dev) => {
      const id = `veh_${dev.id}`;
      let ent = _data.entidades.find((e) => e.id === id);
      if (!ent) {
        ent = { id, tipo: "Vehiculo", activo: true, funciones: [] };
        _data.entidades.push(ent);
        nuevosVehiculos++;
      }
      ent.descripcion = dev.name;
      ent.geotabId = dev.id;
    });

    let nuevosChoferes = 0;
    (users || [])
      .filter((u) => u.isDriver && !u.isDisabled)
      .forEach((u) => {
        const id = `op_${u.id}`;
        let ent = _data.entidades.find((e) => e.id === id);
        if (!ent) {
          ent = { id, tipo: "Operador", activo: true, funciones: [] };
          _data.entidades.push(ent);
        }
        ent.descripcion = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name;
        ent.geotabId = u.id;

        // Publicamos también en `choferes` para que "Mis Documentos" (en la
        // app del chofer) pueda identificarlo por nombre de sesión, igual
        // que hace GV con GV.Storage.getConductores().
        let cho = _data.choferes.find((c) => c.entidadId === id);
        if (!cho) {
          cho = { id: uid("cho"), entidadId: id };
          _data.choferes.push(cho);
          nuevosChoferes++;
        }
        cho.nombre = u.name;
      });

    await persistir();
    notify();
    return { vehiculos: nuevosVehiculos, choferes: nuevosChoferes, totalVehiculos: devices.length, totalChoferes: nuevosChoferes };
  }

  return {
    ESTADOS,
    calcularEstado,
    init,
    onChange,
    usuarioActual,
    listarEntidades,
    getEntidad,
    crearEntidad,
    listarDocumentosDeEntidad,
    guardarDocumento,
    eliminarDocumento,
    restaurarDocumento,
    eliminarDocumentoDefinitivo,
    listarEliminados,
    listarTiposDocumento,
    crearTipoDocumento,
    listarFunciones,
    crearFuncion,
    listarAlertas,
    crearAlerta,
    toggleAlerta,
    eliminarAlerta,
    listarReportes,
    crearReporte,
    toggleReporte,
    eliminarReporte,
    listarUsuarios,
    actualizarUsuario,
    listarAuditoria,
    contarPorEstado,
    recalcularEstados,
    sincronizarConGeotab,
  };
})();

window.GD = GD;
