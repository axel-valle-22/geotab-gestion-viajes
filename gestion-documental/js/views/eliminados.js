window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.eliminados = async function render(container) {
  container.innerHTML = `<h2>Eliminados</h2><p>Cargando…</p>`;
  const [items, entidadesElim, tiposDocumento] = await Promise.all([
    GD.listarEliminados(),
    GD.listarEntidadesEliminadas ? GD.listarEntidadesEliminadas() : [],
    GD.listarTiposDocumento(),
  ]);

  // Filtros (se recuerdan entre redibujos, igual que en Entidades).
  const F = (window.__gdFiltrosEliminados = window.__gdFiltrosEliminados || { docTexto: "", entTexto: "", entTipo: "" });
  const focoPrevio = document.activeElement && document.activeElement.id;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nombreTipo = (d) =>
    d.tipoDocumentoNombre || (tiposDocumento.find((t) => t.id === d.tipoDocumentoId) || {}).nombre || d.tipoDocumentoId || "";
  const TIPO_ENTIDAD = { Vehiculo: "Vehículo", AnexoVehicular: "Anexo vehicular", Operador: "Operador", Seguros: "Seguros" };
  const fecha = (t) => (t ? new Date(t).toLocaleString("es-AR") : "-");

  container.innerHTML = `
    <h2>Documentos Eliminados</h2>
    <div class="gd-filtros">
      <input id="gd-e-doc-texto" placeholder="Buscar entidad o documento..." />
    </div>
    <p class="gd-hint" id="gd-e-doc-resumen"></p>
    <table class="gd-tabla">
      <thead>
        <tr><th>Entidad</th><th>Documento</th><th>Eliminado por</th><th>Fecha</th><th>Opciones</th></tr>
      </thead>
      <tbody id="gd-e-doc-body">
        ${
          items
            .map(
              (d) => `
          <tr data-entidad="${esc(d.entidadId)}" data-doc="${esc(d.id)}" data-texto="${esc(((d.entidadDescripcion || d.entidadId) + " " + nombreTipo(d) + " " + (d.eliminadoPor || "")).toLowerCase())}">
            <td>${esc(d.entidadDescripcion || d.entidadId)}</td>
            <td>${esc(nombreTipo(d))}</td>
            <td>${esc(d.eliminadoPor || "-")}</td>
            <td>${fecha(d.eliminadoEn)}</td>
            <td>
              <button class="gd-link gd-btn-restaurar">Restaurar</button>
              <button class="gd-link gd-btn-borrar-def">Eliminar definitivo</button>
            </td>
          </tr>`
            )
            .join("") || `<tr><td colspan="5">No hay documentos eliminados.</td></tr>`
        }
        <tr class="gd-e-vacio" style="display:none"><td colspan="5">Sin resultados con esta búsqueda.</td></tr>
      </tbody>
    </table>

    <h2 style="margin-top:32px">Entidades Eliminadas</h2>
    <p class="gd-hint">Choferes, vehículos o acoplados eliminados a mano. Sus documentos siguen guardados; al restaurarlos vuelven a aparecer con todo.</p>
    <div class="gd-filtros">
      <input id="gd-e-ent-texto" placeholder="Buscar entidad..." />
      <select id="gd-e-ent-tipo">
        <option value="">Tipo de entidad</option>
        <option value="Vehiculo">Vehículos</option>
        <option value="AnexoVehicular">AnexoVehicular</option>
        <option value="Operador">Operadores</option>
      </select>
    </div>
    <p class="gd-hint" id="gd-e-ent-resumen"></p>
    <table class="gd-tabla">
      <thead>
        <tr><th>Entidad</th><th>Tipo</th><th>Documentos</th><th>Eliminado por</th><th>Fecha</th><th>Opciones</th></tr>
      </thead>
      <tbody id="gd-e-ent-body">
        ${
          entidadesElim
            .map(
              (e) => `
          <tr data-entidad="${esc(e.id)}" data-tipo="${esc(e.tipo)}" data-texto="${esc(((e.descripcion || e.id) + " " + (e.eliminadoPor || "")).toLowerCase())}">
            <td>${esc(e.descripcion || e.id)}</td>
            <td>${TIPO_ENTIDAD[e.tipo] || esc(e.tipo)}</td>
            <td>${e.cantidadDocumentos ?? "-"}</td>
            <td>${esc(e.eliminadoPor || "-")}</td>
            <td>${fecha(e.eliminadoEn)}</td>
            <td><button class="gd-link gd-btn-restaurar-entidad">Restaurar</button></td>
          </tr>`
            )
            .join("") || `<tr><td colspan="6">No hay entidades eliminadas.</td></tr>`
        }
        <tr class="gd-e-vacio" style="display:none"><td colspan="6">Sin resultados con estos filtros.</td></tr>
      </tbody>
    </table>
  `;

  // Muestra/oculta filas según los filtros (sin volver a dibujar la tabla).
  function filtrar(bodyId, resumenId, total, coincide, nombre) {
    const body = document.getElementById(bodyId);
    const filas = [...body.querySelectorAll("tr[data-texto]")];
    let visibles = 0;
    filas.forEach((tr) => {
      const ok = coincide(tr);
      tr.style.display = ok ? "" : "none";
      if (ok) visibles++;
    });
    body.querySelector(".gd-e-vacio").style.display = filas.length && !visibles ? "" : "none";
    document.getElementById(resumenId).textContent =
      total && visibles !== total ? `Mostrando ${visibles} de ${total} ${nombre}` : "";
  }
  function refrescar() {
    const td = F.docTexto.trim().toLowerCase();
    filtrar("gd-e-doc-body", "gd-e-doc-resumen", items.length, (tr) => !td || tr.dataset.texto.includes(td), "documento(s)");
    const te = F.entTexto.trim().toLowerCase();
    filtrar(
      "gd-e-ent-body",
      "gd-e-ent-resumen",
      entidadesElim.length,
      (tr) => (!te || tr.dataset.texto.includes(te)) && (!F.entTipo || tr.dataset.tipo === F.entTipo),
      "entidad(es)"
    );
  }

  const campos = { "gd-e-doc-texto": "docTexto", "gd-e-ent-texto": "entTexto", "gd-e-ent-tipo": "entTipo" };
  Object.entries(campos).forEach(([id, clave]) => {
    const el = document.getElementById(id);
    el.value = F[clave] || "";
    el.addEventListener("input", () => { F[clave] = el.value; refrescar(); });
  });
  if (focoPrevio && campos[focoPrevio] && focoPrevio !== "gd-e-ent-tipo") {
    const t = document.getElementById(focoPrevio);
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }
  refrescar();

  container.querySelectorAll(".gd-btn-restaurar-entidad").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const tr = e.target.closest("tr");
      await GD.restaurarEntidad(tr.dataset.entidad);
      render(container);
    })
  );

  container.querySelectorAll(".gd-btn-restaurar").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const tr = e.target.closest("tr");
      await GD.restaurarDocumento(tr.dataset.entidad, tr.dataset.doc);
      render(container);
    })
  );

  container.querySelectorAll(".gd-btn-borrar-def").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      if (!confirm("Esto borra el documento y sus adjuntos para siempre. ¿Continuar?")) return;
      const tr = e.target.closest("tr");
      await GD.eliminarDocumentoDefinitivo(tr.dataset.entidad, tr.dataset.doc);
      render(container);
    })
  );
};
