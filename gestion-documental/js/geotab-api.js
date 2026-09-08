/**
 * Ciclo de vida estándar de un Add-In de MyGeotab.
 * https://developers.geotab.com/myGeotab/addIns/developingAddIns
 *
 * A diferencia de la primera versión, acá NO hay login contra Firebase
 * (sin Cloud Functions ni Auth): usamos directamente la sesión que Geotab
 * ya nos dio (`api`) tanto para leer Vehículos/Choferes como para guardar
 * el respaldo en AddInData. Es el mismo criterio que ya usa "Gestión de
 * Viajes" en este mismo repo.
 */
geotab.addin.gestionDocumental = function () {
  return {
    initialize: function (api, state, callback) {
      GD.init(api).then(() => {
        window.gdApp.iniciar();
      });
      callback();
    },

    focus: function () {
      if (window.gdApp) window.gdApp.render();
    },

    blur: function () {
      // No hace falta limpiar nada especial al salir de la pantalla.
    },
  };
};
