(()=>{
'use strict';
const SUPABASE_URL='https://nqzriajxhkiujlnldayx.supabase.co';
const SUPABASE_KEY='sb_publishable_y2unaxdazpqayrIq6kGSjw_trmoUiwJ';
const ALLOWED_EMAILS=new Set(['m.elisa@action-immo.com','c.cousquer@action-immo.com','v.julie@action-immo.com','s.jeremy@action-immo.com','coraline.actionimmo@gmail.com','amelia.actionimmo@gmail.com']);
const LOCAL_KEY='action-immo-estimations-v1';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const state={session:null,rows:[],frameReady:false,cloudTimer:null,reloadTimer:null,channel:null,saveChain:Promise.resolve(),toastTimer:null,started:false};
const el={};

document.addEventListener('DOMContentLoaded',init);

async function init(){
  el.boot=document.getElementById('boot');
  el.login=document.getElementById('login-gate');
  el.shell=document.getElementById('app-shell');
  el.form=document.getElementById('login-form');
  el.email=document.getElementById('login-email');
  el.password=document.getElementById('login-password');
  el.loginMessage=document.getElementById('login-message');
  el.frame=document.getElementById('app-frame');
  el.status=document.getElementById('cloud-status');
  el.user=document.getElementById('user-email');
  el.toast=document.getElementById('toast');
  el.refresh=document.getElementById('cloud-refresh');
  el.logout=document.getElementById('cloud-logout');
  el.migration=document.getElementById('migration-banner');
  el.migrationText=document.getElementById('migration-text');
  el.migrate=document.getElementById('migrate-local');
  el.dismissMigration=document.getElementById('dismiss-migration');

  el.form.addEventListener('submit',login);
  el.refresh.addEventListener('click',()=>loadCloudRows(false));
  el.logout.addEventListener('click',logout);
  el.migrate.addEventListener('click',migrateLocalDossiers);
  el.dismissMigration.addEventListener('click',()=>el.migration.classList.add('hidden'));
  el.frame.addEventListener('load',patchFrame);
  window.addEventListener('online',()=>{setStatus('Connexion retrouvée','saving');loadCloudRows(true);scheduleCloudSave(300)});
  window.addEventListener('offline',()=>setStatus('Mode hors ligne — brouillon conservé','offline'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.session)loadCloudRows(true)});

  client.auth.onAuthStateChange((event,session)=>{
    window.setTimeout(()=>handleSession(session,event),0);
  });

  if(!window.supabase){showFatal('Le module de synchronisation ne peut pas être chargé.');return}
  const {data,error}=await client.auth.getSession();
  if(error){showLogin(error.message);return}
  await handleSession(data.session,'INITIAL_SESSION');
}

async function login(event){
  event.preventDefault();
  const email=el.email.value.trim().toLowerCase();
  const password=el.password.value;
  el.loginMessage.textContent='Connexion en cours…';
  el.form.querySelector('button[type="submit"]').disabled=true;
  try{
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error)throw error;
    el.loginMessage.textContent='';
    el.password.value='';
  }catch(error){
    el.loginMessage.textContent=friendlyAuthError(error);
  }finally{
    el.form.querySelector('button[type="submit"]').disabled=false;
  }
}

async function logout(){
  await client.auth.signOut();
  state.session=null;
  state.rows=[];
  if(state.channel){await client.removeChannel(state.channel);state.channel=null}
  showLogin('Vous êtes déconnecté.');
}

async function handleSession(session,event){
  const token=session&&session.access_token;
  if(token&&state.session&&state.session.access_token===token&&state.started)return;
  if(!session){state.session=null;state.started=false;showLogin();return}
  const email=(session.user&&session.user.email||'').toLowerCase();
  if(!ALLOWED_EMAILS.has(email)){
    await client.auth.signOut();
    showLogin('Cette adresse ne fait pas partie des comptes autorisés Action Immobilière.');
    return;
  }
  state.session=session;
  state.started=true;
  showApp(email);
  await loadCloudRows(false);
  subscribeRealtime();
}

function showLogin(message=''){
  el.boot.classList.add('hidden');
  el.shell.classList.add('hidden');
  el.login.classList.remove('hidden');
  if(message)el.loginMessage.textContent=message;
}

