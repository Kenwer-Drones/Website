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

/* ---------- hero particle field: the image lives as thousands of dots ----------
   halftone sampling: dot size follows image brightness · idle shimmer ·
   cursor scatters the dust, springs pull every dot back home                 */
(function(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const cv=document.getElementById('heroPart'),img=document.getElementById('heroSrc'),hero=document.querySelector('.hero');
  if(!cv||!img||!hero)return;
  const ctx=cv.getContext('2d');
  let W,H,DPR,parts=[],vis=true,running=false,t=0;
  const mouse={x:-9e3,y:-9e3};
  const INK='rgba(237,235,228,.85)';
  function build(){
    DPR=Math.min(devicePixelRatio||1,1.5);
    W=cv.clientWidth;H=cv.clientHeight;
    cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
    const iw=img.naturalWidth,ih=img.naturalHeight;if(!iw)return;
    /* cover mapping, biased to the image's upper-middle like the old object-position */
    const sc=Math.max(W/iw,H/ih),ox=(W-iw*sc)/2,oy=(H-ih*sc)*.30;
    /* sample the image once */
    const oc=document.createElement('canvas');oc.width=iw;oc.height=ih;
    const octx=oc.getContext('2d');octx.drawImage(img,0,0);
    const px=octx.getImageData(0,0,iw,ih).data;
    /* pick a gap that keeps the particle count sane on any screen */
    let gap=7;const TARGET=innerWidth<820?5200:11500;
    for(;;){const est=Math.ceil(W/gap)*Math.ceil(H/gap)*.5;if(est<=TARGET||gap>16)break;gap++;}
    parts=[];
    for(let y=gap/2;y<H;y+=gap){
      for(let x=gap/2;x<W;x+=gap){
        const sx=Math.round((x-ox)/sc),sy=Math.round((y-oy)/sc);
        if(sx<0||sy<0||sx>=iw||sy>=ih)continue;
        const i=(sy*iw+sx)*4,b=(px[i]*.3+px[i+1]*.59+px[i+2]*.11);
        if(b<34)continue;                                  /* skip near-black */
        parts.push({
          hx:x,hy:y,x,y,vx:0,vy:0,
          r:.55+(b/255)*(gap*.30),                         /* halftone: size = brightness */
          ph:Math.random()*6.283,sp:.4+Math.random()*.8    /* shimmer phase + speed */
        });
      }
    }
  }
  function frame(){
    if(!vis){running=false;return;}
    t+=.016;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=INK;
    const R=120,R2=R*R;
    for(let i=0;i<parts.length;i++){
      const p=parts[i];
      /* cursor scatter */
      const dx=p.x-mouse.x,dy=p.y-mouse.y,d2=dx*dx+dy*dy;
      if(d2<R2){
        const d=Math.sqrt(d2)||.001,f=(R-d)/R*2.6;
        p.vx+=dx/d*f;p.vy+=dy/d*f;
      }
      /* spring home + damping */
      p.vx+=(p.hx-p.x)*.02;p.vy+=(p.hy-p.y)*.02;
      p.vx*=.86;p.vy*=.86;
      p.x+=p.vx;p.y+=p.vy;
      /* idle shimmer: the dot breathes in place */
      const s=p.r*(0.82+.22*Math.sin(t*p.sp*2+p.ph));
      ctx.fillRect(p.x-s*.5,p.y-s*.5,s,s);
    }
    requestAnimationFrame(frame);
  }
  function start(){if(!running&&parts.length){running=true;requestAnimationFrame(frame);}}
  function pointer(e){const r=cv.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;}
  hero.addEventListener('pointermove',pointer);
  hero.addEventListener('pointerleave',()=>{mouse.x=-9e3;mouse.y=-9e3;});
  let rs;addEventListener('resize',()=>{clearTimeout(rs);rs=setTimeout(()=>{build();},180);});
  new IntersectionObserver(es=>{vis=es[0].isIntersecting;if(vis)start();}).observe(hero);
  if(img.complete&&img.naturalWidth){build();start();}
  else img.addEventListener('load',()=>{build();start();});
})();

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

