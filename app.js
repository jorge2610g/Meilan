(() => {
  const $ = (id) => document.getElementById(id);
  const D = window.MEILAN_DATA;
  const els = {
    video:$("video"), canvas:$("canvas"), preview:$("preview"), cameraStatus:$("cameraStatus"),
    openCameraBtn:$("openCameraBtn"), captureBtn:$("captureBtn"), fileInput:$("fileInput"),
    resetImageBtn:$("resetImageBtn"), ocrBox:$("ocrBox"), ocrProgress:$("ocrProgress"),
    ocrProgressBar:$("ocrProgressBar"), ocrText:$("ocrText"), product:$("productSelect"),
    receivedDate:$("receivedDate"), factoryExpiryDate:$("factoryExpiryDate"), operatorInitial:$("operatorInitial"),
    stage:$("stageSelect"), condition:$("conditionSelect"), startDate:$("startDate"),
    startTime:$("startTime"), expDate:$("writtenExpiryDate"), expTime:$("writtenExpiryTime"),
    calculate:$("calculateBtn"), result:$("resultCard"), state:$("resultState"),
    resultProduct:$("resultProduct"), resultRule:$("resultRule"), remaining:$("remainingText"),
    resultReceived:$("resultReceived"), resultFactoryExpiry:$("resultFactoryExpiry"), resultOperator:$("resultOperator"),
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
    const stage = els.stage.value;
    els.condition.innerHTML='<option value="">Selecciona una condición</option>';
    if(els.product.value==="") return;
    const idx = Number(els.product.value);
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
    const sx=Math.round(sw*.14), sy=Math.round(sh*.14), cw=Math.round(sw*.72), ch=Math.round(sh*.72);
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
    const scale=Math.min(2.2,Math.max(1.25,1800/Math.max(rotated.width,rotated.height)));
    out.width=Math.round(rotated.width*scale);out.height=Math.round(rotated.height*scale);
    const ctx=out.getContext("2d");
    ctx.drawImage(rotated,0,0,out.width,out.height);

    const im=ctx.getImageData(0,0,out.width,out.height), d=im.data;
    let sum=0;
    for(let i=0;i<d.length;i+=4){
      const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      sum+=g;
    }
    const avg=sum/(d.length/4);
    const threshold=Math.max(115,Math.min(205,avg*.90));
    for(let i=0;i<d.length;i+=4){
      let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      g=(g-128)*1.55+128;
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
          const p=progressBase+Math.round((m.progress||0)*28);
          setProgress(Math.min(96,p));
        }
      }
    });
    const text=(result.data.text||"").trim();
    return {text,confidence:result.data.confidence||0,score:ocrScore(text,result.data.confidence||0),label};
  }

  async function runOCR(src){
    if(!window.Tesseract){alert("El lector OCR no pudo cargar. Puedes ingresar los datos manualmente.");return;}
    els.ocrBox.hidden=false;els.ocrText.textContent="Preparando etiqueta…";setProgress(1);
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
        if(best.score>=34) break;
      }
      setProgress(100);
      const parsed=parseOCR(best.text);
      const summary=[];
      if(parsed.received) summary.push("FR recepción: "+String(parsed.received.d).padStart(2,"0")+"/"+String(parsed.received.mo).padStart(2,"0")+"/"+parsed.received.y);
      if(parsed.factoryExpiry) summary.push("FB/FV vencimiento superior: "+String(parsed.factoryExpiry.d).padStart(2,"0")+"/"+String(parsed.factoryExpiry.mo).padStart(2,"0")+"/"+parsed.factoryExpiry.y);
      if(parsed.stage) summary.push("Etapa: "+parsed.stage);
      if(parsed.operator) summary.push("Operario: "+parsed.operator);
      if(parsed.dates.length) summary.push("PREP/PROD fechas: "+parsed.dates.map(x=>String(x.d).padStart(2,"0")+"/"+String(x.mo).padStart(2,"0")+"/"+x.y).join(" · "));
      if(parsed.times.length) summary.push("PREP/PROD horas: "+parsed.times.join(" · "));
      els.ocrText.textContent=
        (summary.length?summary.join("\n")+"\n\n":"")+
        "Mejor lectura: "+best.label+" · confianza "+Math.round(best.confidence)+"%\n"+
        (best.text||"No se detectó texto con suficiente claridad. Corrige los datos manualmente.");
    }catch(e){
      console.error(e);
      els.ocrText.textContent="No se pudo completar la lectura automática. Corrige los datos manualmente.";
      setProgress(0);
    }
  }

  function setProgress(n){els.ocrProgress.textContent=n+"%";els.ocrProgressBar.style.width=n+"%";}

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

  function parseOCR(text){
    const up=normalizeOCRText(text);
    let stage="";
    if(/\bPR[O0]D\b/.test(up)){stage="PROD";els.stage.value="PROD";refreshConditions();}
    else if(/\bPREP\b/.test(up)){stage="PREP";els.stage.value="PREP";refreshConditions();}

    const fullPattern=/\b([0-3]?\d)\s*(?:[\/.\-]|\s)\s*([01]?\d)\s*(?:[\/.\-]|\s)\s*(\d{2,4})\b/g;
    const fullDates=[...up.matchAll(fullPattern)]
      .map(m=>({d:+m[1],mo:+m[2],y:+m[3],raw:m[0]}))
      .filter(x=>x.d>=1&&x.d<=31&&x.mo>=1&&x.mo<=12)
      .map(x=>{if(x.y<100)x.y+=2000;return x;});

    let year=fullDates[0]?.y || new Date().getFullYear();
    if(fullDates[0]) els.receivedDate.value=toISODate(fullDates[0]);
    if(fullDates[1]) els.factoryExpiryDate.value=toISODate(fullDates[1]);

    let residual=up;
    fullDates.forEach(x=>{residual=residual.replace(x.raw," ");});

    const shortPattern=/\b([0-3]?\d)\s*[\/.\-]\s*([01]?\d)\b/g;
    const shortDates=[...residual.matchAll(shortPattern)]
      .map(m=>({d:+m[1],mo:+m[2],y:year,raw:m[0]}))
      .filter(x=>x.d>=1&&x.d<=31&&x.mo>=1&&x.mo<=12);

    const uniqueShort=[];
    shortDates.forEach(x=>{if(!uniqueShort.some(y=>y.d===x.d&&y.mo===x.mo))uniqueShort.push(x);});
    if(uniqueShort[0]) els.startDate.value=toISODate(uniqueShort[0]);
    if(uniqueShort[1]) els.expDate.value=toISODate(uniqueShort[1]);

    uniqueShort.forEach(x=>{residual=residual.replace(x.raw," ");});

    const timeMatches=[];
    for(const m of residual.matchAll(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/g)){
      timeMatches.push(m[1].padStart(2,"0")+":"+m[2]);
    }
    for(const m of residual.matchAll(/\b([01]?\d|2[0-3])\s+([0-5]\d)\b/g)){
      timeMatches.push(m[1].padStart(2,"0")+":"+m[2]);
    }
    for(const m of residual.matchAll(/\b([01]\d|2[0-3])([0-5]\d)\b/g)){
      timeMatches.push(m[1]+":"+m[2]);
    }
    const uniqueTimes=[...new Set(timeMatches)];
    if(uniqueTimes[0]) els.startTime.value=uniqueTimes[0];
    if(uniqueTimes[1]) els.expTime.value=uniqueTimes[1];

    const operatorMatch=residual.match(/\b(?:INIC|INICIO)\s*[:\-]?\s*([A-Z]{1,3})\b/);
    if(operatorMatch && !["PRO","PREP","PROD","FR","FV","FB"].includes(operatorMatch[1])){
      els.operatorInitial.value=operatorMatch[1];
    }

    return {
      stage,
      received:fullDates[0]||null,
      factoryExpiry:fullDates[1]||null,
      dates:uniqueShort.slice(0,2),
      times:uniqueTimes.slice(0,2),
      operator:els.operatorInitial.value||""
    };
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
    if(els.product.value===""||els.condition.value===""){alert("Selecciona el producto y la condición.");return;}
    const pIdx=Number(els.product.value),cIdx=Number(els.condition.value);
    const p=D.products[pIdx],cond=D.conditions[cIdx],rule=parseRule(p.r[cIdx]);
    if(!rule){alert("No existe una regla oficial para esa combinación.");return;}

    const received=dt(els.receivedDate.value,"00:00");
    const factoryExpiry=dt(els.factoryExpiryDate.value,"23:59");
    const start=dt(els.startDate.value,els.startTime.value);
    const written=dt(els.expDate.value,els.expTime.value,"23:59");
    let official=null;
    if(rule.type==="use"){
      const useBy=factoryExpiry||written;
      if(!useBy){alert("Este producto usa la fecha del envase/etiqueta. Ingresa FB/FV o la fecha de vencimiento escrita.");return;}
      official=new Date(useBy);
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
    els.resultReceived.textContent=received?formatDT(received):"No informada";
    els.resultFactoryExpiry.textContent=factoryExpiry?formatDT(factoryExpiry):"No informada";
    els.resultOperator.textContent=els.operatorInitial.value.trim()||"No informado";
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

    lastResult={at:new Date().toISOString(),product:p.n,condition:cond.label,rule:rule.text,received:received?received.toISOString():null,factoryExpiry:factoryExpiry?factoryExpiry.toISOString():null,operator:els.operatorInitial.value.trim()||null,start:start?start.toISOString():null,official:official.toISOString(),written:written?written.toISOString():null,state,remainingMs:remaining};
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