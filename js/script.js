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

/* ---------- footer band: particle film · "The Layer Inside" ----------
   The website's particle trailer of the Kenwer video storyboard — five acts,
   continuous, no dead pauses, drawn entirely in particles:
     act 0  FLEET      five drones; the Kenwer unit (middle) is brighter;
                       a cyan selection ring pulses on it
     act 1  DEPART     the other four bank away and fly OUT of frame; their
                       particles rematerialise into the Kenwer drone, large
                       and fully detailed
     act 2  REVEAL     the drone rises; particles stream from its core down
                       into a brain beneath it, joined by a cyan tether
     act 3  EXPLODE    the drone dissolves; the brain splits into the full
                       five-layer stack — hemispheres, memory plate, the
                       GLOWING CYAN COGNITIVE IDENTITY STACK, bolted frame,
                       amber power layer — the same anatomy as card 04
     act 4  RESEAL     the layers glide back into a whole brain with a cyan
                       core glowing faintly inside … then it disperses back
                       into the fleet and the film loops
   Dense sampling + stiff springs keep edges crisp. Cyan marks cognition,
   amber marks power — same palette as the card-04 scene.
   Press / hold the band to scatter; release and the film resumes. */
(function(){
  const band=document.getElementById('halftone'),cv=document.getElementById('droneCv');
  if(!band||!cv)return;
  const ctx=cv.getContext('2d',{alpha:false});
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BG='#050505', INK='237,235,228', CY='143,227,234', AM='232,194,122';
  let W=0,H=0,DPR=1,parts=[],targets=[],running=false,visible=false,last=0;
  let chosenX=0,chosenY=0;

  function size(){
    W=band.clientWidth;H=band.clientHeight;DPR=Math.min(2,devicePixelRatio||1);
    cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
    if(W&&H)seed();
  }

  /* ================= silhouette painters ================= */
  function drawDrone(o,cx,cy,S,full){
    const b=S*.13, arm=S*.30, rot=S*.15, lw=Math.max(1.6,S*.014);
    o.lineWidth=lw;
    o.strokeRect(cx-b,cy-b,b*2,b*2);
    if(full){
      o.strokeRect(cx-b*.55,cy-b*.55,b*1.1,b*1.1);
      o.beginPath();o.moveTo(cx-b,cy-b);o.lineTo(cx+b,cy+b);
      o.moveTo(cx+b,cy-b);o.lineTo(cx-b,cy+b);o.stroke();
      o.beginPath();o.arc(cx,cy-b-S*.085,S*.032,0,7);o.stroke();
      o.beginPath();o.arc(cx,cy-b-S*.085,S*.013,0,7);o.fill();
    }
    o.beginPath();o.moveTo(cx,cy-b);o.lineTo(cx,cy-b-S*.05);o.stroke();
    let ri=0;
    for(const[sx,sy]of[[-1,-1],[1,-1],[-1,1],[1,1]]){
      const ax=cx+sx*arm, ay=cy+sy*arm;
      if(full){
        const px=-sy*lw*1.4, py=sx*lw*1.4;
        o.beginPath();o.moveTo(cx+sx*b*.9+px,cy+sy*b*.9+py);o.lineTo(ax+px*.4,ay+py*.4);o.stroke();
        o.beginPath();o.moveTo(cx+sx*b*.9-px,cy+sy*b*.9-py);o.lineTo(ax-px*.4,ay-py*.4);o.stroke();
      }else{
        o.beginPath();o.moveTo(cx+sx*b*.9,cy+sy*b*.9);o.lineTo(ax,ay);o.stroke();
      }
      o.beginPath();o.arc(ax,ay,rot,0,7);o.stroke();
      if(full){o.beginPath();o.arc(ax,ay,rot*.5,0,7);o.stroke();}
      o.beginPath();o.arc(ax,ay,rot*(full?.16:.2),0,7);o.fill();
      const ang=(ri++%2?.55:2.1);
      o.beginPath();
      o.moveTo(ax+Math.cos(ang)*rot*.92,ay+Math.sin(ang)*rot*.92);
      o.lineTo(ax-Math.cos(ang)*rot*.92,ay-Math.sin(ang)*rot*.92);o.stroke();
      if(full)for(let k=0;k<4;k++){
        const a2=k*Math.PI/2+.79;
        o.beginPath();
        o.moveTo(ax+Math.cos(a2)*rot*.86,ay+Math.sin(a2)*rot*.86);
        o.lineTo(ax+Math.cos(a2)*rot,ay+Math.sin(a2)*rot);o.stroke();
      }
    }
  }
  function hemiPath(o,m){
    o.beginPath();o.moveTo(m*3,74);
    o.bezierCurveTo(m*54,76,m*90,52,m*90,20);
    o.bezierCurveTo(m*90,-10,m*70,-30,m*46,-30);
    o.bezierCurveTo(m*40,-52,m*16,-60,m*3,-46);
    o.lineTo(m*3,74);o.stroke();
  }
  function foldSet(o){
    function fold(m,pts){
      o.beginPath();o.moveTo(m*pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i+=3)
        o.bezierCurveTo(m*pts[i][0],pts[i][1],m*pts[i+1][0],pts[i+1][1],m*pts[i+2][0],pts[i+2][1]);
      o.stroke();
    }
    for(const m of[1,-1]){
      fold(m,[[14,-38],[34,-46],[52,-34],[56,-16]]);
      fold(m,[[10,-18],[38,-26],[62,-10],[66,12]]);
      fold(m,[[12,4],[40,-2],[64,16],[62,38]]);
      fold(m,[[14,28],[44,22],[60,40],[50,58]]);
      fold(m,[[12,50],[34,46],[44,58],[36,68]]);
    }
  }
  function drawBrain(o,cx,cy,S){
    const u=S/200;
    o.save();o.translate(cx,cy+S*.03);o.scale(u,u);
    o.lineWidth=Math.max(1.6,S*.016)/u;
    for(const e of[1,.92]){o.save();o.scale(e,e);hemiPath(o,1);hemiPath(o,-1);o.restore();}
    foldSet(o);
    o.beginPath();o.moveTo(-7,74);o.bezierCurveTo(-6,86,-4,92,0,96);
    o.bezierCurveTo(4,92,6,86,7,74);o.stroke();
    o.restore();
  }
  function iso(o,cx,cy,w,h,fillIt){
    o.beginPath();
    o.moveTo(cx,cy-h);o.lineTo(cx+w,cy);o.lineTo(cx,cy+h);o.lineTo(cx-w,cy);
    o.closePath();
    fillIt?o.fill():o.stroke();
  }

  /* ================= keyframe target sets =================
     point = [x, y, flag, hx, hy]
       act 0:   flag 1 = Kenwer drone point; hx,hy = that drone's centre
       acts 2+: flag 0 = warm white, 1 = cyan, 2 = amber                   */
  function buildTargets(){
    const off=document.createElement('canvas');off.width=W;off.height=H;
    const o=off.getContext('2d');o.strokeStyle='#fff';o.fillStyle='#fff';
    const cx=W/2, cy=H/2, S=Math.min(W*.5,H*.86);
    const CAP=W<640?3000:6400;
    const GAP=W<640?3:2;

    function sample(flag,hx,hy){
      const img=o.getImageData(0,0,W,H).data, pts=[];
      for(let y=0;y<H;y+=GAP)for(let x=0;x<W;x+=GAP){
        if(img[(y*W+x)*4+3]>10)
          pts.push([x+(Math.random()-.5)*.6,y+(Math.random()-.5)*.6,flag,hx||0,hy||0]);
      }
      return pts;
    }

    /* ---- act 0: FLEET ---- */
    const narrow=W<720;
    const offs=narrow?[-.30,0,.30]:[-.36,-.18,0,.18,.36];
    const mid=(offs.length-1)/2;
    const fleet=[];
    offs.forEach((ox,i)=>{
      o.clearRect(0,0,W,H);
      const dx=cx+ox*W, dy=cy+(i===mid?0:(i%2?-.06:.06)*H);
      drawDrone(o,dx,dy,S*(i===mid?.5:.4),false);
      if(i===mid){chosenX=dx;chosenY=dy;}
      fleet.push(...sample(i===mid?1:0,dx,dy));
    });

    /* ---- act 1: THE UNIT ---- */
    o.clearRect(0,0,W,H);
    drawDrone(o,cx,cy,S,true);
    const unit=sample(0);

    /* ---- act 2: drone above, brain below, cyan tether ---- */
    const dS=S*.6, bS=S*.52, topY=H*.28, botY=H*.74;
    o.clearRect(0,0,W,H);
    drawDrone(o,cx,topY,dS,true);
    drawBrain(o,cx,botY,bS);
    const duo=sample(0);
    o.clearRect(0,0,W,H);
    o.lineWidth=2.6;o.setLineDash([5,6]);
    o.beginPath();o.moveTo(cx,topY+dS*.2);o.lineTo(cx,botY-bS*.36);o.stroke();
    o.setLineDash([]);
    o.beginPath();o.arc(cx,botY-bS*.42,5,0,7);o.stroke();
    duo.push(...sample(1));

    /* ---- act 3: FULL EXPLODED STACK (the card-04 anatomy) ---- */
    const gapY=H/6, pw=S*.42;
    const yHemi=gapY*1.05, yMem=gapY*2.35, yCore=gapY*3.3, yFrame=gapY*4.25, yBase=gapY*5.2;
    const ex=[];
    /* hemispheres, lifted apart */
    o.clearRect(0,0,W,H);
    (function(){
      const u=(S*.46)/200;
      o.lineWidth=Math.max(1.6,S*.007)/u;
      o.save();o.translate(cx-S*.14,yHemi);o.scale(u,u);hemiPath(o,-1);o.restore();
      o.save();o.translate(cx+S*.14,yHemi);o.scale(u,u);hemiPath(o,1);o.restore();
    })();
    /* spindle + memory plate + frame plate (all white) */
    o.lineWidth=2.2;o.setLineDash([3,7]);
    o.beginPath();o.moveTo(cx,yHemi+S*.12);o.lineTo(cx,yBase-S*.02);o.stroke();
    o.setLineDash([]);
    iso(o,cx,yMem,pw*.8,pw*.24,false);
    o.beginPath();o.moveTo(cx-pw*.34,yMem);o.lineTo(cx-pw*.12,yMem-pw*.06);o.stroke();
    o.beginPath();o.moveTo(cx+pw*.34,yMem);o.lineTo(cx+pw*.12,yMem+pw*.06);o.stroke();
    iso(o,cx,yFrame,pw,pw*.28,false);
    for(const[bx,by]of[[0,-pw*.24],[pw*.86,0],[0,pw*.24],[-pw*.86,0]]){
      o.beginPath();o.arc(cx+bx,yFrame+by,4,0,7);o.stroke();
    }
    ex.push(...sample(0));
    /* THE COGNITIVE IDENTITY STACK — cyan */
    o.clearRect(0,0,W,H);
    iso(o,cx,yCore-pw*.09,pw*.62,pw*.17,false);
    iso(o,cx,yCore,pw*.62,pw*.17,false);
    iso(o,cx,yCore+pw*.09,pw*.62,pw*.17,false);
    iso(o,cx,yCore,pw*.2,pw*.06,true);
    o.beginPath();o.moveTo(cx+pw*.66,yCore);o.lineTo(cx+pw*.95,yCore);o.stroke();
    o.beginPath();o.arc(cx+pw*1.02,yCore,5,0,7);o.stroke();
    ex.push(...sample(1));
    /* amber power layer */
    o.clearRect(0,0,W,H);
    iso(o,cx,yBase,pw*1.1,pw*.3,false);
    o.lineWidth=1.8;
    o.beginPath();o.moveTo(cx-pw*.6,yBase);
    o.quadraticCurveTo(cx-pw*.25,yBase-pw*.1,cx,yBase);
    o.quadraticCurveTo(cx+pw*.25,yBase+pw*.1,cx+pw*.6,yBase);o.stroke();
    ex.push(...sample(2));

    /* ---- act 4: RESEALED brain with a faint cyan core ---- */
    o.clearRect(0,0,W,H);
    drawBrain(o,cx,cy,S*.8);
    const seal=sample(0);
    o.clearRect(0,0,W,H);
    (function(){
      const u=(S*.8)/200;
      o.save();o.translate(cx,cy+S*.8*.03);o.scale(u,u);
      o.beginPath();o.moveTo(-26,8);o.quadraticCurveTo(0,-2,26,8);
      o.quadraticCurveTo(0,16,-26,8);o.fill();
      o.restore();
    })();
    seal.push(...sample(1));

    /* ---- act 5: THE MARK — the Kenwer logo, filled and solid ----
       The path is read live from the site's own logo SVG (#cvMark), so the
       particle mark is always identical to the real mark. */
    o.clearRect(0,0,W,H);
    const mEl=document.querySelector('#cvMark path');
    let mark=[];
    if(mEl){
      const LS=S*.94, ls=LS/200;
      o.save();o.translate(cx-LS/2,cy-LS/2);o.scale(ls,ls);
      o.fill(new Path2D(mEl.getAttribute('d')));
      o.restore();
      mark=sample(0);
    }else{
      mark=seal.slice();
    }

    targets=[fleet,unit,duo,ex,seal,mark];
    /* shuffle every set BEFORE equalising — the filled mark oversamples far
       past the cap, and truncating an unshuffled row-major list would slice
       the logo's bottom off instead of thinning it evenly */
    for(const t of targets)t.sort(()=>Math.random()-.5);
    const n=Math.min(CAP,Math.max(...targets.map(t=>t.length)));
    for(const t of targets){while(t.length<n)t.push(t[(Math.random()*t.length)|0]);t.length=n;}
    return n;
  }

  function seed(){
    const n=buildTargets();
    parts=Array.from({length:n},()=>({
      x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,
      ph:Math.random()*7,dl:Math.random(),tp:false,
      r:1.35+Math.random()*.55, ba:.68+Math.random()*.32
    }));
  }

  /* ================= the film ================= */
  let scene=0,t=0;
  const HOLD=[2.8,2.3,3.2,4.4,2.6,3.6];
  let pressed=false,px=0,py=0;

  function frame(ts){
    if(!visible){running=false;return}
    const dt=Math.min(.05,(ts-last)/1000||.016);last=ts;t+=dt;
    if(!pressed&&t>HOLD[scene]){
      scene=(scene+1)%6;t=0;
      for(const p of parts)p.tp=false;
    }

    ctx.fillStyle=BG;ctx.fillRect(0,0,W,H);

    /* cinematic backlight */
    if(scene>0&&!pressed){
      const gr=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.min(W,H)*.55);
      const ga=Math.min(1,t*1.3)*(scene===3?.10:scene===5?.08:.05);
      gr.addColorStop(0,'rgba('+INK+','+ga+')');gr.addColorStop(1,'rgba('+INK+',0)');
      ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
    }
    /* cyan selection ring, late in the fleet act */
    if(scene===0&&!pressed&&t>HOLD[0]-1.2){
      const k=(t-(HOLD[0]-1.2))/1.2;
      for(const q of[0,.45]){
        const kk=(k+q)%1;
        ctx.strokeStyle='rgba('+CY+','+(0.6*(1-kk))+')';
        ctx.lineWidth=1.6;
        ctx.beginPath();ctx.arc(chosenX,chosenY,28+kk*74,0,7);ctx.stroke();
      }
    }

    const tg=targets[scene], t0=targets[0];
    for(let i=0;i<parts.length;i++){
      const p=parts[i], T=tg[i];
      let alpha=1, tint=0;

      if(pressed){
        const dx=p.x-px,dy=p.y-py,d=Math.hypot(dx,dy)||1;
        const f=Math.max(0,1-d/(W*.45))*420*dt;
        p.vx+=dx/d*f+(Math.random()-.5)*70*dt;
        p.vy+=dy/d*f+(Math.random()-.5)*70*dt;
        alpha=.6;
      }else if(scene===1&&t0[i][2]===0&&!p.tp){
        /* a partner-drone particle: bank away and exit the frame like the
           video's act 2, fade in flight, then rematerialise on the unit */
        if(t<.95){
          const exitX=t0[i][3]<W/2? -W*.12 : W*1.12;
          const exitY=t0[i][4]+(t0[i][3]<W/2?-1:1)*H*.10;
          p.vx+=(exitX-p.x)*6.5*dt;
          p.vy+=(exitY-p.y)*6.5*dt;
          alpha=Math.max(0,1-Math.max(0,t-.3)/.55);
        }else{
          p.tp=true;
          p.x=T[0]+(Math.random()-.5)*60;
          p.y=T[1]+(Math.random()-.5)*60;
          p.vx=p.vy=0;
        }
      }else{
        const born=scene===1&&t0[i][2]===0;
        const gate=Math.min(1,Math.max(.15,(born?(t-.95)*2.4:t*2.3)-p.dl*.5));
        p.vx+=(T[0]-p.x)*14*gate*dt;
        p.vy+=(T[1]-p.y)*14*gate*dt;
        if(born)alpha=Math.min(1,(t-.95)/.6);
      }

      p.vx*=Math.exp(-4.5*dt);p.vy*=Math.exp(-4.5*dt);
      p.x+=p.vx*dt;p.y+=p.vy*dt;

      let ox=0,oy=0;
      if(!pressed&&t>1.6){p.ph+=dt*1.4;ox=Math.sin(p.ph)*.4;oy=Math.cos(p.ph*.9)*.4}

      if(scene===0&&T[2]===1)alpha*=1.3;
      if(scene===5)alpha*=Math.min(1.2,1+t*.08);   /* the mark warms as it settles */
      if(scene>=2&&scene<5)tint=T[2];

      const a=Math.min(1,alpha*p.ba);
      if(tint===1){
        ctx.fillStyle='rgba('+CY+','+(a*.28)+')';
        ctx.fillRect(p.x+ox-p.r*1.6,p.y+oy-p.r*1.6,p.r*3.2,p.r*3.2);
        ctx.fillStyle='rgba('+CY+','+a+')';
      }else if(tint===2){
        ctx.fillStyle='rgba('+AM+','+(a*.25)+')';
        ctx.fillRect(p.x+ox-p.r*1.6,p.y+oy-p.r*1.6,p.r*3.2,p.r*3.2);
        ctx.fillStyle='rgba('+AM+','+a+')';
      }else{
        ctx.fillStyle='rgba('+INK+','+a+')';
      }
      ctx.fillRect(p.x+ox-p.r*.5,p.y+oy-p.r*.5,p.r,p.r);
    }
    requestAnimationFrame(frame);
  }
  function start(){if(!running){running=true;last=performance.now();requestAnimationFrame(frame)}}

  band.addEventListener('pointerdown',e=>{
    const r=band.getBoundingClientRect();
    pressed=true;px=e.clientX-r.left;py=e.clientY-r.top;
  });
  band.addEventListener('pointermove',e=>{
    if(!pressed)return;
    const r=band.getBoundingClientRect();px=e.clientX-r.left;py=e.clientY-r.top;
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>
    band.addEventListener(ev,()=>{pressed=false}));

  if(reduce){
    size();ctx.fillStyle=BG;ctx.fillRect(0,0,W,H);
    targets[5].forEach(pt=>{
      ctx.fillStyle='rgba('+INK+',.88)';
      ctx.fillRect(pt[0]-1,pt[1]-1,2,2);
    });
    return;
  }
  new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible){start()}},{threshold:.04}).observe(band);
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

/* ---------- card 04 flip: tap toggles on touch / no-hover devices ----------
   A tap on the card flips it; a swipe that ended on the card must NOT flip it.
   We can't rely on the marquee's .dragging class — pointerup removes it before
   the click event fires. Instead we track pointer movement per-card and treat
   anything past a small threshold as a drag, not a tap. */
(function(){
  if(matchMedia('(hover: hover)').matches)return;   /* mouse users flip via hover */
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
      c.classList.toggle('flipped');
    });
  });
  /* tap anywhere outside a flipped card returns it to the front.
     Runs after the card's own click handler (bubble order), so a tap on the
     card that just added .flipped is inside the card and correctly ignored. */
  document.addEventListener('click',e=>{
    document.querySelectorAll('.pcard-flip.flipped').forEach(c=>{
      if(!c.contains(e.target))c.classList.remove('flipped');
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