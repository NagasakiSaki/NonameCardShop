const $=id=>document.getElementById(id);
try{
 const response=await fetch('/data/character-portraits.json');if(!response.ok)throw Error('立绘登记加载失败');
 const registry=await response.json(),entries=Object.entries(registry.characters);let selected=entries[0][0];
 for(const [id,c]of entries){
  const option=document.createElement('option');option.value=id;option.textContent=c.name;$('character').append(option);
  const button=document.createElement('button');button.className='tile';button.dataset.id=id;
  const image=document.createElement('img');image.src=c.avatar.url;image.alt=c.name;image.loading='lazy';
  const name=document.createElement('strong');name.textContent=c.name;const band=document.createElement('small');band.textContent=c.band;
  button.append(image,name,band);button.addEventListener('click',()=>{selected=id;$('character').value=id;render();});$('grid').append(button);
 }
 function render(){const c=registry.characters[selected],z=Number($('zoom').value);
  $('name').textContent=c.name;$('source').textContent='源文件：'+c.sourceFile;$('hash').textContent='SHA-256：'+c.sourceSha256;
  $('parameters').textContent=`${c.method} · ${c.palette} 色 · 源尺寸 ${c.sourceSize.join('×')} · 头框 ${c.headRectSource.join(', ')}`;
  for(const [key,asset,w,h]of [['portrait',c.portrait,128,224],['avatar',c.avatar,96,96]]){const im=$(key);im.src=asset.url;im.alt=c.name+(key==='portrait'?'立绘':'头像');im.width=w*z;im.height=h*z;}
  $('old-figure').hidden=!$('old').checked;$('old-portrait').src=`/experiments/character-art/generated/${selected}-standing-128x224.png`;$('old-portrait').width=128*z;$('old-portrait').height=224*z;
  document.querySelectorAll('.image').forEach(node=>node.classList.toggle('light',$('background').checked));
  document.querySelectorAll('.tile').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.id===selected)));
 }
 $('character').addEventListener('change',()=>{selected=$('character').value;render();});for(const id of ['zoom','background','old'])$(id).addEventListener('change',render);
 render();window.portraitPreviewReady=true;
}catch(error){$('error').textContent=error.message;}
