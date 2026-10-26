// UI tests unrelated to the prologue still enter through the real acknowledgement.
// No save flags, wallets, progression or browser-global storage are patched here.
export async function finishOpeningDialogue(page){
  const pending=await page.evaluate(async()=>{
    if(!window.__cardShopApp||window.__cardShopMode==='mock')return false;
    const offer=(await window.__cardShopApp.query('dialogue.offer')).data;
    return offer?.kind==='debt-intro'||offer?.choices?.some(c=>c.optionId==='begin');
  });
  if(!pending)return;
  const dialogue=page.getByRole('dialog',{name:'场景对话',exact:true});await dialogue.waitFor();
  await dialogue.getByText('海玲',{exact:true}).waitFor();
  for(let n=0;n<30;n++){
    const next=dialogue.getByRole('button',{name:'继续 ▸',exact:true});
    if(!await next.count())break;await next.click();
  }
  await dialogue.getByRole('button',{name:'记住约定，开始经营',exact:true}).click();
  await dialogue.waitFor({state:'hidden'});
}

export async function deferIncidentalChallenge(page){
  const offer=await page.evaluate(async()=>((await window.__cardShopApp.query('dialogue.offer')).data));
  if(offer?.kind!=='stage-challenge')return;
  const dialogue=page.getByRole('dialog',{name:'场景对话',exact:true});await dialogue.waitFor();
  for(let n=0;n<30;n++){const next=dialogue.getByRole('button',{name:'继续 ▸',exact:true});if(!await next.count())break;await next.click();}
  await dialogue.getByRole('button',{name:'明日再战',exact:true}).click();await dialogue.waitFor({state:'hidden'});return true;
}
