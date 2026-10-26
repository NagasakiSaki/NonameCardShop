import {el} from '../components/trade.mjs';
let stylesheet;
async function styles(){
  if(!stylesheet)stylesheet=fetch('/frontend-next/styles/trade.css').then(r=>{if(!r.ok)throw Error('交易界面样式加载失败');return r.text();}).then(text=>text.replace(':root',':host').replace(/^body\s*\{/m,':host {')).catch(e=>{stylesheet=null;throw e;});
  return stylesheet;
}
/** Shadow DOM isolates the trading design tokens/components from Phaser and existing management windows. */
export async function createSurface(ctx){
  ctx.handle.tradeDispose?.();
  const host=el('div',{'data-trade-workspace':'true'});ctx.body.append(host);const root=host.attachShadow({mode:'open'}),cleanups=new Set();let disposed=false;
  function dispose(){if(disposed)return;disposed=true;for(const fn of cleanups)fn();cleanups.clear();}
  ctx.handle.tradeDispose=dispose;ctx.onCleanup(dispose);
  const css=await styles();if(ctx.handle.closed||!host.isConnected){dispose();return {active:()=>false};}
  root.append(el('style',{text:css}),el('link',{rel:'stylesheet',href:'/frontend/styles/bright-panels.css'}),el('style',{text:`
    :host{display:block;min-width:0;padding:16px;background:var(--bg);font:14px "Microsoft YaHei",system-ui,sans-serif;color:var(--ink)}
    .workspace{grid-template-columns:minmax(0,1fr) 280px;gap:16px}.catalog{max-height:calc(100dvh - 230px)}
    .toolbar{margin-bottom:12px}.card-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.detail-panel,.basket{max-height:calc(100dvh - 260px)}
    .basket-total{gap:12px;flex-wrap:wrap}.basket-total strong{font-size:22px;white-space:nowrap}.basket-total>span{font-size:12px}
    .surface-message{border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin-bottom:12px;color:var(--muted);line-height:1.6}
    .surface-message:empty{display:none}.surface-message[data-kind="error"]{border-color:#a96e66;color:#efb9a9}
    .surface-message[data-kind="success"]{border-color:#7e9b73;color:var(--green)}.surface-footer{margin-top:12px;color:var(--muted);font-size:12px;line-height:1.6}
    .surface-empty{border:1px dashed var(--line);border-radius:8px;padding:28px;line-height:1.8;color:var(--muted)}
    .surface-card{background:var(--panel);border:1px solid var(--line);padding:16px;border-radius:8px;margin-bottom:12px}
    .surface-card h3{margin:0 0 12px;font-size:17px}.surface-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    .surface-field{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.surface-field input,.surface-field select{background:#152020;color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:10px;max-width:100%;min-height:40px}
    .surface-field input[type=number]{width:110px}.surface-pager{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-top:12px}
    .surface-list{display:grid;gap:12px;grid-column:1/-1;min-width:0}.surface-meta{font-size:12px;color:var(--muted);line-height:1.7}
    .surface-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}
    .surface-primary-actions{position:sticky;bottom:0;background:var(--panel);padding:10px 0 0}.surface-wide{grid-column:1/-1}
    @media(max-width:1200px){.card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.workspace{grid-template-columns:minmax(0,1fr) 250px}}
    @media(max-width:900px){.card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.catalog{max-height:none}.detail-panel,.basket{position:static;max-height:none}.workspace{display:block}.workspace>aside{margin-top:16px}}
    @media(max-width:640px){:host{padding:12px}.detail-panel{display:flex}.surface-field input,.surface-field select,.surface-actions button{min-height:44px}.workspace{display:block}.filters input{min-width:0}}
  `}));
  const toolbar=el('div'),message=el('div',{class:'surface-message',role:'status','aria-live':'polite'}),workspace=el('div',{class:'workspace'}),footer=el('div',{class:'surface-footer'});
  root.append(toolbar,message,workspace,footer);ctx.setFooter([]);
  return {root,toolbar,message,workspace,footer,active:()=>!disposed&&!ctx.handle.closed&&host.isConnected,onDispose:fn=>cleanups.add(fn),setMessage(text,kind='info'){if(!disposed){message.textContent=text;message.dataset.kind=kind;}}};
}
