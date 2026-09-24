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

/**
 * Adjuntos reales (subida desde el explorador de archivos), agregados sin
 * Firebase Storage (pide plan Blaze, igual que Cloud Functions — ver nota
 * arriba). Cada archivo se guarda como un documento aparte en la colección
 * `gd_archivos` (no adentro de `gd_data/main`) para no inflar el único
 * documento que se sincroniza en tiempo real con TODA la app cada vez que
 * alguien adjunta algo. En `gd_data/main` solo queda un metadato liviano
 * por archivo (id/nombre/tipo/tamaño) para poder mostrar el clip + cantidad
 * en la tarjeta sin tener que traer el archivo entero.
 *
 * Firestore (plan gratuito) tiene un límite de ~1 MiB por documento, y
 * base64 pesa ~33% más que el archivo original, así que se apunta a que
 * cada archivo quede bien por debajo de eso: las imágenes se comprimen
 * solas (canvas) hasta entrar en el objetivo; los PDF se recomprimen
 * página por página (pdf.js + jsPDF, ver comprimirPdf) con la misma idea;
 * el resto de los tipos (Word, Excel, etc.) no se pueden comprimir del
 * lado del cliente, así que si superan el límite se avisa para que se
 * compriman afuera.
 *
 * OJO tamaño total: este límite es por archivo. Firestore Spark (gratis)
 * tiene además un tope de 1 GiB de datos guardadas EN TOTAL para todo el
 * proyecto (no solo Gestión Documental). Con archivos de ~650KB-900KB
 * cada uno, eso da lugar a unos 1200-1500 adjuntos antes de pegar contra
 * ese techo. Si la idea es subir muchísimos archivos a lo largo del
 * tiempo, la solución de fondo no es este límite por archivo sino migrar
 * los adjuntos a Firebase Storage (requiere plan Blaze) — ahí no hay un
 * tope de ~1MB por archivo y el almacenamiento sale centavos por GB.
 */
const ARCHIVO_MAX_BYTES = 650 * 1024; // objetivo tras comprimir (~650KB → ~890KB en base64)

// Firestore rechaza el documento COMPLETO si supera ~1 MiB, y lo hace con un
// error propio de Firestore (no con el cartel en español de más abajo) si no
// lo frenamos antes nosotros. Lo que realmente pesa en el documento es el
// campo `dataUrl` (el string en base64), así que el control tiene que mirar
// el largo de ESE string y no los "bytes reales" del archivo, que es una
// cuenta más chica y por eso venía dejando pasar archivos que Firestore
// rechazaba igual (ver dataUrlABytes más abajo).
const FIRESTORE_DOC_MAX_BYTES = 1024 * 1024; // 1 MiB, límite real de Firestore por documento
const MARGEN_METADATA_BYTES = 4096; // lugar para nombre/tipo/fechas del resto del documento
const LIMITE_DATAURL_BYTES = FIRESTORE_DOC_MAX_BYTES - MARGEN_METADATA_BYTES;
// Si un PDF ya viene liviano (por ejemplo, comprimido de antemano fuera de la
// app) no tiene sentido rasterizarlo de nuevo: eso le haría perder cualquier
// texto seleccionable/buscable que ya tenga. Se deja pasar tal cual siempre
// que, ya en base64, quede cómodo por debajo del límite real de Firestore.
const UMBRAL_PDF_SIN_RECOMPRIMIR = Math.floor((LIMITE_DATAURL_BYTES * 3) / 4);

function leerArchivoComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function cargarImagen(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
    img.src = dataUrl;
  });
}

