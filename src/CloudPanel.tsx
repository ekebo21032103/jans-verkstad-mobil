import {useEffect,useState} from 'react';
import {Cloud,RefreshCw,Mail,ShieldCheck} from 'lucide-react';
import {activateCloud,cloudClient,cloudPreview,currentUser,readCloudConfig,sendMagicLink,passwordLogin,registerAccount,signOut,storeCloudConfig,syncOnce} from './cloud-sync';
import './cloud-panel.css';

type Preview=Awaited<ReturnType<typeof cloudPreview>>;
export default function CloudPanel(){
 const [config,setConfig]=useState(readCloudConfig());
 const [url,setUrl]=useState(config?.url||'');const [key,setKey]=useState(config?.key||'');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [userEmail,setUserEmail]=useState('');
 const [preview,setPreview]=useState<Preview|null>(null);
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const [open,setOpen]=useState(false);
 async function updateState(){const user=await currentUser();setUserEmail(user?.email||'');if(user){try{setPreview(await cloudPreview());}catch(e){setMessage((e as Error).message);}}else setPreview(null);}
 useEffect(()=>{
  updateState();const c=cloudClient();const sub=c?.auth.onAuthStateChange(()=>{setTimeout(updateState,0);});
  return()=>{sub?.data.subscription.unsubscribe();};
 },[config?.url,config?.key]);
 async function action(fn:()=>Promise<any>){setBusy(true);setMessage('');try{const result=await fn();if(typeof result==='string')setMessage(result);await updateState();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{
  if(!preview?.active||!userEmail)return;
  let timer:number|undefined;
  const trigger=()=>{if(navigator.onLine&&document.visibilityState==='visible')actionBackground();};
  async function actionBackground(){try{const result=await syncOnce();setMessage(result);await updateState();}catch(e){setMessage((e as Error).message);}}
  const change=()=>{window.clearTimeout(timer);timer=window.setTimeout(trigger,1000);};
  const interval=window.setInterval(trigger,45000);
  window.addEventListener('online',trigger);document.addEventListener('visibilitychange',trigger);window.addEventListener('jans-local-changed',change);
  trigger();
  return()=>{window.clearInterval(interval);window.clearTimeout(timer);window.removeEventListener('online',trigger);document.removeEventListener('visibilitychange',trigger);window.removeEventListener('jans-local-changed',change);};
 },[preview?.active,userEmail]);
 const amountLocal=(preview?.localItems||0)+(preview?.localPlaces||0);
 const amountCloud=(preview?.remoteItems||0)+(preview?.remotePlaces||0);
 const unsafe=!!preview&&!preview.active&&amountLocal>0&&amountCloud>0;
 return <section className="cloud-panel" aria-label="Molnsynkronisering">
  <div className="cloud-header"><Cloud size={22}/><div><h2>Molnsynkronisering</h2><p>{preview?.active?'Aktiverad – registret lagras även i Supabase':config?'Förberedd – aktivera när du har kontrollerat innehållet':'Valfritt – ditt lokala register fungerar som tidigare'}</p></div></div>
  <button className="secondary" type="button" onClick={()=>setOpen(x=>!x)}>{open?'Dölj molninställningar':'Visa molninställningar'}</button>
  {open&&<div className="cloud-body">
   {!config&&<><p>Klistra in <b>Project URL</b> och <b>Publishable key</b> från Supabase → Project Settings → API Keys. Använd aldrig <b>secret</b> eller <b>service_role</b>.</p>
    <label className="field">Projektadress<input autoComplete="off" placeholder="https://….supabase.co" value={url} onChange={e=>setUrl(e.target.value)}/></label>
    <label className="field">Publishable key<input autoComplete="off" spellCheck={false} placeholder="sb_publishable_… (eller anon)" value={key} onChange={e=>setKey(e.target.value)}/></label>
    <button className="primary" disabled={busy} onClick={()=>action(async()=>{storeCloudConfig({url,key});setConfig(readCloudConfig());setMessage('Inställningarna sparades endast i denna webbläsare.');})}>Spara anslutning</button></>}
   {config&&!userEmail&&<><p>Logga in via en länk som skickas till din e-postadress. Använd samma e-postkonto på iPhone och Mac.</p>
    <form onSubmit={e=>{e.preventDefault();action(async()=>{await sendMagicLink(email);return 'Inloggningslänk skickad. Kontrollera din e-post och öppna länken i webbläsaren.';});}}>
     <label className="field">E-post<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="primary" disabled={busy}><Mail size={18}/> Skicka inloggningslänk</button>
    </form><details><summary>Logga in med lösenord i stället</summary><p>Detta fungerar även om inloggningslänken öppnas i Safari i stället för hemskärmsappen.</p><form onSubmit={e=>{e.preventDefault();action(async()=>{await passwordLogin(email,password);return 'Inloggad.';});}}><label className="field">Lösenord<input type="password" minLength={6} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>Logga in med lösenord</button></form><button className="cloud-link" disabled={busy} onClick={()=>action(async()=>await registerAccount(email,password))}>Skapa konto med e-post och lösenord</button></details></>}
   {config&&userEmail&&<><p><ShieldCheck size={17} style={{verticalAlign:'middle'}}/> Inloggad som <b>{userEmail}</b></p>
     {preview&&<div className="cloud-counts"><div>På den här enheten: <strong>{preview.localItems} föremål, {preview.localPlaces} platser</strong></div><div>I molnet: <strong>{preview.remoteItems} föremål, {preview.remotePlaces} platser</strong></div><div>Ändringar som väntar: <strong>{preview.pending}</strong></div></div>}
     {unsafe?<p className="cloud-warning">Både den här enheten och molnet har redan data. Av säkerhetsskäl stoppas automatisk sammanslagning. Exportera båda registren och kontrollera innehållet innan någon ändring görs.</p>:preview?.active?<button className="secondary" disabled={busy} onClick={()=>action(syncOnce)}><RefreshCw size={18}/> Synkronisera nu</button>:<><p><strong>Innan första överföringen:</strong> Exportera en säkerhetskopia och spara den i iCloud Drive. Kontrollera antalen ovan.</p>
       <button className="primary" disabled={busy} onClick={()=>{
        const what=amountLocal>0?`Överföra ${preview?.localItems} föremål och ${preview?.localPlaces} platser till molnet?`:`Hämta ${preview?.remoteItems} föremål och ${preview?.remotePlaces} platser från molnet?`;
        if(confirm(what+' Se till att du har en separat säkerhetskopia.'))action(activateCloud);
       }}>{amountLocal>0?'Överför detta register till molnet':'Hämta mitt register från molnet'}</button></>}
     <button className="cloud-link" disabled={busy} onClick={()=>action(async()=>{await signOut();return 'Utloggad. Det lokala registret har inte raderats.';})}>Logga ut från molnkontot</button>
    </>}
   {config&&!userEmail&&<p className="cloud-note">Projektinställningen finns sparad på den här enheten. Inställningarna innehåller ingen administratörsnyckel.</p>}
   <p className="cloud-note">Även med molnsynk: fortsätt exportera säkerhetskopior. Redigera inte samma föremål samtidigt på två enheter.</p>
  </div>}
  {message&&<p className="cloud-message" role="status">{message}</p>}
 </section>;
}
