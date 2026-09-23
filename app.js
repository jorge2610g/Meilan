(() => {
  const $ = (id) => document.getElementById(id);
  const D = window.MEILAN_DATA;
  const els = {
    video:$("video"), canvas:$("canvas"), preview:$("preview"), cameraStatus:$("cameraStatus"),
    openCameraBtn:$("openCameraBtn"), captureBtn:$("captureBtn"), fileInput:$("fileInput"),
    resetImageBtn:$("resetImageBtn"), ocrBox:$("ocrBox"), ocrProgress:$("ocrProgress"),
    ocrProgressBar:$("ocrProgressBar"), ocrText:$("ocrText"), product:$("productSelect"),
    stage:$("stageSelect"), condition:$("conditionSelect"), startDate:$("startDate"),
    startTime:$("startTime"), expDate:$("writtenExpiryDate"), expTime:$("writtenExpiryTime"),
    calculate:$("calculateBtn"), result:$("resultCard"), state:$("resultState"),
    resultProduct:$("resultProduct"), resultRule:$("resultRule"), remaining:$("remainingText"),
    resultStart:$("resultStart"), official:$("resultOfficialExpiry"), written:$("resultWrittenExpiry"),
    storage:$("resultStorage"), warning:$("warningBox"), save:$("saveHistoryBtn"),
    history:$("historyList"), clearHistory:$("clearHistoryBtn")
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
      const og=document.createElement("optgroup"); og.label=group;
      items.forEach(({p,i})=>{const o=document.createElement("option");o.value=i;o.textContent=p.n;og.appendChild(o)});
      els.product.appendChild(og);
    });
  }

  function refreshConditions(){
    const idx = Number(els.product.value);
    const stage = els.stage.value;
    els.condition.innerHTML='<option value="">Selecciona una condición</option>';
    if(!Number.isInteger(idx)) return;
    const p=D.products[idx];
    D.conditions.forEach((c,i)=>{
      if(p.r[i] && (!stage || c.stage===stage)){
        const o=document.createElement("option");o.value=i;o.textContent=c.label;els.condition.appendChild(o);
      }
    });
    if(els.condition.options.length===2) els.condition.selectedIndex=1;
  }

  async function openCamera(){
    try{
      stopCamera();
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      els.video.srcObject=stream;
      els.video.hidden=false; els.preview.hidden=true;
      els.captureBtn.disabled=false;
      els.cameraStatus.textContent="Cámara activa"; els.cameraStatus.className="pill ok";
    }catch(e){
      els.cameraStatus.textContent="Sin acceso a cámara"; els.cameraStatus.className="pill expired";
      alert("No se pudo abrir la cámara. Revisa el permiso del navegador o usa “Subir foto”.");
    }
  }

  function stopCamera(){ if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;} }

  function canvasFromVideo(){
    const c=els.canvas, v=els.video;
    c.width=v.videoWidth||1280;c.height=v.videoHeight||720;
    c.getContext("2d").drawImage(v,0,0,c.width,c.height);
    return c.toDataURL("image/jpeg",.92);
  }

  function showImage(src){
    els.preview.src=src; els.preview.hidden=false; els.video.hidden=true; stopCamera();
    els.captureBtn.disabled=true; els.cameraStatus.textContent="Foto cargada";els.cameraStatus.className="pill ok";
  }

  async function runOCR(src){
    if(!window.Tesseract){alert("El lector OCR no pudo cargar. Puedes ingresar los datos manualmente.");return;}
    els.ocrBox.hidden=false;els.ocrText.textContent="Leyendo etiqueta…";setProgress(1);
    try{
      const result=await Tesseract.recognize(src,"eng",{
        logger:m=>{ if(m.status==="recognizing text") setProgress(Math.round((m.progress||0)*100)); }
      });
      const text=(result.data.text||"").trim();
      els.ocrText.textContent=text||"No se detectó texto con suficiente claridad.";
      setProgress(100);
      parseOCR(text);
    }catch(e){
      els.ocrText.textContent="No se pudo completar la lectura automática. Corrige los datos manualmente.";
      setProgress(0);
    }
  }

  function setProgress(n){els.ocrProgress.textContent=n+"%";els.ocrProgressBar.style.width=n+"%";}

  function parseOCR(text){
    const up=text.toUpperCase().replace(/[|]/g,"/");
    if(/\bPROD\b/.test(up)){els.stage.value="PROD";refreshConditions();}
    else if(/\bPREP\b/.test(up)){els.stage.value="PREP";refreshConditions();}
    else if(/FR\s*\/?\s*FV/.test(up)){els.stage.value="FR_FV";refreshConditions();}

    const dates=[...up.matchAll(/\b([0-3]?\d)[\/.\-]([01]?\d)(?:[\/.\-](\d{2,4}))?\b/g)]
      .map(m=>({d:+m[1],mo:+m[2],y:m[3]?+m[3]:new Date().getFullYear()}))
      .filter(x=>x.d>=1&&x.d<=31&&x.mo>=1&&x.mo<=12);
    const times=[...up.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(m=>m[1].padStart(2,"0")+":"+m[2]);
    if(dates[0]) els.startDate.value=toISODate(dates[0]);
    if(dates[1]) els.expDate.value=toISODate(dates[1]);
    if(times[0]) els.startTime.value=times[0];
    if(times[1]) els.expTime.value=times[1];
  }

  function toISODate(x){
    let y=x.y;if(y<100)y+=2000;
    return String(y).padStart(4,"0")+"-"+String(x.mo).padStart(2,"0")+"-"+String(x.d).padStart(2,"0");
  }

  function parseRule(code){
    if(code==="use") return {type:"use",text:"Uso por fecha del envase",refrigerated:false};
    const m=/^(\d+)(d|h)(R)?$/.exec(code||"");
    if(!m)return null;
    return {type:"duration",amount:+m[1],unit:m[2],refrigerated:!!m[3],
      text:m[1]+" "+(m[2]==="d"?"días":"horas")+(m[3]?" · refrigerado":"")};
  }

  function dt(date,time,defaultTime="00:00"){
    if(!date)return null;
    const x=new Date(date+"T"+(time||defaultTime)+":00");
    return Number.isNaN(x.getTime())?null:x;
  }

  function formatDT(d){
    if(!d)return "—";
    return new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"short"}).format(d);
  }

  function humanDiff(ms){
    const past=ms<0; let mins=Math.round(Math.abs(ms)/60000);
    const days=Math.floor(mins/1440);mins-=days*1440;
    const hrs=Math.floor(mins/60);mins-=hrs*60;
    const parts=[];if(days)parts.push(days+" d");if(hrs)parts.push(hrs+" h");if(mins||!parts.length)parts.push(mins+" min");
    return past?"Venció hace "+parts.join(" "):parts.join(" ");
  }

  function calculate(){
    const pIdx=Number(els.product.value),cIdx=Number(els.condition.value);
    if(!Number.isInteger(pIdx)||!Number.isInteger(cIdx)){alert("Selecciona el producto y la condición.");return;}
    const p=D.products[pIdx],cond=D.conditions[cIdx],rule=parseRule(p.r[cIdx]);
    if(!rule){alert("No existe una regla oficial para esa combinación.");return;}

    const start=dt(els.startDate.value,els.startTime.value);
    const written=dt(els.expDate.value,els.expTime.value,"23:59");
    let official=null;
    if(rule.type==="use"){
      if(!written){alert("Este producto usa la fecha del envase/etiqueta. Ingresa la fecha de vencimiento escrita.");return;}
      official=new Date(written);
    }else{
      if(!start){alert("Ingresa la fecha de inicio para calcular la vida útil.");return;}
      official=new Date(start);
      official.setTime(official.getTime()+rule.amount*(rule.unit==="d"?86400000:3600000));
    }

    const now=new Date(), remaining=official-now;
    let state,stateClass;
    if(remaining<0){state="VENCIDO";stateClass="expired";}
    else if(remaining<=12*3600000){state="POR VENCER";stateClass="soon";}
    else{state="VIGENTE";stateClass="ok";}

    els.result.hidden=false;
    els.state.textContent=state;els.state.className="status-badge "+stateClass;
    els.resultProduct.textContent=p.n;
    els.resultRule.textContent=cond.label+" · Vida útil: "+rule.text;
    els.remaining.textContent=humanDiff(remaining);
    els.resultStart.textContent=start?formatDT(start):"No aplica / no informada";
    els.official.textContent=formatDT(official);
    els.written.textContent=written?formatDT(written):"No informada";
    els.storage.textContent=cond.storage+(rule.refrigerated?" · REFRIGERADO":"");

    els.warning.hidden=true;els.warning.textContent="";
    if(rule.type==="duration"&&written){
      const delta=Math.abs(written-official);
      if(delta>30*60000){
        els.warning.hidden=false;
        els.warning.textContent="⚠ La fecha de vencimiento escrita no coincide con la vida útil oficial. Diferencia: "+humanDiff(delta).replace("Venció hace ","")+". Revisa la etiqueta.";
      }
    }
    if(rule.refrigerated){
      const extra=document.createElement("div");extra.textContent="❄ Esta regla está marcada como almacenamiento refrigerado.";
      if(els.warning.hidden){els.warning.hidden=false;els.warning.textContent=extra.textContent}
      else els.warning.textContent+=" "+extra.textContent;
    }

    lastResult={at:new Date().toISOString(),product:p.n,condition:cond.label,rule:rule.text,start:start?start.toISOString():null,official:official.toISOString(),written:written?written.toISOString():null,state,remainingMs:remaining};
    els.result.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function historyLoad(){try{return JSON.parse(localStorage.getItem("meilan_history")||"[]")}catch{return[]}}
  function historySave(x){localStorage.setItem("meilan_history",JSON.stringify(x.slice(0,80)));renderHistory()}
  function renderHistory(){
    const h=historyLoad();els.history.innerHTML="";
    if(!h.length){els.history.innerHTML='<div class="history-empty">Aún no hay revisiones guardadas.</div>';return;}
    h.slice(0,20).forEach(x=>{
      const div=document.createElement("div");div.className="history-item";
      div.innerHTML='<div><strong>'+escapeHTML(x.product)+'</strong><small>'+escapeHTML(x.condition)+'<br>'+formatDT(new Date(x.official))+'</small></div><span class="status-badge '+(x.state==="VENCIDO"?"expired":x.state==="POR VENCER"?"soon":"ok")+'">'+x.state+'</span>';
      els.history.appendChild(div);
    });
  }
  function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

  els.openCameraBtn.addEventListener("click",openCamera);
  els.captureBtn.addEventListener("click",async()=>{const src=canvasFromVideo();showImage(src);await runOCR(src)});
  els.fileInput.addEventListener("change",async(e)=>{const f=e.target.files&&e.target.files[0];if(!f)return;const src=URL.createObjectURL(f);showImage(src);await runOCR(src)});
  els.resetImageBtn.addEventListener("click",()=>{stopCamera();els.preview.hidden=true;els.video.hidden=false;els.video.srcObject=null;els.ocrBox.hidden=true;els.cameraStatus.textContent="Cámara lista";els.cameraStatus.className="pill neutral"});
  els.product.addEventListener("change",refreshConditions);
  els.stage.addEventListener("change",refreshConditions);
  els.calculate.addEventListener("click",calculate);
  els.save.addEventListener("click",()=>{if(!lastResult)return;const h=historyLoad();h.unshift(lastResult);historySave(h);els.save.textContent="Guardado ✓";setTimeout(()=>els.save.textContent="Guardar revisión",1200)});
  els.clearHistory.addEventListener("click",()=>{if(confirm("¿Borrar el historial guardado en este dispositivo?")){localStorage.removeItem("meilan_history");renderHistory()}});

  initProducts();renderHistory();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
})();