function dataUrlABytes(dataUrl) {
  const base64 = (dataUrl.split(",")[1] || "");
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Reduce una imagen (redimensionando y bajando calidad JPEG en pasos)
 * hasta que entre en ARCHIVO_MAX_BYTES, o hasta agotar los intentos.
 */
async function comprimirImagen(file) {
  const dataUrlOriginal = await leerArchivoComoDataUrl(file);
  const img = await cargarImagen(dataUrlOriginal);
  const intentos = [
    { maxLado: 1600, calidad: 0.82 },
    { maxLado: 1400, calidad: 0.72 },
    { maxLado: 1100, calidad: 0.6 },
    { maxLado: 900, calidad: 0.5 },
    { maxLado: 700, calidad: 0.4 },
  ];
  let mejor = null;
  for (const intento of intentos) {
    const escala = Math.min(1, intento.maxLado / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * escala));
    const h = Math.max(1, Math.round(img.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", intento.calidad);
    mejor = dataUrl;
    if (dataUrlABytes(dataUrl) <= ARCHIVO_MAX_BYTES) return dataUrl;
  }
  return mejor; // no entró del todo: se devuelve el más chico logrado, se valida afuera
}

/**
 * Recomprime un PDF con la misma idea que comprimirImagen: como acá casi
 * todos los PDF son escaneos (CamScanner, cámara del celu, etc.), no hace
 * falta preservar texto seleccionable — alcanza con volver a dibujar cada
 * página como imagen. Usa pdf.js para renderizar cada página a un canvas,
 * la recodifica como JPEG en pasos de calidad/resolución decrecientes
 * (igual que las fotos) y arma un PDF nuevo con jsPDF, mucho más liviano.
 *
 * Si el PDF no se puede abrir (viene roto, con contraseña, o las librerías
 * pdf.js/jsPDF no llegaron a cargar) devuelve null: subirArchivo sigue con
 * el archivo original y, si no entra en el límite, avisa como siempre.
 */
async function comprimirPdf(file) {
  if (typeof pdfjsLib === "undefined" || !window.jspdf) return null;

  let pdf;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  } catch (e) {
    console.warn("No se pudo abrir el PDF para comprimirlo, se sigue con el original:", e);
    return null;
  }

  const intentos = [
    { dpi: 150, calidad: 0.55 },
    { dpi: 120, calidad: 0.45 },
    { dpi: 100, calidad: 0.4 },
    { dpi: 85, calidad: 0.32 },
    { dpi: 70, calidad: 0.28 },
  ];

  let mejor = null;
  for (const intento of intentos) {
    const escala = intento.dpi / 72; // pdf.js mide en puntos (72 por pulgada)
    const paginas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pagina = await pdf.getPage(i);
      const viewport = pagina.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      paginas.push({
        dataUrl: canvas.toDataURL("image/jpeg", intento.calidad),
        anchoPt: pagina.view[2] - pagina.view[0],
        altoPt: pagina.view[3] - pagina.view[1],
      });
    }

    const { jsPDF } = window.jspdf;
    const primera = paginas[0];
    const nuevoPdf = new jsPDF({
      orientation: primera.anchoPt > primera.altoPt ? "landscape" : "portrait",
      unit: "pt",
      format: [primera.anchoPt, primera.altoPt],
    });
    paginas.forEach((p, idx) => {
      if (idx > 0) nuevoPdf.addPage([p.anchoPt, p.altoPt], p.anchoPt > p.altoPt ? "landscape" : "portrait");
      nuevoPdf.addImage(p.dataUrl, "JPEG", 0, 0, p.anchoPt, p.altoPt);
    });

    const dataUrl = nuevoPdf.output("datauristring");
    mejor = dataUrl;
    if (dataUrlABytes(dataUrl) <= ARCHIVO_MAX_BYTES) return dataUrl;
  }
  return mejor; // no entró del todo con la compresión más agresiva: se valida afuera, igual que las fotos
}

/**
 * Achica un PDF pesado sin rasterizarlo (ver js/data/pdf-optimizador.js):
 * recomprime sus imágenes y agrupa el contenido de las páginas para que se
 * comprima mejor. Devuelve un dataUrl, o null si no se pudo o no achicó.
 * Antes de aceptarlo se abre el resultado con pdf.js para confirmar que
 * quedó sano y con la misma cantidad de páginas.
 */
