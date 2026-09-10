// Run with node --test tests/carousel.test.cjs. Browser layout still needs a browser smoke test.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  const callbacks=new Map(),observers=[];let now=0,id=0;
  function el(){return {style:{},classList:{add(){},remove(){}},events:{},addEventListener(n,f){(this.events[n]??=[]).push(f)},dispatch(n,e={}){for(const f of this.events[n]||[])f(e)},setPointerCapture(){},contains(){return false}};}
  const mq=el(),view=el(),track=el(),group=el(),fwd=el(),doc=el(),win=el();
  group.offsetWidth=2800;view.clientWidth=1000;
  mq.querySelector=()=>view;track.querySelector=()=>group;
  doc.getElementById=id=>({pmarquee:mq,pmqTrack:track,pmqFwd:fwd})[id];
  const context={document:doc,matchMedia:()=>({matches:false}),performance:{now:()=>now},
    requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},setTimeout:f=>f(),
    addEventListener:win.addEventListener.bind(win),
    ResizeObserver:class{constructor(f){observers.push(f)}observe(){}},
    IntersectionObserver:class{constructor(f){this.f=f}observe(){this.f([{isIntersecting:true}])}}};
  const source=fs.readFileSync(require('node:path').join(__dirname,'../js/script.js'),'utf8');
  vm.runInNewContext(source.slice(source.indexOf('/* ---------- platform: one bounded'),source.indexOf('/* ---------- card flip:')),context);
  function step(seconds){for(let i=0;i<seconds*60;i++){now+=1000/60;const queue=[...callbacks.values()];callbacks.clear();queue.forEach(f=>f(now));}}
  const x=()=>-Number(track.style.transform.match(/translate3d\(([-\d.]+)/)[1]);
  const wheel=d=>view.dispatch('wheel',{deltaX:d,deltaY:0,deltaMode:0,preventDefault(){}});
  return {step,x,wheel,view,win,doc,group,resize:()=>observers.forEach(f=>f())};
}
test('slow time-based motion, clamps both ends and never automatically rewinds',()=>{
  const s=setup();s.step(1);const start=s.x();s.step(2);assert(Math.abs(s.x()-start-36)<.1);
  s.wheel(100000);assert.equal(s.x(),1800);s.step(10);assert.equal(s.x(),1800);
  s.wheel(-100000);assert(Math.abs(s.x())<.001);
});
test('resize and drag cannot expose out-of-range track space',()=>{
  const s=setup();s.wheel(100000);s.view.clientWidth=1500;s.resize();assert.equal(s.x(),1300);
  s.view.dispatch('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100,target:{closest:()=>null}});
  s.view.dispatch('pointermove',{pointerId:1,clientX:-9999,clientY:100,preventDefault(){}});assert.equal(s.x(),1300);
  s.view.dispatch('pointermove',{pointerId:1,clientX:9999,clientY:100,preventDefault(){}});assert(Math.abs(s.x())<.001);
  s.win.dispatch('pointerup',{pointerId:1});
});
test('hidden document pauses without catching up when restored',()=>{
  const s=setup();s.step(2);const x=s.x();s.doc.hidden=true;s.step(10);assert.equal(s.x(),x);
  s.doc.hidden=false;s.doc.dispatch('visibilitychange');s.step(1);assert(s.x()-x<19);
});
