/**
 * Router mínimo del Add-In: no usamos ningún framework para no depender
 * de un paso de build (los Add-Ins de MyGeotab se sirven como archivos
 * estáticos tal cual).
 */
window.gdApp = (function () {
  let vistaActual = "indicadores";
  let paramsActuales = {};

  function navegar(vista, params = {}) {
    if (!vista) return;
    vistaActual = vista;
    paramsActuales = params;
    document.querySelectorAll(".gd-nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === vista));
    abrirGrupoDeVista(vista);
    render();
  }

  // Documentos / Notificaciones / Configuración son menús desplegables: al
  // navegar a una vista que vive adentro de uno de esos grupos (sea por
  // click directo en el menú, por una tarjeta de Indicadores, o por un link
  // interno como "Ver historial de esta entidad"), ese grupo se abre solo
  // para que el botón activo quede visible.
  function abrirGrupoDeVista(vista) {
    const boton = document.querySelector(`.gd-nav-btn[data-view="${vista}"]`);
    const grupo = boton && boton.closest(".gd-nav-group");
    if (grupo) setGrupoAbierto(grupo, true);
  }

  function setGrupoAbierto(grupo, abierto) {
    grupo.classList.toggle("gd-nav-group-open", abierto);
    const toggle = grupo.querySelector("[data-nav-toggle]");
    if (toggle) toggle.setAttribute("aria-expanded", abierto ? "true" : "false");
  }

  function render() {
    const container = document.getElementById("gd-content");
    // Si la pantalla del módulo ya no está en pantalla (por ejemplo, el usuario
    // abrió otro Add-In), no hay nada que dibujar.
    if (!container) return;
    const vista = window.GD_VIEWS[vistaActual];
    if (!vista) {
      container.innerHTML = `<p class="gd-error">Vista no encontrada: ${vistaActual}</p>`;
      return;
    }
    vista(container, paramsActuales);
  }

  // Excepción de clasificación: la sincronización con Geotab marca como
  // "AnexoVehicular" todo nombre tipo "A123 - PATENTE" o "R123 - PATENTE".
  // Estas dos unidades son vehículos, así que después de cada sincronización
  // (y al abrir el módulo) se vuelven a dejar como "Vehiculo". El id no
  // cambia, así que sus documentos siguen igual.
  const VEHICULOS_FORZADOS = [/^\s*A172\s*[-\u2013\u2014]/i, /^\s*A174\s*[-\u2013\u2014]/i];

  async function corregirTiposForzados() {
    try {
      const entidades = await GD.listarEntidades();
      let cambio = false;
      entidades.forEach((e) => {
        if (e.tipo === "AnexoVehicular" && VEHICULOS_FORZADOS.some((re) => re.test(e.descripcion || ""))) {
          e.tipo = "Vehiculo";
          cambio = true;
        }
      });
      if (cambio) await GD.recalcularEstados(); // guarda y vuelve a dibujar
    } catch (err) {
      console.warn("No se pudo aplicar la excepción de tipo de vehículo:", err);
    }
  }

  function iniciar() {
    // Solo los botones que tienen una vista asignada: el botón "Sincronizar con
    // Geotab" comparte la clase gd-nav-btn pero no es una pantalla.
    document.querySelectorAll(".gd-nav-btn[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => navegar(btn.dataset.view));
    });

    document.querySelectorAll("[data-nav-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const grupo = btn.closest(".gd-nav-group");
        if (grupo) setGrupoAbierto(grupo, !grupo.classList.contains("gd-nav-group-open"));
      });
    });

    abrirGrupoDeVista(vistaActual);

    const status = document.getElementById("gd-auth-status");
    if (status) status.textContent = `Conectado como ${GD.usuarioActual()}`;

    const btnSync = document.getElementById("gd-btn-sync");
    if (btnSync) {
      btnSync.addEventListener("click", async () => {
        btnSync.disabled = true;
        btnSync.textContent = "Sincronizando…";
        try {
          const r = await GD.sincronizarConGeotab();
          await corregirTiposForzados();
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
    corregirTiposForzados();
  }

  return { navegar, render, iniciar };
})();

// Si el Add-In se abre fuera de MyGeotab (ej. para probar en el navegador
// directo), arrancamos igual pero sin `api` de Geotab.
if (!window.geotab) {
  console.warn("Corriendo fuera de MyGeotab: solo para desarrollo local, sin AddInData ni sync con Geotab.");
  GD.init(null).then(() => window.gdApp.iniciar());
}