async function optimizarPdfSinPerderCalidad(file) {
  if (typeof window.GD_optimizarPdf !== "function") return null;
  try {
    const original = new Uint8Array(await file.arrayBuffer());
    const salida = await window.GD_optimizarPdf(original, { objetivoBytes: UMBRAL_PDF_SIN_RECOMPRIMIR });
    if (!salida) return null;
    if (typeof pdfjsLib !== "undefined") {
      const [a, b] = await Promise.all([
        pdfjsLib.getDocument({ data: original.slice() }).promise,
        pdfjsLib.getDocument({ data: salida.slice() }).promise,
      ]);
      const ok = a.numPages === b.numPages;
      if (ok) await (await b.getPage(1)).getOperatorList(); // que la primera página se pueda dibujar
      a.destroy(); b.destroy();
      if (!ok) return null;
    }
    return await leerArchivoComoDataUrl(new Blob([salida], { type: "application/pdf" }));
  } catch (e) {
    console.warn("La optimización sin pérdida no funcionó con este PDF, se sigue con el método anterior:", e);
    return null;
  }
}

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
  let _fbArchivosCol = null;
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
      _fbArchivosCol = _fbDb.collection("gd_archivos");
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

  // Nombre del tipo de documento (Título, VTV Nacional, Foto, etc.) y de la
  // entidad (patente/nombre del chofer) al momento del movimiento: se guardan
  // como "foto" en la auditoría para que quede clarísimo qué se cargó o
  // modificó, y para que el historial no cambie si después se renombra o
  // borra el tipo de documento o la entidad.
  function _nombreTipoDocumento(tipoDocumentoId) {
    if (!tipoDocumentoId) return null;
    const t = _data.tiposDocumento.find((x) => x.id === tipoDocumentoId);
    return (t && t.nombre) || null;
  }

  function _nombreEntidad(entidadId) {
    const e = _data.entidades.find((x) => x.id === entidadId);
    return (e && e.descripcion) || null;
  }

  function registrarAuditoria(entidadId, documentoId, accion, extra = {}) {
    _data.auditoria.unshift({
      id: uid("aud"),
      entidadId,
      documentoId,
      accion,
      usuario: usuarioActual(),
      fecha: Date.now(),
      entidadNombre: _nombreEntidad(entidadId),
      ...extra,
    });
    if (_data.auditoria.length > 500) _data.auditoria.length = 500; // no crecer sin límite
  }

  // ── Entidades ────────────────────────────────────────────────────────────
  const SEGUROS_ENTIDAD_ID = "seguros_empresa";

  async function listarEntidades({ tipo = null, estado = null, texto = null } = {}) {
    // "Seguros" es una entidad interna (ver obtenerEntidadSeguros) que sirve
    // para colgar documentos generales de la empresa (pólizas SVO, ART,
    // etc.) sin atarlos a un vehículo/chofer puntual. Nunca se lista en la
    // pantalla de Entidades, tiene su propia pantalla dedicada.
    let items = _data.entidades.filter((e) => e.activo !== false && e.tipo !== "Seguros");
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
    // Orden alfanumérico "natural": alfabético para los choferes (por
    // nombre y apellido) y numérico ascendente para los códigos de
    // vehículo tipo "L42", "L43" — localeCompare con numeric:true entiende
    // los números adentro del texto, así no queda "L100" antes que "L43"
    // como pasaría comparando las cadenas letra por letra.
    items = items
      .slice()
      .sort((a, b) => (a.descripcion || "").localeCompare(b.descripcion || "", "es", { numeric: true, sensitivity: "base" }));
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

  // Entidad "singleton" (siempre el mismo id) que representa a la empresa,
  // para poder reusar toda la infraestructura de documentos/tipos/archivos
  // ya armada para Vehiculo/AnexoVehicular/Operador sin duplicar código.
  // Se crea sola la primera vez que se abre la pantalla "Seguros".
  async function obtenerEntidadSeguros() {
    let ent = _data.entidades.find((e) => e.id === SEGUROS_ENTIDAD_ID);
    if (!ent) {
      ent = {
        id: SEGUROS_ENTIDAD_ID,
        tipo: "Seguros",
        descripcion: "Transporte Dolores Parra",
        activo: true,
        funciones: [],
      };
      _data.entidades.push(ent);
      await persistir();
    }
    return ent;
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
      documentoNombre: doc.tipoDocumentoNombre || _nombreTipoDocumento(doc.tipoDocumentoId),
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
    registrarAuditoria(entidadId, documentoId, "eliminado", {
      documentoNombre: doc.tipoDocumentoNombre || _nombreTipoDocumento(doc.tipoDocumentoId),
    });
    await persistir();
  }

  async function restaurarDocumento(entidadId, documentoId) {
    const doc = _data.documentos.find((d) => d.id === documentoId);
    if (!doc) return;
    doc.activo = true;
    delete doc.eliminadoPor;
    delete doc.eliminadoEn;
    registrarAuditoria(entidadId, documentoId, "restaurado", {
      documentoNombre: doc.tipoDocumentoNombre || _nombreTipoDocumento(doc.tipoDocumentoId),
    });
    await persistir();
  }

  async function eliminarDocumentoDefinitivo(entidadId, documentoId) {
    const doc = _data.documentos.find((d) => d.id === documentoId);
    registrarAuditoria(entidadId, documentoId, "eliminado_definitivo", {
      documentoNombre: doc && (doc.tipoDocumentoNombre || _nombreTipoDocumento(doc.tipoDocumentoId)),
    });
    _data.documentos = _data.documentos.filter((d) => d.id !== documentoId);
    await persistir();
  }

  // ── Archivos adjuntos (subida real desde el explorador, sin Storage) ────
  /**
   * Trae los archivos de un documento desde `gd_archivos` (consulta puntual,
   * no en tiempo real: se llama cuando se abre el panel de edición, no en
   * cada render, para no golpear Firestore de más).
   */
  async function listarArchivos(documentoId) {
    if (!_fbArchivosCol) return [];
    try {
      const snap = await _fbArchivosCol.where("documentoId", "==", documentoId).get();
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.creadoEn || 0) - (b.creadoEn || 0));
    } catch (err) {
      console.error("No se pudieron cargar los archivos adjuntos", err);
      return [];
    }
  }

  function metaDeArchivo(archivo) {
    return { id: archivo.id, nombre: archivo.nombre, tipo: archivo.tipo, tamanoBytes: archivo.tamanoBytes };
  }

  /**
   * Sube (o reemplaza) un archivo elegido con el explorador del sistema
   * operativo (input type="file") para un documento puntual. Las imágenes
   * y los PDF se comprimen solos (ver comprimirImagen/comprimirPdf); el
   * resto de los tipos (Word, Excel, etc.) se validan contra
   * ARCHIVO_MAX_BYTES porque no se pueden comprimir del lado del cliente.
   */
  async function subirArchivo(entidadId, documentoId, file) {
    if (!_fbArchivosCol) throw new Error("Todavía no hay conexión con el almacenamiento de archivos.");
    if (!documentoId) throw new Error("Primero hay que guardar el documento antes de adjuntar archivos.");

    const esImagen = (file.type || "").startsWith("image/");
    const esPdf = (file.type || "") === "application/pdf";
    let dataUrl;
    if (esImagen) {
      dataUrl = await comprimirImagen(file);
    } else if (esPdf) {
      if (file.size <= UMBRAL_PDF_SIN_RECOMPRIMIR) {
        // Ya entra cómodo tal cual: se sube sin volver a comprimir, para no
        // perder texto seleccionable/buscable de un PDF ya optimizado.
        dataUrl = await leerArchivoComoDataUrl(file);
      } else {
        // 1) Primero se intenta achicarlo SIN perder calidad (el texto sigue
        //    siendo texto; ver js/data/pdf-optimizador.js). Alcanza para la
        //    mayoría de los PDF generados por sistemas (pólizas, listados).
        // 2) Si con eso no entra, se usa el método anterior (convertir cada
        //    página en imagen con pdf.js/jsPDF), y se queda con el más chico.
        // Si todo falla, sigue con el PDF tal cual vino (después se valida
        // el tamaño igual y se avisa).
        const optimizado = await optimizarPdfSinPerderCalidad(file);
        if (optimizado && dataUrlABytes(optimizado) <= UMBRAL_PDF_SIN_RECOMPRIMIR) {
          dataUrl = optimizado;
        } else {
          const candidatos = [optimizado, await comprimirPdf(file), await leerArchivoComoDataUrl(file)].filter(Boolean);
          dataUrl = candidatos.reduce((a, b) => (b.length < a.length ? b : a));
        }
      }
    } else {
      dataUrl = await leerArchivoComoDataUrl(file);
    }

    const tamanoBytes = dataUrlABytes(dataUrl); // tamaño real del archivo, para guardar/mostrar
    const tamanoDataUrl = dataUrl.length; // largo real de la cadena que queda en el documento
    if (tamanoDataUrl > LIMITE_DATAURL_BYTES) {
      const limiteMb = ((LIMITE_DATAURL_BYTES * 3) / 4 / (1024 * 1024)).toFixed(1);
      throw new Error(
        esImagen || esPdf
          ? `El archivo sigue pesando demasiado incluso comprimido (límite ~${limiteMb} MB). Probá con otro archivo, o si es un PDF de muchas páginas dividilo en partes.`
          : `El archivo pesa demasiado (límite ~${limiteMb} MB para Word/Excel/etc., porque no se puede comprimir automáticamente). Comprimilo antes de subirlo.`
      );
    }

    const archivoId = uid("arc");
    const registro = {
      documentoId,
      entidadId,
      nombre: file.name,
      tipo: file.type || "application/octet-stream",
      tamanoBytes,
      dataUrl,
      creadoPor: usuarioActual(),
      creadoEn: Date.now(),
    };
    await _fbArchivosCol.doc(archivoId).set(registro);

    const doc = _data.documentos.find((d) => d.id === documentoId);
    if (doc) {
      doc.archivos = doc.archivos || [];
      doc.archivos.push(metaDeArchivo({ id: archivoId, ...registro }));
    }
    registrarAuditoria(entidadId, documentoId, "archivo_subido", {
      archivoNombre: file.name,
      documentoNombre: doc && (doc.tipoDocumentoNombre || _nombreTipoDocumento(doc.tipoDocumentoId)),
    });
    await persistir();
    notify();
    return { id: archivoId, ...registro };
  }

  async function eliminarArchivo(entidadId, documentoId, archivoId) {
    if (_fbArchivosCol) {
      try {
        await _fbArchivosCol.doc(archivoId).delete();
      } catch (err) {
        console.error("No se pudo borrar el archivo en Firestore", err);
      }
    }
    const doc = _data.documentos.find((d) => d.id === documentoId);
    const archivoBorrado = doc && Array.isArray(doc.archivos) ? doc.archivos.find((a) => a.id === archivoId) : null;
    if (doc && Array.isArray(doc.archivos)) {
      doc.archivos = doc.archivos.filter((a) => a.id !== archivoId);
    }
    registrarAuditoria(entidadId, documentoId, "archivo_eliminado", {
      archivoNombre: archivoBorrado && archivoBorrado.nombre,
      documentoNombre: doc && (doc.tipoDocumentoNombre || _nombreTipoDocumento(doc.tipoDocumentoId)),
    });
    await persistir();
    notify();
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

  async function eliminarTipoDocumento(id) {
    _data.tiposDocumento = _data.tiposDocumento.filter((t) => t.id !== id);
    // Sacamos la referencia de las funciones y reportes que tuvieran este
    // tipo de documento asignado, para no dejar ids colgando. Los
    // documentos ya creados con este tipo no se tocan: cada uno guarda su
    // propio nombre (tipoDocumentoNombre) y va a seguir mostrandose igual.
    _data.funciones.forEach((f) => {
      if (f.tiposDocumentoIds && f.tiposDocumentoIds.includes(id)) {
        f.tiposDocumentoIds = f.tiposDocumentoIds.filter((tid) => tid !== id);
      }
    });
    _data.reportes.forEach((r) => {
      if (r.tiposDocumentoIds && r.tiposDocumentoIds.includes(id)) {
        r.tiposDocumentoIds = r.tiposDocumentoIds.filter((tid) => tid !== id);
      }
    });
    await persistir();
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

  async function eliminarFuncion(id) {
    _data.funciones = _data.funciones.filter((f) => f.id !== id);
    // Sacamos la referencia de las entidades que tuvieran esta funcion
    // asignada, para no dejar ids colgando que despues rompan el calculo
    // de "documentos requeridos" en la vista de una entidad.
    _data.entidades.forEach((e) => {
      if (e.funciones && e.funciones.includes(id)) {
        e.funciones = e.funciones.filter((fid) => fid !== id);
      }
    });
    await persistir();
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
    // Los movimientos guardados antes de este cambio no tienen documentoNombre
    // ni entidadNombre: se completan acá "al vuelo" buscando el documento/
    // entidad todavía vivos (si ya no existen, se sigue mostrando el id).
    return items.slice(0, limite).map((a) => {
      if (a.documentoNombre && a.entidadNombre) return a;
      const doc = _data.documentos.find((d) => d.id === a.documentoId);
      return {
        ...a,
        documentoNombre: a.documentoNombre || (doc && (doc.tipoDocumentoNombre || _nombreTipoDocumento(doc.tipoDocumentoId))) || null,
        entidadNombre: a.entidadNombre || _nombreEntidad(a.entidadId),
      };
    });
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
    obtenerEntidadSeguros,
    listarDocumentosDeEntidad,
    guardarDocumento,
    eliminarDocumento,
    restaurarDocumento,
    eliminarDocumentoDefinitivo,
    listarArchivos,
    subirArchivo,
    eliminarArchivo,
    ARCHIVO_MAX_BYTES,
    listarEliminados,
    listarTiposDocumento,
    crearTipoDocumento,
    eliminarTipoDocumento,
    listarFunciones,
    crearFuncion,
    eliminarFuncion,
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
