// Run with node --test tests/carousel.test.cjs. Browser layout still needs a browser smoke test.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function setup(){
  const callbacks=new Map(),observers=[];
  let now=0,id=0;

  function el(){
    return {
      style:{},
      classList:{add(){},remove(){}},
      events:{},
      addEventListener(n,f){(this.events[n]??=[]).push(f);},
      dispatch(n,e={}){for(const f of this.events[n]||[])f(e);},
      setPointerCapture(){},
      contains(){return false;}
    };
  }

  const mq=el(),view=el(),track=el(),group=el(),fwd=el(),doc=el(),win=el();
  view.clientWidth=1000;
  view.getBoundingClientRect=()=>({left:0,right:view.clientWidth,width:view.clientWidth});

  function currentX(){
    const match=String(track.style.transform||'').match(/translate3d\(([-\d.]+)/);
    return match?-Number(match[1]):0;
  }

  const cards=Array.from({length:6},(_,i)=>{
    const card=el(),left=50+i*426;
    card.getBoundingClientRect=()=>{
      const x=currentX();
      return {left:left-x,right:left+400-x,width:400};
    };
    return card;
  });

  group.querySelectorAll=selector=>selector==='.pcard-flip'?cards:[];
  mq.querySelector=()=>view;
  track.querySelector=()=>group;
  track.scrollWidth=2800;
  doc.getElementById=id=>({pmarquee:mq,pmqTrack:track,pmqFwd:fwd})[id];

  const context={
    document:doc,
    matchMedia:()=>({matches:false}),
    performance:{now:()=>now},
    requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},
    setTimeout:f=>f(),
    addEventListener:win.addEventListener.bind(win),
    ResizeObserver:class{constructor(f){observers.push(f);}observe(){}},
    IntersectionObserver:class{constructor(f){this.f=f;}observe(){this.f([{isIntersecting:true}]);}}
  };

  const source=fs.readFileSync(require('node:path').join(__dirname,'../js/script.js'),'utf8');
  vm.runInNewContext(
    source.slice(source.indexOf('/* ---------- platform: one bounded'),source.indexOf('/* ---------- card flip:')),
    context
  );

  function step(seconds){
    for(let i=0;i<seconds*60;i++){
      now+=1000/60;
      const queue=[...callbacks.values()];
      callbacks.clear();
      queue.forEach(f=>f(now));
    }
  }
  const x=currentX;
  const wheel=deltaX=>view.dispatch('wheel',{deltaX,deltaY:0,deltaMode:0,preventDefault(){}});

  return {
    step,x,wheel,view,win,doc,group,
    resize:()=>observers.forEach(f=>f())
  };
}

test('uses time-based motion and reverses at both ends',()=>{
  const s=setup();
  s.step(1);
  const start=s.x();
  s.step(2);
  assert(Math.abs(s.x()-start-120)<.2);

  s.wheel(100000);
  assert.equal(s.x(),1580);
  s.step(1);
  assert.equal(s.x(),1580);
  s.step(2);
  assert(s.x()<1580);

  s.wheel(-100000);
  assert(Math.abs(s.x())<.001);
  s.step(2);
  assert(s.x()>0);
});

test('last-card measurement and drag never expose out-of-range track space',()=>{
  const s=setup();
  s.wheel(100000);
  assert.equal(s.x(),1580);

  s.resize();
  assert.equal(s.x(),1580);

  s.view.clientWidth=1500;
  s.resize();
  assert.equal(s.x(),1080);

  s.view.dispatch('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100,target:{closest:()=>null}});
  s.view.dispatch('pointermove',{pointerId:1,clientX:-9999,clientY:100,preventDefault(){}});
  assert.equal(s.x(),1080);
  s.view.dispatch('pointermove',{pointerId:1,clientX:9999,clientY:100,preventDefault(){}});
  assert(Math.abs(s.x())<.001);
  s.win.dispatch('pointerup',{pointerId:1});
});

test('finger swipes drag the cards left and right',()=>{
  const s=setup();
  const target={closest:()=>null};
  const start={identifier:7,clientX:320,clientY:100};
  const left={identifier:7,clientX:100,clientY:105};
  let prevented=false;

  s.view.dispatch('touchstart',{touches:[start],changedTouches:[start],target});
  s.view.dispatch('touchmove',{
    changedTouches:[left],cancelable:true,
    preventDefault(){prevented=true;}
  });
  assert.equal(s.x(),220);
  assert.equal(prevented,true);
  s.view.dispatch('touchend',{changedTouches:[left]});

  const restart={identifier:8,clientX:100,clientY:100};
  const right={identifier:8,clientX:420,clientY:104};
  s.view.dispatch('touchstart',{touches:[restart],changedTouches:[restart],target});
  s.view.dispatch('touchmove',{changedTouches:[right],cancelable:true,preventDefault(){}});
  assert(Math.abs(s.x())<.001);
  s.view.dispatch('touchend',{changedTouches:[right]});
});

test('hidden document pauses without catching up when restored',()=>{
  const s=setup();
  s.step(2);
  const x=s.x();
  s.doc.hidden=true;
  s.step(10);
  assert.equal(s.x(),x);
  s.doc.hidden=false;
  s.doc.dispatch('visibilitychange');
  s.step(1);
  assert(s.x()-x<61);
});
