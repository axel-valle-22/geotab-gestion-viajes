/* Proceso automatico (GitHub Actions, lo corre el mismo workflow de los pedidos SLB): lee los mails nuevos de la carpeta
   Shell de Outlook ("Recorrido DD.MM.YYYY" y sus respuestas), los interpreta con parser.mjs y deja cada uno en Firestore
   (coleccion gv_pedidos_shell, estado "pendiente"). El panel arma / actualiza solo el viaje del dia
   (chofer VESCHI TOMAS, unidad C258) con el recorrido optimizado.

   Usa los mismos secretos que SLB (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET) y el buzon SHELL_BUZON (si no esta,
   SLB_BUZON). Opcional: variable SHELL_CARPETA (por defecto "Shell"), SHELL_DIAS (por defecto 3). */
import { parseMailShell } from './parser.mjs';

const FB_PROJECT = 'gestion-de-viajes-f5f65';
const FB_KEY = 'AIzaSyC8e7EGfwvxZkCkmqG59OA2yRTcsAXkamE';
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const COL = 'gv_pedidos_shell';

const env = process.env;
const BUZON = env.SHELL_BUZON || env.SLB_BUZON;
const faltan = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET'].filter(k => !env[k]);
if(faltan.length || !BUZON){ console.log('Pedidos Shell inactivo: faltan secretos ' + faltan.concat(BUZON ? [] : ['SHELL_BUZON/SLB_BUZON']).join(', ') + '.'); process.exit(0); }
const CARPETA = env.SHELL_CARPETA || 'Shell';
const DIAS = parseInt(env.SHELL_DIAS || '3', 10);

async function token(){
  const body = new URLSearchParams({ client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const r = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', body });
  const j = await r.json(); if(!j.access_token) throw new Error('No se pudo obtener token de Microsoft: ' + JSON.stringify(j).slice(0, 300));
  return j.access_token;
}
async function graph(tk, path){
  const r = await fetch('https://graph.microsoft.com/v1.0' + path, { headers: { Authorization: 'Bearer ' + tk, Prefer: 'outlook.body-content-type="html"' } });
  if(!r.ok) throw new Error('Graph ' + r.status + ' ' + path + ': ' + (await r.text()).slice(0, 300));
  return r.json();
}
async function carpetaId(tk){
  const buzon = encodeURIComponent(BUZON);
  const f = encodeURIComponent(`displayName eq '${CARPETA.replace(/'/g, "''")}'`);
  let j = await graph(tk, `/users/${buzon}/mailFolders/inbox/childFolders?$filter=${f}`);
  if(j.value && j.value[0]) return j.value[0].id;
  j = await graph(tk, `/users/${buzon}/mailFolders?$filter=${f}`);
  if(j.value && j.value[0]) return j.value[0].id;
  throw new Error('No se encontro la carpeta "' + CARPETA + '" en el buzon.');
}
function fv(v){
  if(v === null || v === undefined) return { nullValue: null };
  if(typeof v === 'boolean') return { booleanValue: v };
  if(typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if(typeof v === 'string') return { stringValue: v };
  if(Array.isArray(v)) return { arrayValue: { values: v.map(fv) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fv(x)])) } };
}
async function existeDoc(id){ const r = await fetch(`${FS}/${COL}/${id}?key=${FB_KEY}`); return r.status === 200; }
async function crearDoc(id, data){
  const r = await fetch(`${FS}/${COL}?documentId=${id}&key=${FB_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fv(v)])) }) });
  if(r.status === 409) return false;
  if(!r.ok) throw new Error('Firestore ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return true;
}
function idDoc(msgId){ let h = 0; for(const c of msgId){ h = ((h << 5) - h + c.charCodeAt(0)) | 0; } return 's' + Math.abs(h).toString(36) + '_' + msgId.replace(/[^A-Za-z0-9]/g, '').slice(-24); }

const tk = await token();
const fid = await carpetaId(tk);
const desde = new Date(Date.now() - DIAS * 86400000).toISOString();
const buzon = encodeURIComponent(BUZON);
const hoyAR = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
let url = `/users/${buzon}/mailFolders/${fid}/messages?$filter=receivedDateTime ge ${desde}&$orderby=receivedDateTime desc&$top=50&$select=id,subject,receivedDateTime,from,body,conversationId`;
let nuevos = 0, revisados = 0;
while(url){
  const j = await graph(tk, url);
  for(const m of (j.value || [])){
    revisados++;
    const deMail = (m.from && m.from.emailAddress && (m.from.emailAddress.address || '')) || '';
    if(/doloresparra/i.test(deMail)) continue; /* nuestras confirmaciones */
    const id = idDoc(m.id);
    if(await existeDoc(id)) continue;
    let r;
    try{ r = parseMailShell(m.body && m.body.content, m.receivedDateTime, m.subject || ''); }catch(e){ console.log('No se pudo leer', m.subject, e.message); continue; }
    if(!r.filas.length && !r.ordenWH) continue;
    /* solo servicios de hoy en adelante; un mail que solo cambia el orden se guarda igual (el panel lo asocia por la conversacion) */
    if(r.filas.length && r.fecha && r.fecha < hoyAR) continue;
    const ok = await crearDoc(id, {
      estado: 'pendiente', mailId: m.id, asunto: m.subject || '', recibido: m.receivedDateTime,
      de: (m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || '',
      fecha: r.fecha || null, hora: r.hora || null, ordenWH: r.ordenWH || null, filas: r.filas, texto: r.texto || '',
      conversacion: m.conversationId || '', creadoEn: new Date().toISOString()
    });
    if(ok){ nuevos++; console.log('Pedido Shell nuevo:', m.subject, '-', r.filas.length, 'filas', r.ordenWH ? ('orden ' + r.ordenWH.join('>')) : ''); }
  }
  url = j['@odata.nextLink'] ? j['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
}
console.log(`Revisados ${revisados} mails de la carpeta ${CARPETA}; pedidos Shell nuevos: ${nuevos}.`);