function showApp(email){
  el.boot.classList.add('hidden');
  el.login.classList.add('hidden');
  el.shell.classList.remove('hidden');
  el.user.textContent=email;
  if(!el.frame.getAttribute('src'))el.frame.src='estimation-local.html?v=cloud-1';
  setStatus(navigator.onLine?'Connexion au dossier partagé…':'Mode hors ligne — brouillon conservé',navigator.onLine?'saving':'offline');
}

function showFatal(message){
  el.boot.innerHTML='<div class="boot-card"><h2>'+escapeHTML(message)+'</h2><p><a href="estimation-local.html">Ouvrir le mode local</a></p></div>';
}

async function loadCloudRows(silent=false){
  if(!state.session)return;
  if(!navigator.onLine){setStatus('Mode hors ligne — brouillon conservé','offline');return}
  if(!silent)setStatus('Actualisation des dossiers…','saving');
  const {data,error}=await client.from('estimations').select('id,dossier,created_at,updated_at,updated_by').order('updated_at',{ascending:false});
  if(error){
    setStatus('Synchronisation impossible','error');
    showToast('Impossible de charger les dossiers partagés : '+error.message,true);
    return;
  }
  state.rows=(data||[]).map(normalizeRow);
  if(state.frameReady)refreshChildList();
  updateMigrationBanner();
  setStatus('Dossiers synchronisés','');
}

function normalizeRow(row){
  let dossier=row.dossier;
  if(typeof dossier==='string'){
    try{dossier=JSON.parse(dossier)}catch{dossier={}}
  }
  dossier=dossier&&typeof dossier==='object'?dossier:{};
  dossier.id=row.id;
  return {...row,dossier};
}

function patchFrame(){
  const win=el.frame.contentWindow;
  const doc=el.frame.contentDocument;
  if(!win||!doc||typeof win.data!=='function'||typeof win.load!=='function'){
    window.setTimeout(patchFrame,250);
    return;
  }
  state.frameReady=true;
  win.all=()=>state.rows.map(row=>structuredCloneSafe(row.dossier));
  win.save=async()=>{
    const dossier=win.data();
    await saveCloudDossier(dossier,true);
  };
  win.openSaved=id=>openCloudDossier(id);
  win.deleteSaved=id=>deleteCloudDossier(id);
  win.refreshSaved=refreshChildList;

  const main=doc.querySelector('main.editor');
  if(main&&!main.dataset.cloudSyncBound){
    main.dataset.cloudSyncBound='1';
    main.addEventListener('input',()=>scheduleCloudSave(1100),true);
    main.addEventListener('change',()=>scheduleCloudSave(600),true);
  }
  const headerStatus=doc.getElementById('saveStatus');
  if(headerStatus)headerStatus.textContent='Dossiers partagés — sauvegarde automatique active';
  refreshChildList();
  updateMigrationBanner();
  setStatus(navigator.onLine?'Dossiers synchronisés':'Mode hors ligne — brouillon conservé',navigator.onLine?'':'offline');
}

function scheduleCloudSave(delay=1100){
  window.clearTimeout(state.cloudTimer);
  if(!state.session||!state.frameReady)return;
  if(!navigator.onLine){setStatus('Mode hors ligne — brouillon conservé','offline');return}
  setStatus('Modification en attente…','saving');
  state.cloudTimer=window.setTimeout(()=>{
    const win=el.frame.contentWindow;
    if(win&&typeof win.data==='function')saveCloudDossier(win.data(),false);
  },delay);
}

function saveCloudDossier(dossier,manual){
  const snapshot=structuredCloneSafe(dossier||{});
  state.saveChain=state.saveChain.then(()=>performCloudSave(snapshot,manual)).catch(error=>{
    setStatus('Sauvegarde en ligne impossible','error');
    childStatus('Sauvegarde locale conservée — erreur de synchronisation');
    showToast(error.message||'Erreur de synchronisation',true);
  });
  return state.saveChain;
}

