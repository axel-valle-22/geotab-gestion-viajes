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
console.log(ok ? 'TEST OK' : 'TEST FALLO'); process.exit(ok ? 0 : 1);
