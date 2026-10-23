// 连续方向向量；四向朝向只用于选动画，不限制实际行走方向。
const KEYS={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],KeyW:[0,-1],KeyS:[0,1],KeyA:[-1,0],KeyD:[1,0]};
export function createMovementView({host,sessionId,getRoom,isBlocked,onManualMove}){
  let inputSeq=0,lastVector='0,0';const pressed=new Set(),touches=new Map();
  function send(payload){if(isBlocked()&&!payload.stop)return;const room=getRoom();host.world.input({sessionId,inputSeq:++inputSeq,roomId:room.mapId,navVersion:room.navVersion||'',...payload});}
  function vector(){let x=0,y=0;for(const key of pressed){x+=KEYS[key][0];y+=KEYS[key][1];}for(const v of touches.values()){x+=v[0];y+=v[1];}x=Math.sign(x);y=Math.sign(y);const n=Math.hypot(x,y)||1;return {x:x/n,y:y/n};}
  function publish(force=false){const v=vector(),key=v.x+','+v.y;if(force||key!==lastVector){lastVector=key;send(v.x||v.y?{vector:v}:{stop:true});}}
  function onKeyDown(event){const target=event.composedPath?.()[0]||event.target;if(!KEYS[event.code]||/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName)||target?.isContentEditable)return;event.preventDefault();if(isBlocked())return;pressed.add(event.code);onManualMove?.();publish();}
  function onKeyUp(event){if(!KEYS[event.code])return;pressed.delete(event.code);publish();}
  function releaseAll(){pressed.clear();touches.clear();lastVector='0,0';send({stop:true});}
  function moveTo(x,y){pressed.clear();touches.clear();lastVector='0,0';send({destination:{x:Math.round(x),y:Math.round(y)}});}
  function bindTouchpad(container){
    container.replaceChildren();const choices=[[-1,-1,'↖'],[0,-1,'↑'],[1,-1,'↗'],[-1,0,'←'],null,[1,0,'→'],[-1,1,'↙'],[0,1,'↓'],[1,1,'↘']];
    for(const choice of choices){if(!choice){container.append(document.createElement('span'));continue;}const [x,y,label]=choice,b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label','移动 '+label);
      b.addEventListener('pointerdown',e=>{e.preventDefault();if(isBlocked())return;b.setPointerCapture(e.pointerId);touches.set(e.pointerId,[x,y]);onManualMove?.();publish();});
      const up=e=>{touches.delete(e.pointerId);publish();};b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);container.append(b);
    }container.hidden=!window.matchMedia?.('(pointer: coarse)').matches;
  }
  const onVisibility=()=>{if(document.hidden)releaseAll();};window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',onVisibility);
  return {moveTo,stop:releaseAll,releaseAll,bindTouchpad,suspend(){send({stop:true});},resume(){publish(true);return pressed.size>0||touches.size>0;},
    destroy(){releaseAll();window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',releaseAll);document.removeEventListener('visibilitychange',onVisibility);},
    bindPointer(scene,{onWorldClick}){scene.input.on('pointerdown',p=>{if(!isBlocked()){const w=p.positionToCamera(scene.cameras.main);onWorldClick(w.x,w.y);}});}
  };
}