async function performCloudSave(dossier,manual){
  if(!state.session)throw new Error('Reconnectez-vous pour synchroniser ce dossier.');
  if(!navigator.onLine)throw new Error('Aucune connexion Internet. Le brouillon reste conservé sur cet appareil.');
  const win=el.frame.contentWindow;
  let id=dossier.id||(win&&win._currentId)||newId();
  dossier.id=id;
  dossier._cloud={updatedAt:new Date().toISOString(),updatedBy:state.session.user.email};
  if(win)win._currentId=id;
  setStatus('Enregistrement partagé…','saving');
  childStatus('Enregistrement partagé…');
  const payload={id,dossier,updated_by:state.session.user.id};
  const {data,error}=await client.from('estimations').upsert(payload,{onConflict:'id'}).select('id,dossier,created_at,updated_at,updated_by').single();
  if(error)throw error;
  const row=normalizeRow(data);
  const index=state.rows.findIndex(item=>item.id===id);
  if(index>=0)state.rows[index]=row;else state.rows.unshift(row);
  state.rows.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  refreshChildList();
  setStatus('Sauvegardé dans l’espace partagé','');
  childStatus('✓ Sauvegardé dans l’espace partagé');
  if(manual)showToast('Dossier enregistré et disponible sur tous les appareils.');
}

function openCloudDossier(id){
  const row=state.rows.find(item=>item.id===id);
  const win=el.frame.contentWindow;
  if(!row||!win)return;
  win.load(structuredCloneSafe(row.dossier));
  win._currentId=id;
  if(typeof win.showTab==='function')win.showTab(0);
  childStatus('Dossier partagé ouvert');
  showToast('Dossier ouvert.');
}

async function deleteCloudDossier(id){
  const row=state.rows.find(item=>item.id===id);
  const label=row&&row.dossier&&(row.dossier.owner||row.dossier.address)||'ce dossier';
  if(!window.confirm('Supprimer définitivement '+label+' de l’espace partagé ?'))return;
  setStatus('Suppression…','saving');
  const {error}=await client.from('estimations').delete().eq('id',id);
  if(error){setStatus('Suppression impossible','error');showToast(error.message,true);return}
  state.rows=state.rows.filter(item=>item.id!==id);
  const win=el.frame.contentWindow;
  if(win&&win._currentId===id)win._currentId=null;
  refreshChildList();
  setStatus('Dossiers synchronisés','');
  showToast('Dossier supprimé.');
}

function refreshChildList(){
  if(!state.frameReady)return;
  const doc=el.frame.contentDocument;
  const saved=doc.getElementById('saved');
  if(!saved)return;
  const query=(doc.getElementById('searchDossiers')&&doc.getElementById('searchDossiers').value||'').trim().toLocaleLowerCase('fr');
  const rows=state.rows.filter(row=>{
    const d=row.dossier||{};
    return [d.owner,d.address,d.agent,d.date,d.type,d.agency].join(' ').toLocaleLowerCase('fr').includes(query);
  });
  if(!rows.length){saved.innerHTML='<p class="hint">Aucun dossier partagé trouvé.</p>';return}
  saved.innerHTML=rows.map(row=>{
    const d=row.dossier||{};
    const updatedBy=d._cloud&&d._cloud.updatedBy?' · '+escapeHTML(d._cloud.updatedBy):'';
    return '<div class="dossier-card"><div><strong>'+escapeHTML(d.owner||'Sans nom')+'</strong><small>'+escapeHTML(d.address||'Adresse non renseignée')+'</small><small>'+escapeHTML(dateFr(d.date))+' · '+escapeHTML(d.type||'Bien')+' · '+escapeHTML(d.agency||'')+'</small><small>Modifié '+escapeHTML(formatDateTime(row.updated_at))+updatedBy+'</small></div><div class="actions"><button class="secondary" type="button" data-cloud-open="'+escapeHTML(row.id)+'">Ouvrir</button><button class="secondary" type="button" data-cloud-delete="'+escapeHTML(row.id)+'">Supprimer</button></div></div>';
  }).join('');
  saved.querySelectorAll('[data-cloud-open]').forEach(button=>button.addEventListener('click',()=>openCloudDossier(button.dataset.cloudOpen)));
  saved.querySelectorAll('[data-cloud-delete]').forEach(button=>button.addEventListener('click',()=>deleteCloudDossier(button.dataset.cloudDelete)));
}

