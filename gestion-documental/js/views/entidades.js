window.GD_VIEWS = window.GD_VIEWS || {};

/**
 * Iconos en línea (sin librería externa): un set chico de trazos SVG que
 * se colorean con `currentColor` desde el CSS (.gd-doc-icono, .gd-doc-clip,
 * etc.), igual de livianos que un ícono de fuente pero sin depender de
 * ningún CDN de iconos.
 */
const GD_ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3zM12 10v4M12 17.5h.01"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.41 17.42a1.5 1.5 0 0 1-2.12-2.12l8.49-8.49"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0-12 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
};

const GD_ESTADO_ICON = { vigente: "check", preaviso: "warn", vencido: "cross", faltante: "dash" };
const GD_ESTADO_LABEL = { vigente: "Vigente", preaviso: "Preaviso", vencido: "Vencido", faltante: "Faltante" };

function gdFmtFecha(ts) {
  return ts ? new Date(ts).toLocaleDateString("es-AR") : "-";
}
function gdFmtFechaHora(ts) {
  return ts ? new Date(ts).toLocaleString("es-AR") : "-";
}
function gdFmtBytes(n) {
  if (!n) return "-";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
function gdToInputDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

window.GD_VIEWS.entidades = async function render(container, params = {}) {
  if (params.entidadId) return renderDetalle(container, params.entidadId);

  container.innerHTML = `
    <h2>Entidades</h2>
    <div class="gd-filtros">
      <input id="gd-f-texto" placeholder="Buscar..." />
      <select id="gd-f-tipo">
        <option value="">Tipo de entidad</option>
        <option value="Vehiculo">Vehículos</option>
        <option value="AnexoVehicular">AnexoVehicular</option>
        <option value="Operador">Operadores</option>
      </select>
      <select id="gd-f-estado">
        <option value="">Estado</option>
        <option value="vigente">Vigente</option>
        <option value="preaviso">Preaviso</option>
        <option value="vencido">Vencido</option>
        <option value="faltante">Faltante</option>
      </select>
    </div>
    <table class="gd-tabla">
      <thead><tr><th>Descripción</th><th>Tipo</th><th>Detalle</th></tr></thead>
      <tbody id="gd-tabla-body"><tr><td colspan="3">Cargando…</td></tr></tbody>
    </table>
  `;

  async function refrescar() {
    const items = await GD.listarEntidades({
      texto: document.getElementById("gd-f-texto").value,
      tipo: document.getElementById("gd-f-tipo").value || null,
      estado: document.getElementById("gd-f-estado").value || null,
    });
    const body = document.getElementById("gd-tabla-body");
    body.innerHTML = items.length
      ? items
          .map(
            (e) => `
        <tr>
          <td>${e.descripcion}</td>
          <td>${e.tipo}</td>
          <td><button class="gd-link" data-id="${e.id}">Ver</button></td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="3">Sin resultados</td></tr>`;

    body.querySelectorAll("button[data-id]").forEach((btn) =>
      btn.addEventListener("click", () => window.gdApp.navegar("entidades", { entidadId: btn.dataset.id }))
    );
  }

  ["gd-f-texto", "gd-f-tipo", "gd-f-estado"].forEach((id) =>
    document.getElementById(id).addEventListener("input", refrescar)
  );

  refrescar();
};

async function renderDetalle(container, entidadId) {
  container.innerHTML = `<p>Cargando entidad…</p>`;
  const [entidad, documentos, tiposDocumento, funciones] = await Promise.all([
    GD.getEntidad(entidadId),
    GD.listarDocumentosDeEntidad(entidadId),
    GD.listarTiposDocumento(),
    GD.listarFunciones(),
  ]);

  if (!entidad) {
    container.innerHTML = `<p class="gd-error">Entidad no encontrada.</p>`;
    return;
  }

  // Tipos de documento requeridos = los de las funciones asignadas a esta entidad
  const funcionesEntidad = funciones.filter((f) => (entidad.funciones || []).includes(f.id));
  const idsRequeridos = new Set(funcionesEntidad.flatMap((f) => f.tiposDocumentoIds || []));
  const documentosPorTipo = new Map(documentos.map((d) => [d.tipoDocumentoId, d]));

  // Los tipos requeridos SIEMPRE se muestran, tengan o no un documento
  // cargado todavía (si no hay ninguno, se arma una tarjeta "faltante" que
  // al tocarla abre el panel en modo creación para ese tipo puntual) — es
  // el mismo comportamiento que "documentos requeridos" en la referencia.
  const tarjetasRequeridas = [...idsRequeridos].map((tipoId) => {
    const existente = documentosPorTipo.get(tipoId);
    const doc = existente || { id: null, entidadId, tipoDocumentoId: tipoId, estado: "faltante", archivos: [] };
    return { doc, tipo: tiposDocumento.find((t) => t.id === tipoId) };
  });
  const tarjetasNoRequeridas = documentos
    .filter((d) => !idsRequeridos.has(d.tipoDocumentoId))
    .map((doc) => ({ doc, tipo: tiposDocumento.find((t) => t.id === doc.tipoDocumentoId) }));

  const tarjetaDocumento = ({ doc, tipo }) => {
    const estado = doc.estado || "faltante";
    const icono = GD_ICONS[GD_ESTADO_ICON[estado] || "dash"];
    const cantAdjuntos = (doc.archivos || []).length;
    return `
      <div class="gd-doc-card gd-estado-${estado}" data-doc-id="${doc.id || ""}" data-tipo-id="${(tipo && tipo.id) || doc.tipoDocumentoId}" tabindex="0" role="button">
        <div class="gd-doc-card-top">
          <div class="gd-doc-icono">${icono}</div>
          ${cantAdjuntos ? `<span class="gd-doc-clip" title="${cantAdjuntos} adjunto(s)">${GD_ICONS.clip}</span>` : ""}
        </div>
        <div class="gd-doc-nombre">${(tipo && tipo.nombre) || doc.tipoDocumentoId}</div>
        <div class="gd-doc-estado">${GD_ESTADO_LABEL[estado] || estado}</div>
        <div class="gd-doc-fecha">${doc.sinVencimiento ? "Sin vencimiento" : gdFmtFecha(doc.fechaHasta)}</div>
      </div>`;
  };

  container.innerHTML = `
    <button class="gd-link" id="gd-volver">&larr; Volver</button>
    <h2>${entidad.descripcion} <small style="color:#8A8F9C;font-weight:500;font-size:.85rem">(${entidad.tipo})</small></h2>

    <h3>Requeridos</h3>
    <div class="gd-doc-grid" id="gd-grid-requeridos">${
      tarjetasRequeridas.map(tarjetaDocumento).join("") ||
      "<p class='gd-hint'>Esta entidad no tiene funciones con documentos requeridos asignados.</p>"
    }</div>

    <h3>No requeridos <button class="gd-link" id="gd-btn-agregar-doc" style="font-size:.78rem;margin-left:10px;font-weight:600">+ Agregar documento</button></h3>
    <div class="gd-doc-grid" id="gd-grid-norequeridos">${
      tarjetasNoRequeridas.map(tarjetaDocumento).join("") || "<p class='gd-hint'>-</p>"
    }</div>

    <p style="margin-top:22px"><button class="gd-link" id="gd-ver-auditoria">Ver historial de esta entidad</button></p>
  `;

  document.getElementById("gd-volver").addEventListener("click", () => window.gdApp.navegar("entidades"));
  document
    .getElementById("gd-ver-auditoria")
    .addEventListener("click", () => window.gdApp.navegar("auditoria", { entidadId }));

  const abrirTarjeta = (docId, tipoId) => {
    const tipo = tiposDocumento.find((t) => t.id === tipoId) || null;
    const doc = docId
      ? documentos.find((d) => d.id === docId)
      : { id: null, entidadId, tipoDocumentoId: tipoId, estado: "faltante", archivos: [] };
    abrirModalDocumento({
      entidad,
      entidadId,
      doc,
      tipo,
      onGuardado: () => renderDetalle(container, entidadId),
    });
  };

  container.querySelectorAll(".gd-doc-card").forEach((card) => {
    card.addEventListener("click", () => abrirTarjeta(card.dataset.docId || null, card.dataset.tipoId));
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        abrirTarjeta(card.dataset.docId || null, card.dataset.tipoId);
      }
    });
  });

  // Alta de un documento de cualquier tipo (no solo los requeridos por una
  // función) — cubre el caso de una entidad sin funciones asignadas, o de
  // un tipo de documento puntual que no forma parte de ninguna función.
  document.getElementById("gd-btn-agregar-doc").addEventListener("click", () => {
    abrirModalDocumento({
      entidad,
      entidadId,
      doc: { id: null, entidadId, tipoDocumentoId: null, estado: "faltante", archivos: [] },
      tipo: null,
      tiposDocumentoOpciones: tiposDocumento,
      onGuardado: () => renderDetalle(container, entidadId),
    });
  });
}

