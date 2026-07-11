/* ---------- reveal + split ---------- */
const io=new IntersectionObserver(es=>{for(const e of es){if(e.isIntersecting){e.target.classList.add('in','split-in');io.unobserve(e.target)}}},{threshold:.15,rootMargin:"0px 0px -40px 0px"});
document.querySelectorAll('.rv, #heroH, .final-h').forEach(el=>io.observe(el));
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
 '"Hardware enables flight. Intelligence enables autonomous work. The value of an autonomous system isn\'t the aircraft. It\'s the ability to understand objectives, decide well, and prove the mission was accomplished."',
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
function placePv(el){ /* card sits exactly beside the active item */
  if(innerWidth<=1080||!el)return;
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

/* ---------- minimap: docked right; collapses to a tiny box when text passes under it ---------- */
(function(){
  const mm=document.getElementById('minimap');if(!mm)return;
  const PAD=14, MARGIN=22, EXP_W=190, CMP_W=118, CMP_H=64;
  let expH=0, lastFlip=0, tick=false;
  function layout(){
    expH=mm.classList.contains('dodge')?expH:mm.offsetHeight||190;
  }
  function hit(r,zone){
    return r.left<zone.right+PAD&&r.right>zone.left-PAD&&r.top<zone.bottom+PAD&&r.bottom>zone.top-PAD;
  }
  const sel='h1,h2,h3,p,.cv-word,.cv-cue,.svc-item,.dot-label,.ga-l,.ga-n,.faq-q,.btn-big,.btn-box,.hw-tag,.j-title,blockquote';
  function upd(){
    tick=false;
    if(innerWidth<=820)return;
    const cands=document.querySelectorAll(sel);
    const zoneExp={left:innerWidth-MARGIN-EXP_W,right:innerWidth-MARGIN,top:innerHeight-MARGIN-expH,bottom:innerHeight-MARGIN};
    const zoneCmp={left:innerWidth-MARGIN-CMP_W,right:innerWidth-MARGIN,top:innerHeight-MARGIN-CMP_H,bottom:innerHeight-MARGIN};
    let oE=false,oC=false;
    for(const el of cands){
      if(mm.contains(el))continue;
      const r=el.getBoundingClientRect();
      if(!r.width||!r.height)continue;
      if(r.bottom<zoneExp.top-PAD)continue;
      if(!oE&&hit(r,zoneExp))oE=true;
      if(!oC&&hit(r,zoneCmp))oC=true;
      if(oE&&oC)break;
    }
    const now=performance.now();
    const dodged=mm.classList.contains('dodge');
    if(oE!==dodged&&now-lastFlip>350){mm.classList.toggle('dodge',oE);lastFlip=now}
    mm.classList.toggle('shy',mm.classList.contains('dodge')&&oC);
  }
  addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(upd)}},{passive:true});
  addEventListener('resize',()=>{layout();upd()});
  layout();upd();
})();

/* ---------- flight-path canvases (monochrome, slow) ---------- */
function skyfield(id,alpha){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv=document.getElementById(id);if(!cv)return;
  const ctx=cv.getContext('2d');let W,H,DPR;
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
        tone:bright?'237,235,228':'118,116,108',
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
    ctx.strokeStyle='rgba(237,235,228,.065)';ctx.lineWidth=1;
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
        ctx.fillStyle=`rgba(${p.tone},${p.a*p.e})`;
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
      ctx.fillStyle=s.bright?`rgba(237,235,228,${.85*k})`:`rgba(118,116,108,${.9*k})`;
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
        ctx.strokeStyle=`rgba(237,235,228,${alpha*fade*(.3+.7*seg)})`;
        ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(q.x,q.y);ctx.stroke();
        prev=q;
      }
      if(draw<1){const h=bez(p,draw);
        ctx.save();
        ctx.shadowColor='rgba(237,235,228,.9)';ctx.shadowBlur=12;
        ctx.fillStyle=`rgba(237,235,228,${.95*fade})`;ctx.beginPath();ctx.arc(h.x,h.y,2,0,7);ctx.fill();
        ctx.restore();}
    }
    if(!reduce)requestAnimationFrame(frame);
  }
  reduce?frame(performance.now()):requestAnimationFrame(frame);
}
skyfield('skycv',.3);
skyfield('skycv2',.22);

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
  items.forEach((it,i)=>{
    it.addEventListener('mouseenter',()=>{
      clear();
      it.classList.add('hv0');
      if(items[i-1])items[i-1].classList.add('hv1');
      if(items[i+1])items[i+1].classList.add('hv1');
      if(items[i-2])items[i-2].classList.add('hv2');
      if(items[i+2])items[i+2].classList.add('hv2');
    });
  });
  const list=items[0].parentElement;
  list.addEventListener('mouseleave',clear);
})();

