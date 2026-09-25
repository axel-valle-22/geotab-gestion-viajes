window.GD_VIEWS = window.GD_VIEWS || {};

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

window.GD_VIEWS.reportes = async function render(container) {
  container.innerHTML = `<h2>Reportes</h2><p>Cargando…</p>`;
  const [reportes, tiposDocumento] = await Promise.all([GD.listarReportes(), GD.listarTiposDocumento()]);

  // Nombres de documentos (sin repetir) de vehículos, acoplados y choferes, para el filtro.
  const nombresDocs = [...new Set(tiposDocumento.filter((t) => t.tipoEntidad !== "Seguros" && t.activo !== false).map((t) => t.nombre))]
    .sort((a, b) => a.localeCompare(b, "es"));

  container.innerHTML = `
    <h2>Reportes</h2>

    <h3>Exportar vencimientos a Excel</h3>
    <p class="gd-hint">Elegí qué documento y qué situación querés ver (por ejemplo, las VTV vencidas o por vencer), revisá la vista previa y descargá el Excel.</p>
    <div class="gd-filtros">
      <select id="gd-v-doc">
        <option value="">Todos los documentos</option>
        <option value="__vtv">VTV (Nacional y Provincial)</option>
        ${nombresDocs.map((n) => `<option value="${n}">${n}</option>`).join("")}
      </select>
      <select id="gd-v-estado">
        <option value="alerta" selected>Vencidos y por vencer</option>
        <option value="vencido">Solo vencidos</option>
        <option value="porvencer">Solo por vencer</option>
        <option value="todos">Todos (con fecha de vencimiento)</option>
      </select>
      <select id="gd-v-dias" title="Qué se considera 'por vencer'">
        <option value="preaviso" selected>Por vencer: según días de preaviso de cada documento</option>
        <option value="15">Por vencer: próximos 15 días</option>
        <option value="30">Por vencer: próximos 30 días</option>
        <option value="60">Por vencer: próximos 60 días</option>
        <option value="90">Por vencer: próximos 90 días</option>
      </select>
      <select id="gd-v-tipo">
        <option value="">Todas las entidades</option>
        <option value="Vehiculo">Vehículos</option>
        <option value="AnexoVehicular">Acoplados / anexos</option>
        <option value="Operador">Choferes</option>
      </select>
      <button type="button" class="gd-btn" id="gd-v-exportar">Exportar a Excel</button>
    </div>
    <p class="gd-hint" id="gd-v-resumen">Calculando…</p>
    <div style="max-height:360px;overflow:auto;margin-bottom:28px">
      <table class="gd-tabla">
        <thead><tr><th>Entidad</th><th>Tipo</th><th>Documento</th><th>Vence</th><th>Días</th><th>Estado</th></tr></thead>
        <tbody id="gd-v-body"></tbody>
      </table>
    </div>

    <h3>Reportes programados por mail</h3>
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

  // ── Vencimientos: vista previa + exportación ─────────────────────────────
  const MS_DIA = 24 * 60 * 60 * 1000;
  const nombreDe = (d) => d.tipoDocumentoNombre || (tiposDocumento.find((t) => t.id === d.tipoDocumentoId) || {}).nombre || "";
  const fmt = (dia) => (dia ? dia.toLocaleDateString("es-AR") : "");
  let filasVenc = [];

  async function calcularVencimientos() {
    const fDoc = document.getElementById("gd-v-doc").value;
    const fEstado = document.getElementById("gd-v-estado").value;
    const fDias = document.getElementById("gd-v-dias").value;
    const fTipo = document.getElementById("gd-v-tipo").value;
    const hoy = new Date();
    const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();

    const entidades = await GD.listarEntidades({ tipo: fTipo || null });
    const filas = [];
    for (const e of entidades) {
      for (const d of await GD.listarDocumentosDeEntidad(e.id)) {
        if (d.sinVencimiento || !d.fechaHasta) continue;
        const nombre = nombreDe(d);
        if (fDoc === "__vtv" && !/vtv/i.test(nombre)) continue;
        if (fDoc && fDoc !== "__vtv" && nombre !== fDoc) continue;
        const dia = gdFechaDeTs(d.fechaHasta);
        if (!dia) continue;
        const venc0 = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).getTime();
        const dias = Math.round((venc0 - hoy0) / MS_DIA); // negativo = vencido hace N días
        const vencido = dias < 0;
        const ventana = fDias === "preaviso" ? (Number.isFinite(d.diasPreaviso) ? d.diasPreaviso : 30) : Number(fDias);
        const porVencer = !vencido && dias <= ventana;
        if (fEstado === "vencido" && !vencido) continue;
        if (fEstado === "porvencer" && !porVencer) continue;
        if (fEstado === "alerta" && !vencido && !porVencer) continue;
        filas.push({
          entidad: e.descripcion,
          tipo: e.tipo,
          documento: nombre,
          desde: fmt(gdFechaDeTs(d.fechaDesde)),
          vence: fmt(dia),
          dias,
          estado: vencido ? "Vencido" : porVencer ? "Por vencer" : "Vigente",
          archivo: (d.archivos || []).length ? "Sí" : "No",
          observaciones: d.observaciones || "",
        });
      }
    }
    filas.sort((a, b) => a.dias - b.dias || a.entidad.localeCompare(b.entidad, "es", { numeric: true }));
    filasVenc = filas;

    const nVenc = filas.filter((f) => f.estado === "Vencido").length;
    const nPorV = filas.filter((f) => f.estado === "Por vencer").length;
    document.getElementById("gd-v-resumen").textContent =
      `${filas.length} documento(s) · ${nVenc} vencido(s) · ${nPorV} por vencer`;
    const color = { Vencido: "#dc2626", "Por vencer": "#d97706", Vigente: "#16a34a" };
    document.getElementById("gd-v-body").innerHTML = filas.length
      ? filas
          .map(
            (f) => `<tr><td>${f.entidad}</td><td>${f.tipo}</td><td>${f.documento}</td><td>${f.vence}</td>
              <td>${f.dias < 0 ? `hace ${-f.dias}` : f.dias === 0 ? "hoy" : `en ${f.dias}`}</td>
              <td style="color:${color[f.estado]};font-weight:600">${f.estado}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="6">No hay documentos con esos filtros.</td></tr>`;
  }

  // Los filtros se recuerdan aunque la pantalla se redibuje sola por un cambio de datos.
  const FV = (window.__gdFiltrosVenc = window.__gdFiltrosVenc || {});
  ["gd-v-doc", "gd-v-estado", "gd-v-dias", "gd-v-tipo"].forEach((id) => {
    const el = document.getElementById(id);
    if (FV[id] !== undefined) el.value = FV[id];
    el.addEventListener("input", () => { FV[id] = el.value; calcularVencimientos(); });
  });

  // CSV separado por ";" y con BOM: abre directo en Excel respetando acentos.
  document.getElementById("gd-v-exportar").addEventListener("click", () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lineas = [
      ["Entidad", "Tipo", "Documento", "Vigente desde", "Vence", "Días para vencer (negativo = vencido)", "Estado", "Tiene archivo", "Observaciones"].map(esc).join(";"),
      ...filasVenc.map((f) => [f.entidad, f.tipo, f.documento, f.desde, f.vence, f.dias, f.estado, f.archivo, f.observaciones].map(esc).join(";")),
    ];
    const blob = new Blob(["\ufeff" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const docSel = document.getElementById("gd-v-doc");
    const etiqueta = (docSel.value ? docSel.options[docSel.selectedIndex].text : "todos").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    a.href = URL.createObjectURL(blob);
    a.download = `vencimientos-${etiqueta}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  calcularVencimientos();

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
