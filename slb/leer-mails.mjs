/* Proceso automatico (GitHub Actions): lee los mails nuevos de la carpeta SLB de Outlook, interpreta las
   confirmaciones de servicio con parser.mjs y deja cada pedido como BORRADOR en Firestore
   (coleccion gv_pedidos_slb). No crea viajes: los viajes se arman y se confirman desde el panel
   (boton "Pedidos SLB").

   Necesita estos secretos del repositorio (Settings > Secrets and variables > Actions):
     MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  -> app registrada en Microsoft Entra con permiso
                                                      de aplicacion Mail.Read (idealmente limitado
                                                      a este buzon con una Application Access Policy)
     SLB_BUZON                                      -> buzon a leer (ej. avalle@doloresparra.com.ar)
   Opcional: SLB_CARPETA (por defecto "SLB", subcarpeta de la Bandeja de entrada), SLB_DIAS (dias hacia
   atras a revisar, por defecto 3). Si falta algun secreto obligatorio, el proceso termina sin hacer nada. */
import { parseMailSLB } from './parser.mjs';

const FB_PROJECT = 'gestion-de-viajes-f5f65';
const FB_KEY = 'AIzaSyC8e7EGfwvxZkCkmqG59OA2yRTcsAXkamE';
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

const env = process.env;
const faltan = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SLB_BUZON'].filter(k => !env[k]);
if(faltan.length){ console.log('Proceso de pedidos SLB inactivo: faltan los secretos ' + faltan.join(', ') + '.'); process.exit(0); }
const CARPETA = env.SLB_CARPETA || 'SLB';
const DIAS = parseInt(env.SLB_DIAS || '3', 10);

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
  const buzon = encodeURIComponent(env.SLB_BUZON);
  const f = encodeURIComponent(`displayName eq '${CARPETA.replace(/'/g, "''")}'`);
  let j = await graph(tk, `/users/${buzon}/mailFolders/inbox/childFolders?$filter=${f}`);
  if(j.value && j.value[0]) return j.value[0].id;
  j = await graph(tk, `/users/${buzon}/mailFolders?$filter=${f}`);
  if(j.value && j.value[0]) return j.value[0].id;
  throw new Error('No se encontro la carpeta "' + CARPETA + '" en el buzon.');
}
/* Firestore REST: valor JS -> formato de Firestore */
function fv(v){
  if(v === null || v === undefined) return { nullValue: null };
  if(typeof v === 'boolean') return { booleanValue: v };
  if(typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if(typeof v === 'string') return { stringValue: v };
  if(Array.isArray(v)) return { arrayValue: { values: v.map(fv) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fv(x)])) } };
}
async function existeDoc(id){
  const r = await fetch(`${FS}/gv_pedidos_slb/${id}?key=${FB_KEY}`);
  return r.status === 200;
}
async function crearDoc(id, data){
  const r = await fetch(`${FS}/gv_pedidos_slb?documentId=${id}&key=${FB_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fv(v)])) }) });
  if(r.status === 409) return false;
  if(!r.ok) throw new Error('Firestore ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return true;
}
function idDoc(msgId){ let h = 0; for(const c of msgId){ h = ((h << 5) - h + c.charCodeAt(0)) | 0; } return 'm' + Math.abs(h).toString(36) + '_' + msgId.replace(/[^A-Za-z0-9]/g, '').slice(-24); }

const tk = await token();
const fid = await carpetaId(tk);
const desde = new Date(Date.now() - DIAS * 86400000).toISOString();
const buzon = encodeURIComponent(env.SLB_BUZON);
let url = `/users/${buzon}/mailFolders/${fid}/messages?$filter=receivedDateTime ge ${desde}&$orderby=receivedDateTime desc&$top=50&$select=id,subject,receivedDateTime,from,body,conversationId`;
let nuevos = 0, revisados = 0;
while(url){
  const j = await graph(tk, url);
  for(const m of (j.value || [])){
    revisados++;
    const id = idDoc(m.id);
    if(await existeDoc(id)) continue;
    const r = parseMailSLB(m.body && m.body.content, m.receivedDateTime);
    if(!r.filas.length) continue;
    const ok = await crearDoc(id, {
      estado: 'pendiente', mailId: m.id, asunto: m.subject || '', recibido: m.receivedDateTime,
      de: (m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || '',
      filas: r.filas, trs: r.trs, creadoEn: new Date().toISOString()
    });
    if(ok){ nuevos++; console.log('Pedido nuevo:', m.subject, '-', r.filas.length, 'filas'); }
  }
  url = j['@odata.nextLink'] ? j['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
}
console.log(`Revisados ${revisados} mails de la carpeta ${CARPETA}; pedidos nuevos: ${nuevos}.`);
