(() => {
  const $ = (id) => document.getElementById(id);
  const D = window.MEILAN_DATA;

  const els = {
    product:$("productSelect"), receivedDate:$("receivedDate"),
    validateReceipt:$("validateReceiptBtn"), closedRuleBox:$("closedRuleBox"),
    closedRuleTitle:$("closedRuleTitle"), closedRuleText:$("closedRuleText"),
    closedExpiryAuto:$("closedExpiryAuto"), closedExpiryAutoValue:$("closedExpiryAutoValue"),
    closedManualWrap:$("closedManualWrap"), closedManualLabel:$("closedManualLabel"),
    closedManualHelp:$("closedManualHelp"), closedExpiryDate:$("closedExpiryDate"),
    confirmClosed:$("confirmClosedBtn"), continueStage:$("continueStageBtn"),
    processHeading:$("processHeading"), processHelper:$("processHelper"),
    processRuleBox:$("processRuleBox"), processRuleKicker:$("processRuleKicker"),
    processRuleTitle:$("processRuleTitle"), processRuleText:$("processRuleText"),
    operator:$("operatorInitial"), processDate:$("processDate"), processTime:$("processTime"),
    processDateLabel:$("processDateLabel"), processTimeLabel:$("processTimeLabel"),
    manualLifeWrap:$("manualLifeWrap"), manualLifeAmount:$("manualLifeAmount"), manualLifeUnit:$("manualLifeUnit"),
    useByProcessBox:$("useByProcessBox"), useByProcessValue:$("useByProcessValue"),
    writtenExpiryDate:$("writtenExpiryDate"), writtenExpiryTime:$("writtenExpiryTime"),
    calculate:$("calculateBtn"), flowBadge:$("flowBadge"),
    resultState:$("resultState"), resultProduct:$("resultProduct"), resultRule:$("resultRule"),
    remaining:$("remainingText"), resultReceived:$("resultReceived"),
    resultClosedExpiry:$("resultClosedExpiry"), resultStage:$("resultStage"),
    resultOperator:$("resultOperator"), resultStart:$("resultStart"),
    resultLife:$("resultLife"), official:$("resultOfficialExpiry"),
    written:$("resultWrittenExpiry"), warning:$("warningBox"),
    save:$("saveHistoryBtn"), restart:$("restartBtn"),
    history:$("historyList"), clearHistory:$("clearHistoryBtn"),
    video:$("video"), canvas:$("canvas"), preview:$("preview"),
    cameraStatus:$("cameraStatus"), openCameraBtn:$("openCameraBtn"),
    captureBtn:$("captureBtn"), fileInput:$("fileInput"), resetImageBtn:$("resetImageBtn"),
    ocrBox:$("ocrBox"), ocrProgress:$("ocrProgress"),
    ocrProgressBar:$("ocrProgressBar"), ocrText:$("ocrText")
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
    processExpiry:null,
    detectedStage:null
  };

  let stream = null;
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
    if(code==="use") return {
      type:"use", text:"Uso por fecha del envase/etiqueta", refrigerated:false
    };
    const m=/^(\d+)(d|h)(R)?$/.exec(code);
    if(!m) return null;
    const amount=Number(m[1]), unit=m[2], refrigerated=Boolean(m[3]);
    return {
      type:"duration", amount, unit, refrigerated,
      text:amount+" "+(unit==="d"?"días":"horas")+(refrigerated?" · almacenamiento refrigerado":"")
    };
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

  function dateTime(date,time,defaultTime="00:00"){
    if(!date) return null;
    const d=new Date(date+"T"+(time||defaultTime)+":00");
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
    return new Intl.DateTimeFormat("es-CL",{dateStyle:"medium"}).format(d);
  }

  function formatDateTime(d){
    if(!d) return "—";
    return new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"short"}).format(d);
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

  function product(){
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
    const p=product();
    const received=dateOnly(els.receivedDate.value);
    if(!p){ alert("Selecciona el producto."); return; }
    if(!received){ alert("Ingresa la fecha de recepción / entrega (FR)."); return; }

    state.productIndex=Number(els.product.value);
    state.received=received;
    state.closedExpiry=null;
    state.closedExpirySource=null;

    const code=p.r[1]; // Cerrado · FR/FV · En cámara fría
    const rule=parseRule(code);
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
      els.closedRuleText.textContent="La planilla sí define vida útil para el producto cerrado en cámara fría. Se calcula desde la fecha de recepción.";
      els.closedExpiryAuto.hidden=false;
      els.closedExpiryAutoValue.textContent=formatDate(state.closedExpiry);
      els.continueStage.hidden=false;
      return;
    }

    if(rule?.type==="use"){
      els.closedRuleBox.classList.add("rule-use");
      els.closedRuleTitle.textContent="Uso por fecha";
      els.closedRuleText.textContent="La planilla indica “Uso por fecha”: corresponde al período de validez indicado en el envase o etiqueta original, sin abrir.";
      els.closedManualWrap.hidden=false;
      els.closedManualLabel.textContent="FB/FV · Fecha de vencimiento del envase / etiqueta";
      els.closedManualHelp.textContent="Ingresa la fecha que trae o tiene asignada el producto.";
      return;
    }

    els.closedRuleBox.classList.add("rule-missing");
    els.closedRuleTitle.textContent="Sin regla cargada en la planilla";
    els.closedRuleText.textContent="La celda “Cerrado · FR/FV · En cámara fría” está vacía para este producto.";
    els.closedManualWrap.hidden=false;
    els.closedManualLabel.textContent="Fecha de vencimiento asignada al producto";
    els.closedManualHelp.textContent="Como la planilla no entrega una vida útil para esta condición, ingresa manualmente la fecha que corresponde.";
  }

  function confirmClosed(){
    const expiry=dateOnly(els.closedExpiryDate.value,true);
    if(!expiry){ alert("Ingresa la fecha de vencimiento del producto."); return; }
    state.closedExpiry=expiry;
    state.closedExpirySource=state.closedRule?.type==="use"?"uso-por-fecha":"manual";
    els.closedExpiryAuto.hidden=false;
    els.closedExpiryAutoValue.textContent=formatDate(expiry);
    els.continueStage.hidden=false;
  }

  function chooseStage(stage){
    state.stage=stage;
    const p=D.products[state.productIndex];
    const ruleIndex=stage==="PREP"?2:4;
    const rule=parseRule(p.r[ruleIndex]);
    state.processRule=rule;

    els.processRuleBox.classList.remove("rule-ok","rule-use","rule-missing");
    els.manualLifeWrap.hidden=true;
    els.useByProcessBox.hidden=true;

    if(stage==="PREP"){
      els.processHeading.textContent="3. Preparación";
      els.processHelper.textContent="Ingresa la fecha y hora en que se preparó el producto.";
      els.processDateLabel.textContent="Fecha de preparación";
      els.processTimeLabel.textContent="Hora de preparación";
      els.processRuleKicker.textContent="ABIERTO · PREP · EN CÁMARA FRÍA / PREPARADO";
    }else{
      els.processHeading.textContent="3. Producción";
      els.processHelper.textContent="Ingresa la fecha y hora en que el producto pasó a producción.";
      els.processDateLabel.textContent="Fecha de producción";
      els.processTimeLabel.textContent="Hora de producción";
      els.processRuleKicker.textContent="ABIERTO · PROD · LÍNEA PRODUCCIÓN";
    }

    if(rule?.type==="duration"){
      els.processRuleBox.classList.add("rule-ok");
      els.processRuleTitle.textContent=rule.text;
      els.processRuleText.textContent="La planilla define esta vida útil. El vencimiento se calculará desde la fecha y hora ingresadas.";
    }else if(rule?.type==="use"){
      els.processRuleBox.classList.add("rule-use");
      els.processRuleTitle.textContent="Uso por fecha";
      els.processRuleText.textContent="La planilla no asigna días u horas nuevos: se mantiene la fecha de vencimiento del producto.";
      els.useByProcessBox.hidden=false;
      els.useByProcessValue.textContent=formatDate(state.closedExpiry);
    }else{
      els.processRuleBox.classList.add("rule-missing");
      els.processRuleTitle.textContent="Sin vida útil cargada";
      els.processRuleText.textContent="La celda correspondiente está vacía. Debes indicar manualmente la vida útil para este proceso.";
      els.manualLifeWrap.hidden=false;
    }

    goStep(3);
  }

  function calculateProcess(){
    const p=D.products[state.productIndex];
    if(!p || !state.stage){ alert("Falta seleccionar el producto o el destino."); return; }

    const start=dateTime(els.processDate.value,els.processTime.value);
    if(!start){
      alert("Ingresa la fecha y la hora de "+(state.stage==="PREP"?"preparación.":"producción."));
      return;
    }

    let expiry=null;
    let lifeText="";
    let lifeSource="planilla";
    const rule=state.processRule;

    if(rule?.type==="duration"){
      expiry=addRule(start,rule);
      lifeText=rule.text;
    }else if(rule?.type==="use"){
      if(!state.closedExpiry){
        alert("No hay una fecha de vencimiento del producto definida en el paso de recepción.");
        return;
      }
      expiry=new Date(state.closedExpiry);
      lifeText="Uso por fecha del producto";
    }else{
      const amount=Number(els.manualLifeAmount.value);
      const unit=els.manualLifeUnit.value;
      if(!Number.isFinite(amount) || amount<=0){
        alert("La planilla está vacía para esta etapa. Ingresa la vida útil manual.");
        return;
      }
      const manualRule={amount,unit};
      expiry=addRule(start,manualRule);
      lifeText="Manual: "+amount+" "+(unit==="d"?"días":"horas");
      lifeSource="manual";
    }

    state.processExpiry=expiry;

    const written=dateTime(els.writtenExpiryDate.value,els.writtenExpiryTime.value,"23:59");
    const now=new Date();
    const remaining=expiry-now;
    let status,statusClass;
    if(remaining<0){ status="VENCIDO"; statusClass="expired"; }
    else if(remaining<=12*3600000){ status="POR VENCER"; statusClass="soon"; }
    else { status="VIGENTE"; statusClass="ok"; }

    const warnings=[];
    if(state.closedExpiry && start>state.closedExpiry){
      warnings.push("El proceso fue registrado después de la fecha de vencimiento del producto cerrado.");
    }
    if(state.closedExpiry && expiry>state.closedExpiry && rule?.type!=="use"){
      warnings.push("El vencimiento calculado de "+state.stage+" queda después del vencimiento del producto cerrado/FB-FV. Revisa ambas fechas.");
    }
    if(written){
      const diff=Math.abs(written-expiry);
      if(diff>30*60000){
        warnings.push("La fecha/hora escrita en el Meilan no coincide con la calculada por la planilla. Diferencia aproximada: "+humanDiff(diff).replace("Venció hace ","")+".");
      }
    }
    if(rule?.refrigerated){
      warnings.push("La regla de esta etapa está marcada como almacenamiento refrigerado.");
    }

    els.resultState.textContent=status;
    els.resultState.className="status-badge "+statusClass;
    els.resultProduct.textContent=p.n;
    els.resultRule.textContent=(state.stage==="PREP"?"Preparación":"Producción")+" · "+(rule?lifeText:"Vida útil manual");
    els.remaining.textContent=humanDiff(remaining);
    els.resultReceived.textContent=formatDate(state.received);
    els.resultClosedExpiry.textContent=formatDate(state.closedExpiry);
    els.resultStage.textContent=state.stage==="PREP"?"PREP · Preparación":"PROD · Producción";
    els.resultOperator.textContent=els.operator.value.trim()||"No informado";
    els.resultStart.textContent=formatDateTime(start);
    els.resultLife.textContent=lifeText+(lifeSource==="manual"?" (manual)":"");
    els.official.textContent=formatDateTime(expiry);
    els.written.textContent=written?formatDateTime(written):"No informada";

    els.warning.hidden=!warnings.length;
    els.warning.innerHTML=warnings.map(w=>"• "+escapeHTML(w)).join("<br>");

    lastResult={
      at:new Date().toISOString(),
      product:p.n,
      received:state.received?.toISOString()||null,
      closedExpiry:state.closedExpiry?.toISOString()||null,
      closedExpirySource:state.closedExpirySource,
      stage:state.stage,
      operator:els.operator.value.trim()||null,
      start:start.toISOString(),
      life:lifeText,
      lifeSource,
      expiry:expiry.toISOString(),
      written:written?written.toISOString():null,
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

    [
      els.product,els.receivedDate,els.closedExpiryDate,els.operator,els.processDate,
      els.processTime,els.manualLifeAmount,els.writtenExpiryDate,els.writtenExpiryTime
    ].forEach(el=>{ if(el) el.value=""; });
    els.manualLifeUnit.value="d";
    resetClosedUI();
    goStep(1);
  }

  function historyLoad(){
    try{return JSON.parse(localStorage.getItem("meilan_history_v2")||"[]")}catch{return[]}
  }
  function historySave(items){
    localStorage.setItem("meilan_history_v2",JSON.stringify(items.slice(0,80)));
    renderHistory();
  }
  function renderHistory(){
    const h=historyLoad();
    els.history.innerHTML="";
    if(!h.length){
      els.history.innerHTML='<div class="history-empty">Aún no hay revisiones guardadas.</div>';
      return;
    }
    h.slice(0,20).forEach(x=>{
      const div=document.createElement("div");
      div.className="history-item";
      const stage=x.stage==="PREP"?"PREP":"PROD";
      const exp=x.expiry?formatDateTime(new Date(x.expiry)):"—";
      div.innerHTML='<div><strong>'+escapeHTML(x.product)+'</strong><small>'+stage+' · Vence: '+escapeHTML(exp)+'<br>'+escapeHTML(x.life||"")+'</small></div><span class="status-badge '+(x.status==="VENCIDO"?"expired":x.status==="POR VENCER"?"soon":"ok")+'">'+escapeHTML(x.status)+'</span>';
      els.history.appendChild(div);
    });
  }

  function escapeHTML(s){
    return String(s??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  // Cámara / OCR
  async function openCamera(){
    try{
      stopCamera();
      stream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:"environment"}},audio:false
      });
      els.video.srcObject=stream;
      els.video.hidden=false;
      els.preview.hidden=true;
      els.captureBtn.disabled=false;
      els.cameraStatus.textContent="Cámara activa";
      els.cameraStatus.className="pill ok";
    }catch(e){
      els.cameraStatus.textContent="Sin acceso a cámara";
      els.cameraStatus.className="pill expired";
      alert("No se pudo abrir la cámara. Revisa el permiso del navegador o usa “Subir foto”.");
    }
  }

  function stopCamera(){
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  }

  function canvasFromVideo(){
    const c=els.canvas,v=els.video;
    c.width=v.videoWidth||1280;
    c.height=v.videoHeight||720;
    c.getContext("2d").drawImage(v,0,0,c.width,c.height);
    return c.toDataURL("image/jpeg",.94);
  }

  function showImage(src){
    els.preview.src=src;
    els.preview.hidden=false;
    els.video.hidden=true;
    stopCamera();
    els.captureBtn.disabled=true;
    els.cameraStatus.textContent="Foto cargada";
    els.cameraStatus.className="pill ok";
  }

  function loadImage(src){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=reject;
      img.src=src;
    });
  }

  function prepareOCRImage(img,rotation=0){
    const source=document.createElement("canvas");
    const sw=img.naturalWidth||img.width, sh=img.naturalHeight||img.height;
    const sx=Math.round(sw*.10), sy=Math.round(sh*.10), cw=Math.round(sw*.80), ch=Math.round(sh*.80);
    source.width=cw; source.height=ch;
    source.getContext("2d").drawImage(img,sx,sy,cw,ch,0,0,cw,ch);

    const rotated=document.createElement("canvas");
    const quarter=Math.abs(rotation)%180===90;
    rotated.width=quarter?ch:cw; rotated.height=quarter?cw:ch;
    const rctx=rotated.getContext("2d");
    rctx.translate(rotated.width/2,rotated.height/2);
    rctx.rotate(rotation*Math.PI/180);
    rctx.drawImage(source,-cw/2,-ch/2);

    const out=document.createElement("canvas");
    const scale=Math.min(2.4,Math.max(1.3,1900/Math.max(rotated.width,rotated.height)));
    out.width=Math.round(rotated.width*scale);
    out.height=Math.round(rotated.height*scale);
    const ctx=out.getContext("2d");
    ctx.drawImage(rotated,0,0,out.width,out.height);

    const im=ctx.getImageData(0,0,out.width,out.height), d=im.data;
    let sum=0;
    for(let i=0;i<d.length;i+=4) sum+=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    const avg=sum/(d.length/4);
    const threshold=Math.max(110,Math.min(210,avg*.92));
    for(let i=0;i<d.length;i+=4){
      let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      g=(g-128)*1.45+128;
      const v=g>threshold?255:0;
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(im,0,0);
    return out.toDataURL("image/png");
  }

  function ocrScore(text,confidence=0){
    const up=(text||"").toUpperCase();
    let s=(confidence||0)/12;
    if(/\b(PROD|PREP|FECHA|HORA|VENC|INIC|FR|FB|FV)\b/.test(up)) s+=14;
    s+=([...(up.matchAll(/\b[0-3]?\d[\/.\-][01]?\d(?:[\/.\-]\d{2,4})?\b/g))].length)*8;
    s+=([...(up.matchAll(/\b(?:[01]?\d|2[0-3])[:.]?[0-5]\d\b/g))].length)*5;
    return s;
  }

  async function runOneOCR(src,label,progressBase){
    els.ocrText.textContent="Analizando "+label+"…";
    const result=await Tesseract.recognize(src,"eng",{
      logger:m=>{
        if(m.status==="recognizing text"){
          setProgress(Math.min(96,progressBase+Math.round((m.progress||0)*28)));
        }
      }
    });
    const text=(result.data.text||"").trim();
    return {
      text, confidence:result.data.confidence||0,
      score:ocrScore(text,result.data.confidence||0), label
    };
  }

  async function runOCR(src){
    if(!window.Tesseract){
      alert("El lector OCR no pudo cargar. Puedes ingresar los datos manualmente.");
      return;
    }
    els.ocrBox.hidden=false;
    els.ocrText.textContent="Preparando etiqueta…";
    setProgress(1);
    try{
      const img=await loadImage(src);
      const attempts=[
        {rot:0,label:"orientación original"},
        {rot:90,label:"rotación 90°"},
        {rot:270,label:"rotación 270°"}
      ];
      let best={text:"",score:-1,confidence:0,label:""};
      for(let i=0;i<attempts.length;i++){
        const a=attempts[i];
        const prepared=prepareOCRImage(img,a.rot);
        const r=await runOneOCR(prepared,a.label,4+i*30);
        if(r.score>best.score) best=r;
        if(best.score>=38) break;
      }
      const parsed=parseOCR(best.text);
      setProgress(100);
      const summary=[];
      if(parsed.received) summary.push("FR recepción: "+formatDate(parsed.received));
      if(parsed.closedExpiry) summary.push("FB/FV: "+formatDate(parsed.closedExpiry));
      if(parsed.stage) summary.push("Etapa detectada: "+parsed.stage+" (confirma manualmente)");
      if(parsed.processDate) summary.push("Fecha proceso: "+formatDate(parsed.processDate));
      if(parsed.processTime) summary.push("Hora proceso: "+parsed.processTime);
      if(parsed.writtenExpiryDate) summary.push("F. VENC escrita: "+formatDate(parsed.writtenExpiryDate));
      if(parsed.writtenExpiryTime) summary.push("Hora VENC escrita: "+parsed.writtenExpiryTime);
      els.ocrText.textContent=
        (summary.length?summary.join("\n")+"\n\n":"")+
        "Mejor lectura: "+best.label+" · confianza "+Math.round(best.confidence)+"%\n"+
        (best.text||"No se detectó texto con suficiente claridad. Completa los datos manualmente.");
    }catch(e){
      console.error(e);
      els.ocrText.textContent="No se pudo completar la lectura automática. Completa los datos manualmente.";
      setProgress(0);
    }
  }

  function setProgress(n){
    els.ocrProgress.textContent=n+"%";
    els.ocrProgressBar.style.width=n+"%";
  }

  function normalizeOCRText(text){
    return (text||"")
      .toUpperCase()
      .replace(/[|]/g,"/")
      .replace(/[Oo](?=\d)/g,"0")
      .replace(/(?<=\d)[Oo]/g,"0")
      .replace(/[Il](?=\d)/g,"1")
      .replace(/(?<=\d)[Il]/g,"1")
      .replace(/\s+/g," ");
  }

  function toISODate(x){
    let y=x.y;
    if(y<100) y+=2000;
    return String(y).padStart(4,"0")+"-"+String(x.mo).padStart(2,"0")+"-"+String(x.d).padStart(2,"0");
  }

  function parseOCR(text){
    const up=normalizeOCRText(text);
    const result={
      received:null,closedExpiry:null,stage:null,
      processDate:null,processTime:null,writtenExpiryDate:null,writtenExpiryTime:null
    };

    if(/\bPR[O0]D\b/.test(up)) result.stage="PROD";
    else if(/\bPREP\b/.test(up)) result.stage="PREP";
    state.detectedStage=result.stage;

    const fullPattern=/\b([0-3]?\d)\s*(?:[\/.\-]|\s)\s*([01]?\d)\s*(?:[\/.\-]|\s)\s*(\d{2,4})\b/g;
    const full=[...up.matchAll(fullPattern)]
      .map(m=>({d:+m[1],mo:+m[2],y:+m[3],raw:m[0]}))
      .filter(x=>x.d>=1&&x.d<=31&&x.mo>=1&&x.mo<=12)
      .map(x=>{if(x.y<100)x.y+=2000;return x;});

    if(full[0]){
      result.received=new Date(toISODate(full[0])+"T00:00:00");
      els.receivedDate.value=toISODate(full[0]);
    }
    if(full[1]){
      result.closedExpiry=new Date(toISODate(full[1])+"T23:59:59");
      els.closedExpiryDate.value=toISODate(full[1]);
    }

    let residual=up;
    full.forEach(x=>{residual=residual.replace(x.raw," ");});
    const year=full[0]?.y||new Date().getFullYear();

    const short=[...residual.matchAll(/\b([0-3]?\d)\s*[\/.\-]\s*([01]?\d)\b/g)]
      .map(m=>({d:+m[1],mo:+m[2],y:year,raw:m[0]}))
      .filter(x=>x.d>=1&&x.d<=31&&x.mo>=1&&x.mo<=12);

    const uniqueShort=[];
    short.forEach(x=>{
      if(!uniqueShort.some(y=>y.d===x.d&&y.mo===x.mo)) uniqueShort.push(x);
    });

    if(uniqueShort[0]){
      result.processDate=new Date(toISODate(uniqueShort[0])+"T00:00:00");
      els.processDate.value=toISODate(uniqueShort[0]);
    }
    if(uniqueShort[1]){
      result.writtenExpiryDate=new Date(toISODate(uniqueShort[1])+"T00:00:00");
      els.writtenExpiryDate.value=toISODate(uniqueShort[1]);
    }

    uniqueShort.forEach(x=>{residual=residual.replace(x.raw," ");});
    const times=[];
    for(const m of residual.matchAll(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/g)){
      times.push(m[1].padStart(2,"0")+":"+m[2]);
    }
    for(const m of residual.matchAll(/\b([01]?\d|2[0-3])\s+([0-5]\d)\b/g)){
      times.push(m[1].padStart(2,"0")+":"+m[2]);
    }
    for(const m of residual.matchAll(/\b([01]\d|2[0-3])([0-5]\d)\b/g)){
      times.push(m[1]+":"+m[2]);
    }
    const uniqueTimes=[...new Set(times)];
    if(uniqueTimes[0]){
      result.processTime=uniqueTimes[0];
      els.processTime.value=uniqueTimes[0];
    }
    if(uniqueTimes[1]){
      result.writtenExpiryTime=uniqueTimes[1];
      els.writtenExpiryTime.value=uniqueTimes[1];
    }
    return result;
  }

  // Eventos del flujo
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
      localStorage.removeItem("meilan_history_v2");
      renderHistory();
    }
  });

  // Eventos cámara
  els.openCameraBtn.addEventListener("click",openCamera);
  els.captureBtn.addEventListener("click",async()=>{
    const src=canvasFromVideo();
    showImage(src);
    await runOCR(src);
  });
  els.fileInput.addEventListener("change",async(e)=>{
    const file=e.target.files&&e.target.files[0];
    if(!file) return;
    const src=URL.createObjectURL(file);
    showImage(src);
    await runOCR(src);
  });
  els.resetImageBtn.addEventListener("click",()=>{
    stopCamera();
    els.preview.hidden=true;
    els.video.hidden=false;
    els.video.srcObject=null;
    els.ocrBox.hidden=true;
    els.cameraStatus.textContent="Cámara lista";
    els.cameraStatus.className="pill neutral";
  });

  initProducts();
  renderHistory();
  resetClosedUI();
  goStep(1);
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
})();