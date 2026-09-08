window.GD_VIEWS = window.GD_VIEWS || {};

window.GD_VIEWS.indicadores = async function render(container) {
  container.innerHTML = `<p>Cargando indicadores…</p>`;
  const counts = await GD.contarPorEstado();

  const tarjeta = (label, valor, clase) => `
    <div class="gd-card gd-card-${clase}">
      <div class="gd-card-valor">${valor}</div>
      <div class="gd-card-label">${label}</div>
    </div>`;

  container.innerHTML = `
    <h2>Indicadores</h2>
    <div class="gd-cards">
      ${tarjeta("Vigentes", counts.vigente || 0, "ok")}
      ${tarjeta("Preaviso", counts.preaviso || 0, "warn")}
      ${tarjeta("Vencidos", counts.vencido || 0, "danger")}
      ${tarjeta("Faltantes", counts.faltante || 0, "neutral")}
    </div>
    <button id="gd-btn-recalcular" class="gd-btn">Recalcular estados ahora</button>
    <span id="gd-recalcular-msg"></span>
  `;

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
