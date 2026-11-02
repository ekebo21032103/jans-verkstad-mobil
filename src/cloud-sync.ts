import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {bindSyncOwner,getSeen,getSyncSnapshot,receiveRemote,seedPending,uploadedPending,type Item,type Pending,type RemoteRow} from './local-api';

const CONFIG='jans-verkstad-supabase-v1';
export type CloudConfig={url:string;key:string};
let client:SupabaseClient|null=null;
let running:Promise<string>|null=null;
export function readCloudConfig():CloudConfig|null{
 try{const raw=localStorage.getItem(CONFIG);return raw?JSON.parse(raw):null;}catch{return null;}
}
export function storeCloudConfig(config:CloudConfig){
 const url=config.url.trim().replace(/\/+$/,'');const key=config.key.trim();
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))throw new Error('Ange Supabase-projektets adress (https://….supabase.co).');
 if(!key||key.startsWith('sb_secret_')||key.startsWith('service_role'))throw new Error('Använd endast publishable/anon key, aldrig secret eller service_role.');
 if(key.split('.').length===3){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role==='service_role')throw new Error('En administratörsnyckel får inte användas.');}catch(e){if(e instanceof Error&&e.message.includes('administratörsnyckel'))throw e;}}
 localStorage.setItem(CONFIG,JSON.stringify({url,key}));client=null;
}
export function cloudClient():SupabaseClient|null{
 const config=readCloudConfig();if(!config)return null;
 if(!client)client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'jans-verkstad-auth-v1'}});
 return client;
}
export async function currentUser(){const c=cloudClient();if(!c)return null;const {data,error}=await c.auth.getUser();if(error||!data.user)return null;return data.user;}
export async function sendMagicLink(email:string){const c=cloudClient();if(!c)throw new Error('Ange först projektadressen och publishable key.');const {error}=await c.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;}
export async function passwordLogin(email:string,password:string){const c=cloudClient();if(!c)throw new Error('Konfigurera Supabase först.');const {error}=await c.auth.signInWithPassword({email,password});if(error)throw error;}
export async function registerAccount(email:string,password:string){const c=cloudClient();if(!c)throw new Error('Konfigurera Supabase först.');const {data,error}=await c.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;return data.session?'Kontot är skapat och inloggat.':'Kontrollera e-posten och bekräfta kontot. Logga sedan in med lösenordet i appen.';}
export async function signOut(){const c=cloudClient();if(c){const {error}=await c.auth.signOut();if(error)throw error;}}
function ensure(e:any,prefix:string){if(e)throw new Error(prefix+': '+String(e.message||e));}
async function remoteRows(c:SupabaseClient,owner:string):Promise<RemoteRow[]>{
 const rows:RemoteRow[]=[];
 for(let offset=0;;offset+=500){const {data,error}=await c.from('verkstad_records').select('kind,record_id,content,changed_at').eq('owner_id',owner).order('kind').order('record_id').range(offset,offset+499);ensure(error,'Kunde inte läsa molnregistret');rows.push(...(data||[]) as RemoteRow[]);if(!data||data.length<500)break;}
 return rows;
}
function bytesToDataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
async function signature(photo:string){const bytes=new TextEncoder().encode(photo);const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function photoPayload(c:SupabaseClient,owner:string,item:Item,old?:RemoteRow){
 const {photo,...content}=item;
 if(!photo)return {...content,photo_path:null,photo_signature:null};
 const hash=await signature(photo);
 if(old?.content?.photo_signature===hash&&old?.content?.photo_path)return {...content,photo_path:old.content.photo_path,photo_signature:hash};
 const file=await (await fetch(photo)).blob();if(file.size>10*1024*1024)throw new Error('Fotot är större än 10 MB.');
 const path=`${owner}/${item.id}/${crypto.randomUUID()}.jpg`;
 const {error}=await c.storage.from('jans-foton').upload(path,file,{contentType:'image/jpeg',upsert:false});ensure(error,'Kunde inte spara foto');
 return {...content,photo_path:path,photo_signature:hash};
}
async function loadPhoto(c:SupabaseClient,owner:string,row:RemoteRow){
 const path=row.content?.photo_path;if(!path)return null;
 if(typeof path!=='string'||!path.startsWith(owner+'/'))throw new Error('Otillåten fotoadress i molnet.');
 const {data,error}=await c.storage.from('jans-foton').download(path);ensure(error,'Kunde inte hämta foto');return bytesToDataUrl(data!);
}
export async function cloudPreview(){
 const c=cloudClient();if(!c)throw new Error('Konfigurera Supabase först.');
 const {data,error}=await c.auth.getUser();ensure(error,'Inloggning');if(!data.user)throw new Error('Logga in via e-postlänken.');
 const owner=data.user.id;const snapshot=await getSyncSnapshot();
 if(snapshot.owner&&snapshot.owner!==owner)throw new Error('Det lokala registret tillhör redan en annan molnanvändare. Exportera säkerhetskopia och använd en ny enhet för ett nytt konto.');
 const remote=await remoteRows(c,owner);
 return {owner,localItems:snapshot.data.items.length,localPlaces:snapshot.data.places.length,remoteItems:remote.filter(x=>x.kind==='item'&&!x.content._deleted).length,remotePlaces:remote.filter(x=>x.kind==='location'&&!x.content._deleted).length,active:snapshot.active,pending:snapshot.pending.length};
}
export async function activateCloud(){
 const info=await cloudPreview();
 if(info.active)return syncOnce();
 if(info.localItems+info.localPlaces>0&&info.remoteItems+info.remotePlaces>0)throw new Error('Både denna enhet och molnet innehåller uppgifter. Ingen överföring gjordes. Exportera säkerhetskopior och sammanför registren manuellt först.');
 if(info.localItems+info.localPlaces===0&&info.pending>0&&info.remoteItems+info.remotePlaces>0)throw new Error('Det finns oskickade lokala borttagningar. Exportera säkerhetskopia och kontrollera innan molnet hämtas.');
 if(info.localItems+info.localPlaces>0)await seedPending();
 await bindSyncOwner(info.owner);
 return syncOnce();
}
export function syncOnce():Promise<string>{
 if(running)return running;
 running=doSync().finally(()=>{running=null;});return running;
}
async function doSync():Promise<string>{
 const c=cloudClient();if(!c)return 'Molnlagring är inte konfigurerad.';
 if(!navigator.onLine)return 'Offline. Dina ändringar sparas lokalt och väntar på internet.';
 const {data,error}=await c.auth.getUser();ensure(error,'Inloggning');if(!data.user)return 'Logga in för att synkronisera.';
 const owner=data.user.id;let state=await getSyncSnapshot();
 if(!state.active)return 'Kontrollera först innehållet och aktivera synkronisering.';
 if(state.owner!==owner)throw new Error('Molnkontot matchar inte den här enhetens register. Ingen data har ändrats.');
 let remote=await remoteRows(c,owner);
 const map=new Map(remote.map(row=>[row.kind+':'+row.record_id,row]));
 // Halta hellre an att tyst skriva over en andring fran en annan enhet.
 for(const p of state.pending){const old=map.get(p.key);const seen=await getSeen(p.key);
  if(old&&(!seen||old.changed_at!==seen)){
   // Innan forsta uppladdningen ar det tillatet endast om molnet saknar posten.
   throw new Error('Synkkonflikt för '+p.key+'. Molnet har en annan version. Inget har skrivits över.');
  }
 }
 let uploaded=0,downloaded=0;
 for(const p of state.pending){
  const row=map.get(p.key);
  const record=p.kind==='item'?state.data.items.find(x=>x.id===p.id):state.data.places.find(x=>x.id===p.id);
  if(!p.deleted&&!record)throw new Error('Registerpost saknas för '+p.key+'. Synk pausad utan att ändra molnet.');
  const content=p.deleted?{_deleted:true}:p.kind==='item'?await photoPayload(c,owner,record as Item,row):{...(record||{})};
  const payload={owner_id:owner,kind:p.kind,record_id:p.id,content,changed_at:p.changedAt};
  const {error}=await c.from('verkstad_records').upsert(payload,{onConflict:'owner_id,kind,record_id'});
  ensure(error,'Kunde inte överföra '+p.key);
  await uploadedPending(p,p.changedAt);uploaded++;
 }
 // Hamta fran servern EFTER alla lyckade uppladdningar.
 remote=await remoteRows(c,owner);
 for(const row of remote){
  if(!['item','location'].includes(row.kind))continue;
  state=await getSyncSnapshot();const key=row.kind+':'+row.record_id;
  if(state.pending.some(p=>p.key===key))continue;
  const seen=await getSeen(key);if(seen===row.changed_at)continue;
  const photo=row.kind==='item'&&!row.content._deleted?await loadPhoto(c,owner,row):null;
  await receiveRemote(row,photo);downloaded++;
 }
 window.dispatchEvent(new Event('jans-cloud-refreshed'));
 return `Molnregister uppdaterat. Skickade ${uploaded}, hämtade ${downloaded}.`;
}
