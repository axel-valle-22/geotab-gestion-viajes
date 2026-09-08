window.GD_VIEWS = window.GD_VIEWS || {};

/**
 * Ya no hay roles/permisos por Firebase Auth (no lo usamos, igual que
 * Gestión de Viajes). Lo que sí sigue haciendo falta es la lista de
 * "quién es cada chofer" para que la pantalla "Mis Documentos" en la app
 * del chofer sepa qué entidad (operador) mostrarle — se identifica
 * matcheando su nombre de sesión de Geotab, igual que hace GV con
 * GV.Storage.getConductores(). Se completa solo al usar "Sincronizar con
 * Geotab", esta pantalla es para revisar/corregir el cruce a mano.
 */
window.GD_VIEWS.usuarios = async function render(container) {
  container.innerHTML = `<h2>Choferes</h2><p>Cargando…</p>`;
  const [choferes, entidades] = await Promise.all([GD.listarUsuarios(), GD.listarEntidades({ tipo: "Operador" })]);

  container.innerHTML = `
    <h2>Choferes</h2>
    <p class="gd-hint">Cruce entre el nombre de usuario de Geotab y la entidad (operador) de
    Gestión Documental, para que "Mis Documentos" le muestre a cada chofer sus propios
    papeles. "Sincronizar con Geotab" completa esto automáticamente; acá se puede corregir
    a mano si alguien quedó mal identificado.</p>
    <table class="gd-tabla">
      <thead><tr><th>Nombre de usuario (Geotab)</th><th>Entidad / Operador</th><th></th></tr></thead>
      <tbody>
        ${choferes
          .map(
            (c) => `
          <tr data-id="${c.id}">
            <td>${c.nombre || "-"}</td>
            <td>
              <select class="gd-chofer-entidad">
                <option value="">—</option>
                ${entidades
                  .map((e) => `<option value="${e.id}" ${c.entidadId === e.id ? "selected" : ""}>${e.descripcion}</option>`)
                  .join("")}
              </select>
            </td>
            <td><button class="gd-link gd-chofer-guardar">Guardar</button> <span class="gd-chofer-msg"></span></td>
          </tr>`
          )
          .join("") || `<tr><td colspan="3">Todavía no hay choferes sincronizados. Usá "Sincronizar con Geotab".</td></tr>`}
      </tbody>
    </table>

    <h3>Agregar manualmente</h3>
    <form id="gd-form-chofer" class="gd-form">
      <input name="nombre" placeholder="Nombre de usuario exacto en Geotab" required style="min-width:260px" />
      <select name="entidadId">
        <option value="">Entidad (operador)…</option>
        ${entidades.map((e) => `<option value="${e.id}">${e.descripcion}</option>`).join("")}
      </select>
      <button type="submit" class="gd-btn">Agregar</button>
    </form>
  `;

  container.querySelectorAll(".gd-chofer-guardar").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const tr = e.target.closest("tr");
      const msg = tr.querySelector(".gd-chofer-msg");
      msg.textContent = "Guardando…";
      try {
        await GD.actualizarUsuario(tr.dataset.id, { entidadId: tr.querySelector(".gd-chofer-entidad").value || null });
        msg.textContent = "OK";
      } catch (err) {
        msg.textContent = "Error: " + err.message;
      }
    })
  );

  document.getElementById("gd-form-chofer").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    await GD.actualizarUsuario(null, { nombre: form.nombre.value, entidadId: form.entidadId.value || null });
    render(container);
  });
};
