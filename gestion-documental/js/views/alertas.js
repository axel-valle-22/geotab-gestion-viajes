window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.alertas = async function render(container) {
  container.innerHTML = `<h2>Alertas</h2><p>Cargando…</p>`;
  const [alertas, funciones] = await Promise.all([GD.listarAlertas(), GD.listarFunciones()]);

  container.innerHTML = `
    <h2>Alertas</h2>
    <table class="gd-tabla">
      <thead><tr><th>Destinatarios</th><th>Funciones a controlar</th><th>Frecuencia</th><th>Activa</th><th></th></tr></thead>
      <tbody>
        ${
          alertas
            .map(
              (a) => `
          <tr data-id="${a.id}">
            <td>${(a.destinatarios || []).join(", ")}</td>
            <td>${(a.funcionesIds || []).map((id) => funciones.find((f) => f.id === id)?.nombre || id).join(", ")}</td>
            <td>${a.frecuencia}</td>
            <td><input type="checkbox" class="gd-toggle-alerta" ${a.activa ? "checked" : ""} /></td>
            <td><button class="gd-link gd-borrar-alerta">Eliminar</button></td>
          </tr>`
            )
            .join("") || `<tr><td colspan="5">No hay alertas creadas.</td></tr>`
        }
      </tbody>
    </table>

    <h3>Crear alerta</h3>
    <form id="gd-form-alerta" class="gd-form">
      <input name="destinatarios" placeholder="Emails separados por coma" required style="min-width:260px" />
      <select name="funcionesIds" multiple size="6">
        ${funciones.map((f) => `<option value="${f.id}">${f.nombre}</option>`).join("")}
      </select>
      <select name="frecuencia">
        <option value="cada_hora">Cada una hora</option>
        <option value="cada_dos_horas">Cada dos horas</option>
        <option value="diario" selected>Una vez al día</option>
      </select>
      <button type="submit" class="gd-btn">Crear</button>
      <span id="gd-form-alerta-msg"></span>
    </form>
  `;

  container.querySelectorAll(".gd-toggle-alerta").forEach((chk) =>
    chk.addEventListener("change", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      await GD.toggleAlerta(id, e.target.checked);
    })
  );

  container.querySelectorAll(".gd-borrar-alerta").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      if (confirm("¿Eliminar esta alerta?")) {
        await GD.eliminarAlerta(id);
        render(container);
      }
    })
  );

  document.getElementById("gd-form-alerta").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const funcionesIds = [...form.funcionesIds.selectedOptions].map((o) => o.value);
    try {
      await GD.crearAlerta({
        destinatarios: form.destinatarios.value.split(",").map((s) => s.trim()).filter(Boolean),
        funcionesIds,
        frecuencia: form.frecuencia.value,
        notificarmeEmail: GD.usuarioActual() || null,
      });
      render(container);
    } catch (err) {
      document.getElementById("gd-form-alerta-msg").textContent = "Error: " + err.message;
    }
  });
};
