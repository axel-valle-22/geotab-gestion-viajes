window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.funciones = async function render(container) {
  container.innerHTML = `<h2>Funciones</h2><p>Cargando…</p>`;
  const [funciones, tiposDocumento] = await Promise.all([GD.listarFunciones(), GD.listarTiposDocumento()]);

  container.innerHTML = `
    <h2>Funciones</h2>
    <div class="gd-doc-grid">
      ${funciones
        .map(
          (f) => `
        <div class="gd-func-card">
          <div class="gd-func-nombre">${f.nombre}</div>
          <div class="gd-func-tipo">${f.tipoEntidad}</div>
          <div class="gd-func-docs">${(f.tiposDocumentoIds || [])
            .map((id) => tiposDocumento.find((t) => t.id === id)?.nombre || id)
            .join(", ") || "Sin documentos asignados"}</div>
        </div>`
        )
        .join("")}
    </div>

    <h3>Crear función</h3>
    <form id="gd-form-funcion" class="gd-form">
      <input name="nombre" placeholder="Nombre de la función" required />
      <select name="tipoEntidad" required>
        <option value="Vehiculo">Vehículo</option>
        <option value="AnexoVehicular">AnexoVehicular</option>
        <option value="Operador">Operador</option>
      </select>
      <select name="tiposDocumentoIds" multiple size="6">
        ${tiposDocumento.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join("")}
      </select>
      <button type="submit" class="gd-btn">Crear</button>
      <span id="gd-form-funcion-msg"></span>
    </form>
  `;

  document.getElementById("gd-form-funcion").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const seleccionados = [...form.tiposDocumentoIds.selectedOptions].map((o) => o.value);
    try {
      await GD.crearFuncion({
        nombre: form.nombre.value,
        tipoEntidad: form.tipoEntidad.value,
        tiposDocumentoIds: seleccionados,
      });
      window.gdApp.navegar("funciones");
    } catch (err) {
      document.getElementById("gd-form-funcion-msg").textContent = "Error: " + err.message;
    }
  });
};
