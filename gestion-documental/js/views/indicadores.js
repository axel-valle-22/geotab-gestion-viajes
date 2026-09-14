window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.indicadores = async function render(container) {
  container.innerHTML = `<p>Cargando indicadores…</p>`;
  const counts = await GD.contarPorEstado();

  // Cada tarjeta lleva su estado en data-estado: al hacer click navega a
  // Entidades con ese estado ya seleccionado en el filtro (ver entidades.js,
  // que lee params.estadoFiltro para precargar el <select>).
  const tarjeta = (label, valor, clase, estado) => `
    <div class="gd-card gd-card-${clase}" data-estado="${estado}" role="button" tabindex="0"
         title="Ver entidades con estado ${label.toLowerCase()}">
      <div class="gd-card-valor">${valor}</div>
      <div class="gd-card-label">${label}</div>
    </div>`;

  container.innerHTML = `
    <h2>Indicadores</h2>
    <div class="gd-cards">
      ${tarjeta("Vigentes", counts.vigente || 0, "ok", "vigente")}
      ${tarjeta("Preaviso", counts.preaviso || 0, "warn", "preaviso")}
      ${tarjeta("Vencidos", counts.vencido || 0, "danger", "vencido")}
      ${tarjeta("Faltantes", counts.faltante || 0, "neutral", "faltante")}
    </div>
    <button id="gd-btn-recalcular" class="gd-btn">Recalcular estados ahora</button>
    <span id="gd-recalcular-msg"></span>
  `;

  const irAEntidadesConEstado = (estado) => window.gdApp.navegar("entidades", { estadoFiltro: estado });

  container.querySelectorAll(".gd-card[data-estado]").forEach((card) => {
    card.addEventListener("click", () => irAEntidadesConEstado(card.dataset.estado));
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        irAEntidadesConEstado(card.dataset.estado);
      }
    });
  });

  document.getElementById("gd-btn-recalcular").addEventListener("click", async (e) => {
    e.target.disabled = true;
    document.getElementById("gd-recalcular-msg").textContent = "Recalculando…";
    try {
      const data = await GD.recalcularEstados();
      document.getElementById("gd-recalcular-msg").textContent = `${data.actualizados} documento(s) recalculados.`;
    } catch (err) {
      document.getElementById("gd-recalcular-msg").textContent = "Error: " + err.message;
    } finally {
      e.target.disabled = false;
    }
  });
};
