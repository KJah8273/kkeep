import {readLocal,getBackup,downloadBackup,restoreEmpty,validateSave} from './hgola-saves.js';
const $=id=>document.getElementById(id);let current=null,pending=null;
async function refresh(){
 const [local,cloud]=await Promise.allSettled([readLocal(),getBackup()]);
 current=local.status==='fulfilled'?local.value:null;
 const remote=cloud.status==='fulfilled'?cloud.value:null;
 if(!current&&remote?.save)current=remote.save;
 $('download').disabled=!current;
 $('status').textContent=(local.status==='rejected'?'Local storage is unavailable. ':local.value?'Local save found. ':'No local save yet. ')+(remote?.save?'Online backup: '+new Date(remote.updated).toLocaleString()+'.':remote?'Online backup will begin after you play.':'Online backup is temporarily unavailable.');
}
$('download').onclick=()=>{try{downloadBackup(current);}catch(e){$('status').textContent=e.message;}};
$('protect').onclick=async()=>{try{const ok=await navigator.storage?.persist?.();$('status').textContent=ok?'Persistent storage was granted. Keep a downloaded backup too.':'The browser did not grant persistent storage. You can still download a backup.';}catch{$('status').textContent='Persistent storage is unavailable. Download a backup instead.';}};
$('file').onchange=async event=>{pending=null;$('restore').disabled=true;try{const file=event.target.files[0];if(!file)return;if(file.size>524288)throw Error('Choose a game backup under 512 KB.');pending=validateSave(JSON.parse(await file.text()));$('restore').disabled=false;$('result').textContent='Backup checked. Restore it only after closing the game.';}catch(e){$('result').textContent=e.message;}};
$('restore').onclick=async()=>{if(!pending)return;$('restore').disabled=true;try{const restored=await restoreEmpty(pending);$('result').textContent=restored?'Progress restored. Open the game to continue.':'Your existing progress was kept. Recovery only fills an empty installation.';await refresh();}catch(e){$('result').textContent=e.message;}finally{$('restore').disabled=!pending;}};
refresh();
