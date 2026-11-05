/* Prueba del interprete de los mails de Shell con el formato real (node shell/test-parser.mjs). */
import assert from 'node:assert/strict';
import { parseMailShell, codigoWH, horaPrimerPunto, ordenWH } from './parser.mjs';

const ENC = ['WH UTE', 'Fecha Requerida', 'Desde', 'Hasta', 'Numero de PO', 'Vendor', 'Direccion ', 'Horario de atenci\u00f3n ', 'Persona de contacto', 'Detalle', 'Cantidad de bultos', 'Peso Aprox', 'Medidas Largo,Ancho, Alto'];
const td = t => '<td style="border:solid windowtext 1.0pt"><p class="MsoNormal">' + t + '</p></td>';
const tabla = filas => '<table class="MsoNormalTable"><tbody><tr>' + ENC.map(e => td('<b>' + e + '</b>')).join('') + '</tr>' + filas.map(f => '<tr>' + f.map(td).join('') + '</tr>').join('') + '</tbody></table>';

/* 1) Recorrido normal: retiro en proveedores, orden de descarga en el texto */
const m1 = '<div class="WordSection1"><p class="MsoNormal">Les comparto el itinerario con listado de las \u00f3rdenes de compra a retirar el d\u00eda de ma\u00f1ana 03/07/2026 debe estar en el primer punto a las 08:00hs. La columna <b>Vendor </b>indica el proveedor. <b>Primer destino: WH BAN</b>, <b>segundo destino: WH: Sierras Blancas</b></p>' +
  tabla([
    ['WH SB', '3/7/2026', 'Vendor', 'WH SB', '4514431043', 'FINNING ARGENTINA SA', 'Salvador bellostas 2065 - Neuquen', '8 a 17 hs de lunes a viernes', 'Adrian', 'Entrega:805911660', '', '', ''],
    ['WH BAN', '3/7/2026', 'Vendor', 'WH BAN', '4514437540', 'FINNING', 'SALVADOR BELLOSTAS 2065- NEUQUEN', '8:00 HASTA 17:00', 'JOAQUIN', 'ENTREGA:805903122', '1', '1 KG', '20X17X20'],
    ['WH SB', '3/7/2026', 'Vendor', 'WH SB', '4514434672', 'SUPPLY', 'General Enrique Mosconi 3286 - Neuquen Capital', 'Lunes a viernes de 8.30 a 17 horas', '299', '1 caja', '1', '2 kg', ''],
    ['WH BAN', '3/7/2026', 'Vendor', 'WH BAN', '4514438414', 'INNOVARTE', 'PERU 420-CENTENARIO', '9:00 HASTA 17:00', 'FERNANDA', '', '1', '10 KG', '30X30X43']
  ]) + '<p>Saludos</p></div>';
const r1 = parseMailShell(m1, '2026-07-02T16:19:43Z', 'Recorrido 02.07.2026');
assert.equal(r1.filas.length, 4);
assert.equal(r1.fecha, '2026-07-03');
assert.equal(r1.hora, '08:00');
assert.deepEqual(r1.ordenWH, ['BAN', 'SB']);
assert.equal(r1.filas[2].vendor, 'SUPPLY');
assert.equal(codigoWH(r1.filas[0].hasta), 'SB');
assert.equal(codigoWH(r1.filas[0].desde), null);

/* 2) Carga en el deposito para llevar al proveedor; la hora viene como "manana 08:30 en el WH SB" */
const m2 = '<div><p class="MsoNormal">les comparto el itinerario para el transporte el d\u00eda de ma\u00f1ana 04.11.2026. Por favor que la unidad se encuentra ma\u00f1ana 08:30 en el WH SB, ya que tenemos material para enviar a inspeccionar a Vendor.</p>' +
  tabla([['WH SB', '4/11/2026', 'WH SB', 'Vendor', 'Material a inspeccionar', 'MAV', ' Sebastian Rodriguez 2090 Allen- RN', ' 07 a 20hs', ' Francisco Curiman', ' 2995107488', '2', ' 200kg', ' 120x120']]) + '</div>';
const r2 = parseMailShell(m2, '2026-11-03T19:38:16Z', 'Recorrido 04.11.2026');
assert.equal(r2.filas.length, 1);
assert.equal(r2.fecha, '2026-11-04');
assert.equal(r2.hora, '08:30');
assert.equal(r2.ordenWH, null);
assert.equal(codigoWH(r2.filas[0].desde), 'SB');

/* 3) RE: con la tabla completa + Faro, y abajo el mail citado (no se tiene que leer dos veces) */
const m3 = '<div><p class="MsoNormal">Por favor sumar al itinerario del d\u00eda, la entrega al vendor Faro.</p>' +
  tabla([['WH SB', '4/11/2026', 'WH SB', 'Vendor', 'Material a inspeccionar', 'MAV', 'Sebastian Rodriguez 2090 Allen- RN', '07 a 20hs', 'F', '2995107488', '2', '', ''],
         ['WH SB', '4/11/2026', 'WH SB', 'Vendor', 'Material a inspeccionar', 'Faro', 'Ruta 151 Km 5 - CP 8324 Cipolletti, Rio Negro', '08 a 17hs', 'M', '2995573077', '1', '', '']]) +
  '<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm"><p class="MsoNormal"><b>De:</b> Martin</p></div><p>confirmo servicio</p>' + m2 + '</div>';
const r3 = parseMailShell(m3, '2026-11-04T13:39:24Z', 'RE: Recorrido 04.11.2026');
assert.equal(r3.filas.length, 2);
assert.equal(r3.filas[1].vendor, 'Faro');
assert.equal(r3.fecha, '2026-11-04');

/* 4) RE: que solo cambia el orden de descarga */
const r4 = parseMailShell('<p>Por favor, considerar el cambio informado el d\u00eda de ayer para la descarga:</p><p>Primer destino: WH Sierras Blancas.</p><p>Segundo destino: WH BAN.</p>', '2026-07-03T11:20:23Z', 'RE: Recorrido 02.07.2026');
assert.equal(r4.filas.length, 0);
assert.deepEqual(r4.ordenWH, ['SB', 'BAN']);
assert.equal(r4.fecha, '2026-07-02'); /* el asunto: el panel lo asocia al viaje por la conversacion */

assert.equal(horaPrimerPunto('debe estar en el primer punto a las 08:00/08:30hs'), '08:00');
assert.equal(horaPrimerPunto('el d\u00eda 04.11.2026 a las 8.30 hs'), '08:30');
assert.deepEqual(ordenWH('Primer destino: WH: Sierras Blancas'), ['SB', 'BAN']);
console.log('OK parser Shell');
