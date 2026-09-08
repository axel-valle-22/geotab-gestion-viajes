/**
 * Router mínimo del Add-In: no usamos ningún framework para no depender
 * de un paso de build (los Add-Ins de MyGeotab se sirven como archivos
 * estáticos tal cual).
 */
window.gdApp = (function () {
  let vistaActual = "indicadores";
  let paramsActuales = {};

  function navegar(vista, params = {}) {
    vistaActual = vista;
    paramsActuales = params;
    document.querySelectorAll(".gd-nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === vista));
    render();
  }

  function render() {
    const container = document.getElementById("gd-content");
    const vista = window.GD_VIEWS[vistaActual];
    if (!vista) {
      container.innerHTML = `<p class="gd-error">Vista no encontrada: ${vistaActual}</p>`;
      return;
    }
    vista(container, paramsActuales);
  }

  function iniciar() {
    document.querySelectorAll(".gd-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => navegar(btn.dataset.view));
    });

    const status = document.getElementById("gd-auth-status");
    if (status) status.textContent = `Conectado como ${GD.usuarioActual()}`;

    const btnSync = document.getElementById("gd-btn-sync");
    if (btnSync) {
      btnSync.addEventListener("click", async () => {
        btnSync.disabled = true;
        btnSync.textContent = "Sincronizando…";
        try {
          const r = await GD.sincronizarConGeotab();
          btnSync.textContent = `✓ ${r.totalVehiculos ?? 0} vehículos, ${r.totalChoferes ?? 0} choferes`;
        } catch (err) {
          btnSync.textContent = "Error al sincronizar";
          console.error(err);
        } finally {
          btnSync.disabled = false;
          setTimeout(() => (btnSync.textContent = "⟳ Sincronizar con Geotab"), 4000);
        }
      });
    }

    // Re-renderiza la vista actual cada vez que llega un cambio en tiempo
    // real desde Firestore (u otra sesión escribió algo), igual que hace
    // GV.Storage.onChange en Gestión de Viajes.
    GD.onChange(render);

    render();
  }

  return { navegar, render, iniciar };
})();

// Si el Add-In se abre fuera de MyGeotab (ej. para probar en el navegador
// directo), arrancamos igual pero sin `api` de Geotab.
if (!window.geotab) {
  console.warn("Corriendo fuera de MyGeotab: solo para desarrollo local, sin AddInData ni sync con Geotab.");
  GD.init(null).then(() => window.gdApp.iniciar());
}
