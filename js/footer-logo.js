/* Perspective interaction for the supplied halftone artwork. */
(function(){
  var emblem=document.querySelector('.footer-emblem');
  if(!emblem)return;
  var x=0,y=0,drag=null;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)');
  function draw(){
    x=Math.max(-30,Math.min(30,x));
    y=Math.max(-55,Math.min(55,y));
    emblem.style.setProperty('--logo-x',x+'deg');
    emblem.style.setProperty('--logo-y',y+'deg');
  }
  emblem.addEventListener('pointerdown',function(e){
    if(e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,rx:x,ry:y};
    emblem.setPointerCapture(e.pointerId);
    emblem.classList.add('is-dragging');
  });
  emblem.addEventListener('pointermove',function(e){
    if(drag&&drag.id===e.pointerId){
      y=drag.ry+(e.clientX-drag.x)*.65;
      x=drag.rx-(e.clientY-drag.y)*.4;
    }else if(e.pointerType==='mouse'&&!reduce.matches){
      var r=emblem.getBoundingClientRect();
      y=((e.clientX-r.left)/r.width-.5)*50;
      x=(.5-(e.clientY-r.top)/r.height)*30;
    }else{return;}
    draw();
  });
  function end(){drag=null;emblem.classList.remove('is-dragging');}
  emblem.addEventListener('pointerup',end);
  emblem.addEventListener('pointercancel',end);
  emblem.addEventListener('lostpointercapture',end);
  emblem.addEventListener('pointerleave',function(){if(!drag){x=0;y=0;draw();}});
  emblem.addEventListener('keydown',function(e){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape','Enter',' '].includes(e.key))return;
    e.preventDefault();
    if(e.key==='ArrowLeft')y-=10;
    else if(e.key==='ArrowRight')y+=10;
    else if(e.key==='ArrowUp')x+=10;
    else if(e.key==='ArrowDown')x-=10;
    else{x=0;y=0;}
    draw();
  });
})();
