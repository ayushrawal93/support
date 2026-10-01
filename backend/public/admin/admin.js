(() => {
  "use strict";

  let token = localStorage.getItem("aht_admin_token") || "";
  let allSubmissions = [];
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const auth = (extra={}) => ({...extra, Authorization:`Bearer ${token}`});

  async function readJson(r){
    const t=await r.text(); let d={};
    try{d=t?JSON.parse(t):{}}catch{}
    if(!r.ok) throw new Error(d.message||t||`HTTP ${r.status}`);
    return d;
  }

  function toast(message){
    const t=$("toast"); if(!t)return;
    t.textContent=message; t.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
  }

  function loginMessage(message,type="error"){
    const e=$("loginMessage"); if(!e)return;
    e.textContent=message||""; e.className=`message ${type}`;
  }

  function logout(){
    token=""; localStorage.removeItem("aht_admin_token");
    $("app").classList.add("hidden"); $("login").classList.remove("hidden");
    if($("password"))$("password").value="";
  }

  async function login(e){
    if(e)e.preventDefault();
    const btn=$("loginBtn"), username=$("username").value.trim(), password=$("password").value;
    if(!username||!password){loginMessage("Enter your username and password.");return;}
    btn.disabled=true; btn.innerHTML="Signing in…"; loginMessage("Connecting…","info");
    try{
      const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      const d=await readJson(r); if(!d.token)throw new Error("No session token was returned.");
      token=d.token; localStorage.setItem("aht_admin_token",token);
      $("login").classList.add("hidden"); $("app").classList.remove("hidden");
      $("loggedUser").textContent=`${d.username||username}`;
      loginMessage("Login successful.","success"); await load();
    }catch(err){console.error(err);loginMessage(err.message||"Unable to log in.");}
    finally{btn.disabled=false;btn.innerHTML="<span>Sign in</span><span>→</span>";}
  }

  function formatDate(v){
    if(!v)return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
  }
  function bytes(n){n=Number(n||0);if(!n)return "0 B";const u=["B","KB","MB","GB"];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);return `${(n/Math.pow(1024,i)).toFixed(i?1:0)} ${u[i]}`;}

  // Convert an ISO 3166-1 alpha-2 code to the native country flag emoji.
  // New submissions receive CountryCode directly from the IP geolocation API.
  const countryNameCodes={
    "india":"IN","united states":"US","united states of america":"US","usa":"US",
    "united kingdom":"GB","uk":"GB","canada":"CA","australia":"AU","new zealand":"NZ",
    "singapore":"SG","united arab emirates":"AE","uae":"AE","saudi arabia":"SA",
    "qatar":"QA","kuwait":"KW","oman":"OM","bahrain":"BH","pakistan":"PK",
    "bangladesh":"BD","nepal":"NP","sri lanka":"LK","china":"CN","japan":"JP",
    "south korea":"KR","republic of korea":"KR","germany":"DE","france":"FR",
    "italy":"IT","spain":"ES","netherlands":"NL","switzerland":"CH","sweden":"SE",
    "norway":"NO","denmark":"DK","finland":"FI","ireland":"IE","russia":"RU",
    "ukraine":"UA","brazil":"BR","mexico":"MX","south africa":"ZA","nigeria":"NG"
  };
  function countryCode(s){
    const direct=String(s?.CountryCode||"").trim().toUpperCase();
    if(/^[A-Z]{2}$/.test(direct))return direct;
    const name=String(s?.Country||"").trim().toLowerCase();
    return countryNameCodes[name]||"";
  }
  function countryFlag(s){
    const code=countryCode(s);
    if(!code)return `<span class="country-flag-fallback" aria-hidden="true">🌐</span>`;
    const flag=[...code].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join("");
    return `<span class="country-flag-icon" role="img" aria-label="${esc(s?.Country||"Country")}" title="${esc(s?.Country||"Country")}">${flag}</span>`;
  }

  function updateStats(rows){
    $("statTotal").textContent=rows.length;
    $("statNew").textContent=rows.filter(x=>(x.Status||"New")==="New").length;
    $("statProgress").textContent=rows.filter(x=>x.Status==="In Progress").length;
    $("statCompleted").textContent=rows.filter(x=>x.Status==="Completed").length;
  }

  function render(){
    const q=($("search").value||"").trim().toLowerCase(), filter=$("statusFilter").value;
    const rows=allSubmissions.filter(s=>{
      const hay=[s.Id,s.Name,s.Email,s.Phone,s.Subject,s.Country,s.ClientIP,s.AssignmentDetails].join(" ").toLowerCase();
      return (!q||hay.includes(q))&&(!filter||s.Status===filter);
    });
    const list=$("list");
    if(!rows.length){list.innerHTML=`<div class="empty">No matching submissions found.</div>`;return;}
    list.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Subject</th><th>Deadline</th><th>Country</th><th>Files</th><th>Status</th><th>Created</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table></div>`;
  }

  function row(s){
    const id=Number(s.SubmissionId), status=s.Status||"New";
    const deadline=s.Deadline||[s.DeadlineDate,s.DeadlineTime].filter(Boolean).join(" ")||"—";
    const statuses=["New","In Progress","Completed","Cancelled"];
    return `<tr>
      <td><button class="order-btn" type="button" onclick="window.adminDetails(${id})">${esc(s.Id)}</button></td>
      <td><b>${esc(s.Name)}</b><br><span class="small">${esc(s.Email)}</span>${s.Phone?`<br><span class="small">${esc(s.Phone)}</span>`:""}</td>
      <td><b>${esc(s.Subject)}</b>${s.AssignmentDetails?`<br><span class="small">${esc(String(s.AssignmentDetails).slice(0,110))}${String(s.AssignmentDetails).length>110?"…":""}</span>`:""}</td>
      <td><b>${esc(deadline)}</b></td>
      <td>${countryFlag(s)} ${esc(s.Country||"Unknown")}</td>
      <td>${Number(s.AttachmentCount||0)?`<button class="file-count" type="button" onclick="window.adminDetails(${id})">📎 ${Number(s.AttachmentCount)} Files</button>`:"—"}</td>
      <td><select class="status-select" onchange="window.adminChangeStatus(${id},this.value)">${statuses.map(x=>`<option ${x===status?"selected":""}>${esc(x)}</option>`).join("")}</select></td>
      <td><span class="small">${esc(formatDate(s.CreatedAt))}</span></td>
    </tr>`;
  }

  async function load({silent=false}={}){
    if(!silent) $("list").innerHTML=`<div class="loading"><span class="spinner"></span>Loading submissions…</div>`;
    try{
      const r=await fetch("/api/submissions",{headers:auth(),cache:"no-store"});
      if(r.status===401){logout();loginMessage("Session expired. Please log in again.");return;}
      const d=await readJson(r); allSubmissions=Array.isArray(d.submissions)?d.submissions:[]; updateStats(allSubmissions); render();
    }catch(err){console.error("Load submissions:",err);if(!silent) $("list").innerHTML=`<div class="error-box"><b>Unable to load submissions.</b><br>${esc(err.message)}<br><br><button class="primary" type="button" onclick="window.loadSubmissions()">Try again</button></div>`;}
  }

  async function details(id){
    try{
      const r=await fetch(`/api/submissions/${encodeURIComponent(id)}`,{headers:auth(),cache:"no-store"});
      if(r.status===401){logout();return;}
      const d=await readJson(r), s=d.submission||{}, files=d.attachments||[];
      $("modalTitle").textContent=s.Id||`#${id}`;
      $("modalBody").innerHTML=`<div class="detail-body">
        <div class="detail-grid">
          ${detail("Customer",s.Name)}${detail("Email",s.Email)}${detail("Phone",s.Phone||"—")}${detail("Subject",s.Subject)}
          ${detail("Deadline",s.Deadline||[s.DeadlineDate,s.DeadlineTime].filter(Boolean).join(" "))}${detailHtml("Country",`${countryFlag(s)} ${esc(s.Country||"Unknown")}`)}
          ${detail("Customer IP",s.ClientIP||"Unknown")}${detail("Status",s.Status||"New")}${detail("Submitted",formatDate(s.CreatedAt))}
        </div>
      </div>
      <div class="detail-section"><h3>Assignment Requirements</h3><div class="requirements">${esc(s.AssignmentDetails||"No details provided.")}</div></div>
      <div class="detail-section"><h3>📎 Attachments (${files.length})</h3>${files.length?files.map(file).join(""):`<p class="small">No attachments were uploaded.</p>`}</div>`;
      $("modal").classList.remove("hidden"); $("modal").setAttribute("aria-hidden","false");
    }catch(err){console.error(err);toast(err.message||"Unable to load submission.");}
  }
  function detail(label,value){return `<div class="detail-item"><small>${esc(label)}</small><div>${esc(value??"—")}</div></div>`;}
  function detailHtml(label,value){return `<div class="detail-item"><small>${esc(label)}</small><div>${value??"—"}</div></div>`;}
  function file(f){return `<div class="file-row"><div class="file-info"><div class="file-name">📄 ${esc(f.OriginalFileName||"Attachment")}</div><div class="file-meta">${bytes(f.FileSize)} • ${esc(f.MimeType||"application/octet-stream")}</div></div><div class="file-actions"><button type="button" onclick="window.adminViewFile(${Number(f.Id)})">👁 View</button><button class="download" type="button" onclick="window.adminDownloadFile(${Number(f.Id)})">⬇ Download</button></div></div>`;}

  async function attachment(id,download){
    const endpoint=`/api/submissions/attachments/${encodeURIComponent(id)}/${download?"download":"view"}`;
    const r=await fetch(endpoint,{headers:auth(),cache:"no-store"});
    if(r.status===401){logout();throw new Error("Session expired. Please log in again.");}
    if(!r.ok)throw new Error(await r.text()||`Attachment HTTP ${r.status}`); return r;
  }
  async function viewFile(id){
    try{
      const r=await attachment(id,false), blob=await r.blob(), url=URL.createObjectURL(blob), w=window.open("","_blank");
      if(!w){URL.revokeObjectURL(url);throw new Error("Please allow pop-ups for the admin panel.");}
      const type=r.headers.get("Content-Type")||blob.type||"application/octet-stream", cd=r.headers.get("Content-Disposition")||"", m=cd.match(/filename="([^"]+)"/i),name=m?m[1]:"Attachment";
      if(type.startsWith("image/")||type==="application/pdf"||type.startsWith("text/")){
        w.document.write(`<title>${esc(name)}</title><style>html,body{margin:0;height:100%;background:#111}iframe,img{width:100%;height:100%;border:0;object-fit:contain}</style>${type.startsWith("image/")?`<img src="${url}">`:`<iframe src="${url}"></iframe>`}`);w.document.close();
      }else{w.document.write(`<body style="font-family:system-ui;padding:40px"><h2>${esc(name)}</h2><p>This file type cannot be previewed in the browser.</p><button onclick="location.href='${url}'">Open / Download</button></body>`);w.document.close();}
      setTimeout(()=>URL.revokeObjectURL(url),120000);
    }catch(err){console.error(err);toast(err.message||"Unable to view file.");}
  }
  async function downloadFile(id){
    try{
      const r=await attachment(id,true), blob=await r.blob(), cd=r.headers.get("Content-Disposition")||"", m=cd.match(/filename="([^"]+)"/i), name=m?m[1]:"attachment", url=URL.createObjectURL(blob), a=document.createElement("a");
      a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast("Download started");
    }catch(err){console.error(err);toast(err.message||"Unable to download file.");}
  }

  async function changeStatus(id,status){
    try{
      const r=await fetch(`/api/submissions/${encodeURIComponent(id)}/status`,{method:"PATCH",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({status})});
      if(r.status===401){logout();return;} await readJson(r); const item=allSubmissions.find(x=>Number(x.SubmissionId)===Number(id)); if(item)item.Status=status; updateStats(allSubmissions); render(); toast("Status updated");
    }catch(err){console.error(err);toast(err.message||"Could not update status.");load();}
  }

  function closeModal(){$("modal").classList.add("hidden");$("modal").setAttribute("aria-hidden","true");}

  async function session(){
    if(!token)return;
    try{const r=await fetch("/api/admin/me",{headers:auth(),cache:"no-store"});if(!r.ok)throw 0;const d=await readJson(r);$("login").classList.add("hidden");$("app").classList.remove("hidden");$("loggedUser").textContent=d.admin?.username||"Administrator";await load();}catch{logout();}
  }

  function initAdmin(){
    if(window.__ahAdminInitialized)return;
    window.__ahAdminInitialized=true;
    $("loginForm").addEventListener("submit",login);
    $("logout").addEventListener("click",logout);
    $("refresh").addEventListener("click",load);
    $("close").addEventListener("click",closeModal);
    $("search").addEventListener("input",render);
    $("statusFilter").addEventListener("change",render);
    $("togglePassword").addEventListener("click",()=>{const p=$("password");p.type=p.type==="password"?"text":"password";});
    $("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
    window.adminDetails=details;window.adminChangeStatus=changeStatus;window.adminViewFile=viewFile;window.adminDownloadFile=downloadFile;window.loadSubmissions=load;
    session();
    window.__adminRefreshTimer = setInterval(() => {
      if (token && !$('modal').classList.contains("hidden")) return;
      if (token) load({silent:true});
    }, 30000);
  }
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initAdmin,{once:true});
  }else{
    initAdmin();
  }
})();
