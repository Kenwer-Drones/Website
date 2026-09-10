/* ---------- reveal + split ---------- */
const io=new IntersectionObserver(es=>{for(const e of es){if(e.isIntersecting){e.target.classList.add('in','split-in');io.unobserve(e.target)}}},{threshold:0,rootMargin:"0px 0px -12% 0px"});
const revealEls=[...document.querySelectorAll('.rv, #heroH, .final-h')];
revealEls.forEach(el=>io.observe(el));
/* Safari safety net: anything already within the viewport that hasn't revealed
   (observer timing/transform quirks) gets shown so no section can sit blank */
function forceRevealInView(){
  const vh=innerHeight||document.documentElement.clientHeight;
  revealEls.forEach(el=>{
    if(el.classList.contains('in'))return;
    const r=el.getBoundingClientRect();
    if(r.top<vh*0.92&&r.bottom>0){el.classList.add('in','split-in');io.unobserve(el);}
  });
}
addEventListener('scroll',forceRevealInView,{passive:true});
addEventListener('resize',forceRevealInView);
addEventListener('load',()=>{forceRevealInView();setTimeout(forceRevealInView,300);});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(forceRevealInView);
/* also poll briefly so anchor jumps / fast scroll never leave a section blank */
let _rvPolls=0;const _rvTimer=setInterval(()=>{forceRevealInView();if(++_rvPolls>20)clearInterval(_rvTimer);},250);
/* ---------- align "We Design" exactly above DRONE ---------- */
(function(){
  const h=document.getElementById('heroH');if(!h)return;
  const eb=h.querySelector('.eyebrow'),w1=h.querySelector('.w1');
  if(!eb||!w1)return;
  function align(){
    const hr=h.getBoundingClientRect(),wr=w1.getBoundingClientRect();
    eb.style.paddingLeft=Math.max(0,wr.left-hr.left)+'px';
  }
  addEventListener('resize',align);
  addEventListener('load',align);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(align);
  align();
})();
requestAnimationFrame(()=>{document.getElementById('heroH').classList.add('split-in');document.querySelectorAll('.hero .rv').forEach(el=>el.classList.add('in'))});

/* ---------- nav bg ---------- */
const nav=document.getElementById('nav');
addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>10),{passive:true});

/* ---------- adaptive nav ink: dark lettering over light sections, light over dark ---------- */
(function(){
  const nv=document.querySelector('nav');if(!nv)return;
  const blocks=[...document.querySelectorAll('header.hero,section,footer')];
  let tick=false;
  function upd(){
    tick=false;
    const y=38;                       /* sample point: mid-height of the nav bar */
    let light=false;
    for(const b of blocks){
      const r=b.getBoundingClientRect();
      if(r.top<=y&&r.bottom>y){light=b.classList.contains('sec-light');break;}
    }
    nv.classList.toggle('ink',light);
  }
  addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(upd)}},{passive:true});
  addEventListener('resize',upd);
  upd();setTimeout(upd,300);addEventListener('load',upd);
})();

/* ---------- autoplay slider factory (bar fills L→R, then advances) ---------- */
function autoSlider(cfg){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bar=cfg.bar,count=cfg.count,total=cfg.total,DUR=cfg.dur||6000;
  let i=0,prog=0,playing=false,raf=null,last=0,inview=false,userPaused=false;
  bar.style.transition='none';
  function render(){
    cfg.render(i);
    renderCount();
  }
  function renderCount(){
    count.textContent=String(i+1).padStart(2,'0')+'/0'+total+(userPaused?' · PAUSED':'');
    count.classList.toggle('slider-paused',userPaused);
  }
  function step(ts){
    if(!playing){raf=null;return}
    if(!last)last=ts;
    prog+=ts-last;last=ts;
    if(prog>=DUR){prog=0;i=(i+1)%total;render()}
    bar.style.width=Math.min(prog/DUR,1)*100+'%';
    raf=requestAnimationFrame(step);
  }
  function play(){if(reduce||playing||!inview||document.hidden||userPaused)return;playing=true;last=0;if(!raf)raf=requestAnimationFrame(step)}
  function pause(){playing=false;last=0}
  function manual(n){i=(n+total)%total;prog=0;bar.style.width='0%';render()}
  cfg.prev.addEventListener('click',()=>manual(i-1));
  cfg.next.addEventListener('click',()=>manual(i+1));
  /* hold to pause and read; release to resume */
  cfg.watch.title='Hold to pause';
  function holdStart(e){
    if(e.target.closest('button')||e.target.closest('a'))return;
    if(userPaused)return;
    userPaused=true;pause();renderCount();
  }
  function holdEnd(){
    if(!userPaused)return;
    userPaused=false;play();renderCount();
  }
  cfg.watch.addEventListener('pointerdown',holdStart);
  cfg.watch.addEventListener('pointerup',holdEnd);
  cfg.watch.addEventListener('pointerleave',holdEnd);
  cfg.watch.addEventListener('pointercancel',holdEnd);
  new IntersectionObserver(es=>{inview=es[0].isIntersecting;inview?play():pause()},{threshold:.25}).observe(cfg.watch);
  document.addEventListener('visibilitychange',()=>{document.hidden?pause():play()});
  if(reduce){bar.style.width=(1/total*100)+'%'}
  render();
}

/* ---------- principles slider (deploy) ---------- */
const quotes=[
 '"A drone that follows a plan is automation. A drone that holds a mission identity, revises its beliefs from evidence, and can explain what changed is a cognitive worker. That layer, not the aircraft, is where the value lives."',
 '"Users should never need to think like pilots or mission planners. Communicate the objective. The platform assumes responsibility for converting it into a safe, executable mission."',
 '"Trust is built through predictable, explainable behavior. Whenever uncertainty exceeds acceptable limits, the system asks for human guidance instead of making unsupported assumptions."'
];
const qText=document.getElementById('qText');
qText.style.transition='opacity .25s';
autoSlider({
  bar:document.getElementById('qBar'),
  count:document.getElementById('qCount'),
  prev:document.getElementById('qPrev'),
  next:document.getElementById('qNext'),
  watch:document.querySelector('.quote-box'),
  total:quotes.length,dur:8000,
  render:i=>{qText.style.opacity=0;setTimeout(()=>{qText.textContent=quotes[i];qText.style.opacity=1},240)}
});

/* ---------- services scroll-spy ---------- */
const items=[...document.querySelectorAll('.svc-item')];
const pvT=document.getElementById('pvT'),pvD=document.getElementById('pvD'),pvM=document.getElementById('pvM'),pv=document.getElementById('svcPrev');
const svcListEl=document.getElementById('svcList');
function placePv(el){ /* card sits beside the active item */
  if(!el)return;
  const t=el.offsetTop+el.offsetHeight/2-pv.offsetHeight/2;
  const max=svcListEl.offsetHeight-pv.offsetHeight+24;
  pv.style.top=Math.max(-24,Math.min(t,max))+'px';
}
function activate(el){
  items.forEach(i=>i.classList.toggle('active',i===el));
  pvT.textContent=el.dataset.t;pvD.textContent=el.dataset.d;pvM.textContent=el.dataset.m;
  const im=document.getElementById('pvImg');
  if(im&&el.dataset.img&&im.src!==el.dataset.img){
    im.style.opacity=0;
    const nx=el.dataset.img;
    setTimeout(()=>{im.parentElement.style.display='';im.src=nx;im.onload=()=>{im.style.opacity=''}},180);
  }
  pv.style.transform='rotate('+(Math.random()*4-2)+'deg)';
  placePv(el);
}
const ioSvc=new IntersectionObserver(es=>{
  for(const e of es){if(e.isIntersecting)activate(e.target)}
},{rootMargin:"-46% 0px -46% 0px",threshold:0});
items.forEach(i=>{
  ioSvc.observe(i);
  i.addEventListener('mouseenter',()=>activate(i));
  i.addEventListener('click',()=>activate(i)); /* tap support */
});
activate(items[0]);
addEventListener('resize',()=>placePv(items.find(i=>i.classList.contains('active'))));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>placePv(items.find(i=>i.classList.contains('active'))));

/* ---------- FAQ ---------- */
document.querySelectorAll('.faq-item').forEach(item=>{
  const q=item.querySelector('.faq-q'),a=item.querySelector('.faq-a');
  q.addEventListener('click',()=>{
    const open=item.classList.toggle('open');
    q.setAttribute('aria-expanded',open);
    a.style.maxHeight=open?a.scrollHeight+'px':0;
  });
});

/* ---------- clock (Tempe = America/Phoenix) ---------- */
function tick(){
  const now=new Date();
  const t=new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(now);
  const d=new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(now);
  document.getElementById('clock').textContent='Tempe, AZ '+t;
  document.getElementById('clockDate').textContent=d+' (GMT −7)';
}
tick();setInterval(tick,1000);

