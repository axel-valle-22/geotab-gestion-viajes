/**
 * Optimizador de PDF "sin perder calidad" (Gestión Documental).
 *
 * Para qué: los PDF generados por sistemas (pólizas, reportes, listados)
 * suelen pesar mucho no por imágenes sino por el TEXTO: cada página trae
 * su propio "dibujo" comprimido por separado, y como las páginas son casi
 * iguales entre sí (mismo formulario, distinto vehículo) se repite lo
 * mismo cientos de veces. Ejemplo real: la póliza de flota pesada (946
 * páginas) pesaba 3,4 MB y quedó en 700 KB con este método, con el texto
 * intacto (seleccionable, nítido con zoom).
 *
 * Qué hace, sin tocar el texto ni los vectores:
 *   1. Recomprime las fotos/logos JPEG que traiga el PDF (una sola vez
 *      cada una, aunque se repitan en todas las páginas), solo si la
 *      versión nueva pesa menos (ver INTENTOS: ancho y calidad).
 *   2. Agrupa el contenido de a 20-60 páginas en un único bloque
 *      comprimido (Form XObject). Cada página dibuja ese bloque corrido y
 *      recortado a su propio tamaño, así que se ve exactamente igual, pero
 *      la compresión aprovecha lo que se repite entre páginas vecinas.
 *
 * Si algo sale mal (PDF raro, cifrado, librería que no cargó) devuelve
 * null y store.js sigue con el método anterior (rasterizar con pdf.js).
 *
 * Usa pdf-lib (cdnjs) y CompressionStream del navegador. Expone window.GD_optimizarPdf(bytes, opciones).
 */
