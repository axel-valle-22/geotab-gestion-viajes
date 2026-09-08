window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.tiposDocumento = async function render(container) {
  container.innerHTML = `<h2>Tipos de Documento</h2><p>Cargando…</p>`;
  const tipos = await GD.listarTiposDocumento();

  container.innerHTML = `
    <h2>Tipos de Documento</h2>
    <table class="gd-tabla">
      <thead><tr><th>Nombre</th><th>Tipo Entidad</th><th>Preaviso (días)</th><th>Sin vencimiento</th></tr></thead>
      <tbody>
        ${tipos
          .map(
            (t) => `<tr>
              <td>${t.nombre}</td><td>${t.tipoEntidad}</td><td>${t.diasPreaviso}</td>
              <td>${t.sinVencimiento ? "Sí" : "No"}</td>
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
