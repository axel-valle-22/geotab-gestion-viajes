window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.tiposDocumento = async function render(container) {
  container.innerHTML = `<h2>Tipos de Documento</h2><p>Cargando…</p>`;
  const tipos = await GD.listarTiposDocumento();

  container.innerHTML = `
    <h2>Tipos de Documento</h2>
    <table class="gd-tabla">
      <thead><tr><th>Nombre</th><th>Tipo Entidad</th><th>Preaviso (días)</th><th>Sin vencimiento</th><th></th></tr></thead>
      <tbody>
        ${tipos
          .map(
            (t) => `<tr data-id="${t.id}">
              <td>${t.nombre}</td><td>${t.tipoEntidad}</td><td>${t.diasPreaviso}</td>
              <td>${t.sinVencimiento ? "Sí" : "No"}</td>
              <td><button type="button" class="gd-link gd-borrar-tipo">Eliminar</button></td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>

    <h3>Crear tipo de documento</h3>
    <form id="gd-form-tipo" class="gd-form">
      <input name="nombre" placeholder="Nombre" required />
      <select name="tipoEntidad" required>
        <option value="Vehiculo">Vehículo</option>
        <option value="AnexoVehicular">AnexoVehicular</option>
        <option value="Operador">Operador</option>
      </select>
      <label>Días de preaviso <input type="number" name="diasPreaviso" value="30" /></label>
      <label><input type="checkbox" name="sinVencimiento" /> Sin vencimiento</label>
      <button type="submit" class="gd-btn">Crear</button>
      <span id="gd-form-tipo-msg"></span>
    </form>
  `;

  container.querySelectorAll(".gd-borrar-tipo").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      if (
        confirm(
          "¿Eliminar este tipo de documento? Los documentos ya creados con este tipo van a seguir mostrando su nombre, pero dejará de estar disponible para elegir en documentos nuevos."
        )
      ) {
        await GD.eliminarTipoDocumento(id);
        render(container);
      }
    })
  );

  document.getElementById("gd-form-tipo").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      await GD.crearTipoDocumento({
        nombre: fd.get("nombre"),
        tipoEntidad: fd.get("tipoEntidad"),
        diasPreaviso: Number(fd.get("diasPreaviso")) || 30,
        sinVencimiento: fd.get("sinVencimiento") === "on",
      });
      window.gdApp.navegar("tiposDocumento");
    } catch (err) {
      document.getElementById("gd-form-tipo-msg").textContent = "Error: " + err.message;
    }
  });
};
