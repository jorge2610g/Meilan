(() => {
  const $ = (id) => document.getElementById(id);
  const D = window.MEILAN_DATA;

  const els = {
    product:$("productSelect"),
    receivedDate:$("receivedDate"),
    validateReceipt:$("validateReceiptBtn"),
    closedRuleBox:$("closedRuleBox"),
    closedRuleTitle:$("closedRuleTitle"),
    closedRuleText:$("closedRuleText"),
    closedExpiryAuto:$("closedExpiryAuto"),
    closedExpiryAutoValue:$("closedExpiryAutoValue"),
    closedManualWrap:$("closedManualWrap"),
    closedManualTitle:$("closedManualTitle"),
    closedManualHelp:$("closedManualHelp"),
    closedExpiryDate:$("closedExpiryDate"),
    confirmClosed:$("confirmClosedBtn"),
    continueStage:$("continueStageBtn"),
    processHeading:$("processHeading"),
    processHelper:$("processHelper"),
    processRuleBox:$("processRuleBox"),
    processRuleKicker:$("processRuleKicker"),
    processRuleTitle:$("processRuleTitle"),
    processRuleText:$("processRuleText"),
    processDate:$("processDate"),
    processTime:$("processTime"),
    processDateLabel:$("processDateLabel"),
    processTimeLabel:$("processTimeLabel"),
    manualLifeWrap:$("manualLifeWrap"),
    manualLifeAmount:$("manualLifeAmount"),
    manualLifeUnit:$("manualLifeUnit"),
    useByProcessBox:$("useByProcessBox"),
    useByProcessValue:$("useByProcessValue"),
    calculate:$("calculateBtn"),
    flowBadge:$("flowBadge"),
    resultState:$("resultState"),
    resultProduct:$("resultProduct"),
    resultRule:$("resultRule"),
    remaining:$("remainingText"),
    resultReceived:$("resultReceived"),
    resultClosedExpiry:$("resultClosedExpiry"),
    resultStage:$("resultStage"),
    resultStart:$("resultStart"),
    resultLife:$("resultLife"),
    official:$("resultOfficialExpiry"),
    warning:$("warningBox"),
    save:$("saveHistoryBtn"),
    restart:$("restartBtn"),
    history:$("historyList"),
    clearHistory:$("clearHistoryBtn")
  };

  const state = {
    step:1,
    productIndex:null,
    received:null,
    closedRule:null,
    closedExpiry:null,
    closedExpirySource:null,
    stage:null,
    processRule:null,
    processExpiry:null
  };

  let lastResult = null;

  function initProducts(){
    els.product.innerHTML = '<option value="">Selecciona un producto</option>';
    const groups = {};
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
      els.product.appendChild(og);
    });
  }

  function parseRule(code){
    if(!code) return null;
    if(code==="use") return {type:"use",text:"Uso por fecha del envase/etiqueta",refrigerated:false};
    const m=/^(\d+)(d|h)(R)?$/.exec(code);
    if(!m) return null;
    const amount=Number(m[1]);
    const unit=m[2];
    const refrigerated=Boolean(m[3]);
    return {
      type:"duration",
      amount,
      unit,
      refrigerated,
      text:formatLife(amount,unit,refrigerated)
    };
  }

  function formatLife(amount,unit,refrigerated=false){
    let text;
    if(unit==="d"){
      text=amount+" "+(amount===1?"día":"días")+" ("+(amount*24)+" horas)";
    }else{
      const days=amount%24===0 ? amount/24 : null;
      text=amount+" "+(amount===1?"hora":"horas");
      if(days) text+=" ("+days+" "+(days===1?"día":"días")+")";
    }
    if(refrigerated) text+=" · refrigerado";
    return text;
  }

  function goStep(n){
    state.step=n;
    document.querySelectorAll(".wizard-step").forEach(x=>{
      x.classList.toggle("active",Number(x.dataset.step)===n);
    });
    document.querySelectorAll("[data-step-dot]").forEach(x=>{
      const s=Number(x.dataset.stepDot);
      x.classList.toggle("active",s===n);
      x.classList.toggle("done",s<n);
    });
    els.flowBadge.textContent="Paso "+n+" de 4";
    document.querySelector(".wizard-card")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function dateOnly(value,endOfDay=false){
    if(!value) return null;
    const d=new Date(value+"T"+(endOfDay?"23:59:59":"00:00:00"));
    return Number.isNaN(d.getTime())?null:d;
  }

  function dateTime(date,time){
    if(!date || !time) return null;
    const d=new Date(date+"T"+time+":00");
    return Number.isNaN(d.getTime())?null:d;
  }

  function addRule(base,rule){
    const d=new Date(base);
    const ms=rule.amount*(rule.unit==="d"?86400000:3600000);
    d.setTime(d.getTime()+ms);
    return d;
  }

  function formatDate(d){
    if(!d) return "—";
    return new Intl.DateTimeFormat("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
  }

  function formatDateTime(d){
    if(!d) return "—";
    return new Intl.DateTimeFormat("es-CL",{
      day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false
    }).format(d);
  }

  function humanDiff(ms){
    const past=ms<0;
    let mins=Math.round(Math.abs(ms)/60000);
    const days=Math.floor(mins/1440); mins-=days*1440;
    const hrs=Math.floor(mins/60); mins-=hrs*60;
    const parts=[];
    if(days) parts.push(days+" d");
    if(hrs) parts.push(hrs+" h");
    if(mins || !parts.length) parts.push(mins+" min");
    return past?"Venció hace "+parts.join(" "):parts.join(" ");
  }

  function currentProduct(){
    if(els.product.value==="") return null;
    return D.products[Number(els.product.value)] || null;
  }

  function resetClosedUI(){
    els.closedRuleBox.hidden=true;
    els.closedManualWrap.hidden=true;
    els.closedExpiryAuto.hidden=true;
    els.continueStage.hidden=true;
    els.closedRuleBox.classList.remove("rule-ok","rule-use","rule-missing");
  }

  function validateReceipt(){
    const p=currentProduct();
    const received=dateOnly(els.receivedDate.value);

    if(!p){ alert("Selecciona el producto."); return; }
    if(!received){ alert("Ingresa la fecha de recibimiento."); return; }

    state.productIndex=Number(els.product.value);
    state.received=received;
    state.closedExpiry=null;
    state.closedExpirySource=null;

    // Índice 1 = Cerrado · FR/FV · En cámara fría.
    const rule=parseRule(p.r[1]);
    state.closedRule=rule;

    els.closedRuleBox.hidden=false;
    els.closedManualWrap.hidden=true;
    els.closedExpiryAuto.hidden=true;
    els.continueStage.hidden=true;
    els.closedRuleBox.classList.remove("rule-ok","rule-use","rule-missing");

    if(rule?.type==="duration"){
      state.closedExpiry=addRule(received,rule);
      state.closedExpirySource="planilla";
      els.closedRuleBox.classList.add("rule-ok");
      els.closedRuleTitle.textContent=rule.text;
      els.closedRuleText.textContent=
        "La planilla indica que este producto cerrado en cámara fría dura "+rule.text+
        " desde la fecha de recibimiento.";
      els.closedExpiryAuto.hidden=false;
      els.closedExpiryAutoValue.textContent=formatDate(state.closedExpiry);
      els.continueStage.hidden=false;
      return;
    }

    if(rule?.type==="use"){
      els.closedRuleBox.classList.add("rule-use");
      els.closedRuleTitle.textContent="Uso por fecha";
      els.closedRuleText.textContent=
        "Este producto no se calcula sumando días desde la recepción: se utiliza la fecha que viene en el envase o etiqueta original.";
      els.closedManualWrap.hidden=false;
      els.closedManualTitle.textContent="Ingresa la fecha de vencimiento que trae el producto.";
      els.closedManualHelp.textContent=
        "La planilla marca “Uso por fecha”, por eso necesitamos la fecha real indicada en el envase.";
      return;
    }

    els.closedRuleBox.classList.add("rule-missing");
    els.closedRuleTitle.textContent="Sin duración en cámara fría";
    els.closedRuleText.textContent=
      "La planilla no tiene una duración asignada en “Cerrado · FR/FV · En cámara fría” para este producto.";
    els.closedManualWrap.hidden=false;
    els.closedManualTitle.textContent="Ingresa la fecha de vencimiento asignada al producto.";
    els.closedManualHelp.textContent=
      "Como la planilla está vacía en esta condición, la fecha debe ser ingresada manualmente.";
  }

  function confirmClosed(){
    const expiry=dateOnly(els.closedExpiryDate.value,true);
    if(!expiry){ alert("Ingresa la fecha de vencimiento del producto."); return; }

    state.closedExpiry=expiry;
    state.closedExpirySource=state.closedRule?.type==="use" ? "uso-por-fecha" : "manual";

    els.closedExpiryAuto.hidden=false;
    els.closedExpiryAutoValue.textContent=formatDate(expiry);
    els.continueStage.hidden=false;
  }

  function chooseStage(stage){
    state.stage=stage;
    const p=D.products[state.productIndex];
    const ruleIndex=stage==="PREP" ? 2 : 4;
    const rule=parseRule(p.r[ruleIndex]);
    state.processRule=rule;

    els.processRuleBox.classList.remove("rule-ok","rule-use","rule-missing");
    els.manualLifeWrap.hidden=true;
    els.useByProcessBox.hidden=true;
    els.processDate.value="";
    els.processTime.value="";
    els.manualLifeAmount.value="";

    if(stage==="PREP"){
      els.processHeading.textContent="3. Preparación";
      els.processHelper.textContent=
        "Ingresa la fecha y la hora exactas en que se preparó el producto. El cálculo parte desde ese momento, no desde la fecha de recibimiento.";
      els.processDateLabel.textContent="Fecha de preparación";
      els.processTimeLabel.textContent="Hora de preparación";
      els.processRuleKicker.textContent="ABIERTO · PREP · EN CÁMARA FRÍA / PREPARADO";
    }else{
      els.processHeading.textContent="3. Producción";
      els.processHelper.textContent=
        "Ingresa la fecha y la hora exactas en que el producto se sacó para trabajar en producción.";
      els.processDateLabel.textContent="Fecha de producción";
      els.processTimeLabel.textContent="Hora de producción";
      els.processRuleKicker.textContent="ABIERTO · PROD · LÍNEA PRODUCCIÓN";
    }

    if(rule?.type==="duration"){
      els.processRuleBox.classList.add("rule-ok");
      els.processRuleTitle.textContent=rule.text;
      els.processRuleText.textContent=
        "La planilla define esta vida útil para "+(stage==="PREP"?"preparación":"producción")+
        ". Se sumará exactamente desde la fecha y hora que ingreses.";
    }else if(rule?.type==="use"){
      els.processRuleBox.classList.add("rule-use");
      els.processRuleTitle.textContent="Uso por fecha";
      els.processRuleText.textContent=
        "La planilla indica “Uso por fecha”, por lo que se conserva la fecha de vencimiento ya definida para el producto.";
      els.useByProcessBox.hidden=false;
      els.useByProcessValue.textContent=formatDate(state.closedExpiry);
    }else{
      els.processRuleBox.classList.add("rule-missing");
      els.processRuleTitle.textContent="Sin tiempo definido en la planilla";
      els.processRuleText.textContent=
        "La celda de esta etapa está vacía. Debes ingresar manualmente la vida útil.";
      els.manualLifeWrap.hidden=false;
    }

    goStep(3);
  }

  function calculateProcess(){
    const p=D.products[state.productIndex];
    if(!p || !state.stage){ alert("Falta seleccionar el producto o el tipo de proceso."); return; }

    const start=dateTime(els.processDate.value,els.processTime.value);
    if(!start){
      alert("Ingresa la fecha y la hora de "+(state.stage==="PREP"?"preparación.":"producción."));
      return;
    }

    let expiry;
    let lifeText;
    let lifeSource="planilla";
    const rule=state.processRule;

    if(rule?.type==="duration"){
      expiry=addRule(start,rule);
      lifeText=rule.text;
    }else if(rule?.type==="use"){
      if(!state.closedExpiry){
        alert("Primero debes definir la fecha de vencimiento del producto recibido.");
        return;
      }
      expiry=new Date(state.closedExpiry);
      lifeText="Uso por fecha del producto recibido";
    }else{
      const amount=Number(els.manualLifeAmount.value);
      const unit=els.manualLifeUnit.value;
      if(!Number.isFinite(amount) || amount<=0){
        alert("Ingresa la vida útil manual para esta etapa.");
        return;
      }
      const manualRule={amount,unit};
      expiry=addRule(start,manualRule);
      lifeText=formatLife(amount,unit,false);
      lifeSource="manual";
    }

    state.processExpiry=expiry;

    const now=new Date();
    const remaining=expiry-now;
    let status,statusClass;
    if(remaining<0){ status="VENCIDO"; statusClass="expired"; }
    else if(remaining<=12*3600000){ status="POR VENCER"; statusClass="soon"; }
    else{ status="VIGENTE"; statusClass="ok"; }

    const warnings=[];
    if(state.closedExpiry && start>state.closedExpiry){
      warnings.push("La fecha/hora del proceso está después del vencimiento del producto recibido.");
    }
    if(rule?.refrigerated){
      warnings.push("Esta vida útil está marcada en la planilla como almacenamiento refrigerado.");
    }

    els.resultState.textContent=status;
    els.resultState.className="status-badge "+statusClass;
    els.resultProduct.textContent=p.n;
    els.resultRule.textContent=
      (state.stage==="PREP"?"Preparación":"Producción")+" · "+lifeText+
      (lifeSource==="manual"?" · dato manual":"");
    els.remaining.textContent=humanDiff(remaining);
    els.resultReceived.textContent=formatDate(state.received);
    els.resultClosedExpiry.textContent=formatDate(state.closedExpiry);
    els.resultStage.textContent=state.stage==="PREP" ? "PREP · Preparación" : "PROD · Producción";
    els.resultStart.textContent=formatDateTime(start);
    els.resultLife.textContent=lifeText+(lifeSource==="manual"?" (manual)":"");
    els.official.textContent=
      rule?.type==="use" ? formatDate(expiry) : formatDateTime(expiry);

    els.warning.hidden=!warnings.length;
    els.warning.innerHTML=warnings.map(w=>"• "+escapeHTML(w)).join("<br>");

    lastResult={
      at:new Date().toISOString(),
      product:p.n,
      received:state.received?.toISOString()||null,
      closedExpiry:state.closedExpiry?.toISOString()||null,
      closedExpirySource:state.closedExpirySource,
      stage:state.stage,
      start:start.toISOString(),
      life:lifeText,
      lifeSource,
      expiry:expiry.toISOString(),
      status
    };

    goStep(4);
  }

  function restart(){
    state.step=1;
    state.productIndex=null;
    state.received=null;
    state.closedRule=null;
    state.closedExpiry=null;
    state.closedExpirySource=null;
    state.stage=null;
    state.processRule=null;
    state.processExpiry=null;
    lastResult=null;

    els.product.value="";
    els.receivedDate.value="";
    els.closedExpiryDate.value="";
    els.processDate.value="";
    els.processTime.value="";
    els.manualLifeAmount.value="";
    els.manualLifeUnit.value="d";
    resetClosedUI();
    goStep(1);
  }

  function historyLoad(){
    try{return JSON.parse(localStorage.getItem("meilan_history_v3")||"[]")}catch{return[]}
  }

  function historySave(items){
    localStorage.setItem("meilan_history_v3",JSON.stringify(items.slice(0,80)));
    renderHistory();
  }

  function renderHistory(){
    const h=historyLoad();
    els.history.innerHTML="";
    if(!h.length){
      els.history.innerHTML='<div class="history-empty">Aún no hay cálculos guardados.</div>';
      return;
    }

    h.slice(0,20).forEach(x=>{
      const div=document.createElement("div");
      div.className="history-item";
      const stage=x.stage==="PREP"?"PREP":"PROD";
      const exp=x.expiry?formatDateTime(new Date(x.expiry)):"—";
      div.innerHTML=
        '<div><strong>'+escapeHTML(x.product)+'</strong>'+
        '<small>'+stage+' · Vence: '+escapeHTML(exp)+'<br>'+escapeHTML(x.life||"")+'</small></div>'+
        '<span class="status-badge '+(x.status==="VENCIDO"?"expired":x.status==="POR VENCER"?"soon":"ok")+'">'+
        escapeHTML(x.status)+'</span>';
      els.history.appendChild(div);
    });
  }

  function escapeHTML(s){
    return String(s??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  els.validateReceipt.addEventListener("click",validateReceipt);
  els.confirmClosed.addEventListener("click",confirmClosed);
  els.continueStage.addEventListener("click",()=>goStep(2));

  document.querySelectorAll("[data-stage-choice]").forEach(btn=>{
    btn.addEventListener("click",()=>chooseStage(btn.dataset.stageChoice));
  });

  document.querySelectorAll("[data-back]").forEach(btn=>{
    btn.addEventListener("click",()=>goStep(Number(btn.dataset.back)));
  });

  els.calculate.addEventListener("click",calculateProcess);
  els.restart.addEventListener("click",restart);

  els.save.addEventListener("click",()=>{
    if(!lastResult) return;
    const h=historyLoad();
    h.unshift(lastResult);
    historySave(h);
    els.save.textContent="Guardado ✓";
    setTimeout(()=>els.save.textContent="Guardar revisión",1200);
  });

  els.clearHistory.addEventListener("click",()=>{
    if(confirm("¿Borrar el historial guardado en este dispositivo?")){
      localStorage.removeItem("meilan_history_v3");
      renderHistory();
    }
  });

  initProducts();
  renderHistory();
  resetClosedUI();
  goStep(1);

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
})();