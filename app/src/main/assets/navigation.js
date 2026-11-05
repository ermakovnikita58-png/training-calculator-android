/* One coordinator for the legacy screens, sheets, browser Back and Android Back. */
(function () {
  'use strict';
  const KEY = 'forge_navigation_v1', LIMIT = 40;
  const titles = {home:'Главная',plan:'Программы',workout:'Тренировка',progress:'Статистика и история',nutrition:'Питание',nutritionCoach:'Nutrition Coach',library:'Библиотека упражнений',foodcatalog:'Продукты',meals:'Рецепты',cycles:'Силовые калькуляторы',profile:'Профиль',account:'Настройки'};
  const overlayIds = ['modalback','f5DetailBack','f5EditBack','x7BrowserBack','x7DetailBack','y8DetailBack','n8-program','n8-day','n8-picker','n9Modal'];
  const byId = id => document.getElementById(id);
  const active = () => document.querySelector('.page.active')?.id || 'home';
  const clone = x => JSON.parse(JSON.stringify(x));
  let frames = [], busy = false, restoring = false, timer, overlayOrder = [], observed = '', dirty = new Set(), editorApproved = false;
  let originFocus = null, browserPending = false;
  const surfaceRoutes = new Map();
  const surfaceContent = el => el.querySelector('#modalBody,#n9ModalContent')?.firstChild || el.firstChild;
  const editableSurfaces = new Set(['n8-program','n8-day','f5EditBack','n9Modal','modalback']);
  const reopen = ['openModal','forgeOpenFoodModal','n10EditRecipe','f5EditCustom','f5OpenCard','y8OpenCard','x7OpenDetail','n9WorkoutNote','n9Plates','n9RestSettings'];
  const originalShow = showPage, originalEditorBack = window.ForgeEditorNavigation?.back;
  // The secondary pages used to be body siblings AFTER a viewport-high .app.
  const app = document.querySelector('.app');
  for (const page of document.querySelectorAll('.page')) if (!app.contains(page)) app.append(page);
  function overlays() {
    return overlayIds.map(byId).filter(el => el?.classList.contains('show')).sort((a,b) =>
      (Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0) || overlayOrder.indexOf(a.id)-overlayOrder.indexOf(b.id));
  }
  function top() { return overlays().at(-1); }
  function values(root) {
    return [...(root?.querySelectorAll('input,select,textarea')||[])].map((el,i)=>({i,id:el.id,value:el.type==='file'||el.type==='password'?'':el.value,checked:el.checked}));
  }
  function restoreValues(root, fields) {
    const els = root?.querySelectorAll('input,select,textarea')||[];
    for (const f of fields||[]) {const el=f.id?byId(f.id):els[f.i];if(el&&root.contains(el)&&!['file','password'].includes(el.type)){el.value=f.value;el.checked=f.checked;}}
  }
  function snapshot() {
    const page=active();
    return {page,y:scrollY,screen:ForgeScreenNavigation.snapshot(),fields:values(byId(page)),library:ForgeLibraryNavigation.snapshot(),
      coach:page==='nutritionCoach'&&byId('nc-age')?ForgeCoach.snapshot():null,
      surfaces:overlays().filter(el=>surfaceRoutes.get(el.id)?.node===surfaceContent(el)).map(el=>({id:el.id,route:surfaceRoutes.get(el.id).route,fields:values(el),y:el.scrollTop,dirty:dirty.has(el.id)})),
      editor:overlays().some(el=>el.id.startsWith('n8-'))?(()=>{const e=overlays().filter(el=>el.id.startsWith('n8-')).at(-1);return {id:e.id,data:ForgeEditorNavigation.snapshot(),fields:values(e),y:e.scrollTop,dirty:[...dirty]}})():null};
  }
  function persist() {
    if(restoring)return;
    try{localStorage.setItem(KEY,JSON.stringify({version:1,frames:frames.slice(-LIMIT),current:snapshot()}));}catch{/* A navigation cache must never prevent saving the diary. */}
  }
  function notify() {
    try{window.AndroidBridge?.navigationState(true,canBack());}catch{}
  }
  function focus(root) {
    const el=root?.querySelector('h1,h2,.title,.titlebig,.n8-overlay-head b,.navhead,.eyebrow')||root;
    if(el){el.setAttribute('tabindex','-1');el.focus({preventScroll:true});}
  }
  function commitFocusedField() {
    if(document.activeElement?.matches('input,textarea,select'))document.activeElement.blur();
  }
  function announce() {
    document.title='FORGE · '+(titles[active()]||active());
    byId(active())?.setAttribute('aria-label',titles[active()]||active());
    document.body.classList.toggle('forge-overlay-open',!!top());
    for(const el of document.querySelectorAll('.page'))el.inert=el.id!==active()||!!top();
    const visible=overlays();for(const el of visible)el.inert=el!==visible.at(-1);
    document.querySelector('.top').inert=!!top();document.querySelector('.tabbar').inert=!!top();
    notify();
  }
  function canBack() {return !!top()||frames.length>0||active()!=='home';}
  function allowCloseEditor() {
    if(editorApproved||restoring)return true;
    const id=top()?.id;
    return !id?.startsWith('n8-')||!dirty.has(id)||confirm('Выйти из редактора без сохранения изменений?');
  }
  function closeTop() {
    const el=top();if(!el)return false;
    if(dirty.has(el.id)&&!confirm('Закрыть без сохранения изменений?'))return true;
    editorApproved=true;
    try {
      if(el.id==='n8-picker'||el.id==='n8-day')originalEditorBack();
      else if(el.id==='n8-program')n8CloseOverlay();
      else {const close={modalback:closeModal,f5DetailBack:f5CloseCard,f5EditBack:f5CloseEditor,x7BrowserBack:x7BackFromTop,x7DetailBack:x7CloseDetail,y8DetailBack:y8CloseDetail,n9Modal:n9Close}[el.id];close?.();}
      dirty.delete(el.id);
    } finally {editorApproved=false;}
    announce();
    if(top())focus(top());else originFocus?.getClientRects().length&&!originFocus.closest('[inert]')?originFocus.focus({preventScroll:true}):focus(byId(active()));
    persist();return true;
  }
  function render(frame) {
    restoring=true;
    try {
      if(frame.page==='nutritionCoach'&&!byId('nc-age'))ForgeCoach.open();

      ForgeScreenNavigation.restore(frame.screen);
      originalShow(frame.page);
      if(frame.page==='library')ForgeLibraryNavigation.restore(frame.library);
      if(frame.coach)ForgeCoach.restore(frame.coach);
      restoreValues(byId(frame.page),frame.fields);
      if(frame.editor){ForgeEditorNavigation.restore(frame.editor.data,frame.editor.id);restoreValues(byId(frame.editor.id),frame.editor.fields);if(frame.editor.id==='n8-day')byId('n8-day').querySelectorAll('input,select,textarea').forEach(el=>el.dispatchEvent(new Event('change',{bubbles:true})));byId(frame.editor.id).scrollTop=frame.editor.y||0;dirty=new Set(frame.editor.dirty||[]);}
      for(const surface of (frame.surfaces||[]).slice(0,5)){
        if(!reopen.includes(surface.route?.name)||!Array.isArray(surface.route.args)||surface.route.args.length>4)continue;
        window[surface.route.name]?.(...surface.route.args);
        const el=byId(surface.id);if(el){restoreValues(el,surface.fields);el.scrollTop=surface.y||0;if(surface.dirty)dirty.add(surface.id);}
      }
      announce();
      focus(top()||byId(frame.page));
      scrollTo(0,Math.max(0,frame.y||0));
    }finally{restoring=false;}
    announce();persist();
  }
  function go(id) {
    if(restoring)return originalShow(id);
    if(!titles[id]||!byId(id))return;
    commitFocusedField();
    if(top()&&!allowCloseEditor())return;
    const previous=snapshot();
    // Direct section links close transient surfaces, never finish a workout.
    for(const el of overlays()){el.classList.remove('show');el.inert=false;}
    dirty.clear();
    if(previous.page===id){originalShow(id);scrollTo(0,previous.y);announce();persist();return;}
    previous.editor=null;
    previous.surfaces=[];
    const visited=frames.findIndex(frame=>frame.page===id);
    if(id==='home')frames=[];
    else if(visited>=0)frames=frames.slice(0,visited);
    else {frames.push(previous);frames=frames.slice(-LIMIT);}
    document.activeElement?.blur();
    originalShow(id);announce();focus(byId(id));scrollTo(0,0);persist();
  }
  function back() {
    if(busy)return 'handled';busy=true;
    try {
      commitFocusedField();
      if(closeTop())return 'handled';
      if(active()==='library'&&window.ForgeExerciseLibrary?.back()){persist();return 'handled';}
      if(active()==='nutritionCoach'&&ForgeCoach.backStep()){persist();return 'handled';}
      if(frames.length){render(frames.pop());return 'handled';}
      if(active()!=='home'){render({page:active()==='nutritionCoach'?'nutrition':'home',y:0});return 'handled';}
      return 'exit';
    }finally{busy=false;notify();}
  }
  // A single browser sentinel delegates to the bounded internal history. It does
  // not add a browser entry for every re-render or sheet, and cannot double-pop.
  history.scrollRestoration='manual';
  const marker='forgeBackSentinel';
  if(!history.state?.[marker]){history.replaceState({forgeRoot:true},'');history.pushState({[marker]:true},'');}
  addEventListener('popstate',event=>{
    if(event.state?.[marker])return;
    if(browserPending){browserPending=false;return;}
    if(back()==='exit'){browserPending=true;history.back();return;}
    history.pushState({[marker]:true},'');
  });
  showPage=go;window.f6Go=go;window.f6Back=()=>back()==='handled';window.f6HandleAndroidBack=back;
  window.n8Back=()=>closeTop();
  // Existing inline Back buttons now return through the same history.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    const action=button.getAttribute('onclick')||'';
    if(/^\s*(closeModal|n9Close|f5CloseEditor)\(\)\s*;?\s*$/.test(action)&&top()){
      event.preventDefault();event.stopImmediatePropagation();back();return;
    }
    if(button.classList.contains('back')&&/^\s*(showPage|f6Go)\(/.test(action)){
      event.preventDefault();event.stopImmediatePropagation();back();
    }
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();back();}},true);
  document.addEventListener('input',event=>{const el=event.target.closest(overlayIds.map(id=>'#'+id).join(','));if(el&&editableSurfaces.has(el.id))dirty.add(el.id);persist();});
  document.addEventListener('change',()=>{persist();});
  addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(persist,150);},{passive:true});
  addEventListener('pagehide',persist);
  const observer=new MutationObserver(()=>{
    const visible=overlays(), key=visible.map(x=>x.id).join(',');if(key===observed)return;
    const previous=observed.split(',');observed=key;
    let opened=false;
    for(const el of visible)if(!previous.includes(el.id)){opened=true;originFocus=document.activeElement;overlayOrder=overlayOrder.filter(id=>id!==el.id);overlayOrder.push(el.id);el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');}
    announce();
    if(opened||previous.some(id=>id&&!visible.some(el=>el.id===id)))focus(top()||byId(active()));
    persist();
  });
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
  window.ForgeNavigation={go,back,canBack,persist,allowCloseEditor,surfaceOpened(id,name,args){const el=byId(id);if(el&&reopen.includes(name)){surfaceRoutes.set(id,{route:{name,args:clone(args)},node:surfaceContent(el)});announce();persist();}},beforeOverlay:persist,markSaved:id=>dirty.delete(id),markDirty:id=>dirty.add(id),inspect:()=>({current:active(),depth:frames.length,overlay:top()?.id||null})};
  for(const name of reopen){
    const original=window[name];if(typeof original!=='function')continue;
    window[name]=function(...args){const result=original.apply(this,args),el=top();if(el){if(!restoring)dirty.delete(el.id);surfaceRoutes.set(el.id,{route:{name,args:clone(args)},node:surfaceContent(el)});persist();}return result;};
  }
  let saved;try{saved=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}
  if(saved?.version===1&&titles[saved.current?.page]&&Array.isArray(saved.frames)){
    frames=saved.frames.filter(f=>titles[f?.page]&&Number.isFinite(f.y)).slice(-LIMIT);
    try{render(saved.current);}catch{frames=[];render({page:'home',y:0});}
  }else{announce();persist();}
  const bar=document.querySelector('.tabbar');
  new ResizeObserver(()=>document.documentElement.style.setProperty('--forge-nav-height',bar.getBoundingClientRect().height+'px')).observe(bar);
  if(window.visualViewport)visualViewport.addEventListener('resize',()=>{
    document.body.classList.toggle('forge-keyboard',innerHeight-visualViewport.height>150);persist();
  });
})();
