window.GD_VIEWS = window.GD_VIEWS || {};

// ── Vencidos ─────────────────────────────────────────────────────────────
// Lista de TODOS los documentos vencidos (uno por fila), para que quien
// lleva la documentación vea de un vistazo qué hay que actualizar sin tener
// que entrar entidad por entidad. Se llega desde el menú Documentos >
// Vencidos o tocando la tarjeta "Vencidos" de Indicadores.
// "Actualizar" abre el mismo modal de documento que la ficha de la entidad
// (abrirModalDocumento, en entidades.js): al cargar la nueva fecha el
// documento deja de estar vencido y sale solo de esta lista.
window.GD_VIEWS.vencidos = async function render(container) {
  // Los filtros se recuerdan entre redibujos (la pantalla se vuelve a dibujar
  // sola cuando llega un cambio en tiempo real).
  const F = (window.__gdFiltrosVencidos = window.__gdFiltrosVencidos || { texto: "", tipo: "", doc: "", orden: "antiguos" });
  const focoPrevio = document.activeElement && document.activeElement.id;

  const [entidades, entSeguros, tiposDocumento] = await Promise.all([
    GD.listarEntidades(),
    GD.getEntidad("seguros_empresa"),
    GD.listarTiposDocumento(),
  ]);
  if (entSeguros && entSeguros.activo !== false) entidades.push(entSeguros);

  const nombreTipo = (d) =>
    d.tipoDocumentoNombre || (tiposDocumento.find((t) => t.id === d.tipoDocumentoId) || {}).nombre || "(sin tipo)";
  const TIPO_ENTIDAD = { Vehiculo: "Vehículo", AnexoVehicular: "Anexo vehicular", Operador: "Operador", Seguros: "Seguros" };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Todas las filas (documento vencido + su entidad).
  const todas = [];
  for (const e of entidades) {
    const docs = await GD.listarDocumentosDeEntidad(e.id);
    docs
      .filter((d) => d.estado === "vencido")
      .forEach((d) => {
        const dia = gdFechaDeTs(d.fechaHasta);
        const dias = dia ? Math.round((hoy - new Date(dia.getFullYear(), dia.getMonth(), dia.getDate())) / 86400000) : null;
        todas.push({ e, d, tipoNombre: nombreTipo(d), dias, ts: dia ? dia.getTime() : 0 });
      });
  }
  // Orden por fecha de vencimiento: "antiguos" = primero los que hace más
  // tiempo que vencieron (más días vencidos); "recientes" = al revés.
  // Se cambia tocando el encabezado "Días vencido" (o "Venció el").
  const ordenar = () => {
    const sig = F.orden === "recientes" ? -1 : 1;
    todas.sort((a, b) => sig * (a.ts - b.ts) || (a.e.descripcion || "").localeCompare(b.e.descripcion || "", "es", { numeric: true }));
  };
  ordenar();

  const nombresDocs = [...new Set(todas.map((f) => f.tipoNombre))].sort((a, b) => a.localeCompare(b, "es"));
  if (F.doc && !nombresDocs.includes(F.doc)) F.doc = "";

  container.innerHTML = `
    <h2>Documentos vencidos</h2>
    <p class="gd-hint">Cada fila es un documento vencido. Tocá <b>Actualizar</b> para cargar la nueva fecha o el archivo; al guardarlo sale solo de esta lista.</p>
    <div class="gd-filtros">
      <input id="gd-v-texto" placeholder="Buscar entidad..." />
      <select id="gd-v-tipo">
        <option value="">Tipo de entidad</option>
        <option value="Vehiculo">Vehículos</option>
        <option value="AnexoVehicular">AnexoVehicular</option>
        <option value="Operador">Operadores</option>
        <option value="Seguros">Seguros</option>
      </select>
      <select id="gd-v-doc">
        <option value="">Documento</option>
        ${nombresDocs.map((n) => `<option value="${gdEsc(n)}">${gdEsc(n)}</option>`).join("")}
      </select>
      <button type="button" class="gd-btn gd-btn-sec" id="gd-v-exportar" title="Descargar la lista filtrada para trabajar en Excel">Exportar a Excel</button>
    </div>
    <p class="gd-hint" id="gd-v-resumen"></p>
    <table class="gd-tabla">
      <thead><tr><th>Entidad</th><th>Tipo</th><th>Documento</th><th class="gd-v-orden" style="cursor:pointer;user-select:none" title="Tocá para cambiar el orden">Venció el</th><th class="gd-v-orden" style="cursor:pointer;user-select:none" title="Tocá para cambiar el orden">Días vencido <span id="gd-v-flecha"></span></th><th></th></tr></thead>
      <tbody id="gd-v-body"></tbody>
    </table>
  `;

  let filasActuales = [];

  function refrescar() {
    document.getElementById("gd-v-flecha").textContent = F.orden === "recientes" ? "▲" : "▼";
    const t = F.texto.trim().toLowerCase();
    filasActuales = todas.filter(
      (f) =>
        (!t || (f.e.descripcion || "").toLowerCase().includes(t)) &&
        (!F.tipo || f.e.tipo === F.tipo) &&
        (!F.doc || f.tipoNombre === F.doc)
    );
    const entidadesDistintas = new Set(filasActuales.map((f) => f.e.id)).size;
    document.getElementById("gd-v-resumen").textContent = todas.length
      ? `${filasActuales.length} documento(s) vencido(s) en ${entidadesDistintas} entidad(es)` +
        (filasActuales.length !== todas.length ? ` · ${todas.length} en total` : "") +
        (F.orden === "recientes" ? " · de más recientes a más antiguos" : " · de más antiguos a más recientes")
      : "";

    const body = document.getElementById("gd-v-body");
    body.innerHTML = filasActuales.length
      ? filasActuales
          .map(
            (f, i) => `
        <tr>
          <td><b>${gdEsc(f.e.descripcion || "")}</b></td>
          <td>${TIPO_ENTIDAD[f.e.tipo] || gdEsc(f.e.tipo || "")}</td>
          <td>${gdEsc(f.tipoNombre)}</td>
          <td>${gdFmtFecha(f.d.fechaHasta)}</td>
          <td style="color:#dc2626;font-weight:600">${f.dias == null ? "-" : f.dias === 1 ? "1 día" : f.dias + " días"}</td>
          <td style="white-space:nowrap">
            <button class="gd-btn" data-act="${i}" style="padding:5px 12px;font-size:.78rem">Actualizar</button>
            <button class="gd-link" data-ver="${i}" style="margin-left:8px">Ver entidad</button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6">${todas.length ? "Sin resultados con estos filtros" : "No hay documentos vencidos. ✔"}</td></tr>`;

    body.querySelectorAll("button[data-act]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const f = filasActuales[+btn.dataset.act];
        const tipo = tiposDocumento.find((x) => x.id === f.d.tipoDocumentoId) || null;
        abrirModalDocumento({
          entidad: f.e,
          entidadId: f.e.id,
          doc: f.d,
          tipo,
          onGuardado: () => window.GD_VIEWS.vencidos(container),
        });
      })
    );
    body.querySelectorAll("button[data-ver]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const f = filasActuales[+btn.dataset.ver];
        if (f.e.tipo === "Seguros") window.gdApp.navegar("seguros");
        else window.gdApp.navegar("entidades", { entidadId: f.e.id });
      })
    );
  }

  // Exporta la lista filtrada (CSV con ";" y BOM, abre directo en Excel).
  document.getElementById("gd-v-exportar").addEventListener("click", () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lineas = [["Entidad", "Tipo", "Documento", "Vencio el", "Dias vencido"].map(esc).join(";")];
    filasActuales.forEach((f) =>
      lineas.push([f.e.descripcion, TIPO_ENTIDAD[f.e.tipo] || f.e.tipo, f.tipoNombre, gdFmtFecha(f.d.fechaHasta), f.dias ?? ""].map(esc).join(";"))
    );
    const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `documentos-vencidos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  container.querySelectorAll(".gd-v-orden").forEach((th) =>
    th.addEventListener("click", () => {
      F.orden = F.orden === "recientes" ? "antiguos" : "recientes";
      ordenar();
      refrescar();
    })
  );

  const campos = { "gd-v-texto": "texto", "gd-v-tipo": "tipo", "gd-v-doc": "doc" };
  Object.entries(campos).forEach(([id, clave]) => {
    const el = document.getElementById(id);
    el.value = F[clave] || "";
    el.addEventListener("input", () => { F[clave] = el.value; refrescar(); });
  });
  if (focoPrevio === "gd-v-texto") {
    const t = document.getElementById("gd-v-texto");
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }

  refrescar();
};

function gdEsc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