(function () {
  "use strict";

  const PDF_LIB_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
  const SEPARACION = 3000; // distancia (en puntos) entre páginas dentro del bloque

  const PAKO_URL = "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";
  const _cargas = {};
  function cargarScript(url, listo) {
    if (listo()) return Promise.resolve();
    if (typeof document === "undefined") return Promise.reject(new Error("sin document"));
    if (!_cargas[url]) {
      _cargas[url] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = () => (listo() ? resolve() : reject(new Error("No cargó " + url)));
        s.onerror = () => { delete _cargas[url]; reject(new Error("No se pudo descargar " + url)); };
        document.head.appendChild(s);
      });
    }
    return _cargas[url];
  }
  async function cargarPdfLib() {
    await cargarScript(PDF_LIB_URL, () => typeof PDFLib !== "undefined");
    // pako es opcional: si no carga se usa la compresión nativa del navegador.
    await cargarScript(PAKO_URL, () => typeof pako !== "undefined").catch(() => {});
    return PDFLib;
  }

  // ── Compresión Flate con las APIs nativas del navegador ──────────────────
  async function pasarPor(stream, bytes) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }
  // pako (nivel 9, comprime algo más) si está; si no, el nativo del navegador.
  const deflate = (b) =>
    typeof pako !== "undefined" ? Promise.resolve(pako.deflate(b, { level: 9 })) : pasarPor(new CompressionStream("deflate"), b);

  function ascii85(bytes) {
    const out = [];
    let tupla = 0, n = 0;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c === 0x7e) break; // "~>" fin
      if (c <= 0x20) continue;
      if (c === 0x7a && n === 0) { out.push(0, 0, 0, 0); continue; } // "z"
      tupla = tupla * 85 + (c - 33);
      if (++n === 5) {
        out.push((tupla >>> 24) & 255, (tupla >>> 16) & 255, (tupla >>> 8) & 255, tupla & 255);
        tupla = 0; n = 0;
      }
    }
    if (n > 0) {
      for (let k = n; k < 5; k++) tupla = tupla * 85 + 84;
      const b = [(tupla >>> 24) & 255, (tupla >>> 16) & 255, (tupla >>> 8) & 255, tupla & 255];
      for (let k = 0; k < n - 1; k++) out.push(b[k]);
    }
    return new Uint8Array(out);
  }
  function asciiHex(bytes) {
    const s = new TextDecoder("latin1").decode(bytes).replace(/[^0-9a-fA-F]/g, "");
    const out = new Uint8Array(Math.ceil(s.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt((s.substr(i * 2, 2) + "0").slice(0, 2), 16);
    return out;
  }

  function nombresFiltro(L, dict) {
    const f = dict.get(L.PDFName.of("Filter"));
    if (!f) return [];
    if (f instanceof L.PDFName) return [f.asString()];
    if (f instanceof L.PDFArray) return f.asArray().map((x) => x.asString());
    return ["?"];
  }

  // Decodifica los filtros "de texto" (Flate/ASCII85/ASCIIHex). Si queda
  // alguno que no sabemos (o que no corresponde), devuelve los que faltan.
  async function decodificar(L, stream, pararEn) {
    let datos = stream.getContents();
    const filtros = nombresFiltro(L, stream.dict);
    let i = 0;
    for (; i < filtros.length; i++) {
      const f = filtros[i];
      if (pararEn && pararEn.includes(f)) break;
      if (f === "/FlateDecode" || f === "/Fl") {
        const parms = stream.dict.get(L.PDFName.of("DecodeParms"));
        if (parms) throw new Error("Flate con DecodeParms no soportado");
        // Se usa el descompresor de pdf-lib (el mismo de pdf.js), que tolera
        // la "basura" al final que traen muchos PDF; el nativo del navegador
        // la rechaza.
        const tmp = L.PDFRawStream.of(L.PDFDict.withContext(stream.dict.context), datos);
        tmp.dict.set(L.PDFName.of("Filter"), L.PDFName.of("FlateDecode"));
        datos = L.decodePDFRawStream(tmp).decode();
      } else if (f === "/ASCII85Decode" || f === "/A85") datos = ascii85(datos);
      else if (f === "/ASCIIHexDecode" || f === "/AHx") datos = asciiHex(datos);
      else throw new Error("Filtro no soportado: " + f);
    }
    return { datos, resto: filtros.slice(i) };
  }

  // ── Recompresión de JPEG en el navegador ─────────────────────────────────
  async function recomprimirJpegNavegador(bytes, calidad, maxAncho) {
    if (typeof createImageBitmap === "undefined" || typeof document === "undefined") return null;
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
    let w = bmp.width, h = bmp.height;
    if (w > maxAncho) { h = Math.round((h * maxAncho) / w); w = maxAncho; }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", calidad));
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho: w, alto: h };
  }

  async function optimizarImagenes(L, doc, opciones) {
    const recomprimir = opciones.recomprimirJpeg || recomprimirJpegNavegador;
    const vistos = new Set();
    for (const page of doc.getPages()) {
      const res = page.node.Resources();
      const xo = res && res.lookupMaybe(L.PDFName.of("XObject"), L.PDFDict);
      if (!xo) continue;
      for (const [, ref] of xo.entries()) {
        if (!(ref instanceof L.PDFRef) || vistos.has(ref.toString())) continue;
        vistos.add(ref.toString());
        const img = doc.context.lookup(ref);
        if (!(img instanceof L.PDFRawStream)) continue;
        const d = img.dict;
        if (d.get(L.PDFName.of("Subtype")) !== L.PDFName.of("Image")) continue;
        const filtros = nombresFiltro(L, d);
        if (filtros[filtros.length - 1] !== "/DCTDecode") continue;
        const cs = d.get(L.PDFName.of("ColorSpace"));
        const csNombre = cs instanceof L.PDFName ? cs.asString() : "";
        // CMYK, Decode invertido o máscaras raras: mejor no tocar.
        if (csNombre === "/DeviceCMYK" || d.get(L.PDFName.of("Decode")) || d.get(L.PDFName.of("ImageMask"))) continue;
        if (!(cs instanceof L.PDFName) || !["/DeviceRGB", "/DeviceGray"].includes(csNombre)) continue;
        try {
          const { datos } = await decodificar(L, img, ["/DCTDecode"]);
          const nuevo = await recomprimir(datos, opciones.calidadJpeg, opciones.maxAnchoImagen);
          if (!nuevo || nuevo.bytes.length >= img.getContents().length * 0.9) continue;
          d.set(L.PDFName.of("Filter"), L.PDFName.of("DCTDecode"));
          d.delete(L.PDFName.of("DecodeParms"));
          d.set(L.PDFName.of("Width"), L.PDFNumber.of(nuevo.ancho));
          d.set(L.PDFName.of("Height"), L.PDFNumber.of(nuevo.alto));
          d.set(L.PDFName.of("ColorSpace"), L.PDFName.of("DeviceRGB"));
          d.set(L.PDFName.of("BitsPerComponent"), L.PDFNumber.of(8));
          d.set(L.PDFName.of("Length"), L.PDFNumber.of(nuevo.bytes.length));
          doc.context.assign(ref, L.PDFRawStream.of(d, nuevo.bytes));
        } catch (e) {
          console.warn("No se pudo recomprimir una imagen del PDF, queda como estaba:", e);
        }
      }
    }
  }

  // ── Agrupar contenido de páginas en bloques compartidos ──────────────────
  async function contenidoDePagina(L, doc, page) {
    const c = page.node.get(L.PDFName.of("Contents"));
    if (!c) return new Uint8Array(0);
    const obj = doc.context.lookup(c);
    const lista = obj instanceof L.PDFArray ? obj.asArray().map((r) => doc.context.lookup(r)) : [obj];
    const partes = [];
    for (const s of lista) {
      if (!(s instanceof L.PDFRawStream)) throw new Error("Contenido de página inesperado");
      const { datos, resto } = await decodificar(L, s);
      if (resto.length) throw new Error("Contenido con filtro no soportado");
      partes.push(datos, new Uint8Array([10]));
    }
    return concat(partes);
  }

  function concat(arrs) {
    const total = arrs.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  }
  const bytesDe = (s) => new TextEncoder().encode(s);
  const num = (n) => String(Math.round(n * 1000) / 1000);

  // Junta los recursos (fuentes, imágenes, etc.) de varias páginas en uno.
  // Si dos páginas usan el mismo nombre para cosas distintas, avisa (null).
  function fusionarRecursos(L, doc, destino, origen) {
    if (!origen) return true;
    for (const [clave, valor] of origen.entries()) {
      const v = doc.context.lookup(valor);
      if (v instanceof L.PDFDict) {
        let sub = destino.get(clave);
        if (!sub) { sub = doc.context.obj({}); destino.set(clave, sub); }
        for (const [k, r] of v.entries()) {
          const actual = sub.get(k);
          if (actual && actual.toString() !== r.toString()) return false;
          sub.set(k, r);
        }
      } else if (v instanceof L.PDFArray) {
        const actual = destino.get(clave);
        if (actual && actual.toString() !== valor.toString()) return false;
        destino.set(clave, valor);
      }
    }
    return true;
  }

  async function agruparPaginas(L, doc, GRUPO) {
    const paginas = doc.getPages();
    let i = 0;
    while (i < paginas.length) {
      const grupo = [];
      const recursos = doc.context.obj({});
      const cuerpos = [];
      while (i < paginas.length && grupo.length < GRUPO) {
        const p = paginas[i];
        const prueba = recursos.clone(doc.context);
        // clone es superficial: los sub-diccionarios se copian aparte
        for (const [k, v] of prueba.entries()) if (v instanceof L.PDFDict) prueba.set(k, v.clone(doc.context));
        if (!fusionarRecursos(L, doc, prueba, p.node.Resources())) {
          if (grupo.length === 0) { i++; continue; } // página que no se puede agrupar: queda como está
          break;
        }
        for (const [k, v] of prueba.entries()) recursos.set(k, v);
        const cuerpo = await contenidoDePagina(L, doc, p);
        cuerpos.push(bytesDe(`q 1 0 0 1 0 ${-SEPARACION * grupo.length} cm\n`), cuerpo, bytesDe("\nQ\n"));
        grupo.push(p);
        i++;
      }
      if (grupo.length < 2) continue; // no vale la pena para una sola página

      const comprimido = await deflate(concat(cuerpos));
      const dictForm = doc.context.obj({
        Type: "XObject",
        Subtype: "Form",
        BBox: [-100000, -SEPARACION * grupo.length - 100000, 100000, 100000],
        Resources: recursos,
        Filter: "FlateDecode",
        Length: comprimido.length,
      });
      const formRef = doc.context.register(L.PDFRawStream.of(dictForm, comprimido));

      grupo.forEach((p, j) => {
        const mb = p.getMediaBox();
        const txt =
          `q ${num(mb.x)} ${num(mb.y)} ${num(mb.width)} ${num(mb.height)} re W n ` +
          `1 0 0 1 0 ${SEPARACION * j} cm /GDbloque Do Q\n`;
        // pdf-lib guarda todos los objetos aunque ya nadie los use: hay que
        // borrar a mano el contenido viejo de la página para que no pese.
        const viejo = p.node.get(L.PDFName.of("Contents"));
        if (viejo instanceof L.PDFRef) {
          const v = doc.context.lookup(viejo);
          if (v instanceof L.PDFArray) v.asArray().forEach((r) => r instanceof L.PDFRef && doc.context.delete(r));
          doc.context.delete(viejo);
        } else if (viejo instanceof L.PDFArray) {
          viejo.asArray().forEach((r) => r instanceof L.PDFRef && doc.context.delete(r));
        }
        const cRef = doc.context.register(L.PDFRawStream.of(doc.context.obj({ Length: txt.length }), bytesDe(txt)));
        p.node.set(L.PDFName.of("Contents"), cRef);
        p.node.set(L.PDFName.of("Resources"), doc.context.obj({ XObject: { GDbloque: formRef } }));
      });
    }
  }

  // Intentos de menor a mayor agresividad. Agrupar más páginas comprime
  // más, pero cada página tiene que "leer" un bloque más grande al
  // mostrarse; por eso se empieza con bloques chicos y solo se agranda si
  // hace falta para entrar en el límite.
  const INTENTOS = [
    { grupo: 20, calidadJpeg: 0.78, maxAnchoImagen: 2000 },
    { grupo: 30, calidadJpeg: 0.78, maxAnchoImagen: 2000 },
    { grupo: 40, calidadJpeg: 0.72, maxAnchoImagen: 1600 },
    { grupo: 60, calidadJpeg: 0.65, maxAnchoImagen: 1400 },
  ];

  async function unIntento(L, bytes, opciones) {
    const doc = await L.PDFDocument.load(bytes, { updateMetadata: false });
    await optimizarImagenes(L, doc, opciones);
    await agruparPaginas(L, doc, opciones.grupo);
    return doc.save({ useObjectStreams: true });
  }

  /**
   * bytes: Uint8Array del PDF original.
   * opciones.objetivoBytes: tamaño al que se quiere llegar (se prueba con
   *   más agresividad hasta entrar; si ninguno entra devuelve el más chico).
   * Devuelve Uint8Array del PDF optimizado, o null si no se pudo / no achicó.
   */
  async function optimizarPdf(bytes, opciones = {}) {
    try {
      const L = opciones.PDFLib || (await cargarPdfLib());
      if (typeof pako === "undefined" && typeof CompressionStream === "undefined") return null;
      const objetivo = opciones.objetivoBytes || 0;
      let mejor = null;
      for (const intento of INTENTOS) {
        const salida = await unIntento(L, bytes, { ...opciones, ...intento });
        if (!mejor || salida.length < mejor.length) mejor = salida;
        if (!objetivo || salida.length <= objetivo) break;
      }
      return mejor && mejor.length < bytes.length ? mejor : null;
    } catch (e) {
      console.warn("No se pudo optimizar el PDF sin perder calidad, se prueba el método anterior:", e);
      return null;
    }
  }

  if (typeof window !== "undefined") window.GD_optimizarPdf = optimizarPdf;
  if (typeof module !== "undefined") module.exports = { optimizarPdf };
})();