async function migrateLocalDossiers(){
  if(!state.session||!state.frameReady)return;
  const local=getLocalDossiers();
  const missing=local.filter(dossier=>dossier&&dossier.id&&!state.rows.some(row=>row.id===dossier.id));
  if(!missing.length){el.migration.classList.add('hidden');showToast('Tous les dossiers de cet appareil sont déjà synchronisés.');return}
  if(!window.confirm('Importer '+missing.length+' dossier(s) de cet appareil dans l’espace partagé ?'))return;
  setStatus('Import des dossiers locaux…','saving');
  const now=new Date().toISOString();
  const payload=missing.map((item,index)=>{
    const dossier=structuredCloneSafe(item);
    dossier.id=dossier.id||newId();
    dossier._cloud={updatedAt:now,updatedBy:state.session.user.email,importedFromDevice:true};
    return {id:dossier.id,dossier,updated_by:state.session.user.id};
  });
  const {error}=await client.from('estimations').upsert(payload,{onConflict:'id'});
  if(error){setStatus('Import impossible','error');showToast(error.message,true);return}
  await loadCloudRows(true);
  el.migration.classList.add('hidden');
  showToast(payload.length+' dossier(s) importé(s) dans l’espace partagé.');
}

function getLocalDossiers(){
  try{
    const raw=window.localStorage.getItem(LOCAL_KEY);
    const value=raw?JSON.parse(raw):[];
    return Array.isArray(value)?value:[];
  }catch{return []}
}

function updateMigrationBanner(){
  if(!state.frameReady||!state.session)return;
  const local=getLocalDossiers();
  const missing=local.filter(dossier=>dossier&&dossier.id&&!state.rows.some(row=>row.id===dossier.id));
  if(!missing.length){el.migration.classList.add('hidden');return}
  el.migrationText.innerHTML='<strong>Dossiers présents uniquement sur cet appareil</strong>'+missing.length+' dossier(s) peuvent être copiés dans l’espace partagé sans supprimer les originaux.';
  el.migration.classList.remove('hidden');
}

function subscribeRealtime(){
  if(state.channel)client.removeChannel(state.channel);
  state.channel=client.channel('estimations-partagees')
    .on('postgres_changes',{event:'*',schema:'public',table:'estimations'},()=>{
      window.clearTimeout(state.reloadTimer);
      state.reloadTimer=window.setTimeout(()=>loadCloudRows(true),350);
    })
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR')setStatus('Actualisation temps réel indisponible','error');
    });
}

function setStatus(text,type=''){
  if(!el.status)return;
  el.status.textContent=text;
  el.status.className='cloud-status'+(type?' '+type:'');
}

function childStatus(text){
  if(!state.frameReady)return;
  const status=el.frame.contentDocument.getElementById('saveStatus');
  if(status)status.textContent=text;
}

function showToast(message,isError=false){
  window.clearTimeout(state.toastTimer);
  el.toast.textContent=message;
  el.toast.className='toast show'+(isError?' error':'');
  state.toastTimer=window.setTimeout(()=>el.toast.className='toast',4200);
}

function friendlyAuthError(error){
  const message=(error&&error.message||'').toLowerCase();
  if(message.includes('invalid login credentials'))return 'Adresse e-mail ou mot de passe incorrect.';
  if(message.includes('email not confirmed'))return 'Ce compte doit encore être confirmé.';
  if(message.includes('rate limit'))return 'Trop de tentatives. Attendez quelques minutes avant de réessayer.';
  return error&&error.message||'Connexion impossible.';
}

function newId(){
  if(window.crypto&&crypto.randomUUID)return 'est_'+crypto.randomUUID();
  return 'est_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);
}

function structuredCloneSafe(value){
  if(window.structuredClone)return window.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function escapeHTML(value){
  return String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function dateFr(value){
  if(!value)return '';
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match?match[3]+'/'+match[2]+'/'+match[1]:value;
}

function formatDateTime(value){
  if(!value)return '';
  try{return new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}catch{return value}
}
})();