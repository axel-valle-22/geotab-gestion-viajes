window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.auditoria = async function render(container, params = {}) {
  container.innerHTML = `<h2>Auditoría</h2><p>Cargando…</p>`;
  const items = await GD.listarAuditoria({ entidadId: params.entidadId || null });

  const etiquetaAccion = {
    creado: "Creado",
    editado: "Editado",
    eliminado: "Eliminado (papelera)",
    restaurado: "Restaurado",
    eliminado_definitivo: "Eliminado definitivamente",
  };

  container.innerHTML = `
    <h2>Auditoría ${params.entidadId ? "de esta entidad" : "(global, últimos 100 movimientos)"}</h2>
    ${params.entidadId ? `<button class="gd-link" id="gd-volver-auditoria">&larr; Volver a la entidad</button>` : ""}
    <table class="gd-tabla">
      <thead><tr><th>Fecha</th><th>Entidad</th><th>Documento</th><th>Acción</th><th>Usuario</th><th>Estado anterior → nuevo</th></tr></thead>
      <tbody>
        ${
          items
            .map(
              (a) => `
          <tr>
            <td>${a.fecha ? new Date(a.fecha).toLocaleString() : "-"}</td>
            <td>${a.entidadId}</td>
            <td>${a.documentoId}</td>
            <td>${etiquetaAccion[a.accion] || a.accion}</td>
            <td>${a.usuario || "-"}</td>
            <td>${a.estadoAnterior || "-"} → ${a.estadoNuevo || "-"}</td>
          </tr>`
            )
            .join("") || `<tr><td colspan="6">Sin movimientos registrados.</td></tr>`
        }
      </tbody>
    </table>
  `;

  document
    .getElementById("gd-volver-auditoria")
    ?.addEventListener("click", () => window.gdApp.navegar("entidades", { entidadId: params.entidadId }));
};