/* ---------- footer: physical "string" flight path + drone ----------
   The line is simulated as a real plucked string: N mass points spaced
   across the width, each connected to its neighbors by springs and
   anchored (weakly) to a resting wave shape. Grabbing it anywhere only
   deforms that area — the disturbance ripples outward through the
   neighbor springs and settles with a damped elastic wobble, instead of
   the whole line moving as one rigid piece. A drone rides the live,
   ever-changing curve every frame via getPointAtLength.

   Persistence model (unchanged in spirit, adapted to a string):
   · The resting shape has a single vertical offset ("lift"). Whoever
     releases a drag FIRST, ever, across all visitors, permanently sets
     the shared resting position for everyone — enforced at the database
     level (a single row, insert-once; Postgres rejects every insert
     after the first, and there is no update/delete policy, so it can
     never change again for anyone, including future drags).
   · Every visitor's own drags are saved to their own browser
     (localStorage) and always take priority there, forever. Dragging
     again just settles the string to a new local resting position —
     the string still wobbles and springs elastically on every grab, it
     just settles somewhere new. */
(function(){
  const svg=document.getElementById('flowSvg');if(!svg)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VB_W=1400;
  const baseY=55,amp=22; /* centered in the short band between the logo and heading */
  const LS_KEY='kenwerFooterFlowLift';
  const LIFT_MIN=-30,LIFT_MAX=30;
  let lift=0;

  const FLOW_SUPABASE_URL='https://rgevwosnbeglfsagfqpk.supabase.co';
  const FLOW_SUPABASE_KEY='sb_publishable_npilwVrdEihiu09ks9a0qQ_XomiqUFr';
  const flowDb=(window.supabase&&window.supabase.createClient)
    ?window.supabase.createClient(FLOW_SUPABASE_URL,FLOW_SUPABASE_KEY)
    :null;

  const el=document.getElementById('fp1'),hit=document.getElementById('fp1-hit');
  if(!el||!hit)return;

  /* ---- the string: N points, evenly spaced in x, simulated in y ---- */
  const N=22;
  const xs=[];for(let i=0;i<N;i++)xs.push(-20+(VB_W+40)*(i/(N-1)));
  function restYOf(i){return baseY+lift+amp*Math.sin(Math.PI*2*(i/(N-1)));}
  const ys=xs.map((_,i)=>restYOf(i));
  const vys=new Array(N).fill(0);

  function catmullRom(pts){
    let d=`M ${pts[0][0]} ${pts[0][1]} `;
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
      const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6;
      const c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]} `;
    }
    return d;
  }
  function draw(){
    const pts=xs.map((x,i)=>[x,ys[i]]);
    const d=catmullRom(pts);
    el.setAttribute('d',d);
    hit.setAttribute('d',d);
  }
  draw();

  /* ---- persistence: local override always wins; otherwise the shared
     database default; otherwise the hardcoded starting shape ---- */
  function readLocalLift(){
    try{const v=localStorage.getItem(LS_KEY);return v===null?null:parseFloat(v)}catch(e){return null}
  }
  function saveLocalLift(v){
    try{localStorage.setItem(LS_KEY,String(v))}catch(e){}
  }
  function applyLift(v){
    lift=Math.max(LIFT_MIN,Math.min(LIFT_MAX,v));
    /* points still ease toward the new rest shape via the spring sim
       below rather than snapping, so a remote update also feels alive */
  }
  function tryClaimGlobalDefault(v){
    if(!flowDb)return;
    flowDb.from('footer_flow_settings').insert({id:1,lift:v}).then(()=>{}).catch(()=>{});
  }

  const localLift=readLocalLift();
  if(localLift!==null&&!isNaN(localLift)){
    applyLift(localLift);
    for(let i=0;i<N;i++)ys[i]=restYOf(i); /* start settled, no jump-in */
    draw();
  }else if(flowDb){
    flowDb.from('footer_flow_settings').select('lift').eq('id',1).maybeSingle()
      .then(({data})=>{
        if(readLocalLift()!==null)return; /* visitor already dragged while this was in flight */
        if(data&&typeof data.lift==='number'){
          applyLift(data.lift); /* the animated string eases toward it live */
          if(reduce){ /* no animation loop running to pick this up — redraw once */
            for(let i=0;i<N;i++)ys[i]=restYOf(i);
            draw();
          }
        }
      })
      .catch(()=>{});
  }

  function svgPoint(clientX,clientY){
    const pt=svg.createSVGPoint();pt.x=clientX;pt.y=clientY;
    const ctm=svg.getScreenCTM();if(!ctm)return{x:0,y:0};
    return pt.matrixTransform(ctm.inverse());
  }
  function nearestIndex(x){
    let best=0,bd=Infinity;
    for(let i=0;i<N;i++){const d=Math.abs(xs[i]-x);if(d<bd){bd=d;best=i}}
    return best;
  }

  let dragIndex=-1;
  hit.addEventListener('pointerdown',e=>{
    const p=svgPoint(e.clientX,e.clientY);
    dragIndex=nearestIndex(p.x);
    hit.classList.add('dragging');
    try{hit.setPointerCapture(e.pointerId)}catch(err){}
    e.preventDefault();
  });
  hit.addEventListener('pointermove',e=>{
    if(dragIndex<0)return;
    const p=svgPoint(e.clientX,e.clientY);
    /* pull the grabbed point straight to the pointer; neighbors follow
       through the spring simulation below, not directly here */
    ys[dragIndex]=Math.max(baseY-50,Math.min(baseY+50,p.y));
    vys[dragIndex]=0;
  });
  const release=()=>{
    if(dragIndex<0)return;
    /* the point you released becomes the new resting equilibrium — the
       shape still eases there elastically, it just settles somewhere new */
    const restNoLift=baseY+amp*Math.sin(Math.PI*2*(dragIndex/(N-1)));
    const newLift=ys[dragIndex]-restNoLift;
    applyLift(newLift);
    saveLocalLift(lift);
    tryClaimGlobalDefault(lift);
    dragIndex=-1;hit.classList.remove('dragging');
  };
  hit.addEventListener('pointerup',release);
  hit.addEventListener('pointercancel',release);
  hit.addEventListener('keydown',e=>{
    let step=6,changed=true;
    if(e.key==='ArrowUp')lift-=step;
    else if(e.key==='ArrowDown')lift+=step;
    else changed=false;
    if(changed){
      applyLift(lift);
      e.preventDefault();
      saveLocalLift(lift);
      tryClaimGlobalDefault(lift);
    }
  });

  /* ---- the drone: rides the live, ever-changing curve ---- */
  const drones=[
    {el:document.getElementById('fd2'),dur:11000,delay:0,quad:true},
  ].filter(d=>d.el);
  const t0=performance.now();

  if(reduce){
    for(let i=0;i<N;i++)ys[i]=restYOf(i);
    draw();
    const len=el.getTotalLength();
    drones.forEach(dr=>{
      const p=el.getPointAtLength(len*.5);
      dr.el.style.opacity='.35';
      dr.el.setAttribute('transform',`translate(${p.x} ${p.y})`);
    });
    return;
  }

  const K_NEIGHBOR=95,K_REST=16,DAMPING=7.5;
  let lastT=performance.now();
  function frame(now){
    const dt=Math.min((now-lastT)/1000,.033);lastT=now;

    /* spring-mass string simulation: each non-dragged point is pulled by
       its neighbors and eased toward the resting wave shape */
    for(let i=0;i<N;i++){
      if(i===dragIndex)continue;
      const left=ys[i-1]!==undefined?ys[i-1]:ys[i];
      const right=ys[i+1]!==undefined?ys[i+1]:ys[i];
      const neighborForce=K_NEIGHBOR*((left-ys[i])+(right-ys[i]));
      const restForce=K_REST*(restYOf(i)-ys[i]);
      const accel=neighborForce+restForce-DAMPING*vys[i];
      vys[i]+=accel*dt;
      ys[i]+=vys[i]*dt;
    }
    draw();

    const len=el.getTotalLength();
    if(len){
      drones.forEach(dr=>{
        const t=((now-t0-dr.delay)%dr.dur+dr.dur)%dr.dur/dr.dur;
        const dist=t*len,p=el.getPointAtLength(dist);
        let op=.65;
        if(t<.08)op=.65*(t/.08);
        else if(t>.9)op=.65*(1-(t-.9)/.1);
        dr.el.style.opacity=op;
        if(dr.quad){
          const p2=el.getPointAtLength(Math.min(len,dist+3));
          const angle=Math.atan2(p2.y-p.y,p2.x-p.x)*180/Math.PI;
          dr.el.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${angle})`);
        }else{
          dr.el.setAttribute('transform',`translate(${p.x} ${p.y})`);
        }
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ---------- minimap ---------- */
const mmRows=[...document.querySelectorAll('.minimap .rowline')];
const secs=mmRows.map(r=>document.getElementById(r.dataset.sec));
const vpBar=document.getElementById('vpBar');
addEventListener('scroll',()=>{
  const p=scrollY/(document.documentElement.scrollHeight-innerHeight);
  vpBar.style.width=(p*100)+'%';
  let idx=0;
  secs.forEach((s,i)=>{if(s&&s.getBoundingClientRect().top<innerHeight*.5)idx=i});
  mmRows.forEach((r,i)=>r.classList.toggle('on',i===idx));
},{passive:true});

