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
    archivo_subido: "Archivo subido",
    archivo_eliminado: "Archivo eliminado",
  };

  // Muestra el tipo de documento bien claro (Título, VTV Nacional, Foto,
  // etc.) y, si la acción tocó un archivo puntual, el nombre real de ese
  // archivo al lado, en gris, para distinguir "qué documento" de "qué
  // archivo" dentro de ese documento.
  const documentoLabel = (a) => {
    const base = a.documentoNombre || a.documentoId || "-";
    const esArchivo = a.accion === "archivo_subido" || a.accion === "archivo_eliminado";
    if (esArchivo && a.archivoNombre) {
      return `${base} <span style="color:#8A8F9C;font-weight:400;">(${a.archivoNombre})</span>`;
    }
    return base;
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
            <td>${a.entidadNombre || a.entidadId}</td>
            <td>${documentoLabel(a)}</td>
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
