window.GD_VIEWS = window.GD_VIEWS || {};

// ── Seguros ──────────────────────────────────────────────────────────────
// Pantalla para documentos generales de la empresa que no pertenecen a un
// vehículo, chofer o anexo vehicular puntual (pólizas de seguro: SVO, ART,
// etc.). Reusa toda la infraestructura de documentos/tipos/archivos ya
// armada para Vehiculo/AnexoVehicular/Operador colgándola de una entidad
// "singleton" interna (ver GD.obtenerEntidadSeguros en store.js), en vez de
// duplicar el código del modal/tarjetas/subida de archivos.
window.GD_VIEWS.seguros = async function render(container) {
  container.innerHTML = `<h2>Seguros</h2><p>Cargando…</p>`;

  const [entidad, tiposDocumento] = await Promise.all([
    GD.obtenerEntidadSeguros(),
    GD.listarTiposDocumento(),
  ]);
  const documentos = await GD.listarDocumentosDeEntidad(entidad.id);

  // Solo los tipos de documento pensados para "Seguros" (se crean en Tipos
  // de Documento eligiendo ese tipo de entidad).
  const tiposSeguros = tiposDocumento.filter((t) => t.tipoEntidad === "Seguros");
  const documentosPorTipo = new Map(documentos.map((d) => [d.tipoDocumentoId, d]));

  // Una tarjeta por cada tipo "Seguros" (tenga o no un documento cargado
  // todavía), más los documentos que hayan quedado con un tipo que ya no
  // está marcado como "Seguros" (o fue borrado) — para no perder el acceso
  // a algo que ya se había cargado.
  const tarjetas = tiposSeguros.map((tipo) => {
    const doc = documentosPorTipo.get(tipo.id);
    documentosPorTipo.delete(tipo.id);
    return {
      doc: doc || { id: null, entidadId: entidad.id, tipoDocumentoId: tipo.id, estado: "faltante", archivos: [] },
      tipo,
    };
  });
  documentosPorTipo.forEach((doc) => {
    tarjetas.push({ doc, tipo: tiposDocumento.find((t) => t.id === doc.tipoDocumentoId) });
  });

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
    <h2>Seguros</h2>
    <p class="gd-hint">Documentos generales de la empresa (no atados a un vehículo o chofer en particular): pólizas de SVO, ART, etc. Los tipos de documento se crean en "Tipos de Documento" eligiendo el tipo de entidad "Seguros".</p>

    <h3>Documentos <button class="gd-link" id="gd-btn-agregar-doc-seguro" style="font-size:.78rem;margin-left:10px;font-weight:600">+ Agregar documento</button></h3>
    <div class="gd-doc-grid" id="gd-grid-seguros">${
      tarjetas.map(tarjetaDocumento).join("") ||
      `<p class="gd-hint">Todavía no hay tipos de documento para "Seguros". Creá uno en Tipos de Documento eligiendo el tipo de entidad "Seguros".</p>`
    }</div>
  `;

  const rerender = () => window.GD_VIEWS.seguros(container);

  const abrirTarjeta = (docId, tipoId) => {
    const tipo = tiposDocumento.find((t) => t.id === tipoId) || null;
    const doc = docId
      ? documentos.find((d) => d.id === docId)
      : { id: null, entidadId: entidad.id, tipoDocumentoId: tipoId, estado: "faltante", archivos: [] };
    abrirModalDocumento({
      entidad,
      entidadId: entidad.id,
      doc,
      tipo,
      onGuardado: rerender,
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

  const btnAgregar = document.getElementById("gd-btn-agregar-doc-seguro");
  if (btnAgregar) btnAgregar.addEventListener("click", () => {
    if (!tiposSeguros.length) {
      alert('Primero creá un tipo de documento con tipo de entidad "Seguros" desde la pantalla "Tipos de Documento".');
      return;
    }
    abrirModalDocumento({
      entidad,
      entidadId: entidad.id,
      doc: { id: null, entidadId: entidad.id, tipoDocumentoId: null, estado: "faltante", archivos: [] },
      tipo: null,
      tiposDocumentoOpciones: tiposSeguros,
      onGuardado: rerender,
    });
  });
};