/* ---------- minimap: minimized badge → click opens the board → click a row navigates ----------
   · default: minimized, showing only the section currently on screen
   · click the box: expands in place (bottom-right) into the full section board
   · click a section row: smooth-scrolls there and the board re-minimizes
   · click outside / press Escape / click the box body again: re-minimizes    */
(function(){
  const mm=document.getElementById('minimap');if(!mm)return;
  const rows=[...mm.querySelectorAll('.rowline')];
  function setOpen(open){
    mm.classList.toggle('open',open);
    mm.setAttribute('aria-expanded',open?'true':'false');
  }
  mm.addEventListener('click',e=>{
    const row=e.target.closest('.rowline');
    if(!mm.classList.contains('open')){
      setOpen(true);                                   /* minimized → any click opens the board */
      e.stopPropagation();
      return;
    }
    if(row){                                           /* open → a row navigates, then minimize */
      const sec=document.getElementById(row.dataset.sec);
      if(sec){
        /* The Contact section has generous internal top padding; land inside it so the heading is immediately visible. */
        const offset=row.dataset.sec==='contact'?80:0;
        const top=Math.max(0,sec.getBoundingClientRect().top+window.scrollY+offset);
        window.scrollTo({top,behavior:'smooth'});
      }
      setOpen(false);
    }else{
      setOpen(false);                                  /* open → clicking the box body closes it */
    }
    e.stopPropagation();
  });
  addEventListener('click',e=>{if(mm.classList.contains('open')&&!mm.contains(e.target))setOpen(false)});
  addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});
  mm.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(!mm.classList.contains('open'));}
  });
})();

/* ---------- flight-path canvases (monochrome, slow) ---------- */
function skyfield(id,alpha){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv=document.getElementById(id);if(!cv)return;
  const ctx=cv.getContext('2d');let W,H,DPR;
  /* live theme ink: primary = --ink-rgb, secondary = a muted mid-grey */
  const INK=()=>getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb').trim()||'237,235,228';
  const DIM=()=>document.documentElement.classList.contains('light')?'120,120,112':'118,116,108';
  function size(){DPR=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);seed()}
  /* ---- hidden particle field + cursor-emitted sparks ---- */
  let parts=[],sparks=[];
  const mouse={x:-9e3,y:-9e3};let lastEx=-9e3,lastEy=-9e3;
  function seed(){
    const n=Math.min(150,Math.round(W*H/11000));
    parts=[];
    for(let i=0;i<n;i++){
      const bright=Math.random()<.5; /* mix of white and dark-grey specks */
      parts.push({
        x:Math.random()*W,y:Math.random()*H,
        vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,
        dx:0,dy:0,
        e:0, /* energy: 0 = invisible until the cursor comes near */
        tone:bright?INK():DIM(),
        _b:bright,
        r:bright?(.8+Math.random()*1.2):(.7+Math.random()),
        a:bright?(.5+Math.random()*.35):(.3+Math.random()*.25)
      });
    }
  }
  function spawn(x,y,n,speed){
    for(let i=0;i<n;i++){
      const an=Math.random()*6.283,sp=(.3+Math.random())*speed;
      const bright=Math.random()<.6;
      sparks.push({x,y,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,
        life:0,dur:.55+Math.random()*.75,bright,
        r:bright?(.9+Math.random()*1.4):(.8+Math.random())});
    }
    if(sparks.length>280)sparks.splice(0,sparks.length-280);
  }
  addEventListener('mousemove',e=>{
    const r=cv.getBoundingClientRect();
    mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;
    if(mouse.x>=0&&mouse.x<=W&&mouse.y>=0&&mouse.y<=H){
      const d=Math.hypot(mouse.x-lastEx,mouse.y-lastEy);
      if(d>28){spawn(mouse.x,mouse.y,3,46);lastEx=mouse.x;lastEy=mouse.y}
    }
  },{passive:true});
  addEventListener('pointerdown',e=>{
    const r=cv.getBoundingClientRect();
    const x=e.clientX-r.left,y=e.clientY-r.top;
    if(x>=0&&x<=W&&y>=0&&y<=H)spawn(x,y,24,110); /* tap = burst */
  },{passive:true});
  addEventListener('mouseout',e=>{if(!e.relatedTarget){mouse.x=-9e3;mouse.y=-9e3}},{passive:true});
  size();addEventListener('resize',size);
  const paths=[];
  function np(){const y1=.15+Math.random()*.65,y2=.1+Math.random()*.65;
    return{x1:-.04,y1,x2:1.04,y2,cx1:.3,cy1:y1-(.1+Math.random()*.3),cx2:.7,cy2:y2-(.05+Math.random()*.3),life:0,dur:12+Math.random()*6,delay:Math.random()*3}}
  for(let i=0;i<3;i++){const p=np();p.life=-i*4.5;paths.push(p)}
  function bez(p,t){const u=1-t;return{x:(u*u*u*p.x1+3*u*u*t*p.cx1+3*u*t*t*p.cx2+t*t*t*p.x2)*W,y:(u*u*u*p.y1+3*u*u*t*p.cy1+3*u*t*t*p.cy2+t*t*t*p.y2)*H}}
  let last=performance.now();
  function frame(now){
    const dt=Math.min((now-last)/1000,.05);last=now;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle=`rgba(${INK()},.065)`;ctx.lineWidth=1;
    for(let i=1;i<7;i++){const y=H*i/7;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    for(let i=1;i<14;i++){const x=W*i/14;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
    /* ---- hidden field: particles bloom only near the cursor ---- */
    const R=150;
    for(let i=0;i<parts.length;i++){
      const p=parts[i];
      const mx=p.x-mouse.x,my=p.y-mouse.y,d=Math.hypot(mx,my);
      if(d<R){
        p.e+=(1-p.e)*Math.min(1,dt*9); /* light up fast near cursor */
        if(d>.001){const f=(1-d/R)*34*dt;p.dx+=(mx/d)*f;p.dy+=(my/d)*f}
      }else{
        p.e*=Math.exp(-2.6*dt); /* fade back into the dark */
      }
      p.dx*=.9;p.dy*=.9;
      p.x+=(p.vx+p.dx)*(dt*60);p.y+=(p.vy+p.dy)*(dt*60);
      if(p.x<-4)p.x=W+4;else if(p.x>W+4)p.x=-4;
      if(p.y<-4)p.y=H+4;else if(p.y>H+4)p.y=-4;
      if(p.e>.02){
        ctx.fillStyle=`rgba(${p._b?INK():DIM()},${p.a*p.e})`;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r*(0.7+.5*p.e),0,7);ctx.fill();
      }
    }
    /* ---- sparks released by cursor movement / taps ---- */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i];s.life+=dt;
      if(s.life>=s.dur){sparks.splice(i,1);continue}
      const damp=Math.exp(-2.4*dt);
      s.vx*=damp;s.vy*=damp;
      s.x+=s.vx*dt;s.y+=s.vy*dt;
      const k=1-s.life/s.dur;
      ctx.fillStyle=s.bright?`rgba(${INK()},${.85*k})`:`rgba(${DIM()},${.9*k})`;
      ctx.beginPath();ctx.arc(s.x,s.y,s.r*(.5+.5*k),0,7);ctx.fill();
    }
    for(let i=0;i<paths.length;i++){
      const p=paths[i];p.life+=dt;if(p.life<p.delay)continue;
      const t=(p.life-p.delay)/p.dur;if(t>=1){paths[i]=np();continue}
      const draw=Math.min(t/.45,1),fade=t<.8?1:1-(t-.8)/.2;
      const steps=60,upto=Math.floor(steps*draw);if(upto<2)continue;
      /* gradient trail — dim at the tail, bright toward the head */
      ctx.lineWidth=1;
      let prev=bez(p,0);
      for(let s=1;s<=upto;s++){
        const q=bez(p,s/steps),seg=s/Math.max(upto,1);
        ctx.strokeStyle=`rgba(${INK()},${alpha*fade*(.3+.7*seg)})`;
        ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(q.x,q.y);ctx.stroke();
        prev=q;
      }
      if(draw<1){const h=bez(p,draw);
        ctx.save();
        ctx.shadowColor=`rgba(${INK()},.9)`;ctx.shadowBlur=12;
        ctx.fillStyle=`rgba(${INK()},${.95*fade})`;ctx.beginPath();ctx.arc(h.x,h.y,2,0,7);ctx.fill();
        ctx.restore();}
    }
    if(!reduce)requestAnimationFrame(frame);
  }
  reduce?frame(performance.now()):requestAnimationFrame(frame);
}