/* ---------- footer field: living constellation that locks into an objective, then the mark ---------- */
(function(){
  const band=document.getElementById('halftone'),cv=document.getElementById('droneCv');
  if(!cv)return;
  const ctx=cv.getContext('2d',{alpha:false});
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LOGO='M 6.4,11.2 C 5.9,11.7 5.9,104.0 6.5,105.2 C 6.7,105.8 6.9,106.5 6.9,106.9 C 6.9,107.8 7.6,109.4 8.5,110.4 C 9.0,110.9 9.3,111.5 9.3,111.6 C 9.3,112.0 14.0,116.7 15.7,117.9 C 16.3,118.4 17.9,119.4 19.1,120.2 C 20.4,121.1 21.8,122.1 22.4,122.6 C 23.3,123.3 23.8,123.7 26.4,125.6 C 26.9,125.9 27.8,126.6 28.5,127.1 C 29.7,128.1 31.4,129.4 32.8,130.4 C 33.3,130.7 34.2,131.4 34.8,131.9 C 37.5,134.0 38.6,134.8 41.0,136.4 C 42.4,137.4 43.8,138.5 44.2,138.9 C 44.5,139.3 45.9,140.3 47.1,141.1 C 48.4,141.9 50.1,143.2 50.9,143.9 C 51.7,144.7 52.8,145.6 53.3,146.0 C 54.3,146.8 54.6,147.3 54.0,147.3 C 53.6,147.3 47.6,144.3 46.7,143.6 C 46.2,143.3 44.1,142.1 41.9,141.0 C 39.8,139.9 37.8,138.8 37.5,138.7 C 37.3,138.4 36.0,137.7 34.7,137.0 C 33.4,136.3 32.2,135.6 31.9,135.4 C 31.7,135.2 29.4,134.0 26.7,132.6 C 24.1,131.3 21.8,130.1 21.6,129.8 C 16.8,125.5 8.6,127.4 6.6,133.3 C 6.0,135.4 5.7,176.9 6.4,177.6 C 6.6,177.8 23.2,177.9 79.0,177.9 C 160.0,177.9 153.4,177.7 154.6,180.1 C 155.7,182.4 162.0,187.5 163.8,187.5 C 164.0,187.5 164.9,187.9 165.8,188.3 C 168.5,189.5 176.2,189.5 178.8,188.3 C 179.8,187.9 180.7,187.5 180.9,187.5 C 181.5,187.5 187.5,183.1 187.5,182.7 C 187.5,182.5 188.0,181.8 188.7,181.1 C 189.4,180.4 189.9,179.7 189.9,179.6 C 189.9,179.4 190.2,178.9 190.5,178.5 C 190.9,178.1 191.8,176.0 192.5,173.7 C 194.6,167.6 194.5,164.2 192.2,159.1 C 191.8,158.3 191.5,157.5 191.5,157.3 C 191.5,157.1 191.2,156.5 190.7,155.9 C 190.3,155.4 189.9,154.8 189.9,154.6 C 189.9,154.4 189.6,154.1 189.3,153.8 C 189.0,153.5 188.6,152.9 188.4,152.4 C 188.2,151.9 187.6,151.2 186.9,150.8 C 186.3,150.4 185.4,149.8 185.0,149.4 C 183.1,147.7 178.6,145.9 175.9,145.9 C 174.1,145.9 173.0,145.6 172.7,144.9 C 172.6,144.7 172.4,119.2 172.3,88.2 C 172.2,42.6 172.1,31.8 171.8,30.8 C 170.7,27.1 170.4,26.1 169.7,24.7 C 169.3,23.9 168.7,22.8 168.3,22.4 C 167.9,21.9 167.5,21.4 167.5,21.2 C 167.5,20.7 163.1,16.3 161.4,15.3 C 159.1,13.7 157.9,13.2 151.5,11.4 C 149.6,10.8 81.7,10.7 80.3,11.3 C 79.8,11.5 78.9,11.7 78.4,11.7 C 76.8,11.7 72.1,13.4 70.3,14.6 C 69.5,15.3 68.2,16.1 67.6,16.6 C 65.8,17.9 64.4,19.2 64.4,19.6 C 64.4,19.8 63.9,20.5 63.3,21.2 C 61.7,22.9 58.8,28.8 58.8,30.3 C 58.8,30.9 58.6,31.8 58.4,32.4 C 57.9,33.7 57.9,40.0 58.4,41.3 C 58.6,41.8 58.8,42.7 58.8,43.4 C 58.8,44.1 59.2,45.2 60.0,46.9 C 60.7,48.3 61.2,49.5 61.2,49.7 C 61.2,49.9 61.6,50.8 62.0,51.7 C 62.5,52.7 62.8,53.6 62.8,53.7 C 62.8,53.9 63.2,54.8 63.6,55.7 C 64.1,56.7 64.4,57.6 64.4,57.7 C 64.4,57.9 65.0,59.1 65.6,60.5 C 66.3,61.9 66.8,63.1 66.8,63.3 C 66.8,63.5 67.4,64.7 68.0,66.1 C 68.7,67.5 69.2,68.7 69.2,68.9 C 69.2,69.0 69.6,69.9 70.0,70.9 C 70.5,71.8 70.8,72.7 70.8,72.9 C 70.8,73.1 71.3,74.3 72.0,75.7 C 72.7,77.1 73.2,78.3 73.2,78.5 C 73.2,78.6 73.6,79.5 74.0,80.5 C 74.5,81.4 74.8,82.3 74.8,82.5 C 74.8,82.6 75.2,83.5 75.6,84.5 C 76.1,85.4 76.4,86.3 76.4,86.5 C 76.4,86.7 76.9,87.9 77.6,89.3 C 78.3,90.6 78.8,91.9 78.8,92.1 C 78.8,92.2 79.3,93.5 80.0,94.9 C 80.7,96.2 81.2,97.5 81.2,97.7 C 81.2,97.8 81.7,99.1 82.4,100.4 C 83.0,101.8 83.7,103.6 84.0,104.5 C 84.3,105.4 85.0,107.2 85.7,108.6 C 86.3,109.9 86.8,111.2 86.8,111.5 C 86.8,111.7 87.1,112.4 87.5,113.2 C 88.2,114.7 88.3,114.8 87.7,114.8 C 87.5,114.8 86.9,113.8 86.2,112.5 C 85.6,111.3 84.9,110.0 84.5,109.6 C 84.2,109.2 83.0,107.2 82.0,105.0 C 80.9,102.9 79.9,101.0 79.7,100.9 C 79.5,100.7 78.8,99.4 78.1,98.1 C 77.4,96.7 76.7,95.4 76.4,95.2 C 76.1,94.9 75.8,94.2 75.6,93.6 C 75.5,93.0 75.2,92.3 74.9,92.1 C 74.7,91.9 74.0,90.6 73.3,89.3 C 72.7,87.9 71.9,86.7 71.7,86.5 C 71.5,86.3 70.4,84.3 69.3,82.1 C 68.2,79.9 67.1,77.9 66.9,77.7 C 66.7,77.5 65.8,75.9 64.9,74.1 C 64.0,72.3 63.1,70.7 62.9,70.5 C 62.7,70.3 61.6,68.3 60.5,66.1 C 59.4,63.9 58.3,61.9 58.1,61.7 C 57.9,61.5 57.2,60.3 56.5,58.9 C 55.9,57.6 55.2,56.3 54.9,56.1 C 54.7,56.0 53.5,53.6 52.1,50.9 C 50.8,48.2 49.5,45.9 49.3,45.7 C 49.1,45.5 48.6,44.6 48.1,43.7 C 47.7,42.8 47.2,41.9 47.0,41.8 C 46.7,41.6 45.5,39.2 44.1,36.5 C 42.8,33.8 41.5,31.5 41.3,31.3 C 41.1,31.1 40.6,30.3 40.2,29.3 C 39.7,28.4 39.2,27.5 39.0,27.3 C 38.7,27.2 38.0,25.9 37.4,24.5 C 36.7,23.2 36.0,21.9 35.8,21.8 C 35.5,21.6 34.8,20.3 34.2,19.0 C 32.3,15.1 29.7,13.0 25.1,11.4 C 23.1,10.7 7.0,10.5 6.4,11.2';
  let W=0,H=0,dpr=1,parts=[],forms=[],t=0,last=0,running=false,visible=false;
  const LINK=96;               /* neighbour link radius */

  function reticle(){                              /* objective / targeting reticle points */
    const pts=[],cx=W/2,cy=H*0.5,R=Math.min(W,H)*0.30;
    for(const r of [R*0.42,R*0.72,R]){             /* concentric rings */
      const n=Math.round(r*0.16);
      for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}
    }
    for(let k=-1;k<=1;k+=2){                        /* crosshair ticks */
      for(let s=0;s<10;s++){const o=R*0.22+s/10*R*0.5;pts.push([cx+o*k,cy]);pts.push([cx,cy+o*k]);}
    }
    pts.push([cx,cy]);
    return pts;
  }
  function markPts(){                               /* Kenwer mark, sampled */
    const gw=140,gh=140,off=document.createElement('canvas');off.width=gw;off.height=gh;
    const o=off.getContext('2d');o.fillStyle='#000';o.fillRect(0,0,gw,gh);
    o.save();const s=gw/200*0.9;o.translate(gw*0.05,gh*0.05);o.scale(s,s);
    o.fillStyle='#fff';o.fill(new Path2D(LOGO));o.restore();
    const data=o.getImageData(0,0,gw,gh).data,raw=[];
    for(let j=0;j<gh;j+=2)for(let i=0;i<gw;i+=2)if(data[(j*gw+i)*4]>110)raw.push([i,j]);
    const scale=Math.min(W,H)*0.62/gw,ox=W/2-gw*scale/2,oy=H*0.5-gh*scale/2;
    return raw.map(p=>[ox+p[0]*scale,oy+p[1]*scale]);
  }
  function assign(pts){ for(let i=0;i<parts.length;i++)parts[i].tg=pts[i%pts.length]; }

  function size(){
    const r=band.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);W=r.width;H=r.height;
    cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const n=Math.min(230,Math.max(90,Math.round(W*H/7200)));
    parts=[];for(let i=0;i<n;i++)parts.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,tg:[W/2,H/2],sp:.6+Math.random()*.8});
    forms=[reticle(),markPts()];assign(forms[0]);
  }
  function flow(x,y,tt){return (Math.sin(x*0.006+tt*0.6)+Math.cos(y*0.0064-tt*0.45)+Math.sin((x+y)*0.0034+tt*0.3))*1.7;}

  /* formation timeline: long free-flow, brief lock, alternating reticle <-> mark */
  let formV=0,fi=0,pulseV=0,pulsed=false;
  function timeline(tt){
    const p=(tt%17)/17;                    /* 17s cycle */
    let v=0;
    if(p>0.5&&p<0.82){const q=(p-0.5)/0.32;v=q<0.5?q*2:1-(q-0.5)*2;v=v*v*(3-2*v);}  /* smooth rise+fall */
    return v;
  }

  let px=.5,py=.5,press=0,scatter=0;
  band.addEventListener('pointerdown',e=>{const r=band.getBoundingClientRect();px=e.clientX-r.left;py=e.clientY-r.top;press=1;scatter=1;});
  addEventListener('pointerup',()=>press=0);band.addEventListener('pointerleave',()=>press=0);

  function frame(ts){
    if(!visible){running=false;return;}
    const dt=Math.min(.05,(ts-last)/1000||.016);last=ts;t+=dt;
    const rawV=timeline(t);
    if(rawV>0.02&&formV<=0.02){fi=(fi+1)%forms.length;assign(forms[fi]);pulsed=false;}  /* new lock -> pick form */
    formV=rawV*(1-scatter);scatter=Math.max(0,scatter-dt*0.8);
    if(formV>0.9&&!pulsed){pulseV=1;pulsed=true;}
    ctx.fillStyle='rgba(6,6,6,0.16)';ctx.fillRect(0,0,W,H);

    /* integrate */
    for(const pt of parts){
      const ang=flow(pt.x,pt.y,t);let fx=Math.cos(ang),fy=Math.sin(ang);
      if(formV>0.01){const dx=pt.tg[0]-pt.x,dy=pt.tg[1]-pt.y,dl=Math.hypot(dx,dy)||1;fx=fx*(1-formV)+dx/dl*formV*2.6;fy=fy*(1-formV)+dy/dl*formV*2.6;}
      if(press){const dx=pt.x-px,dy=pt.y-py,d2=dx*dx+dy*dy,R=170;if(d2<R*R){const dd=Math.sqrt(d2)||1,f=(1-dd/R)*7;fx+=dx/dd*f;fy+=dy/dd*f;}}
      pt.vx=(pt.vx+fx*pt.sp*dt*3)*0.9;pt.vy=(pt.vy+fy*pt.sp*dt*3)*0.9;
      pt.x+=pt.vx;pt.y+=pt.vy;
      if(pt.x<-6)pt.x=W+6;else if(pt.x>W+6)pt.x=-6;
      if(pt.y<-6)pt.y=H+6;else if(pt.y>H+6)pt.y=-6;
    }
    /* neighbour links via grid */
    const cs=LINK,cols=Math.ceil(W/cs)+1,grid=new Map();
    const key=(a,b)=>a+','+b;
    for(let i=0;i<parts.length;i++){const p=parts[i],gx=p.x/cs|0,gy=p.y/cs|0,k=key(gx,gy);(grid.get(k)||grid.set(k,[]).get(k)).push(i);}
    ctx.lineWidth=1;
    const lineA=(0.30+formV*0.16);
    for(let i=0;i<parts.length;i++){
      const p=parts[i],gx=p.x/cs|0,gy=p.y/cs|0;
      for(let ax=-1;ax<=1;ax++)for(let ay=-1;ay<=1;ay++){
        const arr=grid.get(key(gx+ax,gy+ay));if(!arr)continue;
        for(const j of arr){if(j<=i)continue;const q=parts[j],dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy);
          if(d<LINK){ctx.strokeStyle='rgba(237,235,228,'+(lineA*(1-d/LINK)).toFixed(3)+')';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}}
      }
    }
    /* nodes */
    for(const p of parts){const sp=Math.min(1,(Math.abs(p.vx)+Math.abs(p.vy))*0.5);
      ctx.globalAlpha=0.7+sp*0.3+formV*0.3;ctx.fillStyle='#F4F2EC';
      const r=1+formV*0.7;ctx.beginPath();ctx.arc(p.x,p.y,r,0,7);ctx.fill();}
    ctx.globalAlpha=1;
    /* objective lock pulse */
    if(pulseV>0){pulseV-=dt*1.1;const cx=W/2,cy=H*0.5,R=Math.min(W,H)*0.30*(1.4-pulseV);
      ctx.strokeStyle='rgba(237,235,228,'+(pulseV*0.5).toFixed(3)+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.stroke();}
    requestAnimationFrame(frame);
  }
  function start(){if(!running){running=true;last=performance.now();ctx.fillStyle='#060606';ctx.fillRect(0,0,W,H);requestAnimationFrame(frame);}}

  if(reduce){size();ctx.fillStyle='#060606';ctx.fillRect(0,0,W,H);ctx.fillStyle='#EDEBE4';forms[0].forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],1.3,0,7);ctx.fill();});return;}
  new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible){size();start();}},{threshold:.04}).observe(band);
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

