window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.eliminados = async function render(container) {
  container.innerHTML = `<h2>Documentos Eliminados</h2><p>Cargando…</p>`;
  const items = await GD.listarEliminados();

  container.innerHTML = `
    <h2>Documentos Eliminados</h2>
    <table class="gd-tabla">
      <thead>
        <tr><th>Entidad</th><th>Documento</th><th>Eliminado por</th><th>Fecha</th><th>Opciones</th></tr>
      </thead>
      <tbody>
        ${
          items
            .map(
              (d) => `
          <tr data-entidad="${d.entidadId}" data-doc="${d.id}">
            <td>${d.entidadDescripcion || d.entidadId}</td>
            <td>${d.tipoDocumentoNombre || d.tipoDocumentoId}</td>
            <td>${d.eliminadoPor || "-"}</td>
            <td>${d.eliminadoEn ? new Date(d.eliminadoEn).toLocaleString() : "-"}</td>
            <td>
              <button class="gd-link gd-btn-restaurar">Restaurar</button>
              <button class="gd-link gd-btn-borrar-def">Eliminar definitivo</button>
            </td>
          </tr>`
            )
            .join("") || `<tr><td colspan="5">No hay documentos eliminados.</td></tr>`
        }
      </tbody>
    </table>
  `;

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