/* ---------- gap: word-by-word scroll reveal ---------- */
(function(){
  const box=document.getElementById('reveal');if(!box)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* split into words */
  box.querySelectorAll('p').forEach(p=>{
    const words=p.textContent.trim().split(/\s+/);
    p.innerHTML=words.map(w=>'<span class="w">'+w+'</span>').join(' ');
  });
  const words=[...box.querySelectorAll('.w')];
  /* keep the product term "Cognitive Identity" permanently lit, whatever the scroll does */
  const bare=w=>w.textContent.replace(/[^A-Za-z]/g,'');
  const pinned=new Set();
  for(let i=0;i<words.length-1;i++){
    if(bare(words[i])==='Cognitive'&&bare(words[i+1])==='Identity'){
      const a=words[i],b=words[i+1],sp=a.nextSibling;
      a.classList.add('w-pin');b.classList.add('w-pin');
      a.style.opacity=1;b.style.opacity=1;
      pinned.add(i);pinned.add(i+1);
      /* wrap the two words (and their space) so the marker is one clean shape
         and the term can't break across two lines */
      const wrap=document.createElement('span');wrap.className='pin-wrap';
      a.parentNode.insertBefore(wrap,a);
      wrap.appendChild(a);
      wrap.appendChild(sp&&sp.nodeType===3?sp:document.createTextNode(' '));
      wrap.appendChild(b);
    }
  }
  if(reduce){words.forEach(w=>w.style.opacity=1);return}
  const DIM=.13, K=2, F=.3; /* K = diagonal slope, F = softness of the fade band */
  let scores=[],lo=0,span=1;
  function measure(){
    const br=box.getBoundingClientRect();
    scores=words.map(w=>{const r=w.getBoundingClientRect();return (r.left-br.left)+(r.top-br.top)*K});
    lo=Math.min(...scores);
    span=Math.max(1,Math.max(...scores)-lo);
  }
  let ticking=false;
  function upd(){
    ticking=false;
    const r=box.getBoundingClientRect();
    const start=innerHeight*.82, end=innerHeight*.3;
    const p=Math.min(1,Math.max(0,(start-r.top)/(r.height+start-end)));
    const pos=p*(1+F); /* overshoot so the last corner reaches full brightness */
    for(let i=0;i<words.length;i++){
      if(pinned.has(i))continue;
      const s=(scores[i]-lo)/span;
      const t=Math.min(1,Math.max(0,(pos-s)/F));
      words[i].style.opacity=(DIM+t*(1-DIM)).toFixed(3);
    }
  }
  measure();
  addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(upd)}},{passive:true});
  addEventListener('resize',()=>{measure();upd()});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{measure();upd()});
  upd();
})();

/* ---------- gap aside facts slider (autoplay) ---------- */
(function(){
  const facts=[
    ['0','Unsupported assumptions. Ambiguity triggers a question, never a guess.'],
    ['95%','of missions pass safety and compliance validation before anything flies.'],
    ['4+','drone ecosystems: DJI, PX4, ArduPilot, Auterion. One intelligence layer.']
  ];
  const n=document.getElementById('gaN'),l=document.getElementById('gaL');
  n.style.transition='opacity .22s';l.style.transition='opacity .22s';
  autoSlider({
    bar:document.getElementById('gaBar'),
    count:document.getElementById('gaCount'),
    prev:document.getElementById('gaPrev'),
    next:document.getElementById('gaNext'),
    watch:document.querySelector('.gap-aside'),
    total:facts.length,dur:6000,
    render:i=>{n.style.opacity=0;l.style.opacity=0;
      setTimeout(()=>{n.textContent=facts[i][0];l.textContent=facts[i][1];n.style.opacity=1;l.style.opacity=1},220)}
  });
})();