// ── Modal de documento (ver / editar / adjuntar) ──────────────────────────

function gdCerrarModalDocumento() {
  const el = document.getElementById("gd-modal-doc");
  if (el) el.remove();
  document.removeEventListener("keydown", gdModalEscHandler);
}

function gdModalEscHandler(ev) {
  if (ev.key === "Escape") gdCerrarModalDocumento();
}

function abrirModalDocumento({ entidad, entidadId, doc, tipo, tiposDocumentoOpciones, onGuardado }) {
  gdCerrarModalDocumento();
  // Si se abrió sin un tipo fijo (alta libre desde "+ Agregar documento"),
  // `tipo` se va a ir completando cuando la persona elija una opción del
  // desplegable — por eso es un `let`, no una constante.

  // Copia local editable — no se toca `doc` hasta guardar con éxito.
  let form = {
    fechaDesde: gdToInputDate(doc.fechaDesde),
    fechaHasta: gdToInputDate(doc.fechaHasta),
    sinVencimiento: !!doc.sinVencimiento,
    diasPreaviso: doc.diasPreaviso ?? (tipo && tipo.diasPreaviso) ?? 30,
    observaciones: doc.observaciones || "",
  };

  const st = {
    editing: !doc.id, // un documento nuevo arranca directo en modo edición
    guardando: false,
    subiendo: false,
    msgGuardar: "",
    msgArchivos: "",
    archivos: doc.archivos || [],
    archivosCargados: !doc.id, // si es nuevo no hay nada que cargar de Firestore
    abiertas: { info: true, entidades: false, archivos: false, extra: false },
  };

  function estadoActual() {
    if (st.editing) {
      return (
        GD.calcularEstado({
          activo: true,
          sinVencimiento: form.sinVencimiento,
          fechaHasta: form.sinVencimiento ? null : form.fechaHasta ? new Date(form.fechaHasta).getTime() : null,
          diasPreaviso: Number(form.diasPreaviso) || 30,
        }) || "faltante"
      );
    }
    return doc.estado || GD.calcularEstado(doc) || "faltante";
  }

  const overlay = document.createElement("div");
  overlay.className = "gd-modal-overlay";
  overlay.id = "gd-modal-doc";
  document.body.appendChild(overlay);
  document.addEventListener("keydown", gdModalEscHandler);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) gdCerrarModalDocumento();
  });

  async function cargarArchivosSiHaceFalta() {
    if (st.archivosCargados || !doc.id) return;
    st.archivos = await GD.listarArchivos(doc.id);
    st.archivosCargados = true;
    pintar();
  }

  function seccionAccordion(key, numero, titulo, contenidoHtml) {
    const abierta = st.abiertas[key];
    return `
      <div class="gd-acc-section ${abierta ? "gd-acc-open" : ""}" data-acc="${key}">
        <button type="button" class="gd-acc-head" data-acc-toggle="${key}">
          <span class="gd-acc-num">${numero}</span>
          <span class="gd-acc-title">${titulo}</span>
          <span class="gd-acc-chevron">${GD_ICONS.chevron}</span>
        </button>
        <div class="gd-acc-body">${contenidoHtml}</div>
      </div>`;
  }

  function htmlInfo() {
    const dis = st.editing ? "" : "disabled";
    const tipoEditable = !doc.id && !tipo && tiposDocumentoOpciones && tiposDocumentoOpciones.length;
    const filaTipo = tipoEditable
      ? `
      <div class="gd-modal-row">
        <label>Tipo de Documento</label>
        <select id="gd-f-tipo">
          <option value="">Elegí un tipo…</option>
          ${tiposDocumentoOpciones.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join("")}
        </select>
      </div>`
      : `
      <div class="gd-modal-row">
        <label>Tipo de Documento</label>
        <input type="text" value="${(tipo && tipo.nombre) || doc.tipoDocumentoId || ""}" disabled />
      </div>`;
    return `
      ${filaTipo}
      <div class="gd-modal-2col">
        <div class="gd-modal-row">
          <label>Fecha Desde</label>
          <input type="date" id="gd-f-desde" value="${form.fechaDesde}" ${dis} />
        </div>
        <div class="gd-modal-row">
          <label>Fecha Hasta</label>
          <input type="date" id="gd-f-hasta" value="${form.fechaHasta}" ${form.sinVencimiento ? "disabled" : dis} />
        </div>
      </div>
      <div class="gd-modal-2col">
        <div class="gd-modal-row">
          <label><input type="checkbox" id="gd-f-sinvenc" ${form.sinVencimiento ? "checked" : ""} ${dis} style="width:auto;margin-right:6px" />Sin vencimiento</label>
        </div>
        <div class="gd-modal-row">
          <label>Días de Preaviso</label>
          <input type="number" id="gd-f-preaviso" value="${form.diasPreaviso}" min="0" ${dis} />
        </div>
      </div>
      <div class="gd-modal-row">
        <label>Observaciones</label>
        <textarea id="gd-f-obs" rows="3" ${dis}>${form.observaciones}</textarea>
      </div>
    `;
  }

  function htmlEntidades() {
    return `
      <div class="gd-entidad-chip">${entidad.tipo}: ${entidad.descripcion}</div>
      <p class="gd-hint" style="margin-top:10px">Este documento pertenece únicamente a esta entidad.</p>
    `;
  }

  function htmlArchivoTarjeta(a) {
    const esImagen = (a.tipo || "").startsWith("image/");
    return `
      <div class="gd-archivo-card" data-archivo-id="${a.id}">
        <a href="${a.dataUrl}" target="_blank" rel="noopener" download="${a.nombre}" title="${a.nombre}">
          <div class="gd-archivo-thumb">${esImagen ? `<img src="${a.dataUrl}" alt="${a.nombre}" />` : GD_ICONS.file}</div>
        </a>
        <div class="gd-archivo-nombre" title="${a.nombre}">${a.nombre}</div>
        <button type="button" class="gd-archivo-quitar" data-quitar-archivo="${a.id}" title="Eliminar archivo">×</button>
      </div>`;
  }

  function htmlArchivos() {
    if (!doc.id) {
      return `<p class="gd-hint">Guardá el documento (botón Guardar más abajo) para poder adjuntar archivos.</p>`;
    }
    const lista = st.archivosCargados
      ? st.archivos.length
        ? `<div class="gd-archivos-grid">${st.archivos.map(htmlArchivoTarjeta).join("")}</div>`
        : `<p class="gd-archivos-vacio">Todavía no hay archivos adjuntos.</p>`
      : `<p class="gd-hint">Cargando archivos…</p>`;
    return `
      <div class="gd-archivos-toolbar">
        <label class="gd-upload-btn ${st.subiendo ? "gd-uploading" : ""}">
          ${GD_ICONS.upload}
          <span>${st.subiendo ? "Subiendo…" : "Subir archivo"}</span>
          <input type="file" id="gd-input-archivo" style="display:none" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" ${st.subiendo ? "disabled" : ""} />
        </label>
      </div>
      <p class="gd-hint">Las fotos y los PDF se comprimen automáticamente. Tamaño máximo aproximado por archivo: 900 KB.</p>
      ${lista}
      ${st.msgArchivos ? `<p class="gd-archivos-msg ${st.msgArchivos.startsWith("Error") ? "gd-error" : "gd-ok"}">${st.msgArchivos}</p>` : ""}
    `;
  }

  function htmlExtra() {
    return `
      <div class="gd-datos-extra-row"><span>Actualizado por</span><span>${doc.actualizadoPor || "-"}</span></div>
      <div class="gd-datos-extra-row"><span>Última actualización</span><span>${gdFmtFechaHora(doc.actualizadoEn)}</span></div>
      <div class="gd-datos-extra-row"><span>ID interno</span><span style="font-family:monospace;font-size:.72rem">${doc.id || "(sin guardar)"}</span></div>
    `;
  }

  function htmlAcciones() {
    if (st.editing) {
      return `
        <button type="button" class="gd-btn gd-btn-sec" id="gd-btn-cancelar-edicion" ${st.guardando ? "disabled" : ""}>Cancelar</button>
        <button type="button" class="gd-btn" id="gd-btn-guardar" ${st.guardando ? "disabled" : ""}>${st.guardando ? "Guardando…" : "Guardar"}</button>
      `;
    }
    return `
      <span class="gd-modal-actions-left">
        <button type="button" class="gd-btn gd-btn-sm gd-btn-danger" id="gd-btn-eliminar">Eliminar</button>
      </span>
      <button type="button" class="gd-btn gd-btn-sec" id="gd-btn-renovar">Renovar</button>
      <button type="button" class="gd-btn" id="gd-btn-editar">Editar</button>
    `;
  }

  function pintar() {
    const estado = estadoActual();
    overlay.innerHTML = `
      <div class="gd-modal" role="dialog" aria-modal="true">
        <div class="gd-modal-header">
          <h3>${(tipo && tipo.nombre) || doc.tipoDocumentoId || "Documento"}</h3>
          <span class="gd-badge gd-badge-${estado}" id="gd-badge-estado">${GD_ESTADO_LABEL[estado] || estado}</span>
          <button type="button" class="gd-modal-close" id="gd-btn-cerrar-modal" aria-label="Cerrar">×</button>
        </div>
        <div class="gd-modal-body">
          ${seccionAccordion("info", 1, "Información del Documento", htmlInfo())}
          ${seccionAccordion("entidades", 2, "Entidades asociadas al documento", htmlEntidades())}
          ${seccionAccordion("archivos", 3, `Archivos adjuntos${doc.id ? ` (${st.archivos.length})` : ""}`, htmlArchivos())}
          ${seccionAccordion("extra", 4, "Datos extra", htmlExtra())}
        </div>
        <div class="gd-modal-actions">
          ${st.msgGuardar ? `<span class="gd-archivos-msg ${st.msgGuardar.startsWith("Error") ? "gd-error" : "gd-ok"}" style="margin-right:auto">${st.msgGuardar}</span>` : ""}
          ${htmlAcciones()}
        </div>
      </div>
    `;
    cablear();
    if (st.abiertas.archivos) cargarArchivosSiHaceFalta();
  }

  function actualizarBadgeEnVivo() {
    const estado = estadoActual();
    const badge = overlay.querySelector("#gd-badge-estado");
    if (badge) {
      badge.className = `gd-badge gd-badge-${estado}`;
      badge.textContent = GD_ESTADO_LABEL[estado] || estado;
    }
  }

  function cablear() {
    overlay.querySelector("#gd-btn-cerrar-modal").addEventListener("click", gdCerrarModalDocumento);

    overlay.querySelectorAll("[data-acc-toggle]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const key = btn.dataset.accToggle;
        st.abiertas[key] = !st.abiertas[key];
        pintar();
      })
    );

    const fTipo = overlay.querySelector("#gd-f-tipo");
    if (fTipo) fTipo.addEventListener("change", (e) => {
      tipo = tiposDocumentoOpciones.find((t) => t.id === e.target.value) || null;
      form.diasPreaviso = (tipo && tipo.diasPreaviso) ?? 30;
      pintar(); // cambia el título del modal y el valor por defecto de preaviso
    });

    // Campos: se actualiza el estado en memoria sin re-pintar todo (para no
    // perder el foco mientras se escribe); el badge se actualiza a mano.
    const fDesde = overlay.querySelector("#gd-f-desde");
    const fHasta = overlay.querySelector("#gd-f-hasta");
    const fSinVenc = overlay.querySelector("#gd-f-sinvenc");
    const fPreaviso = overlay.querySelector("#gd-f-preaviso");
    const fObs = overlay.querySelector("#gd-f-obs");
    if (fDesde) fDesde.addEventListener("input", (e) => (form.fechaDesde = e.target.value));
    if (fHasta) fHasta.addEventListener("input", (e) => {
      form.fechaHasta = e.target.value;
      actualizarBadgeEnVivo();
    });
    if (fSinVenc) fSinVenc.addEventListener("change", (e) => {
      form.sinVencimiento = e.target.checked;
      if (fHasta) fHasta.disabled = e.target.checked || !st.editing;
      actualizarBadgeEnVivo();
    });
    if (fPreaviso) fPreaviso.addEventListener("input", (e) => {
      form.diasPreaviso = e.target.value;
      actualizarBadgeEnVivo();
    });
    if (fObs) fObs.addEventListener("input", (e) => (form.observaciones = e.target.value));

    const btnEditar = overlay.querySelector("#gd-btn-editar");
    if (btnEditar) btnEditar.addEventListener("click", () => {
      st.editing = true;
      st.abiertas.info = true;
      pintar();
    });

    const btnCancelar = overlay.querySelector("#gd-btn-cancelar-edicion");
    if (btnCancelar) btnCancelar.addEventListener("click", () => {
      if (!doc.id) {
        gdCerrarModalDocumento();
        return;
      }
      form = {
        fechaDesde: gdToInputDate(doc.fechaDesde),
        fechaHasta: gdToInputDate(doc.fechaHasta),
        sinVencimiento: !!doc.sinVencimiento,
        diasPreaviso: doc.diasPreaviso ?? (tipo && tipo.diasPreaviso) ?? 30,
        observaciones: doc.observaciones || "",
      };
      st.editing = false;
      st.msgGuardar = "";
      pintar();
    });

    const btnGuardar = overlay.querySelector("#gd-btn-guardar");
    if (btnGuardar) btnGuardar.addEventListener("click", async () => {
      if (!tipo && !doc.tipoDocumentoId) {
        st.msgGuardar = "Error: elegí un tipo de documento.";
        pintar();
        return;
      }
      if (!form.sinVencimiento && !form.fechaDesde) {
        st.msgGuardar = "Error: elegí la Fecha Desde.";
        pintar();
        return;
      }
      st.guardando = true;
      st.msgGuardar = "";
      pintar();
      const datos = {
        tipoDocumentoId: (tipo && tipo.id) || doc.tipoDocumentoId,
        tipoDocumentoNombre: (tipo && tipo.nombre) || null,
        fechaDesde: form.fechaDesde ? new Date(form.fechaDesde).getTime() : null,
        fechaHasta: form.sinVencimiento ? null : form.fechaHasta ? new Date(form.fechaHasta).getTime() : null,
        sinVencimiento: !!form.sinVencimiento,
        diasPreaviso: Number(form.diasPreaviso) || 30,
        observaciones: form.observaciones || "",
      };
      try {
        const nuevoId = await GD.guardarDocumento(entidadId, doc.id, datos);
        doc = { ...doc, ...datos, id: nuevoId, estado: GD.calcularEstado({ ...doc, ...datos }) };
        st.editing = false;
        st.guardando = false;
        st.archivosCargados = st.archivosCargados && !!doc.id ? st.archivosCargados : false;
        if (onGuardado) onGuardado();
        pintar();
      } catch (err) {
        st.guardando = false;
        st.msgGuardar = "Error: " + err.message;
        pintar();
      }
    });

    const btnRenovar = overlay.querySelector("#gd-btn-renovar");
    if (btnRenovar) btnRenovar.addEventListener("click", () => {
      form.fechaDesde = gdToInputDate(Date.now());
      form.fechaHasta = "";
      st.editing = true;
      st.abiertas.info = true;
      pintar();
    });

    const btnEliminar = overlay.querySelector("#gd-btn-eliminar");
    if (btnEliminar) btnEliminar.addEventListener("click", async () => {
      if (!doc.id) return;
      if (!confirm("¿Eliminar este documento? Se puede restaurar después desde Eliminados.")) return;
      await GD.eliminarDocumento(entidadId, doc.id);
      gdCerrarModalDocumento();
      if (onGuardado) onGuardado();
    });

    const inputArchivo = overlay.querySelector("#gd-input-archivo");
    if (inputArchivo) inputArchivo.addEventListener("change", async (e) => {
      const archivos = e.target.files;
      if (!archivos || !archivos.length) return;
      if (!doc.id) {
        st.msgArchivos = "Error: guardá el documento antes de adjuntar archivos.";
        pintar();
        return;
      }
      st.subiendo = true;
      st.msgArchivos = "";
      pintar();
      let errorFinal = "";
      for (const file of Array.from(archivos)) {
        try {
          const registro = await GD.subirArchivo(entidadId, doc.id, file);
          st.archivos.push(registro);
        } catch (err) {
          errorFinal = "Error: " + err.message;
        }
      }
      st.subiendo = false;
      st.msgArchivos = errorFinal || "Archivo(s) subido(s).";
      pintar();
      if (onGuardado) onGuardado();
    });

    overlay.querySelectorAll("[data-quitar-archivo]").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const archivoId = btn.dataset.quitarArchivo;
        if (!confirm("¿Eliminar este archivo adjunto?")) return;
        await GD.eliminarArchivo(entidadId, doc.id, archivoId);
        st.archivos = st.archivos.filter((a) => a.id !== archivoId);
        pintar();
        if (onGuardado) onGuardado();
      })
    );
  }

  pintar();
}