/* ---------- footer: interactive dotted flight paths + faded drones ----------
   Each path is a gentle horizontal wave (M start, then a series of quadratic
   segments) running left to right through the panel. There's no separate
   handle dot — dragging directly on the line (or its wide invisible hit
   twin) lifts/lowers the whole wave, which feels more natural and is much
   easier to grab than a tiny circle. Two faded drones ride the paths every
   frame via getPointAtLength, so they always track whatever shape the
   visitor has bent the path into. */
(function(){
  const svg=document.getElementById('flowSvg');if(!svg)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VB_W=1400,VB_H=480;

  const defs=[
    {path:'fp1',y:60, amp:22},
    {path:'fp2',y:130,amp:-26},
    {path:'fp3',y:200,amp:20},
    {path:'fp4',y:280,amp:-18},
    {path:'fp5',y:350,amp:24},
    {path:'fp6',y:420,amp:-20},
  ];
  const state={};

  /* draw a smooth wave across the width using the current lift (offset)
     applied as an extra bulge around the drag point */
  function draw(id){
    const s=state[id],el=document.getElementById(id),hit=document.getElementById(id+'-hit');
    const y=s.baseY+s.lift;
    const d=`M -20 ${s.baseY} C ${VB_W*.22} ${y+s.amp} ${VB_W*.36} ${y-s.amp} ${VB_W*.5} ${y} `+
             `C ${VB_W*.64} ${y+s.amp} ${VB_W*.78} ${y-s.amp} ${VB_W+20} ${s.baseY}`;
    if(el)el.setAttribute('d',d);
    if(hit)hit.setAttribute('d',d);
  }

  defs.forEach(d=>{
    state[d.path]={baseY:d.y,amp:d.amp,lift:0};
    draw(d.path);
  });

  function svgPoint(clientX,clientY){
    const pt=svg.createSVGPoint();pt.x=clientX;pt.y=clientY;
    const ctm=svg.getScreenCTM();if(!ctm)return{x:0,y:0};
    return pt.matrixTransform(ctm.inverse());
  }

  let dragging=null,dragStartY=0,dragStartLift=0;
  defs.forEach(d=>{
    const hit=document.getElementById(d.path+'-hit');if(!hit)return;
    hit.addEventListener('pointerdown',e=>{
      dragging=d.path;hit.classList.add('dragging');
      const p=svgPoint(e.clientX,e.clientY);
      dragStartY=p.y;dragStartLift=state[d.path].lift;
      try{hit.setPointerCapture(e.pointerId)}catch(err){}
      e.preventDefault();
    });
    hit.addEventListener('pointermove',e=>{
      if(dragging!==d.path)return;
      const p=svgPoint(e.clientX,e.clientY),s=state[d.path];
      s.lift=Math.max(-140,Math.min(140,dragStartLift+(p.y-dragStartY)));
      draw(d.path);
    });
    const release=()=>{if(dragging===d.path){dragging=null;hit.classList.remove('dragging')}};
    hit.addEventListener('pointerup',release);
    hit.addEventListener('pointercancel',release);
    hit.addEventListener('keydown',e=>{
      const s=state[d.path];let step=16,changed=true;
      if(e.key==='ArrowUp')s.lift-=step;
      else if(e.key==='ArrowDown')s.lift+=step;
      else changed=false;
      if(changed){
        s.lift=Math.max(-140,Math.min(140,s.lift));
        e.preventDefault();draw(d.path);
      }
    });
  });

  /* drones ride whatever shape the path currently has */
  const drones=[
    {el:document.getElementById('fd1'),pathId:'fp2',dur:12000,delay:0},
    {el:document.getElementById('fd2'),pathId:'fp5',dur:14500,delay:3500},
  ].filter(d=>d.el);

  if(reduce){
    drones.forEach(dr=>{
      const pathEl=document.getElementById(dr.pathId),len=pathEl.getTotalLength();
      const p=pathEl.getPointAtLength(len*.5);
      dr.el.style.opacity='.35';
      dr.el.setAttribute('transform',`translate(${p.x} ${p.y})`);
    });
    return;
  }
  if(!drones.length)return;

  const t0=performance.now();
  function frame(now){
    drones.forEach(dr=>{
      const t=((now-t0-dr.delay)%dr.dur+dr.dur)%dr.dur/dr.dur;
      const pathEl=document.getElementById(dr.pathId),len=pathEl.getTotalLength();
      if(!len)return;
      const dist=t*len,p=pathEl.getPointAtLength(dist);
      const p2=pathEl.getPointAtLength(Math.min(len,dist+2));
      const angle=Math.atan2(p2.y-p.y,p2.x-p.x)*180/Math.PI;
      let op=.5;
      if(t<.08)op=.5*(t/.08);
      else if(t>.9)op=.5*(1-(t-.9)/.1);
      dr.el.style.opacity=op;
      dr.el.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${angle})`);
    });
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
      if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});
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
    ['100%','of missions pass safety and compliance validation before anything flies.'],
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

/* ---------- platform marquee v5 · deep elastic end + 3D lean ----------
   · idle: drifts 01→06, dwells at the blur edge, carriage-returns to 01
   · hover/touch: stops; drag, swipe, or horizontal scroll browses the cards
   · past either boundary: a DEEP rubber-band — you can pull the last card
     up to ~75% of the viewport into the empty space, with progressive
     weight (easy at first, heavier the further you stretch) and a subtle
     3D lean on the cards showing the tension
   · release mid-air: a damped spring flies the track home to the boundary
     with a small overshoot wobble — nothing exists past 06, so it returns  */
(function(){
  const mq=document.getElementById('pmarquee'),track=document.getElementById('pmqTrack'),
        fwd=document.getElementById('pmqFwd'),view=mq?mq.querySelector('.pmq-view'):null;
  if(!mq||!track||!view)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const canHover=matchMedia('(hover:hover) and (pointer:fine)').matches;

  /* blur cues at both boundaries */
  const edge=document.createElement('div');edge.className='pmq-edge';view.appendChild(edge);
  const edgeL=document.createElement('div');edgeL.className='pmq-edge left';view.appendChild(edgeL);

  let maxX=0,x=0,cur=1,target=1,vis=false,running=false,last=0;
  let dragging=false,maybeDrag=false,pid=null,px=0,py=0,dragVX=0,dragT=0,fling=0;
  let lastBump=0,rawPull=0,xv=0;        /* rawPull: raw px dragged past a boundary · xv: spring velocity */
  let DIM=300;                          /* max stretch ≈ 75% of the viewport (set in measure) */
  const BASE=42;            /* seconds to travel the full set at 1x            */
  const FAST=3.4;           /* fast-forward button multiplier (touch devices)  */
  const THRESH=7;           /* px of movement before a press becomes a drag    */
  const SPR_K=210,SPR_C=21; /* stiff spring: released stretch snaps home in ~0.35s with one tiny wobble */

  let seeded=false;
  function measure(){
    const w=track.scrollWidth,vw=view.clientWidth;
    if(w>0&&vw>0){
      maxX=Math.max(0,w-vw);DIM=Math.min(vw*.16,210);  /* short leash: stretch can never approach mid-page */
      /* first successful measure: park the track so card 2 is the leftmost
         visible card. That way card 4 (Persistent Cognitive Identity) enters
         cleanly from the right edge as the drift progresses, instead of
         starting mid-screen. From here, ambient drift continues toward 06,
         dwells, and rewinds all the way to 01, so cycles after this behave
         normally. */
      if(!seeded){
        seeded=true;
        const cards=track.querySelectorAll('.pmq-group:not([aria-hidden="true"]) .pcard');
        if(cards.length>=2&&maxX>0){x=Math.min(maxX,cards[1].offsetLeft);}
      }
    }
    return maxX>0;
  }
  /* iOS-style rubber band: raw pull → displayed stretch, asymptotic to DIM */
  function rubber(d){ return (1-1/((d*.42)/DIM+1))*DIM; }         /* heavy from the very first pixel of pull */
  function invRubber(o){ o=Math.min(o,DIM-1); return o*DIM/(.42*Math.max(1,DIM-o)); }
  function paint(){
    const oE=x>maxX?x-maxX:0,oS=x<0?-x:0,o=oE||oS;
    let t='translateX('+(-x).toFixed(2)+'px)';
    if(o>0){
      const k=Math.min(1,o/DIM);
      const squash=1-.03*k;                      /* faint elastic compression   */
      const tilt=(oE?-1:1)*2.2*k;                /* whisper of a 3D lean, max 2.2° */
      track.style.transformOrigin=oE?'right center':'left center';
      t+=' scaleX('+squash.toFixed(4)+') rotateY('+tilt.toFixed(2)+'deg)';
    }
    mq.classList.toggle('stretch',o>0);
    track.style.transform=t;
  }
  function bump(which){
    const now=performance.now();
    if(now-lastBump<600)return;lastBump=now;
    const el=which==='L'?edgeL:edge;
    el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');
  }
  function syncEnd(){
    edge.classList.toggle('on',x>maxX-24);
    edgeL.classList.toggle('on',x<-4);
  }

  /* auto cycle: drift 01→06, dwell at the blur edge, carriage-return to 01 */
  let phase='drift',dwellAcc=0;
  const DWELL=1.15;
  const REWIND=1.35;

  function frame(ts){
    if(!vis){running=false;return;}
    const dt=Math.min(.05,(ts-last)/1000||.016);last=ts;
    if(!maxX){measure();paint();requestAnimationFrame(frame);return;}
    if(dragging){requestAnimationFrame(frame);return;}   /* pointer owns position */
    const out=x>maxX||x<0;
    if(out){
      if(wRAF2){/* wheel tension owns the position while it lasts */}
      else{
        /* ---- damped spring flight home (with a small overshoot wobble) ---- */
        const bound=x>maxX?maxX:0;
        xv+=(-SPR_K*(x-bound)-SPR_C*xv)*dt;
        x+=xv*dt;
        if(Math.abs(x-bound)<.6&&Math.abs(xv)<14){x=bound;xv=0;rawPull=0;}
      }
      fling=0;
    }else{
      xv=0;rawPull=0;
      /* momentum from a released swipe, decaying */
      if(Math.abs(fling)>4){
        x+=fling*dt;
        fling*=Math.exp(-dt*3.2);
        if(x>maxX||x<0){xv=fling;fling=0;bump(x<0?'L':'R');}  /* momentum hits the wall → hand it to the spring */
      }else fling=0;
      /* eased auto speed: hover → 0, idle → 1x (gates every phase) */
      cur+=(target-cur)*Math.min(1,dt*(target<cur?7:2.6));
      if(phase==='drift'){
        x+=((maxX+view.clientWidth)/BASE)*cur*dt;
        if(x>=maxX){x=maxX;phase='dwell';dwellAcc=0;bump('R');}
      }else if(phase==='dwell'){
        dwellAcc+=dt*cur;
        if(x<maxX-24)phase='drift';
        else if(dwellAcc>=DWELL)phase='rewind';
      }else if(phase==='rewind'){
        x-=(maxX/REWIND)*cur*dt;
        if(x<=0){x=0;phase='drift';}
      }
    }
    syncEnd();paint();
    requestAnimationFrame(frame);
  }
  function start(){if(!running){running=true;last=performance.now();measure();paint();requestAnimationFrame(frame);}}

  /* ---- hover: stop / un-hover: resume the ambient cycle ---- */
  if(canHover){
    mq.addEventListener('mouseenter',()=>{if(!dragging)target=0;});
    mq.addEventListener('mouseleave',()=>{target=1;});
  }

  /* ---- drag / swipe: 1:1 in bounds; deep progressive rubber past them ---- */
  view.addEventListener('pointerdown',e=>{
    if(e.button!==undefined&&e.button!==0)return;
    maybeDrag=true;dragging=false;pid=e.pointerId;px=e.clientX;py=e.clientY;
    dragVX=0;dragT=performance.now();fling=0;xv=0;phase='drift';wRaw=0;
    /* if the spring was mid-flight, pick the stretch up exactly where it is */
    if(x>maxX)rawPull=invRubber(x-maxX);
    else if(x<0)rawPull=-invRubber(-x);
    else rawPull=0;
  });
  view.addEventListener('pointermove',e=>{
    if(!maybeDrag||e.pointerId!==pid)return;
    const dx=e.clientX-px,dy=e.clientY-py;
    if(!dragging){
      if(Math.abs(dx)<THRESH)return;
      if(Math.abs(dy)>Math.abs(dx))return maybeDrag=false;
      dragging=true;view.classList.add('dragging');
      try{view.setPointerCapture(pid);}catch(_){}
    }
    const now=performance.now(),dt=Math.max(1,now-dragT);
    const s=-(e.clientX-px);           /* finger left → advance, finger right → go back */
    /* in-bounds portion moves 1:1; beyond a boundary, raw pull feeds the rubber curve */
    let inb=x;
    if(rawPull===0){
      inb=x+s;
      if(inb>maxX){rawPull=inb-maxX;inb=maxX;bump('R');}
      else if(inb<0){rawPull=inb;inb=0;bump('L');}
      x=inb+ (rawPull>0?rubber(rawPull):rawPull<0?-rubber(-rawPull):0);
    }else{
      const prev=rawPull;
      rawPull+=s;
      if((prev>0&&rawPull<=0)||(prev<0&&rawPull>=0)){
        /* pulled back across the boundary: leftover motion applies 1:1 */
        const leftover=rawPull;rawPull=0;
        x=Math.min(maxX,Math.max(0,(prev>0?maxX:0)+leftover));
      }else if(rawPull>0)x=maxX+rubber(rawPull);
      else x=-rubber(-rawPull);
    }
    dragVX=s/(dt/1000);
    px=e.clientX;py=e.clientY;dragT=now;
    syncEnd();paint();
    e.preventDefault();
  });
  function endDrag(e){
    if(e&&pid!==null&&e.pointerId!==pid)return;
    if(dragging){
      if(x>maxX||x<0){fling=0;xv=0;}                    /* released in the air → spring takes over */
      else fling=Math.max(-2600,Math.min(2600,dragVX));
      cur=0;
      target=(canHover&&mq.matches(':hover'))?0:1;
    }
    dragging=false;maybeDrag=false;pid=null;rawPull=0;
    view.classList.remove('dragging');
  }
  view.addEventListener('pointerup',endDrag);
  view.addEventListener('pointercancel',endDrag);
  addEventListener('pointerup',endDrag);
  view.addEventListener('click',e=>{if(Math.abs(fling)>40){e.stopPropagation();e.preventDefault();}},true);

  /* ---- wheel / trackpad: box-on-a-spring model at the boundaries ----
     Your scroll input is a FORCE pushing the box against the spring:
     · pushing hard holds a modest stretch (the spring is always pulling back)
     · the moment your real force stops, the tension leaks out and the box
       returns immediately — macOS "momentum" echo events after your fingers
       lift are detected (fading-delta signature) and ignored, so they can
       never hold the stretch                                                  */
  let wheelGlide=0,wheelRAF=false;
  let wRaw=0,wDir=0,wHist=[],wStreak=0,wTail=false,wLastD=0,wRAF2=false,wLastT=0;
  function wheelGate(mag){                    /* true = genuine push, false = momentum echo */
    wHist.push(mag);if(wHist.length>12)wHist.shift();
    const ref=wHist.length>6?wHist[wHist.length-7]:wHist[0];
    if(mag>wLastD*1.15&&mag>3){wTail=false;wStreak=0;}   /* a fresh, growing push */
    else if(mag<ref*.95){if(++wStreak>=3)wTail=true;}    /* steadily fading → echo */
    else wStreak=0;
    wLastD=mag;
    return !wTail;
  }
  function stretchStep(ts){
    if(wRaw<=.5||dragging){wRaw=0;wRAF2=false;return;}   /* drained → spring snaps the last px */
    const dt=Math.min(.05,(ts-wLastT)/1000||.016);wLastT=ts;
    wRaw*=Math.exp(-dt*8);                    /* tension constantly leaks — stop pushing, it returns */
    x=wDir>0?maxX+rubber(wRaw):-rubber(wRaw);
    syncEnd();paint();
    requestAnimationFrame(stretchStep);
  }
  function enterStretch(dir,initialOver){
    wDir=dir;wRaw=Math.max(wRaw,invRubber(Math.max(0,initialOver)));
    wHist.length=0;wStreak=0;wTail=false;wLastD=0;
    if(!wRAF2){wRAF2=true;wLastT=performance.now();requestAnimationFrame(stretchStep);}
  }
  function glideStep(){
    if(Math.abs(wheelGlide)<.4||wRAF2){wheelGlide=0;wheelRAF=false;return;}
    const step=wheelGlide*.22;wheelGlide-=step;
    x+=step;
    if(x>maxX){enterStretch(1,x-maxX);x=maxX+rubber(wRaw);wheelGlide=0;bump('R');}
    else if(x<0){enterStretch(-1,-x);x=-rubber(wRaw);wheelGlide=0;bump('L');}
    syncEnd();paint();
    if(!wRAF2)requestAnimationFrame(glideStep);else wheelRAF=false;
  }
  view.addEventListener('wheel',e=>{
    if(dragging)return;
    if(Math.abs(e.deltaX)<=Math.abs(e.deltaY))return;
    e.preventDefault();
    fling=0;xv=0;target=0;phase='drift';
    const d=e.deltaMode===1?e.deltaX*16:e.deltaX;
    const stretched=wRaw>.5||x>maxX||x<0;
    if(stretched){
      const dir=wDir!==0?wDir:(x>maxX?1:-1);
      if(d*dir>0){                            /* pushing outward: only a real push adds tension */
        if(wheelGate(Math.abs(d)))wRaw+=Math.abs(d)*2;
        bump(dir>0?'R':'L');
      }else{                                  /* pulling back: always releases tension, instantly */
        wRaw=Math.max(0,wRaw-Math.abs(d)*3);
      }
      enterStretch(dir,x>maxX?x-maxX:(x<0?-x:0));
    }else{
      if(x>=maxX&&d>0){enterStretch(1,0);if(wheelGate(d))wRaw+=d*2;bump('R');}
      else if(x<=0&&d<0){enterStretch(-1,0);if(wheelGate(-d))wRaw+=(-d)*2;bump('L');}
      else{
        wheelGlide+=d;
        if(!wheelRAF){wheelRAF=true;requestAnimationFrame(glideStep);}
      }
    }
  },{passive:false});

  /* ---- fast-forward button ---- */
  if(fwd){
    const go=()=>{target=FAST;fwd.classList.add('on');};
    const stop=()=>{target=(canHover&&mq.matches(':hover'))?0:1;fwd.classList.remove('on');};
    fwd.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();go();});
    fwd.addEventListener('pointerup',stop);
    fwd.addEventListener('pointerleave',stop);
    fwd.addEventListener('pointercancel',stop);
    fwd.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
    fwd.addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' ')stop();});
    fwd.addEventListener('blur',stop);
  }

  measure();
  addEventListener('resize',()=>{measure();x=Math.min(maxX,Math.max(0,x));xv=0;rawPull=0;paint();syncEnd();});
  setTimeout(measure,400);addEventListener('load',measure);
  new IntersectionObserver(es=>{vis=es[0].isIntersecting;if(vis){measure();start();}},{threshold:.02}).observe(mq);
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
          calLink:'kenwer-drones-hhjia7/kenwer-intro-call',
          config:{layout:'month_view'}
        });
      }else{
        window.open(btn.href,'_blank','noopener');
      }
    });
  });
})();
