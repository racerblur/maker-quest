(()=>{
async function api(path,data,method='POST'){
 const r=await fetch('/api/'+path,{method:data?method:'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const result=await r.json();if(!r.ok)throw new Error(result.message||'Save failed');return result;
}
window.mqLeaders=async(game,id)=>{const el=document.getElementById(id);if(!el)return;try{const data=await api('leaderboard?game='+game);el.replaceChildren();for(const row of data.scores){const li=document.createElement('li');li.textContent=row.name+': '+row.score;el.append(li)}if(!data.scores.length)el.textContent='No scores this hour.'}catch(e){el.textContent=e.message}};
window.mqSubmit=async(game,score,id)=>{const el=document.getElementById(id);try{await api('scores',{game,score});if(el)el.textContent='Saved '+score+' points to your staging account.'}catch(e){if(el)el.textContent=e.message+'. Score was not saved.'}};
let pending=Promise.resolve();
window.mqSavePassport=badges=>{
 window.mqPassport?.lock(true);
 pending=pending.then(async()=>{try{await api('progress',{badges},'PUT');const data=await api('progress');window.mqPassport.set(data.badges);document.getElementById('toast').textContent='Badges saved to your staging account.'}catch(e){document.getElementById('toast').textContent=e.message+'. Save not confirmed; reload to retry.'}finally{window.mqPassport.lock(false)}});
};
async function load(){if(!window.mqPassport)return;window.mqPassport.lock(true);try{const data=await api('progress');window.mqPassport.set(data.badges);window.mqPassport.lock(false);document.getElementById('toast').textContent='Progress loaded from your staging account.'}catch(e){document.getElementById('toast').textContent=e.message+'. Sign in on the Account page.'}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
