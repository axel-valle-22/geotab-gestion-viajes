window.GD_VIEWS = window.GD_VIEWS || {};

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

  const tarjetaDocumento = (doc) => {
    const tipo = tiposDocumento.find((t) => t.id === doc.tipoDocumentoId);
    const claseEstado = `gd-estado-${doc.estado || "faltante"}`;
    return `
      <div class="gd-doc-card ${claseEstado}" data-id="${doc.id}">
        <div class="gd-doc-nombre">${tipo?.nombre || doc.tipoDocumentoId}</div>
        <div class="gd-doc-estado">${(doc.estado || "faltante").toUpperCase()}</div>
        <div class="gd-doc-fecha">${doc.fechaHasta ? new Date(doc.fechaHasta).toLocaleDateString() : "-"}</div>
        <div class="gd-doc-acciones">
          ${doc.link ? `<a href="${doc.link}" target="_blank" rel="noopener">Ver</a>` : ""}
          <button class="gd-link gd-doc-eliminar" data-doc-id="${doc.id}">Eliminar</button>
        </div>
      </div>`;
  };

  const requeridos = documentos.filter((d) => idsRequeridos.has(d.tipoDocumentoId));
  const noRequeridos = documentos.filter((d) => !idsRequeridos.has(d.tipoDocumentoId));

  container.innerHTML = `
    <button class="gd-link" id="gd-volver">&larr; Volver</button>
    <h2>${entidad.descripcion} <small>(${entidad.tipo})</small></h2>

    <h3>Requeridos</h3>
    <div class="gd-doc-grid">${requeridos.map(tarjetaDocumento).join("") || "<p>Sin documentos requeridos cargados.</p>"}</div>

    <h3>No requeridos</h3>
    <div class="gd-doc-grid">${noRequeridos.map(tarjetaDocumento).join("") || "<p>-</p>"}</div>

    <h3>Cargar / renovar documento</h3>
    <form id="gd-form-doc" class="gd-form">
      <select name="tipoDocumentoId" required>
        <option value="">Tipo de documento…</option>
        ${tiposDocumento.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join("")}
      </select>
      <label>Desde <input type="date" name="fechaDesde" required /></label>
      <label>Hasta <input type="date" name="fechaHasta" /></label>
      <label><input type="checkbox" name="sinVencimiento" /> Sin vencimiento</label>
      <input type="url" name="link" placeholder="Link al archivo (Drive, mail, WhatsApp...)" style="min-width:280px" />
      <button type="submit" class="gd-btn">Guardar</button>
      <span id="gd-form-doc-msg"></span>
    </form>
    <p class="gd-hint">El archivo en sí no se sube acá (activar Firebase Storage requiere pasar
    el proyecto a plan pago). Por ahora se guarda un link al documento; subida directa queda
    lista para activar el día que decidan pasar a ese plan.</p>

    <p><button class="gd-link" id="gd-ver-auditoria">Ver historial de esta entidad</button></p>
  `;

  document.getElementById("gd-volver").addEventListener("click", () => window.gdApp.navegar("entidades"));
  document
    .getElementById("gd-ver-auditoria")
    .addEventListener("click", () => window.gdApp.navegar("auditoria", { entidadId }));

  container.querySelectorAll(".gd-doc-eliminar").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este documento? Se puede restaurar después desde Eliminados.")) return;
      await GD.eliminarDocumento(entidadId, btn.dataset.docId);
      renderDetalle(container, entidadId);
    })
  );

  document.getElementById("gd-form-doc").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const tipo = tiposDocumento.find((t) => t.id === fd.get("tipoDocumentoId"));

    const datos = {
      tipoDocumentoId: fd.get("tipoDocumentoId"),
      tipoDocumentoNombre: tipo?.nombre || null,
      fechaDesde: fd.get("fechaDesde") ? new Date(fd.get("fechaDesde")).getTime() : null,
      fechaHasta: fd.get("fechaHasta") ? new Date(fd.get("fechaHasta")).getTime() : null,
      sinVencimiento: fd.get("sinVencimiento") === "on",
      diasPreaviso: tipo?.diasPreaviso ?? 30,
      link: fd.get("link") || null,
    };

    document.getElementById("gd-form-doc-msg").textContent = "Guardando…";
    try {
      await GD.guardarDocumento(entidadId, null, datos);
      document.getElementById("gd-form-doc-msg").textContent = "Guardado.";
      renderDetalle(container, entidadId);
    } catch (err) {
      document.getElementById("gd-form-doc-msg").textContent = "Error: " + err.message;
    }
  });
}