/* ---------- journey banners: cover slides away on approach, panel pops up; tap panel for 3D ---------- */
(function(){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const medias=[...document.querySelectorAll('.j-media')];
  const panels=[...document.querySelectorAll('.j-media .inner')];
  let open=null;
  const BASE='translateZ(80px) scale(1.14)';
  function close(){
    if(!open)return;
    open.classList.remove('popped');
    open.style.transform='';
    open.closest('.j-media').classList.remove('dimmed');
    open=null;
  }
  /* cover reveal on approach (hover) / first tap */
  medias.forEach(m=>{
    m.addEventListener('mouseenter',()=>m.classList.add('reveal'));
    m.addEventListener('mouseleave',()=>{
      m.classList.remove('reveal');
      if(open&&m.contains(open))close();
    });
    m.addEventListener('click',e=>{
      if(!m.classList.contains('reveal')){m.classList.add('reveal');e.stopPropagation();}
    },true); /* capture: first tap reveals before panel pop */
  });
  /* touch/no-hover: reveal automatically when the panel scrolls into view */
  const noHover=matchMedia('(hover:none)').matches;
  if(noHover&&'IntersectionObserver'in window){
    const ioJ=new IntersectionObserver(es=>{
      es.forEach(e=>{
        if(e.isIntersecting)e.target.classList.add('reveal');
        else{e.target.classList.remove('reveal');if(open&&e.target.contains(open))close();}
      });
    },{rootMargin:'-30% 0px -30% 0px',threshold:0});
    medias.forEach(m=>ioJ.observe(m));
  }
  panels.forEach(p=>{
    p.addEventListener('click',e=>{
      e.stopPropagation();
      if(!p.closest('.j-media').classList.contains('reveal'))return;
      (open===p)?close():(function(){
        close();open=p;
        p.classList.add('popped');
        p.closest('.j-media').classList.add('dimmed');
        p.style.transform=reduce?'scale(1.1)':BASE+' rotateX(4deg)';
      })();
    });
    p.addEventListener('pointermove',e=>{
      if(open!==p||reduce)return;
      const r=p.getBoundingClientRect();
      const rx=((e.clientY-r.top)/r.height-.5)*-14;
      const ry=((e.clientX-r.left)/r.width-.5)*16;
      p.style.transform=`${BASE} rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    });
    p.addEventListener('pointerleave',()=>{
      if(open===p&&!reduce)p.style.transform=BASE+' rotateX(4deg)';
    });
  });
  document.addEventListener('click',close);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
})();

/* ---------- ambient sound (synthesized, peaceful low pad) ---------- */
(function(){
  const btn=document.getElementById('muteBtn'),icM=document.getElementById('icMuted'),icO=document.getElementById('icOn');
  if(!btn)return;
  let ctx=null,master=null,on=false;
  function build(){
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);

    /* warm low pad: G2 root + fifth + octave, gently detuned */
    const pad=ctx.createGain();pad.gain.value=.5;pad.connect(master);
    [[98,.5,0],[98.4,.4,0],[147,.22,0],[196,.14,3]].forEach(([f,g,det])=>{
      const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;o.detune.value=det;
      const og=ctx.createGain();og.gain.value=g;
      o.connect(og);og.connect(pad);o.start();
    });

    /* soft filtered air */
    const len=ctx.sampleRate*4,buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1);
    const noise=ctx.createBufferSource();noise.buffer=buf;noise.loop=true;
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=340;lp.Q.value=.4;
    const ng=ctx.createGain();ng.gain.value=.05;
    noise.connect(lp);lp.connect(ng);ng.connect(master);noise.start();

    /* slow breathing: LFO on pad gain (~12s cycle) */
    const lfo=ctx.createOscillator();lfo.frequency.value=.08;
    const lg=ctx.createGain();lg.gain.value=.14;
    lfo.connect(lg);lg.connect(pad.gain);lfo.start();

    /* very slow filter drift for movement */
    const lfo2=ctx.createOscillator();lfo2.frequency.value=.03;
    const lg2=ctx.createGain();lg2.gain.value=120;
    lfo2.connect(lg2);lg2.connect(lp.frequency);lfo2.start();
  }
  btn.addEventListener('click',()=>{
    if(!ctx)build();
    if(ctx.state==='suspended')ctx.resume();
    on=!on;
    const t=ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value,t);
    master.gain.linearRampToValueAtTime(on?0.055:0, t+(on?2.5:1.2)); /* gentle fade */
    icM.style.display=on?'none':'block';
    icO.style.display=on?'block':'none';
    btn.setAttribute('aria-pressed',on);
  });
  /* pause when tab hidden */
  document.addEventListener('visibilitychange',()=>{
    if(!ctx)return;
    if(document.hidden&&on){master.gain.linearRampToValueAtTime(0,ctx.currentTime+.4)}
    else if(!document.hidden&&on){master.gain.linearRampToValueAtTime(.055,ctx.currentTime+1.5)}
  });
})();
/* ---------- converge: WE CLOSE  ·  THAT GAP (two phrases slide together) ---------- */
(function(){
  const wrap=document.getElementById('cvWrap');if(!wrap)return;
  const L=document.getElementById('cvLeft'),R=document.getElementById('cvRight'),M=document.getElementById('cvMark');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return; /* CSS shows them met */
  let tick=false;
  function upd(){
    tick=false;
    const r=wrap.getBoundingClientRect();
    const total=Math.max(1,r.height-innerHeight);
    const p=Math.min(1,Math.max(0,-r.top/total));
    const c=Math.min(1,p/.9), ec=1-Math.pow(1-c,3);
    L.style.transform=`translateX(${-(1-ec)*58}vw)`;
    R.style.transform=`translateX(${(1-ec)*58}vw)`;
    if(M){ /* mark rises toward the nav bar as it fades, then the bar mark lights up */
      const o=Math.max(0,1-ec*1.18);
      M.style.opacity=o.toFixed(3);
      M.style.transform=`translate(-50%,calc(-50% - ${(ec*46).toFixed(1)}vh)) scale(${(1-ec*.55).toFixed(3)})`;
      const nm=document.getElementById('navMark');
      if(nm){
        if(ec>.82&&!M._docked){M._docked=true;nm.classList.add('filled');nm.classList.remove('pulse');void nm.offsetWidth;nm.classList.add('pulse')}
        if(ec<.5&&M._docked){M._docked=false;nm.classList.remove('filled')}
      }
    }
  }
  addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(upd)}},{passive:true});
  addEventListener('resize',upd);
  upd();
})();

/* ---------- FAQ stacked hover: hovered row highlighted, neighbours graded ---------- */
(function(){
  if(matchMedia('(hover: none)').matches)return; /* touch: keep tap-to-open only */
  const items=[...document.querySelectorAll('.faq-item')];
  if(!items.length)return;
  function clear(){items.forEach(it=>it.classList.remove('hv0','hv1','hv2'))}
  function glow(i){
    clear();
    items[i].classList.add('hv0');
    if(items[i-1])items[i-1].classList.add('hv1');
    if(items[i+1])items[i+1].classList.add('hv1');
    if(items[i-2])items[i-2].classList.add('hv2');
    if(items[i+2])items[i+2].classList.add('hv2');
  }
  const noHover=matchMedia('(hover:none)').matches;
  if(noHover){
    /* touch: highlight the item nearest screen-centre as you scroll */
    let tick=false;
    function onScroll(){
      if(tick)return;tick=true;
      requestAnimationFrame(()=>{
        tick=false;
        const mid=innerHeight/2;let best=-1,bd=1e9;
        items.forEach((it,i)=>{
          const r=it.getBoundingClientRect();
          if(r.bottom<0||r.top>innerHeight)return;
          const d=Math.abs((r.top+r.bottom)/2-mid);
          if(d<bd){bd=d;best=i}
        });
        if(best>=0)glow(best);else clear();
      });
    }
    addEventListener('scroll',onScroll,{passive:true});
    onScroll();
  }else{
    items.forEach((it,i)=>it.addEventListener('mouseenter',()=>glow(i)));
    const list=items[0].parentElement;
    list.addEventListener('mouseleave',clear);
  }
})();

/* ---------- logo particle band ---------- */
(function(){
  var band=document.getElementById('halftone'),cv=document.getElementById('droneCv');
  if(!band||!cv)return;
  var ctx=cv.getContext('2d',{alpha:false});
  var W=0,H=0,DPR=1,parts=[],visible=false,raf=0;
  var mx=-9999,my=-9999,pressing=false;
  var BG='#050505';
  var LOGO_PATH=new Path2D("M 6.4,11.2 C 5.9,11.7 5.9,104.0 6.5,105.2 C 6.7,105.8 6.9,106.5 6.9,106.9 C 6.9,107.8 7.6,109.4 8.5,110.4 C 9.0,110.9 9.3,111.5 9.3,111.6 C 9.3,112.0 14.0,116.7 15.7,117.9 C 16.3,118.4 17.9,119.4 19.1,120.2 C 20.4,121.1 21.8,122.1 22.4,122.6 C 23.3,123.3 23.8,123.7 26.4,125.6 C 26.9,125.9 27.8,126.6 28.5,127.1 C 29.7,128.1 31.4,129.4 32.8,130.4 C 33.3,130.7 34.2,131.4 34.8,131.9 C 37.5,134.0 38.6,134.8 41.0,136.4 C 42.4,137.4 43.8,138.5 44.2,138.9 C 44.5,139.3 45.9,140.3 47.1,141.1 C 48.4,141.9 50.1,143.2 50.9,143.9 C 51.7,144.7 52.8,145.6 53.3,146.0 C 54.3,146.8 54.6,147.3 54.0,147.3 C 53.6,147.3 47.6,144.3 46.7,143.6 C 46.2,143.3 44.1,142.1 41.9,141.0 C 39.8,139.9 37.8,138.8 37.5,138.7 C 37.3,138.4 36.0,137.7 34.7,137.0 C 33.4,136.3 32.2,135.6 31.9,135.4 C 31.7,135.2 29.4,134.0 26.7,132.6 C 24.1,131.3 21.8,130.1 21.6,129.8 C 16.8,125.5 8.6,127.4 6.6,133.3 C 6.0,135.4 5.7,176.9 6.4,177.6 C 6.6,177.8 23.2,177.9 79.0,177.9 C 160.0,177.9 153.4,177.7 154.6,180.1 C 155.7,182.4 162.0,187.5 163.8,187.5 C 164.0,187.5 164.9,187.9 165.8,188.3 C 168.5,189.5 176.2,189.5 178.8,188.3 C 179.8,187.9 180.7,187.5 180.9,187.5 C 181.5,187.5 187.5,183.1 187.5,182.7 C 187.5,182.5 188.0,181.8 188.7,181.1 C 189.4,180.4 189.9,179.7 189.9,179.6 C 189.9,179.4 190.2,178.9 190.5,178.5 C 190.9,178.1 191.8,176.0 192.5,173.7 C 194.6,167.6 194.5,164.2 192.2,159.1 C 191.8,158.3 191.5,157.5 191.5,157.3 C 191.5,157.1 191.2,156.5 190.7,155.9 C 190.3,155.4 189.9,154.8 189.9,154.6 C 189.9,154.4 189.6,154.1 189.3,153.8 C 189.0,153.5 188.6,152.9 188.4,152.4 C 188.2,151.9 187.6,151.2 186.9,150.8 C 186.3,150.4 185.4,149.8 185.0,149.4 C 183.1,147.7 178.6,145.9 175.9,145.9 C 174.1,145.9 173.0,145.6 172.7,144.9 C 172.6,144.7 172.4,119.2 172.3,88.2 C 172.2,42.6 172.1,31.8 171.8,30.8 C 170.7,27.1 170.4,26.1 169.7,24.7 C 169.3,23.9 168.7,22.8 168.3,22.4 C 167.9,21.9 167.5,21.4 167.5,21.2 C 167.5,20.7 163.1,16.3 161.4,15.3 C 159.1,13.7 157.9,13.2 151.5,11.4 C 149.6,10.8 81.7,10.7 80.3,11.3 C 79.8,11.5 78.9,11.7 78.4,11.7 C 76.8,11.7 72.1,13.4 70.3,14.6 C 69.5,15.3 68.2,16.1 67.6,16.6 C 65.8,17.9 64.4,19.2 64.4,19.6 C 64.4,19.8 63.9,20.5 63.3,21.2 C 61.7,22.9 58.8,28.8 58.8,30.3 C 58.8,30.9 58.6,31.8 58.4,32.4 C 57.9,33.7 57.9,40.0 58.4,41.3 C 58.6,41.8 58.8,42.7 58.8,43.4 C 58.8,44.1 59.2,45.2 60.0,46.9 C 60.7,48.3 61.2,49.5 61.2,49.7 C 61.2,49.9 61.6,50.8 62.0,51.7 C 62.5,52.7 62.8,53.6 62.8,53.7 C 62.8,53.9 63.2,54.8 63.6,55.7 C 64.1,56.7 64.4,57.6 64.4,57.7 C 64.4,57.9 65.0,59.1 65.6,60.5 C 66.3,61.9 66.8,63.1 66.8,63.3 C 66.8,63.5 67.4,64.7 68.0,66.1 C 68.7,67.5 69.2,68.7 69.2,68.9 C 69.2,69.0 69.6,69.9 70.0,70.9 C 70.5,71.8 70.8,72.7 70.8,72.9 C 70.8,73.1 71.3,74.3 72.0,75.7 C 72.7,77.1 73.2,78.3 73.2,78.5 C 73.2,78.6 73.6,79.5 74.0,80.5 C 74.5,81.4 74.8,82.3 74.8,82.5 C 74.8,82.6 75.2,83.5 75.6,84.5 C 76.1,85.4 76.4,86.3 76.4,86.5 C 76.4,86.7 76.9,87.9 77.6,89.3 C 78.3,90.6 78.8,91.9 78.8,92.1 C 78.8,92.2 79.3,93.5 80.0,94.9 C 80.7,96.2 81.2,97.5 81.2,97.7 C 81.2,97.8 81.7,99.1 82.4,100.4 C 83.0,101.8 83.7,103.6 84.0,104.5 C 84.3,105.4 85.0,107.2 85.7,108.6 C 86.3,109.9 86.8,111.2 86.8,111.5 C 86.8,111.7 87.1,112.4 87.5,113.2 C 88.2,114.7 88.3,114.8 87.7,114.8 C 87.5,114.8 86.9,113.8 86.2,112.5 C 85.6,111.3 84.9,110.0 84.5,109.6 C 84.2,109.2 83.0,107.2 82.0,105.0 C 80.9,102.9 79.9,101.0 79.7,100.9 C 79.5,100.7 78.8,99.4 78.1,98.1 C 77.4,96.7 76.7,95.4 76.4,95.2 C 76.1,94.9 75.8,94.2 75.6,93.6 C 75.5,93.0 75.2,92.3 74.9,92.1 C 74.7,91.9 74.0,90.6 73.3,89.3 C 72.7,87.9 71.9,86.7 71.7,86.5 C 71.5,86.3 70.4,84.3 69.3,82.1 C 68.2,79.9 67.1,77.9 66.9,77.7 C 66.7,77.5 65.8,75.9 64.9,74.1 C 64.0,72.3 63.1,70.7 62.9,70.5 C 62.7,70.3 61.6,68.3 60.5,66.1 C 59.4,63.9 58.3,61.9 58.1,61.7 C 57.9,61.5 57.2,60.3 56.5,58.9 C 55.9,57.6 55.2,56.3 54.9,56.1 C 54.7,56.0 53.5,53.6 52.1,50.9 C 50.8,48.2 49.5,45.9 49.3,45.7 C 49.1,45.5 48.6,44.6 48.1,43.7 C 47.7,42.8 47.2,41.9 47.0,41.8 C 46.7,41.6 45.5,39.2 44.1,36.5 C 42.8,33.8 41.5,31.5 41.3,31.3 C 41.1,31.1 40.6,30.3 40.2,29.3 C 39.7,28.4 39.2,27.5 39.0,27.3 C 38.7,27.2 38.0,25.9 37.4,24.5 C 36.7,23.2 36.0,21.9 35.8,21.8 C 35.5,21.6 34.8,20.3 34.2,19.0 C 32.3,15.1 29.7,13.0 25.1,11.4 C 23.1,10.7 7.0,10.5 6.4,11.2");

  function sampleLogo(cb){
    var tmp=document.createElement('canvas');
    var tc=tmp.getContext('2d');
    var s=Math.min(W*.45,H*.75);
    tmp.width=Math.ceil(s);tmp.height=Math.ceil(s);
    tc.scale(s/200,s/200);
    tc.fillStyle='#fff';
    tc.fill(LOGO_PATH);
    var id=tc.getImageData(0,0,tmp.width,tmp.height).data;
    var pts=[];
    var gap=Math.max(3,Math.round(s/100));
    for(var y=0;y<tmp.height;y+=gap){
      for(var x=0;x<tmp.width;x+=gap){
        var a=id[(y*tmp.width+x)*4+3];
        if(a>80) pts.push({x:x-tmp.width/2,y:y-tmp.height/2,b:a/255});
      }
    }
    cb(pts);
  }

  function seed(){
    sampleLogo(function(pts){
      var ox=W/2,oy=H/2;
      parts=[];
      for(var i=0;i<pts.length;i++){
        var p=pts[i];
        var angle=Math.random()*Math.PI*2;
        var dist=Math.random()*Math.max(W,H)*.7;
        parts.push({
          x:ox+Math.cos(angle)*dist,
          y:oy+Math.sin(angle)*dist,
          tx:ox+p.x,ty:oy+p.y,
          vx:0,vy:0,
          r:1.0+p.b*1.6,
          b:p.b,
          phase:Math.random()*Math.PI*2
        });
      }
    });
  }

  function size(){
    W=band.clientWidth;H=band.clientHeight;DPR=Math.min(2,devicePixelRatio||1);
    cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
    if(W&&H)seed();
  }

  function draw(t){
    raf=requestAnimationFrame(draw);
    if(!visible)return;
    ctx.fillStyle=BG;ctx.fillRect(0,0,W,H);
    var ts=t*.001;
    for(var i=0;i<parts.length;i++){
      var p=parts[i];
      var dx=p.x-mx,dy=p.y-my;
      var d2=dx*dx+dy*dy;
      var radius=pressing?16000:9000;
      var force=pressing?2.5:1.4;
      if(d2<radius&&d2>0){
        var d=Math.sqrt(d2);
        var f=force*(1-d/Math.sqrt(radius));
        p.vx+=dx/d*f;
        p.vy+=dy/d*f;
      }
      var sx=p.tx-p.x, sy=p.ty-p.y;
      p.vx+=sx*0.04;
      p.vy+=sy*0.04;
      p.vx*=0.87;
      p.vy*=0.87;
      p.x+=p.vx;
      p.y+=p.vy;
      var shimmer=0.5+0.5*Math.sin(ts*1.5+p.phase);
      var alpha=0.3+p.b*0.6+shimmer*0.1;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,6.283);
      ctx.fillStyle='rgba(237,235,228,'+alpha+')';
      ctx.fill();
    }
  }

  function start(){if(!raf)raf=requestAnimationFrame(draw);}

  band.addEventListener('mousemove',function(e){
    var r=band.getBoundingClientRect();
    mx=e.clientX-r.left;my=e.clientY-r.top;
  });
  band.addEventListener('mouseleave',function(){mx=-9999;my=-9999;pressing=false;});
  band.addEventListener('mousedown',function(){pressing=true;});
  band.addEventListener('mouseup',function(){pressing=false;});
  band.addEventListener('touchstart',function(e){
    pressing=true;
    var r=band.getBoundingClientRect();
    mx=e.touches[0].clientX-r.left;my=e.touches[0].clientY-r.top;
  },{passive:true});
  band.addEventListener('touchmove',function(e){
    var r=band.getBoundingClientRect();
    mx=e.touches[0].clientX-r.left;my=e.touches[0].clientY-r.top;
  },{passive:true});
  band.addEventListener('touchend',function(){pressing=false;mx=-9999;my=-9999;});

  new IntersectionObserver(function(es){visible=es[0].isIntersecting;if(visible)start();},{threshold:.04}).observe(band);
  addEventListener('resize',size);size();
})();

/* ---------- menu overlay ---------- */
(function(){
  const ov=document.getElementById('menuOv'),btn=document.getElementById('menuBtn'),cls=document.getElementById('menuClose');
  if(!ov||!btn)return;
  function set(open){
    ov.classList.toggle('open',open);
    ov.setAttribute('aria-hidden',String(!open));
    btn.setAttribute('aria-expanded',String(open));
    document.documentElement.style.overflow=open?'hidden':'';
  }
  btn.addEventListener('click',()=>set(!ov.classList.contains('open')));
  cls.addEventListener('click',()=>set(false));
  ov.querySelectorAll('.menu-links a').forEach(a=>a.addEventListener('click',()=>set(false)));
  addEventListener('keydown',e=>{if(e.key==='Escape')set(false)});
})();

/* ---------- contact dropdown (touch fallback) ---------- */
(function(){
  var wrap=document.getElementById('contactDrop');
  var btn=document.getElementById('contactToggle');
  if(!wrap||!btn)return;
  /* on touch devices, toggle on tap since hover doesn't exist */
  btn.addEventListener('click',function(e){
    e.preventDefault();
    if('ontouchstart' in window){wrap.classList.toggle('open');}
  });
  document.addEventListener('click',function(e){if(!wrap.contains(e.target))wrap.classList.remove('open');});
})();

/* ---------- platform: one bounded track, slow drift, no automatic rewind ---------- */
(function(){
  const mq=document.getElementById('pmarquee');
  if(!mq||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const view=mq.querySelector('.pmq-view'),track=document.getElementById('pmqTrack');
  const group=track.querySelector('.pmq-group'),fwd=document.getElementById('pmqFwd');
  const cards=[...group.querySelectorAll('.pcard-flip')];
  let x=0,maxX=0,visible=false,hover=false,focused=false,fast=false,raf=0,last=0,endReached=false;
  let pointer=null,startX=0,startY=0,startPosition=0,dragging=false,pauseUntil=0,featuredCard=null;
  const SPEED=60; // CSS pixels per second, independent of screen width or refresh rate.
  function updateFeatured(){
    if(!cards.length)return;
    const vr=view.getBoundingClientRect(),mid=vr.left+vr.width/2;
    let nearest=cards[0],distance=Infinity;
    cards.forEach(card=>{
      const cr=card.getBoundingClientRect(),d=Math.abs((cr.left+cr.width/2)-mid);
      if(d<distance){distance=d;nearest=card;}
    });
    if(nearest===featuredCard)return;
    if(featuredCard)featuredCard.classList.remove('featured');
    featuredCard=nearest;
    featuredCard.classList.add('featured');
  }
  function focusCard(card){
    const vr=view.getBoundingClientRect(),cr=card.getBoundingClientRect();
    x+=(cr.left+cr.width/2)-(vr.left+vr.width/2);
    endReached=false;pauseUntil=performance.now()+1800;paint();
  }
  function paint(){
    const reachedEnd=maxX>0&&x>=maxX-.5;
    x=Math.max(0,Math.min(maxX,x));
    if(reachedEnd)endReached=true;
    track.style.transform='translate3d('+(-x).toFixed(3)+'px,0,0)';
    updateFeatured();
  }
  function measure(){
    // Use the track's untransformed scroll width; Safari can misreport a flex group's offsetWidth at the end.
    maxX=Math.max(0,track.scrollWidth-view.clientWidth);
    paint();
  }
  function frame(ts){
    raf=0;
    if(!visible||document.hidden){last=0;return;}
    const dt=last?Math.min((ts-last)/1000,.05):0;last=ts;
    if(!endReached&&pointer===null&&(!hover&&!focused||fast)&&ts>=pauseUntil){
      x+=SPEED*(fast?3:1)*dt;paint();
    }
    raf=requestAnimationFrame(frame);
  }
  function start(){if(!raf&&visible&&!document.hidden){last=0;raf=requestAnimationFrame(frame);}}
  if(matchMedia('(hover:hover) and (pointer:fine)').matches){
    mq.addEventListener('mouseenter',()=>{hover=true;});
    mq.addEventListener('mouseleave',()=>{hover=false;});
    cards.forEach(card=>{
      card.addEventListener('pointerenter',()=>card.classList.add('pmq-hovered'));
      card.addEventListener('pointerleave',()=>card.classList.remove('pmq-hovered'));
    });
  }
  cards.forEach(card=>card.addEventListener('click',e=>{
    if(e.target.closest('a,button'))return;
    focusCard(card);
  }));
  mq.addEventListener('focusin',()=>{focused=true;});
  mq.addEventListener('focusout',e=>{focused=mq.contains(e.relatedTarget);});
  view.tabIndex=0;
  view.addEventListener('keydown',e=>{
    if(e.target!==view)return;
    endReached=false;
    if(e.key==='ArrowRight')x+=240;
    else if(e.key==='ArrowLeft')x-=240;
    else if(e.key==='Home')x=0;
    else if(e.key==='End')x=maxX;
    else return;
    e.preventDefault();paint();
  });
  view.addEventListener('pointerdown',e=>{
    if(e.button!==0||pointer!==null||e.target.closest('button,a'))return;
    endReached=false;pointer=e.pointerId;startX=e.clientX;startY=e.clientY;startPosition=x;dragging=false;
  });
  view.addEventListener('pointermove',e=>{
    if(e.pointerId!==pointer)return;
    const dx=e.clientX-startX,dy=e.clientY-startY;
    if(!dragging){
      if(Math.max(Math.abs(dx),Math.abs(dy))<7)return;
      if(Math.abs(dy)>Math.abs(dx)){pointer=null;return;}
      dragging=true;view.classList.add('dragging');view.setPointerCapture(pointer);
    }
    x=startPosition-dx;paint();e.preventDefault();
  });
  function release(e){
    if(e.pointerId!==pointer)return;
    pointer=null;view.classList.remove('dragging');pauseUntil=performance.now()+1800;
    // Keep the drag flag through the ensuing click, including a drag at an endpoint.
    setTimeout(()=>{dragging=false;},0);
  }
  addEventListener('pointerup',release);
  view.addEventListener('pointercancel',release);
  view.addEventListener('lostpointercapture',release);
  view.addEventListener('click',e=>{if(dragging){e.preventDefault();e.stopPropagation();}},true);
  view.addEventListener('wheel',e=>{
    if(Math.abs(e.deltaX)<=Math.abs(e.deltaY))return;
    e.preventDefault();
    endReached=false;
    x+=e.deltaX*(e.deltaMode===1?16:e.deltaMode===2?view.clientWidth:1);
    pauseUntil=performance.now()+1800;paint();
  },{passive:false});
  if(fwd){
    const stop=()=>{fast=false;fwd.classList.remove('on');};
    fwd.addEventListener('pointerdown',e=>{
      e.preventDefault();fwd.setPointerCapture(e.pointerId);fast=true;fwd.classList.add('on');
    });
    ['pointerup','pointercancel','lostpointercapture','blur'].forEach(type=>fwd.addEventListener(type,stop));
    fwd.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fast=true;}});
    fwd.addEventListener('keyup',stop);
  }
  new ResizeObserver(measure).observe(group);
  new ResizeObserver(measure).observe(view);
  new IntersectionObserver(es=>{visible=es[0].isIntersecting;start();},{threshold:.02}).observe(mq);
  document.addEventListener('visibilitychange',start);
  measure();
})();

/* ---------- card flip: touch = tap to flip, desktop = click to lock front ----------
   On touch/no-hover devices the tap toggles .flipped (existing behaviour: the
   flip is fully controlled by that class). On desktop the flip happens on
   hover via CSS; a click toggles .locked-front, which the CSS rules honour by
   suppressing the hover flip. Result: hover to peek, click to hold the front
   still while reading, click again to release. Same movement-based drag guard
   in both cases so a marquee swipe never registers as a click. */
(function(){
  const canHover=matchMedia('(hover: hover) and (pointer: fine)').matches;
  const stateClass=canHover?'locked-front':'flipped';
  document.querySelectorAll('.pcard-flip').forEach(c=>{
    let sx=0,sy=0,moved=false,down=false;
    c.addEventListener('pointerdown',e=>{
      down=true;moved=false;sx=e.clientX;sy=e.clientY;
    },{passive:true});
    c.addEventListener('pointermove',e=>{
      if(!down)return;
      if(Math.abs(e.clientX-sx)>8||Math.abs(e.clientY-sy)>8)moved=true;
    },{passive:true});
    c.addEventListener('pointercancel',()=>{down=false;moved=true;},{passive:true});
    c.addEventListener('click',e=>{
      const wasDrag=moved;down=false;moved=false;
      if(wasDrag)return;
      c.classList.toggle(stateClass);
    });
  });
  /* on touch: tapping outside a flipped card returns it to the front.
     on desktop: clicking outside releases the front-lock so hover works again. */
  document.addEventListener('click',e=>{
    document.querySelectorAll('.pcard-flip.'+stateClass).forEach(c=>{
      if(!c.contains(e.target))c.classList.remove(stateClass);
    });
  });
})();

/* ---------- back to top: scroll without leaving "#top" in the address bar ----------
   #top is the very start of the page, so parking it in the URL adds nothing and
   reads like a stray fragment. Handle the scroll ourselves and strip the hash.
   Other section links (#platform, #faq …) keep their hash on purpose — those are
   shareable deep links. */
(function(){
  function stripHash(){
    if(!location.hash)return;
    try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
  }
  const smooth=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('a[href="#top"]').forEach(a=>{
    a.addEventListener('click',e=>{
      e.preventDefault();
      window.scrollTo({top:0,behavior:smooth?'smooth':'auto'});
      stripHash();
    });
  });
  /* arriving with a leftover #top (bookmark, refresh, back button) — clean it too */
  if(location.hash==='#top')stripHash();
})();

/* ---------- font fallback (Safari Lockdown Mode etc.) ----------
   Lockdown blocks web fonts AND most named system fonts. Detect whether
   Anton actually rendered by comparing text width against monospace —
   if widths match, Anton never applied, so switch headlines to a bold
   system-font style that Lockdown allows. */
(function(){
  function antonMissing(){
    const s=document.createElement('span');
    s.style.cssText='position:absolute;left:-9999px;top:0;font-size:80px;white-space:nowrap;visibility:hidden;font-family:monospace';
    s.textContent='KENWER MISSION IIWW 0123';
    document.body.appendChild(s);
    const base=s.offsetWidth;
    s.style.fontFamily="'Anton',monospace";
    const w=s.offsetWidth;
    s.remove();
    return Math.abs(w-base)<1; /* identical width = Anton not rendering */
  }
  function apply(){if(antonMissing())document.documentElement.classList.add('fontfallback')}
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(apply).catch(apply);
  setTimeout(apply,2000); /* safety net if fonts.ready never settles */
})();

/* ---------- careers modal ---------- */
(function(){
  /* ---- build the overlay ---- */
  const ov=document.createElement('div');
  ov.className='careers-ov';
  ov.id='careersOv';
  ov.setAttribute('aria-hidden','true');
  ov.innerHTML=`
  <button class="btn-box careers-close" id="careersClose" aria-label="Close careers">Close <span class="sq">✕</span></button>
  <div class="careers-inner">
    <div class="careers-head">
      <h2>Join Kenwer</h2>
      <p>We're building the intelligence layer for autonomous drones. If you're excited about shaping the future of mission autonomy, we'd love to hear from you.</p>
    </div>
    <form class="careers-form" id="careersForm" novalidate>
      <div class="cf-group">
        <label>Full Name <span class="req">*</span></label>
        <input type="text" name="fullName" placeholder="Your full name" required>
      </div>
      <div class="cf-row">
        <div class="cf-group">
          <label>Email <span class="req">*</span></label>
          <input type="email" name="email" placeholder="you@example.com" required>
        </div>
        <div class="cf-group">
          <label>Phone <span class="req">*</span></label>
          <input type="tel" name="phone" placeholder="+1 (555) 000-0000" required>
        </div>
      </div>
      <div class="cf-row">
        <div class="cf-group">
          <label>College / University <span class="req">*</span></label>
          <input type="text" name="college" placeholder="Your college or university" required>
        </div>
        <div class="cf-group">
          <label>Graduation Date <span class="req">*</span></label>
          <input type="month" name="gradDate" required>
        </div>
      </div>
      <div class="cf-group">
        <label>Position of Interest</label>
        <select name="position">
          <option value="">— Select a role —</option>
          <option value="Software Engineer">Software Engineer</option>
          <option value="AI/ML Engineer">AI / ML Engineer</option>
          <option value="Robotics Engineer">Robotics Engineer</option>
          <option value="Hardware Engineer">Hardware Engineer</option>
          <option value="Business / Operations">Business / Operations</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="cf-group">
        <label>LinkedIn Profile</label>
        <input type="url" name="linkedin" placeholder="https://linkedin.com/in/yourprofile">
      </div>
      <div class="cf-group">
        <label>Previous Experience</label>
        <textarea name="experience" placeholder="Briefly describe your relevant experience, projects, or interests"></textarea>
      </div>
      <div class="cf-row">
        <div class="cf-group">
          <label>Resume <span class="req">*</span></label>
          <input type="file" name="resume" accept=".pdf,.doc,.docx" required>
          <span class="cf-hint">PDF or Word · Max 5 MB</span>
        </div>
        <div class="cf-group">
          <label>Cover Letter</label>
          <input type="file" name="coverLetter" accept=".pdf,.doc,.docx">
          <span class="cf-hint">PDF or Word · Max 5 MB · Optional</span>
        </div>
      </div>
      <button type="submit" class="cf-submit">Submit Application <span class="sq">→</span></button>
    </form>
    <div class="cf-success" id="cfSuccess">
      <h3>Application Received</h3>
      <p>Thank you for your interest in Kenwer. We'll review your application and get back to you soon.</p>
    </div>
  </div>`;
  document.body.appendChild(ov);

  /* ---- open / close ---- */
  function openCareers(){ov.classList.add('open');ov.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
  function closeCareers(){ov.classList.remove('open');ov.setAttribute('aria-hidden','true');document.body.style.overflow='';}

  document.getElementById('careersClose').addEventListener('click',closeCareers);
  /* final CTA "View open roles" button */
  var finalBtn=document.getElementById('finalCareersBtn');
  if(finalBtn)finalBtn.addEventListener('click',function(e){e.preventDefault();openCareers();});
  /* footer careers link */
  var footLink=document.getElementById('footCareersLink');
  if(footLink)footLink.addEventListener('click',function(e){e.preventDefault();openCareers();});
  /* removed: click-outside-to-close — only the X button closes the careers modal */

  /* ---- Supabase: stores the application row + uploads the two files ---- */
  var SUPABASE_URL='https://rgevwosnbeglfsagfqpk.supabase.co';
  var SUPABASE_KEY='sb_publishable_npilwVrdEihiu09ks9a0qQ_XomiqUFr';
  var sb=(window.supabase&&window.supabase.createClient)
    ?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
    :null;

  var MAX_FILE_BYTES=5*1024*1024;

  function randomStamp(){
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  }

  document.getElementById('careersForm').addEventListener('submit',function(e){
    e.preventDefault();
    var form=this;

    var valid=true;
    form.querySelectorAll('[required]').forEach(function(el){if(!el.value.trim())valid=false;});
    var resumeFile=form.resume.files[0],coverFile=form.coverLetter.files[0]||null;
    if(!valid||!resumeFile){alert('Please fill in all required fields and attach your resume.');return;}
    if(resumeFile.size>MAX_FILE_BYTES||(coverFile&&coverFile.size>MAX_FILE_BYTES)){alert('Resume and cover letter must each be under 5 MB.');return;}
    if(!sb){alert('Application system is temporarily unavailable. Please email us directly instead.');return;}

    var submitBtn=form.querySelector('.cf-submit');
    var originalHTML=submitBtn.innerHTML;
    submitBtn.disabled=true;
    submitBtn.innerHTML='Submitting…';

    var stamp=randomStamp();
    var resumePath=stamp+'/resume-'+resumeFile.name;
    var coverPath=coverFile?stamp+'/cover-letter-'+coverFile.name:null;
    var gradDateVal=form.gradDate.value?form.gradDate.value+'-01':null;

    sb.storage.from('resumes').upload(resumePath,resumeFile)
      .then(function(res){
        if(res.error)throw res.error;
        return coverFile?sb.storage.from('resumes').upload(coverPath,coverFile):Promise.resolve({error:null});
      })
      .then(function(res){
        if(res.error)throw res.error;
        return sb.from('applicants').insert({
          full_name:form.fullName.value.trim(),
          email:form.email.value.trim(),
          phone:form.phone.value.trim(),
          college:form.college.value.trim(),
          grad_date:gradDateVal,
          position:form.position.value||null,
          linkedin:form.linkedin.value.trim()||null,
          experience:form.experience.value.trim()||null,
          resume_path:resumePath,
          cover_letter_path:coverPath
        });
      })
      .then(function(res){
        if(res.error)throw res.error;
        form.style.display='none';
        document.getElementById('cfSuccess').style.display='block';
      })
      .catch(function(err){
        console.error('Careers form submission failed:',err);
        alert('Something went wrong submitting your application. Please try again or email us directly.');
        submitBtn.disabled=false;
        submitBtn.innerHTML=originalHTML;
      });
  });
})();

/* ---------- "Book a call": always the Cal.com popup, never a new tab ---------- */
/* redeploy trigger */
(function(){
  ['bookCallBtn','contactCallBtn','footCallBtn'].forEach(function(id){
    var btn=document.getElementById(id);
    if(!btn)return;
    btn.addEventListener('click',function(e){
      e.preventDefault();
      if(window.Cal&&Cal.ns&&Cal.ns['kenwer-intro-call']){
        Cal.ns['kenwer-intro-call']('modal',{
          calLink:'kenwer-drones/30min',
          config:{layout:'month_view'}
        });
      }else{
        window.open(btn.href,'_blank','noopener');
      }
    });
  });
})();

/* ---------- hero flight: continuous route with spatial headline fading ---------- */
(function(){
  const route=document.getElementById('heroExistingFlightRoute');
  const drone=document.querySelector('.hero-quad-moving');
  if(!route||!drone||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const svg=route.ownerSVGElement,hero=document.querySelector('.hero');
  const headline=document.getElementById('heroH');
  const length=route.getTotalLength(),duration=22000;
  let elapsed=0,last=0,visible=true,raf=0;
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  function frame(now){
    raf=0;
    if(!visible||document.hidden){last=0;return;}
    if(last)elapsed+=Math.min(now-last,50);last=now;
    const t=(elapsed%duration)/duration,d=t*length,p=route.getPointAtLength(d);
    const before=route.getPointAtLength(Math.max(0,d-1)),after=route.getPointAtLength(Math.min(length,d+1));
    const angle=Math.atan2(after.y-before.y,after.x-before.x)*180/Math.PI;
    drone.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${angle})`);
    // Screen coordinates account for SVG cropping, mobile sizing and font layout.
    const matrix=svg.getScreenCTM(),r=headline.getBoundingClientRect();
    let textFade=1;
    if(matrix){
      const point=svg.createSVGPoint();point.x=p.x;point.y=p.y;
      const screen=point.matrixTransform(matrix);
      const dx=Math.max(r.left-screen.x,0,screen.x-r.right);
      const dy=Math.max(r.top-screen.y,0,screen.y-r.bottom);
      textFade=smooth(Math.hypot(dx,dy)/65);
    }
    drone.style.opacity=.65*textFade*smooth(t/.04)*smooth((1-t)/.04);
    raf=requestAnimationFrame(frame);
  }
  function start(){if(!raf&&visible&&!document.hidden){last=0;raf=requestAnimationFrame(frame);}}
  new IntersectionObserver(es=>{visible=es[0].isIntersecting;start();}).observe(hero);
  document.addEventListener('visibilitychange',start);
  start();
})();