/* ---------- platform marquee: continuous rAF drift + fast-forward toggle ---------- */
(function(){
  const mq=document.getElementById('pmarquee'),track=document.getElementById('pmqTrack'),fwd=document.getElementById('pmqFwd');
  if(!mq||!track)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let groupW=0,x=0,cur=0,target=1,vis=false,running=false,last=0;
  const BASE=42;            /* seconds per loop at 1x */
  const FAST=3.4;           /* fast-forward multiplier */
  function measure(){
    const g=track.querySelector('.pmq-group');
    groupW=g?g.getBoundingClientRect().width:track.scrollWidth/2;
  }
  function frame(ts){
    if(!vis){running=false;return;}
    const dt=Math.min(.05,(ts-last)/1000||.016);last=ts;
    cur+=(target-cur)*Math.min(1,dt*4);        /* ease toward target speed */
    const base=groupW/BASE;                     /* px per second at 1x */
    x+=base*cur*dt;
    if(x>=groupW)x-=groupW;                      /* seamless wrap */
    track.style.transform='translateX('+(-x).toFixed(2)+'px)';
    requestAnimationFrame(frame);
  }
  function start(){if(!running){running=true;last=performance.now();requestAnimationFrame(frame);}}
  if(fwd){
    const go=()=>{target=FAST;fwd.classList.add('on');};   /* hold to fast-forward */
    const stop=()=>{target=1;fwd.classList.remove('on');};
    fwd.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();go();});
    fwd.addEventListener('pointerup',stop);
    fwd.addEventListener('pointerleave',stop);
    fwd.addEventListener('pointercancel',stop);
    /* keyboard: hold Enter/Space */
    fwd.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
    fwd.addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' ')stop();});
    fwd.addEventListener('blur',stop);
  }
  /* tap-and-hold the card area to pause; release to resume */
  const boxPause=()=>{target=0;};
  const boxResume=()=>{target=1;};
  mq.addEventListener('pointerdown',boxPause);
  mq.addEventListener('pointerup',boxResume);
  mq.addEventListener('pointerleave',boxResume);
  mq.addEventListener('pointercancel',boxResume);
  measure();addEventListener('resize',()=>{measure();});
  /* recompute once fonts/images settle */
  setTimeout(measure,400);addEventListener('load',measure);
  new IntersectionObserver(es=>{vis=es[0].isIntersecting;if(vis){measure();start();}},{threshold:.02}).observe(mq);
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
