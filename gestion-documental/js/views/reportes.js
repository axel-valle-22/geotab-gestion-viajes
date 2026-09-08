window.GD_VIEWS = window.GD_VIEWS || {};

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

window.GD_VIEWS.reportes = async function render(container) {
  container.innerHTML = `<h2>Reportes</h2><p>Cargando…</p>`;
  const [reportes, tiposDocumento] = await Promise.all([GD.listarReportes(), GD.listarTiposDocumento()]);

  container.innerHTML = `
    <h2>Reportes</h2>
    <table class="gd-tabla">
      <thead><tr><th>Destinatarios</th><th>Tipo</th><th>Documentos</th><th>Frecuencia</th><th>Activo</th><th></th></tr></thead>
      <tbody>
        ${
          reportes
            .map(
              (r) => `
          <tr data-id="${r.id}">
            <td>${(r.destinatarios || []).join(", ")}</td>
            <td>${r.tipo}</td>
            <td>${(r.tiposDocumentoIds || []).map((id) => tiposDocumento.find((t) => t.id === id)?.nombre || id).join(", ") || "Todos"}</td>
            <td>${r.frecuencia === "semanal" ? "Semanal (" + DIAS_SEMANA[r.diaSemana] + ")" : "Diario"}</td>
            <td><input type="checkbox" class="gd-toggle-reporte" ${r.activo ? "checked" : ""} /></td>
            <td><button class="gd-link gd-borrar-reporte">Eliminar</button></td>
          </tr>`
            )
            .join("") || `<tr><td colspan="6">No hay reportes creados.</td></tr>`
        }
      </tbody>
    </table>

    <h3>Crear reporte</h3>
    <form id="gd-form-reporte" class="gd-form">
      <input name="destinatarios" placeholder="Emails separados por coma" required style="min-width:260px" />
      <select name="tipo">
        <option value="completo">Completo</option>
        <option value="cambios">Solo cambios (últimas 24hs)</option>
      </select>
      <select name="tiposDocumentoIds" multiple size="6">
        ${tiposDocumento.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join("")}
      </select>
      <select name="frecuencia">
        <option value="diario">Diario</option>
        <option value="semanal" selected>Semanal</option>
      </select>
      <select name="diaSemana">
        ${DIAS_SEMANA.map((d, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${d}</option>`).join("")}
      </select>
      <button type="submit" class="gd-btn">Crear</button>
      <span id="gd-form-reporte-msg"></span>
    </form>
  `;

  container.querySelectorAll(".gd-toggle-reporte").forEach((chk) =>
    chk.addEventListener("change", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      await GD.toggleReporte(id, e.target.checked);
    })
  );

  container.querySelectorAll(".gd-borrar-reporte").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      if (confirm("¿Eliminar este reporte?")) {
        await GD.eliminarReporte(id);
        render(container);
      }
    })
  );

  document.getElementById("gd-form-reporte").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const tiposDocumentoIds = [...form.tiposDocumentoIds.selectedOptions].map((o) => o.value);
    try {
      await GD.crearReporte({
        destinatarios: form.destinatarios.value.split(",").map((s) => s.trim()).filter(Boolean),
        tipo: form.tipo.value,
        tiposDocumentoIds,
        frecuencia: form.frecuencia.value,
        diaSemana: Number(form.diaSemana.value),
      });
      render(container);
    } catch (err) {
      document.getElementById("gd-form-reporte-msg").textContent = "Error: " + err.message;
    }
  });
};
