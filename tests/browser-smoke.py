"""Run against the production build: python tests/browser-smoke.py (Playwright + Chromium)."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import threading,tempfile,json,zipfile
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(root/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
  context.route('**/*.supabase.co/**',lambda route:route.abort())
  page=context.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('dialog',lambda dialog:dialog.accept())
  page.goto(base+'/');page.get_by_role('heading',name='Mindre letande. Mer snickeri.').wait_for()
  page.evaluate('''async()=>{const req=indexedDB.open('jans-verkstad-mobil',2);const db=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});const tx=db.transaction('register','readwrite');const c=document.createElement('canvas');c.width=2;c.height=2;const photo=c.toDataURL('image/jpeg');tx.objectStore('register').put({items:[{id:'one',name:'Såg',location:'Låda 1',category:'Elverktyg',quantity:1,keywords:'',notes:'Original',photo,updated:'2026-11-02T01:00:00Z',brand:'Festool',model:'TS55',serial:'SERIAL-123',custom:'keep'},{id:'two',name:'Hyvel',location:'Låda 1',category:'Handverktyg',quantity:2,keywords:'',notes:'',photo:null,updated:'2026-11-01T01:00:00Z'}],places:[{id:'place-1',name:'Låda 1'},{id:'place-2',name:'Låda 2'}]},'data');await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}''')
  page.reload();page.get_by_role('button').filter(has=page.get_by_role('heading',name='Såg',exact=True)).click()
  expect(page.get_by_text('SERIAL-123',exact=True)).to_be_visible()
  page.get_by_label('Låntagare',exact=True).fill('Anna')
  page.get_by_label('Åter senast (valfritt)').fill('2026-12-01')
  page.get_by_role('button',name='Registrera utlåning',exact=True).click()
  expect(page.get_by_text('Utlånat till Anna',exact=True)).to_be_visible()
  page.get_by_role('button',name='Markera som återlämnat').click()
  expect(page.get_by_text('Tidigare utlåningar (1)',exact=True)).to_be_visible()
  page.get_by_role('dialog',name='Föremålsuppgifter').get_by_role('button',name='Stäng',exact=True).click()
  page.get_by_role('button',name='Flytta flera föremål',exact=True).click()
  page.get_by_role('button',name='Markera alla som visas (2)').click()
  page.get_by_role('combobox',name='Förvaringsplats',exact=True).select_option('place:Låda 2')
  page.get_by_role('button',name='Flytta 2 föremål',exact=True).click()
  expect(page.get_by_text('2 föremål har flyttats',exact=True)).to_be_visible()
  page.get_by_role('link',name='Projekt & ritningar',exact=True).click()
  page.get_by_role('button',name='＋ Nytt projekt',exact=True).click()
  page.get_by_label('Projektnamn *').fill('Bord i ek')
  page.get_by_label('Checklista – en uppgift per rad').fill('Såga\nLimma')
  page.get_by_label('Materiallista – ett material per rad').fill('Ek 2 meter\nTrälim')
  page.get_by_label('Såg · Låda 2',exact=True).check()
  page.locator('#attachments').set_input_files({'name':'ritning.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4 test'})
  page.get_by_role('button',name='Spara projekt',exact=True).click()
  page.get_by_role('button',name='Öppna →',exact=True).click()
  page.get_by_label('Såga',exact=True).check()
  expect(page.get_by_role('heading',name='Checklista (1/2)',exact=True)).to_be_visible()
  page.get_by_role('button',name='Redigera',exact=True).click()
  page.get_by_label('Checklista – en uppgift per rad').fill('Limma\nSåga\nSlipa')
  page.get_by_role('button',name='Spara projekt',exact=True).click()
  expect(page.get_by_label('Såga',exact=True)).to_be_checked()
  page.get_by_role('button',name='Stäng',exact=True).click()
  with page.expect_download() as exported:page.get_by_role('button',name='↓ Exportera projekt med filer (ZIP)').click()
  project_zip=Path(tempfile.gettempdir())/'jans-project-browser.zip';exported.value.save_as(project_zip)
  with zipfile.ZipFile(project_zip) as z:assert z.read('project-files/0')==b'%PDF-1.4 test'
  # Capture queries: typing must not getAll() file blobs.
  page.evaluate("()=>{window.blobReads=0;const old=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(...args){if(this.name==='files')window.blobReads++;return old.apply(this,args)}}")
  page.get_by_label('Sök projekt',exact=True).fill('Bord')
  page.wait_for_timeout(100)
  assert page.evaluate('window.blobReads')==0
  page.goto(base+'/')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Root mobile horizontal overflow'
  page.screenshot(path='/tmp/jans-root-mobile.png',full_page=True)
  with page.expect_download() as exported:page.get_by_role('button',name='Säkerhetskopiera hela verkstaden',exact=True).click()
  whole_zip=Path(tempfile.gettempdir())/'jans-whole-browser.zip';exported.value.save_as(whole_zip)
  with zipfile.ZipFile(whole_zip) as z:
   m=json.loads(z.read('manifest.json'));assert len(m['register']['items'])==2;assert len(m['projects']['projects'])==1;assert m['projects']['projects'][0]['toolIds']==['one'];assert m['register']['items'][0]['location']=='Låda 2';assert any(i.get('serial')=='SERIAL-123' for i in m['register']['items'])
  page.get_by_label('Öppna säkerhetskopia',exact=True).set_input_files(whole_zip)
  expect(page.get_by_role('heading',name='Förhandsgranska återställning')).to_be_visible()
  with page.expect_download() as recovery:page.get_by_role('button',name='1. Spara nuvarande uppgifter',exact=True).click()
  recovery.value.save_as(Path(tempfile.gettempdir())/'jans-recovery-browser.zip')
  page.get_by_role('button',name='2. Återställ hela verkstaden',exact=True).click()
  expect(page.get_by_text('Hela verkstaden är återställd på den här enheten.',exact=True)).to_be_visible()
  page.evaluate('''async()=>{await navigator.serviceWorker.ready;await Promise.all((await navigator.serviceWorker.getRegistrations()).map(async r=>{if(r.installing)await new Promise(resolve=>r.installing.addEventListener('statechange',()=>{if(r.active)resolve()}))}));}''')
  context.set_offline(True)
  page.goto(base+'/');expect(page.get_by_role('heading',name='Mindre letande. Mer snickeri.')).to_be_visible()
  expect(page.get_by_role('heading',name='Såg',exact=True)).to_be_visible()
  page.goto(base+'/projekt-ritningar.html');expect(page.get_by_role('heading',name='Bord i ek',exact=True)).to_be_visible()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile horizontal overflow'
  context.set_offline(False)
  page.goto(base+'/?nyplats=1');expect(page.get_by_role('dialog',name='Förvaringsplats')).to_be_visible()
  page.get_by_role('button',name='Avbryt',exact=True).click()
  assert not errors,errors
  page.screenshot(path='/tmp/jans-mobile.png',full_page=True)
  browser.close()
  print('PASS: mobile UI, loans/return history, mass move, project checklist/materials/attachments, ZIP download, complete restore with recovery copy, no blob reads on search, offline root and projects, direct new-place link. No uncaught page errors.')
finally:server.shutdown()
