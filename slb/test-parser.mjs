import { parseMailSLB } from './parser.mjs';
const H = (c)=>`<td style="border:1px solid">${c}</td>`;
const filas = [
 ['PB63485','RPI-WL','20-Oct','8:00','Gunshop WL Base<br>Operativa A&ntilde;elo','LCav / LCav174_2 / YPF','Semi<br>c/Barandas','Dolores<br>Parra','Rental','Tevez Cesar<br>Federico','AF576JA'],
 ['PB63486','RPI-WL','20-Oct','11:00','LCav / LCav174_2 /<br>YPF','Gunshop WL Base<br>Operativa Añelo','Semi c/Barandas','Dolores Parra','Rental','Tevez Cesar Federico','AF576JA'],
 ['PB63493','RPI-WL','20-Oct','8:00','Gunshop WL Base Operativa Añelo','LCav / LCav174_2 / YPF','Chasis c/Hidro','Dolores Parra','Rental','Gramajo Alejandro','AG791PX'],
 ['PB63494','RPI-WL','20-Oct','10:00','LCav / LCav174_2 / YPF','Añelo - Base','Chasis c/Hidro','Dolores Parra','Rental','Gramajo Alejandro','AG791PX'],
 ['PB63495','RPI-WL','20-Oct','16:00','Gunshop WL Base Operativa Añelo','BPO / PAD100 / Vista','Chasis c/Hidro','Dolores Parra','Rental','Gramajo Alejandro','AG791PX'],
 ['PB63496','RPI-WL','20-Oct','18:00','BPO / PAD100 / Vista','Añelo - Base','Chasis c/Hidro','Dolores Parra','Rental','Gramajo Alejandro','AG791PX'],
 ['PB63499','RPI-WL','20-Oct','09:00','X','Y','Semi','Otro Proveedor SA','Rental','Juan Perez','AA000AA'],
];
const html = `<p>Estimados, confirmamos el servicio de transporte solicitado:</p><table><tr><th>CVU</th><th>BL</th><th>Fecha</th><th>Hora<br>Carga</th><th>Origen</th><th>Destino</th><th>Tipo Unidad</th><th>Proveedor</th><th>Contrato</th><th>Chofer</th><th>Patente</th></tr>${filas.map(f=>'<tr>'+f.map(H).join('')+'</tr>').join('')}</table>
<ul><li><span>AF576JA</span> 8hs rao - ypf Lcav 174 - rao // <a>TR2600591149</a></li><ul><li>AG791PX&nbsp; 8hs Rao - ypf Lcav 174- Rao // 16hs Rao - vista pad 100- Rao. <i>TR2600591148</i></li></ul></ul><p>Saludos,<br>Pablo</p>`;
const r = parseMailSLB(html, '2026-10-19T22:10:00Z');
console.log(JSON.stringify(r, null, 1));
const ok = r.filas.length === 6 && r.trs.AF576JA === 'TR2600591149' && r.trs.AG791PX === 'TR2600591148' && r.filas[0].fecha === '2026-10-20' && r.filas[1].hora === '11:00' && r.filas[0].origen.includes('Añelo');
/* 20/10: formatos reales (datos inventados) */
const T = (enc, filas) => '<table><tr>' + enc.map(c => '<td>' + c + '</td>').join('') + '</tr>' + filas.map(f => '<tr>' + f.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table>';
const ENC = ['CVU','Segmento','Fecha','Hora Carga','Origen','Destino','Tipo Unidad','Proveedor','Contrato','Chofer','Patente','GV','TR','SH','Detalle de carga'];
const viejo = T(ENC, [['VG1','WCE','20/10/26','8:00','Solalique / Base Neuquén','BPO / HP217 / Vista','Semi','Dolores Parra','Rental','Perez Juan','AA111AA','','TR2600000001','SH_1','x']]);
const nuevoT = T(ENC, [
  ['VG1','WCE','20/10/26','8:00','Solalique / Base Neuquén','BPO / HP217 / Vista','Semi','Dolores Parra','Rental','Perez Juan','AB222BB','339','TR2600000001','SH_1','x'],
  ['VG2','WCE','20/10/26','8:00','Solalique / Base Neuquén','MMO / HP234 / Phoenix','Semi','Dolores Parra','Rental','Perez Juan','AB222BB','339','TR2600000002','SH_2','y'],
  ['VG3','WCE','21/10/26','8:00','APO / DLS165 / PAE','Solalique / Base Neuquén','Semi','Dolores Parra','Rental','Perez Juan','AB222BB','','TR2600000003','SH_3','z']]);
const cita = '<hr><div id="divRplyFwdMsg"><b>From:</b> Alguien</div>' + viejo;
const r2 = parseMailSLB('<p>Confirmamos:</p>' + nuevoT + cita, '2026-10-20T12:00:00Z');
const ok2 = r2.filas.length === 3 && r2.filas.every(f => f.patente === 'AB222BB') && r2.trs.AB222BB === 'TR2600000001' && r2.filas[2].fecha === '2026-10-21' && r2.filas[1].gv === '339' && r2.filas[1].sh === 'SH_2' && r2.filas[0].bl === 'WCE';
const r3 = parseMailSLB('<div>Recorrido: Base Solalique &gt;&gt; H&amp;P 234 &gt;&gt; H&amp;P 217 &gt;&gt; DLS 165 &gt;&gt; Base Solalique</div>' + '<hr><div id="divRplyFwdMsg"><b>De:</b> x</div>' + nuevoT, '2026-10-20T13:00:00Z');
const ok3 = r3.actualizacion === true && r3.filas.length === 3 && JSON.stringify(r3.recorrido) === JSON.stringify(['Base Solalique','H&P 234','H&P 217','DLS 165','Base Solalique']);
const ENC2 = ['CVU','BL','Fecha','Hora Carga','Origen','Destino','Tipo Unidad','Proveedor','Contrato','Chofer','Patente','Telefono','GIN','TR','SH','Detalle Carga','Observaciones'];
const r4 = parseMailSLB(T(ENC2, [['PB1','RPS','10/20/2026','8:00','BDT / BDTN-49 / YPF','LCav / LCav174_2 / YPF','Carreton','Dolores Parra','Rental','Gomez Ana','AC333CC','299','190','TR2600000009','DTM','obs1','obs2'],['PB2','RPS','10/20/2026','14:00','BDT / BDTN-49 / YPF','LCav / LCav174_2 / YPF','Carreton','Dolores Parra','Rental','Gomez Ana','AC333CC','299','190','n/a','DTM','obs1','obs2']]), '2026-10-20T10:00:00Z');
const ok4 = r4.filas.length === 2 && r4.filas[0].fecha === '2026-10-20' && r4.filas[1].tr === '' && r4.trs.AC333CC === 'TR2600000009' && r4.filas[0].telefono === '299';
console.log('cita/columnas:', ok2, '| recorrido:', ok3, '| fecha EEUU:', ok4);
const r5 = parseMailSLB('<div>Buenas tardes, se cancela el CVU VG2 por pedido del cliente.</div>' + nuevoT.replace(/VG2/g, 'VG2'), '2026-10-20T14:00:00Z');
const r5b = parseMailSLB('<div>Se cancela el servicio AL62643.</div>' + T(ENC, [['AL62643','WCM','20/10/26','15:00','Solalique','HP224','Semi','Dolores Parra','Rental','X','AG004TC','','TR2600000005','',''],['AL62644','WCM','20/10/26','17:00','Solalique','HP217','Semi','Dolores Parra','Rental','Y','AE939LY','','TR2600000006','','']]), '2026-10-20T14:00:00Z');
const ok5 = r5b.cancelados.includes('AL62643') && r5b.filas.length === 1 && r5b.filas[0].cvu === 'AL62644';
console.log('cancelacion:', ok5);
const todo = ok && ok2 && ok3 && ok4 && ok5;
console.log(todo ? 'TEST OK' : 'TEST FALLO'); process.exit(todo ? 0 : 1);
