(() => {
  const $ = id => document.getElementById(id);
  const D = window.MEILAN_DATA;

  const els = {
    frfbSection:$("frfbSection"), preprodSection:$("preprodSection"),
    frProductSearch:$("frProductSearch"), frSearchResults:$("frSearchResults"), frComboToggle:$("frComboToggle"), frProduct:$("frProduct"), frReceivedDate:$("frReceivedDate"),
    frCalculateBtn:$("frCalculateBtn"), frManualBox:$("frManualBox"),
    frManualTitle:$("frManualTitle"), frManualHelp:$("frManualHelp"),
    frManualExpiry:$("frManualExpiry"), frConfirmManualBtn:$("frConfirmManualBtn"),
    frResult:$("frResult"), frResultProduct:$("frResultProduct"),
    frResultRule:$("frResultRule"), frResultExpiry:$("frResultExpiry"),
    frResultExpiryCard:$("frResultExpiryCard"),
    frResultReceived:$("frResultReceived"), frResultLife:$("frResultLife"),
    frResultRemaining:$("frResultRemaining"), frSaveBtn:$("frSaveBtn"),

    ppProductSearch:$("ppProductSearch"), ppSearchResults:$("ppSearchResults"), ppComboToggle:$("ppComboToggle"), ppProduct:$("ppProduct"), ppFields:$("ppFields"),
    ppRuleBox:$("ppRuleBox"), ppRuleKicker:$("ppRuleKicker"),
    ppRuleTitle:$("ppRuleTitle"), ppRuleText:$("ppRuleText"),
    ppDateLabel:$("ppDateLabel"), ppTimeLabel:$("ppTimeLabel"),
    ppDate:$("ppDate"), ppTime:$("ppTime"),
    ppUseByBox:$("ppUseByBox"), ppUseByDate:$("ppUseByDate"),
    ppManualLifeBox:$("ppManualLifeBox"), ppManualAmount:$("ppManualAmount"),
    ppManualUnit:$("ppManualUnit"), ppCalculateBtn:$("ppCalculateBtn"),
    ppResult:$("ppResult"), ppResultState:$("ppResultState"),
    ppResultProduct:$("ppResultProduct"), ppResultRule:$("ppResultRule"),
    ppRemaining:$("ppRemaining"), ppResultStage:$("ppResultStage"),
    ppResultStart:$("ppResultStart"), ppResultLife:$("ppResultLife"),
    ppResultExpiry:$("ppResultExpiry"), ppWarning:$("ppWarning"),
    ppSaveBtn:$("ppSaveBtn"), newProcessBtn:$("newProcessBtn"),

    history:$("historyList"), clearHistory:$("clearHistoryBtn"),
    networkBadge:$("networkBadge"), reloadAppBtn:$("reloadAppBtn"),
    installPwaBtn:$("installPwaBtn"), openPwaBtn:$("openPwaBtn")
  };

  const state = {
    frRule:null, frExpiry:null, frProductIndex:null, frReceived:null,
    ppStage:null, ppRule:null, ppExpiry:null
  };

  let deferredInstallPrompt = null;
  let lastFrResult = null;
  let lastPpResult = null;

  function normalizeSearch(value){
    return String(value||"")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .trim();
  }

  function getProductMatches(query){
    const term=normalizeSearch(query);

    return D.products
      .map((p,i)=>{
        const name=normalizeSearch(p.n);
        const group=normalizeSearch(p.g);
        let score=9;

        if(!term) score=5;
        else if(name===term) score=0;
        else if(name.startsWith(term)) score=1;
        else if(name.split(/\s+/).some(word=>word.startsWith(term))) score=2;
        else if(name.includes(term)) score=3;
        else if(group.includes(term)) score=4;

        return {p,i,name,group,score};
      })
      .filter(x=>!term || x.score<9)
      .sort((a,b)=>a.score-b.score || a.p.n.localeCompare(b.p.n,"es"))
      .slice(0,50);
  }

  function populateSelect(select){
    const previous=select.value;
    select.innerHTML='<option value="">Selecciona un producto</option>';

    const groups={};
    D.products.forEach((p,i)=>{
      if(!groups[p.g]) groups[p.g]=[];
      groups[p.g].push({p,i});
    });

    Object.entries(groups).forEach(([group,items])=>{
      const og=document.createElement("optgroup");
      og.label=group;
      items.forEach(({p,i})=>{
        const o=document.createElement("option");
        o.value=String(i);
        o.textContent=p.n;
        og.appendChild(o);
      });
      select.appendChild(og);
    });

    if(previous && [...select.options].some(o=>o.value===previous)){
      select.value=previous;
    }
  }

  function closeProductResults(input,resultsBox){
    resultsBox.hidden=true;
    input.setAttribute("aria-expanded","false");
  }

  function selectProductMatch(input,resultsBox,select,item){
    input.value=item.p.n;
    select.value=String(item.i);
    closeProductResults(input,resultsBox);
    select.dispatchEvent(new Event("change",{bubbles:true}));
  }

  function syncTypedProduct(input,select){
    const term=normalizeSearch(input.value);
    if(!term){
      select.value="";
      return null;
    }

    const exactIndex=D.products.findIndex(p=>normalizeSearch(p.n)===term);
    if(exactIndex>=0){
      select.value=String(exactIndex);
      return exactIndex;
    }

    if(select.value!==""){
      const current=D.products[Number(select.value)];
      if(!current || normalizeSearch(current.n)!==term){
        select.value="";
      }
    }
    return null;
  }

  function renderSearchResults(input,resultsBox,select,showAll=false){
    const query=input.value;
    const matches=getProductMatches(showAll && !normalizeSearch(query) ? "" : query);

    resultsBox.innerHTML="";
    resultsBox.hidden=false;
    input.setAttribute("aria-expanded","true");

    if(!matches.length){
      select.value="";
      resultsBox.innerHTML='<div class="search-empty">No se encontraron productos</div>';
      return;
    }

    matches.forEach((item,index)=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="search-result-item";
      btn.setAttribute("role","option");
      btn.dataset.productIndex=String(item.i);
      btn.innerHTML='<strong>'+escapeHTML(item.p.n)+'</strong><small>'+escapeHTML(item.p.g)+'</small>';
      btn.addEventListener("mousedown",e=>e.preventDefault());
      btn.addEventListener("click",()=>selectProductMatch(input,resultsBox,select,item));
      if(index===0) btn.dataset.first="true";
      resultsBox.appendChild(btn);
    });
  }

  function setupProductCombobox(input,resultsBox,select,toggle){
    populateSelect(select);

    input.addEventListener("focus",()=>{
      renderSearchResults(input,resultsBox,select,true);
    });

    input.addEventListener("click",()=>{
      renderSearchResults(input,resultsBox,select,true);
    });

    input.addEventListener("input",()=>{
      syncTypedProduct(input,select);
      renderSearchResults(input,resultsBox,select,false);
    });

    input.addEventListener("keydown",event=>{
      if(event.key==="Escape"){
        closeProductResults(input,resultsBox);
        input.blur();
        return;
      }

      if(event.key==="Enter"){
        const first=resultsBox.querySelector(".search-result-item");
        if(first){
          event.preventDefault();
          const i=Number(first.dataset.productIndex);
          if(Number.isInteger(i) && D.products[i]){
            selectProductMatch(input,resultsBox,select,{p:D.products[i],i});
          }
        }
        return;
      }

      if(event.key==="ArrowDown"){
        const first=resultsBox.querySelector(".search-result-item");
        if(first){
          event.preventDefault();
          first.focus();
        }
      }
    });

    resultsBox.addEventListener("keydown",event=>{
      const items=[...resultsBox.querySelectorAll(".search-result-item")];
      const current=items.indexOf(document.activeElement);
      if(event.key==="ArrowDown" && items.length){
        event.preventDefault();
        items[Math.min(current+1,items.length-1)].focus();
      }else if(event.key==="ArrowUp" && items.length){
        event.preventDefault();
        if(current<=0) input.focus();
        else items[current-1].focus();
      }else if(event.key==="Escape"){
        closeProductResults(input,resultsBox);
        input.focus();
      }
    });

    toggle?.addEventListener("click",()=>{
      if(resultsBox.hidden){
        input.focus();
        renderSearchResults(input,resultsBox,select,true);
      }else{
        closeProductResults(input,resultsBox);
      }
    });

    select.addEventListener("change",()=>{
      if(select.value==="") return;
      const i=Number(select.value);
      if(Number.isInteger(i) && D.products[i]){
        input.value=D.products[i].n;
        closeProductResults(input,resultsBox);

        if(select===els.ppProduct && state.ppStage){
          choosePpStage(state.ppStage);
        }
      }
    });

    document.addEventListener("pointerdown",event=>{
      const combo=input.closest(".product-combobox");
      if(combo && !combo.contains(event.target)){
        closeProductResults(input,resultsBox);
      }
    });
  }

  function parseRule(code){
    if(!code) return null;
    if(code==="use") return {type:"use",text:"Uso por fecha del envase/etiqueta",refrigerated:false};
    const m=/^(\d+)(d|h)(R)?$/.exec(code);
    if(!m) return null;
    const amount=Number(m[1]), unit=m[2], refrigerated=Boolean(m[3]);
    return {type:"duration",amount,unit,refrigerated,text:formatLife(amount,unit,refrigerated)};
  }

  function formatLife(amount,unit,refrigerated=false){
    let text;
    if(unit==="d") text=amount+" "+(amount===1?"día":"días")+" ("+(amount*24)+" horas)";
    else {
      text=amount+" "+(amount===1?"hora":"horas");
      if(amount%24===0){
        const days=amount/24;
        text+=" ("+days+" "+(days===1?"día":"días")+")";
      }
    }
    if(refrigerated) text+=" · refrigerado";
    return text;
  }

  function dateOnly(v,end=false){
    if(!v) return null;
    const d=new Date(v+"T"+(end?"23:59:59":"00:00:00"));
    return Number.isNaN(d.getTime())?null:d;
  }
  function dateTime(d,t){
    if(!d||!t) return null;
    const x=new Date(d+"T"+t+":00");
    return Number.isNaN(x.getTime())?null:x;
  }
  function addRule(base,rule){
    const d=new Date(base);
    d.setTime(d.getTime()+rule.amount*(rule.unit==="d"?86400000:3600000));
    return d;
  }
  function formatDate(d){
    return d?new Intl.DateTimeFormat("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d):"—";
  }
  function formatDateTime(d){
    return d?new Intl.DateTimeFormat("es-CL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d):"—";
  }
  function humanDiff(ms){
    const past=ms<0;
    let mins=Math.round(Math.abs(ms)/60000);
    const days=Math.floor(mins/1440); mins-=days*1440;
    const hrs=Math.floor(mins/60); mins-=hrs*60;
    const parts=[];
    if(days) parts.push(days+" d");
    if(hrs) parts.push(hrs+" h");
    if(mins||!parts.length) parts.push(mins+" min");
    return past?"Venció hace "+parts.join(" "):parts.join(" ");
  }
  function escapeHTML(s){
    return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function calculateFr(){
    syncTypedProduct(els.frProductSearch,els.frProduct);
    if(els.frProduct.value===""){ alert("Selecciona uno de los productos que aparecen en la búsqueda."); return; }
    const received=dateOnly(els.frReceivedDate.value);
    if(!received){ alert("Ingresa la fecha de recibimiento."); return; }

    const pIndex=Number(els.frProduct.value);
    const p=D.products[pIndex];
    const rule=parseRule(p.r[1]);

    state.frProductIndex=pIndex;
    state.frReceived=received;
    state.frRule=rule;
    state.frExpiry=null;

    els.frManualBox.hidden=true;
    els.frResult.hidden=true;

    if(rule?.type==="duration"){
      state.frExpiry=addRule(received,rule);
      renderFrResult(p,rule,state.frExpiry,"planilla");
      return;
    }

    els.frManualBox.hidden=false;
    if(rule?.type==="use"){
      els.frManualTitle.textContent="Este producto usa la fecha que trae en el envase.";
      els.frManualHelp.textContent="Ingresa la fecha de vencimiento indicada en el producto.";
    }else{
      els.frManualTitle.textContent="La planilla no tiene una duración definida para este producto cerrado.";
      els.frManualHelp.textContent="Ingresa manualmente la fecha de vencimiento asignada al producto.";
    }
  }

  function confirmFrManual(){
    const expiry=dateOnly(els.frManualExpiry.value,true);
    if(!expiry){ alert("Ingresa la fecha de vencimiento."); return; }
    const p=D.products[state.frProductIndex];
    state.frExpiry=expiry;
    renderFrResult(p,state.frRule,expiry,state.frRule?.type==="use"?"uso-por-fecha":"manual");
  }

  function renderFrResult(p,rule,expiry,source){
    els.frResult.hidden=false;
    els.frResultProduct.textContent=p.n;
    els.frResultRule.textContent=
      source==="planilla"?"Calculado automáticamente con la columna Cerrado · FR/FV · En cámara fría.":
      source==="uso-por-fecha"?"Fecha tomada del vencimiento indicado por el usuario.":
      "Fecha de vencimiento ingresada manualmente.";
    const expiryText=formatDate(expiry);
    els.frResultExpiry.textContent=expiryText;
    els.frResultExpiryCard.textContent=expiryText;
    els.frResultReceived.textContent=formatDate(state.frReceived);
    els.frResultLife.textContent=rule?.type==="duration"?rule.text:(source==="uso-por-fecha"?"Uso por fecha":"Manual");
    const days=(expiry-state.frReceived)/86400000;
    els.frResultRemaining.textContent=(days>=0?Math.ceil(days):0)+" días";
    requestAnimationFrame(()=>els.frResult.scrollIntoView({behavior:"smooth",block:"nearest"}));

    lastFrResult={
      type:"FR/FB", product:p.n, received:state.frReceived.toISOString(),
      expiry:expiry.toISOString(), life:els.frResultLife.textContent,
      status:expiry<new Date()?"VENCIDO":"VIGENTE"
    };
  }

  function choosePpStage(stage){
    syncTypedProduct(els.ppProductSearch,els.ppProduct);
    if(els.ppProduct.value===""){ alert("Selecciona uno de los productos que aparecen en la búsqueda antes de elegir PREP o PROD."); return; }

    state.ppStage=stage;
    const p=D.products[Number(els.ppProduct.value)];
    const rule=parseRule(p.r[stage==="PREP"?2:4]);
    state.ppRule=rule;

    document.querySelectorAll(".pp-choice").forEach(b=>b.classList.toggle("selected",b.dataset.stage===stage));
    els.ppFields.hidden=false;
    els.ppResult.hidden=true;
    els.ppUseByBox.hidden=true;
    els.ppManualLifeBox.hidden=true;
    els.ppRuleBox.classList.remove("rule-ok","rule-use","rule-missing");

    if(stage==="PREP"){
      els.ppRuleKicker.textContent="ABIERTO · PREP · EN CÁMARA FRÍA / PREPARADO";
      els.ppDateLabel.textContent="Fecha de preparación";
      els.ppTimeLabel.textContent="Hora de preparación";
    }else{
      els.ppRuleKicker.textContent="ABIERTO · PROD · LÍNEA PRODUCCIÓN";
      els.ppDateLabel.textContent="Fecha de producción";
      els.ppTimeLabel.textContent="Hora de producción";
    }

    if(rule?.type==="duration"){
      els.ppRuleBox.classList.add("rule-ok");
      els.ppRuleTitle.textContent=rule.text;
      els.ppRuleText.textContent="El sistema sumará automáticamente este tiempo desde la fecha y hora que ingreses.";
    }else if(rule?.type==="use"){
      els.ppRuleBox.classList.add("rule-use");
      els.ppRuleTitle.textContent="Uso por fecha";
      els.ppRuleText.textContent="La planilla indica que se debe mantener la fecha de vencimiento del producto.";
      els.ppUseByBox.hidden=false;
    }else{
      els.ppRuleBox.classList.add("rule-missing");
      els.ppRuleTitle.textContent="Sin duración definida";
      els.ppRuleText.textContent="La planilla está vacía para esta etapa. Ingresa la vida útil manualmente.";
      els.ppManualLifeBox.hidden=false;
    }
  }

  function calculatePp(){
    syncTypedProduct(els.ppProductSearch,els.ppProduct);
    if(els.ppProduct.value===""){ alert("Selecciona uno de los productos que aparecen en la búsqueda."); return; }
    if(!state.ppStage){ alert("Selecciona Preparación o Producción."); return; }

    const start=dateTime(els.ppDate.value,els.ppTime.value);
    if(!start){ alert("Ingresa la fecha y la hora del proceso."); return; }

    const p=D.products[Number(els.ppProduct.value)];
    const rule=state.ppRule;
    let expiry,lifeText,source="planilla";

    if(rule?.type==="duration"){
      expiry=addRule(start,rule);
      lifeText=rule.text;
    }else if(rule?.type==="use"){
      expiry=dateOnly(els.ppUseByDate.value,true);
      if(!expiry){ alert("Ingresa la fecha de vencimiento del producto."); return; }
      lifeText="Uso por fecha";
      source="uso-por-fecha";
    }else{
      const amount=Number(els.ppManualAmount.value);
      const unit=els.ppManualUnit.value;
      if(!Number.isFinite(amount)||amount<=0){ alert("Ingresa la vida útil manual."); return; }
      expiry=addRule(start,{amount,unit});
      lifeText=formatLife(amount,unit,false);
      source="manual";
    }

    state.ppExpiry=expiry;
    const remaining=expiry-new Date();
    let status,statusClass;
    if(remaining<0){status="VENCIDO";statusClass="expired";}
    else if(remaining<=12*3600000){status="POR VENCER";statusClass="soon";}
    else{status="VIGENTE";statusClass="ok";}

    els.ppResult.hidden=false;
    els.ppResultState.textContent=status;
    els.ppResultState.className="status-badge "+statusClass;
    els.ppResultProduct.textContent=p.n;
    els.ppResultRule.textContent=(state.ppStage==="PREP"?"Preparación":"Producción")+" · "+(source==="manual"?"dato manual":"según planilla");
    els.ppRemaining.textContent=humanDiff(remaining);
    els.ppResultStage.textContent=state.ppStage==="PREP"?"PREP · Preparación":"PROD · Producción";
    els.ppResultStart.textContent=formatDateTime(start);
    els.ppResultLife.textContent=lifeText;
    els.ppResultExpiry.textContent=rule?.type==="use"?formatDate(expiry):formatDateTime(expiry);

    const warnings=[];
    if(rule?.refrigerated) warnings.push("Esta regla está marcada como almacenamiento refrigerado.");
    els.ppWarning.hidden=!warnings.length;
    els.ppWarning.innerHTML=warnings.map(x=>"• "+escapeHTML(x)).join("<br>");

    lastPpResult={
      type:state.ppStage, product:p.n, start:start.toISOString(),
      expiry:expiry.toISOString(), life:lifeText, status
    };
  }

  function resetPp(){
    state.ppStage=null; state.ppRule=null; state.ppExpiry=null;
    els.ppDate.value=""; els.ppTime.value=""; els.ppUseByDate.value="";
    els.ppManualAmount.value=""; els.ppManualUnit.value="d";
    els.ppFields.hidden=true; els.ppResult.hidden=true;
    document.querySelectorAll(".pp-choice").forEach(b=>b.classList.remove("selected"));
  }

  function historyLoad(){try{return JSON.parse(localStorage.getItem("meilan_history_v5")||"[]")}catch{return[]}}
  function historySave(item){
    const h=historyLoad(); h.unshift(item);
    localStorage.setItem("meilan_history_v5",JSON.stringify(h.slice(0,80)));
    renderHistory();
  }
  function renderHistory(){
    const h=historyLoad(); els.history.innerHTML="";
    if(!h.length){els.history.innerHTML='<div class="history-empty">Aún no hay cálculos guardados.</div>';return;}
    h.slice(0,20).forEach(x=>{
      const div=document.createElement("div"); div.className="history-item";
      const exp=x.expiry?new Date(x.expiry):null;
      div.innerHTML='<div><strong>'+escapeHTML(x.product)+'</strong><small>'+escapeHTML(x.type)+' · Vence: '+escapeHTML(x.type==="FR/FB"?formatDate(exp):formatDateTime(exp))+'<br>'+escapeHTML(x.life||"")+'</small></div><span class="status-badge '+(x.status==="VENCIDO"?"expired":x.status==="POR VENCER"?"soon":"ok")+'">'+escapeHTML(x.status||"")+'</span>';
      els.history.appendChild(div);
    });
  }

  function updateNetworkStatus(){
    if(!els.networkBadge) return;
    const online=navigator.onLine;
    els.networkBadge.textContent=online?"En línea":"Sin internet";
    els.networkBadge.className="pill "+(online?"ok":"soon");
  }
  function isStandalone(){
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true;
  }
  function setInstalledUi(installed){
    if(isStandalone()){
      els.installPwaBtn.hidden=true; els.openPwaBtn.hidden=true; return;
    }
    if(installed){
      localStorage.setItem("meilan_pwa_installed","1");
      els.installPwaBtn.hidden=true; els.openPwaBtn.hidden=false;
    }else{
      localStorage.removeItem("meilan_pwa_installed");
      els.installPwaBtn.hidden=false; els.openPwaBtn.hidden=true;
    }
  }
  async function detectInstalledPwa(){
    if(isStandalone()){setInstalledUi(true);return true;}
    if("getInstalledRelatedApps" in navigator){
      try{
        const apps=await navigator.getInstalledRelatedApps();
        const installed=Array.isArray(apps)&&apps.some(app=>app.platform==="webapp");
        setInstalledUi(installed); return installed;
      }catch{}
    }
    const saved=localStorage.getItem("meilan_pwa_installed")==="1";
    setInstalledUi(saved); return saved;
  }
  async function reloadApp(){
    if(!els.reloadAppBtn) return;
    const original=els.reloadAppBtn.textContent;
    els.reloadAppBtn.disabled=true;
    els.reloadAppBtn.textContent=navigator.onLine?"Actualizando…":"Recargando…";

    try{
      if("serviceWorker" in navigator){
        const reg=await navigator.serviceWorker.getRegistration("./");
        if(reg && navigator.onLine){
          try{ await reg.update(); }catch{}
        }
      }
    }finally{
      setTimeout(()=>{
        window.location.reload();
      },250);
      setTimeout(()=>{
        if(els.reloadAppBtn){
          els.reloadAppBtn.disabled=false;
          els.reloadAppBtn.textContent=original;
        }
      },2500);
    }
  }

  function setupPwaInstall(){
    updateNetworkStatus();
    window.addEventListener("online",updateNetworkStatus);
    window.addEventListener("offline",updateNetworkStatus);
    window.addEventListener("beforeinstallprompt",event=>{
      event.preventDefault(); deferredInstallPrompt=event;
      if(!isStandalone()){els.installPwaBtn.hidden=false;els.openPwaBtn.hidden=true;}
    });
    window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;setInstalledUi(true);});
    els.installPwaBtn?.addEventListener("click",async()=>{
      if(!deferredInstallPrompt){
        const installed=await detectInstalledPwa();
        if(installed) return;
        alert("Chrome todavía no habilitó el instalador automático. Vuelve a tocar “Instalar” en unos segundos o usa el menú de Chrome.");
        return;
      }
      const promptEvent=deferredInstallPrompt; deferredInstallPrompt=null;
      const result=await promptEvent.prompt();
      if(result?.outcome==="accepted") setInstalledUi(true); else setInstalledUi(false);
    });
    detectInstalledPwa();
  }

  els.frCalculateBtn.addEventListener("click",calculateFr);
  els.frConfirmManualBtn.addEventListener("click",confirmFrManual);
  els.frSaveBtn.addEventListener("click",()=>{if(lastFrResult)historySave(lastFrResult);});

  document.querySelectorAll(".pp-choice").forEach(btn=>btn.addEventListener("click",()=>choosePpStage(btn.dataset.stage)));
  els.ppCalculateBtn.addEventListener("click",calculatePp);
  els.ppSaveBtn.addEventListener("click",()=>{if(lastPpResult)historySave(lastPpResult);});
  els.newProcessBtn.addEventListener("click",resetPp);

  els.reloadAppBtn?.addEventListener("click",reloadApp);

  els.clearHistory.addEventListener("click",()=>{
    if(confirm("¿Borrar el historial guardado en este dispositivo?")){
      localStorage.removeItem("meilan_history_v5"); renderHistory();
    }
  });

  setupProductCombobox(els.frProductSearch,els.frSearchResults,els.frProduct,els.frComboToggle);
  setupProductCombobox(els.ppProductSearch,els.ppSearchResults,els.ppProduct,els.ppComboToggle);
  renderHistory();
  setupPwaInstall();
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{});
  }
})();