import {MODE_LABELS,RATED_FORMATS} from '../../modules/backend/strength-modes.mjs';
import {el,art,rarity} from '../components/trade.mjs';
import {createSurface} from '../services/surface.mjs';
import {draftFor} from '../services/views.mjs';
import {performOperation,recoverOperation,retryOperation} from '../services/operations.mjs';

const button=(text,onclick,props={})=>el('button',{class:'button',type:'button',text,onclick,...props});
const line=(name,value)=>el('div',{class:'surface-row'},[el('span',{class:'muted',text:name}),el('strong',{text:String(value??'—')})]);
const REVIEW={calibrated:'规则校准估算',estimated:'初估，待更多样本','needs-review':'待复核'};
const LOCATION={collection:'收藏',market:'二级市场挂单',trash:'垃圾桶'};
const unresolved=draft=>['submitting','unknown'].includes(draft.operation?.status);

export function openCardDetail(app,options={}){
  const cardKey=options.cardKey,draft=draftFor(app,'card-detail:'+cardKey,{operation:null,selectedCopy:null});
  return app.windows.open({id:'card-detail:'+cardKey,title:'卡牌详情',width:'window--trade',pauseReason:'查看卡牌详情',
    subtitle:'原画与技能 · 实物印刷与全局强度分开显示',
    render:async ctx=>{
      const surface=await createSurface(ctx);if(!surface.active())return;
      let card=null,detailVersion=0,sourceVersion=0,loading=false,sourceState='idle',sourceText='',sourceError=null,sourceVisible=false,busy=false;
      const pending=()=>busy||unresolved(draft),usable=()=>surface.active()&&!pending()&&ctx.canSubmit();
      const report=error=>{if(surface.active())surface.setMessage((error?.code?error.code+' · ':'')+(error?.message||String(error)),'error');};
      surface.onDispose(()=>{++detailVersion;++sourceVersion;});
      surface.root.append(el('style',{text:`
        .detail-layout{display:grid;grid-template-columns:minmax(300px,340px) minmax(0,1fr);gap:24px;grid-column:1/-1;align-items:start}
        .detail-image-column{min-width:0;display:grid;gap:14px;justify-items:center;position:sticky;top:0}
        .hero-art{width:320px;height:426px;max-width:100%;background:#10191a;border:1px solid #79806a;border-radius:6px;box-shadow:0 12px 24px #0004}
        .hero-art img{width:100%;height:100%;object-fit:contain}.detail-copy-column{min-width:0;display:grid;gap:16px}.detail-copy-column h2{font-size:26px}
        .detail-badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.detail-badges .rarity{font-size:13px;padding:4px 8px}
        .detail-skill{border-top:1px solid var(--line);padding-top:14px;margin-top:14px}.detail-skill h4{margin:0 0 8px;color:var(--gold);font-size:17px}
        .detail-skill p{font-size:15px;line-height:1.9;overflow-wrap:anywhere;white-space:pre-wrap}.detail-sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;grid-column:1/-1;margin-top:20px}
        .detail-sections .surface-card{margin:0}.detail-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.detail-table th,.detail-table td{padding:10px 6px;border-bottom:1px solid var(--line);text-align:right}.detail-table th:first-child,.detail-table td:first-child{text-align:left}
        .detail-source{background:#0d1618;border:1px solid var(--line);border-radius:6px;padding:16px;line-height:1.7;font:13px/1.7 Consolas,monospace;white-space:pre;overflow-x:auto;max-width:100%;tab-size:2}
        .detail-source-status{color:var(--muted);line-height:1.8}.detail-copies{grid-column:1/-1;margin-top:20px;min-width:0}.copy-card{border-top:1px solid var(--line);padding:14px 0}.copy-card p{overflow-wrap:anywhere}.copy-card .surface-actions{margin-top:8px}
        .detail-foot{display:flex;gap:8px;flex-wrap:wrap}.detail-foot p{flex-basis:100%;line-height:1.7}.detail-meta{font-size:13px;line-height:1.8;color:var(--muted);overflow-wrap:anywhere}.detail-source-panel{margin-top:14px}
        @media(max-width:720px){.detail-layout{display:block}.detail-image-column{position:static;margin-bottom:20px}.hero-art{width:min(320px,100%);height:auto;aspect-ratio:3/4}.detail-sections{grid-template-columns:1fr}.detail-copy-column h2{font-size:23px}.detail-skill p{font-size:15px}.detail-table th,.detail-table td{padding:8px 4px}.surface-actions button{min-height:44px}}
      `}));

      function footer(){
        const nodes=[];
        if(unresolved(draft)){
          nodes.push(el('p',{class:'muted',text:draft.operation.status==='submitting'?'正在提交实物操作，请稍候。':'操作结果尚未确定。先查询原操作，或使用原操作号重试；不要重复发起保护操作。'}));
          if(draft.operation.status==='unknown')nodes.push(button('查询原操作结果',()=>resolveOperation(false),{disabled:busy}),button('用原操作号重试',()=>resolveOperation(true),{disabled:busy}));
        }
        nodes.push(button('刷新详情',()=>loadDetail(),{disabled:loading||busy}),button('前往二级市场柜台',()=>travel()),button('关闭',()=>ctx.handle.close(),{class:'button button--ghost'}));
        surface.footer.replaceChildren(el('div',{class:'detail-foot'},nodes));
      }

      function travel(copy){
        if(copy&&(!card?.copies?.some(current=>current.inventoryRef===copy.inventoryRef&&current.available)||pending()))return;
        ctx.handle.close();app.goToInteraction('store.secondaryMarket','market',{tab:'sell',...(copy?{inventoryRef:copy.inventoryRef}:{})});
      }

      function render(){
        if(!surface.active())return;
        surface.workspace.replaceChildren();footer();
        if(!card){surface.workspace.append(el('div',{class:'surface-empty surface-wide',text:loading?'正在读取原画、技能与持有情况…':'详情暂不可用，请重试。'}));return;}
        const holdings=card.holdings||{},review=REVIEW[card.reviewStatus]||card.reviewStatus||'待复核';
        const confidence=Number.isFinite(card.power?.confidence)?Math.round(card.power.confidence*100)+'%':'未提供';
        const title=el('div',{class:'detail-copy-column'},[
          el('span',{class:'eyebrow',text:'CARD ARCHIVE'}),el('h2',{text:card.name}),
          el('div',{class:'detail-badges'},[el('span',{text:'印刷：'+(card.printedRarity||'未持有')}),rarity(card.currentRarity),el('span',{class:'muted',text:'当前全局强度分级'})]),
          el('p',{class:'detail-meta',text:[card.title,card.faction,card.pack,'技能版本 '+(card.skillVersion||'—')].filter(Boolean).join(' · ')}),
          el('section',{class:'surface-card','aria-label':'评分与参考价格'},[el('h3',{text:'全局评分与参考行情'}),line('全局综合分',card.globalScore),...(card.power?.modeScores?RATED_FORMATS.map(mode=>line(MODE_LABELS[mode]+' 评分',card.power.modeAvailability?.[mode]===false?'不可出场（计0分）':card.power.modeScores[mode])):[]),...(card.power?.roles?[line('斗地主身份分','地主 '+card.power.roles.landlord.score+' / 农民 '+card.power.roles.farmer.score),line('定价标准','三模式等权平均')]:[]),line('评分状态',review),line('评分置信度（模型估计）',confidence),line('当前参考价',app.formatMoney(card.referencePrice?.amount)),
            card.power?.modelVersion?el('p',{class:'detail-meta',text:'收益论估算：'+(card.power.unit||'每己方回合等效牌收益')+' '+card.power.netCardEquivalent+'；'+card.power.notes}):null,
            el('p',{class:'detail-meta',text:'评分版本 '+(card.ratingVersion||'—')+'。强度评分与模型置信度不等于实战胜率；印刷稀有度保留在各实物副本上。'})]),
          skillsSection()
        ]);
        if(card.power?.scenario){
          const table=el('table',{class:'detail-table'},[el('thead',{},[el('tr',{},['场景','分数','两轮牌差','两轮血差','强中加分','拆装备加分'].map(text=>el('th',{text})))])]);
          table.append(el('tbody',{},[['kof','KOF'],['landlord','地主'],['farmer','农民'],['versus2v2-bo3','2v2']].map(([key,name])=>{const r=card.power.roles[key];return el('tr',{},[name,r.score,r.cardDifference,r.hpDifference,r.contributions.reliable,r.contributions.equipment].map(text=>el('td',{text:String(text)})));})));
          title.append(el('details',{class:'surface-card'},[el('summary',{text:'查看两回合收益明细'}),el('p',{class:'detail-meta',text:'每轮己方一次1点伤害、回合外受一次1点伤害；1血=2牌。牌差、血差均为相对同场景四血白板的技能增量；初始体力差计入血差。'}),el('div',{style:{overflowX:'auto'}},[table]),el('p',{class:'detail-meta',text:'强中与拆装备列为额外分，已含在总分内；不再重复算基础伤害或弃牌。'}),el('h4',{text:'KOF 逐技能计算与待复核项'}),el('ul',{class:'detail-meta'},(card.power.roles.kof.components||[]).map(c=>el('li',{text:(card.skills.find(s=>s.id===c.id)?.name||c.id)+'：'+(c.notes||[]).join('；')+((c.flags||[]).length?'【待复核：'+c.flags.join('；')+'】':'')})))]));
        }
        surface.workspace.append(el('div',{class:'detail-layout'},[
          el('div',{class:'detail-image-column','data-card-key':card.cardKey},[art(card.imageUrl,card.name,'hero-art'),el('p',{class:'detail-meta',text:'原始卡图 · 等比完整显示'}),
            el('div',{class:'detail-badges'},[el('span',{class:'chip',text:'持有 ×'+(holdings.owned??0)}),el('span',{class:'chip',text:'可用 '+(holdings.available??0)})])]),title
        ]));
        const eligibility=el('section',{class:'surface-card'},[el('h3',{text:'流通与准入'}),el('p',{class:'detail-meta',text:card.circulation?'该卡种已进入市场流通。':'该卡种尚未登记流通；私下开包不自动成为市场牌。'})]);
        for(const [field,label]of [['marketEligibility','单卡市场'],['combatEligibility','对战']]){
          const value=card[field];if(!value)continue;
          eligibility.append(el('p',{class:'detail-meta',text:label+'：'+(value.eligible?'符合当前准入条件。':(value.reasons||[]).map(reason=>reason.message||reason.code).join('；')||'当前不可用。')}));
        }
        surface.workspace.append(el('div',{class:'detail-sections'},[
          el('section',{class:'surface-card','aria-label':'真实持有数量'},[el('h3',{text:'实物持有'}),line('总持有',holdings.owned??0),line('可交易',holdings.available??0),line('受保护',holdings.protected??0),line('交易 / 比赛锁定',holdings.locked??0),line('已在售',holdings.listed??0)]),
          statsSection(),eligibility
        ]));
        const copies=el('section',{class:'surface-card detail-copies','aria-label':'实物副本操作'},[el('h3',{text:'实物副本'}),el('p',{class:'detail-meta',text:'保护按单张实物设置；挂单或比赛锁定的副本不能更改保护。'})]);
        if(!card.copies?.length)copies.append(el('p',{class:'muted',text:'尚未持有这张卡，可到二级市场查看挂单。'}));
        for(const copy of card.copies||[]){
          copies.append(el('article',{class:'copy-card','data-copy-ref':copy.inventoryRef},[
            el('p',{class:'detail-meta',text:[copy.printedRarity,copy.printVersion,LOCATION[copy.location]||copy.location,copy.protected?'受保护':'未保护',copy.locked?'已占用':null].filter(Boolean).join(' · ')}),
            el('p',{class:'detail-meta',text:copy.inventoryRef}),el('div',{class:'surface-actions'},[
              button(copy.protected?'取消保护':'保护这张',()=>protect(copy),{disabled:copy.locked||!usable()}),
              button('在二级市场出售这张',()=>travel(copy),{disabled:!copy.available||pending()})
            ])
          ]));
        }
        surface.workspace.append(copies);
      }

      function statsSection(){
        const stats=card.stats||{};
        return el('section',{class:'surface-card','aria-label':'实际对战战绩'},[el('h3',{text:'实战场次与胜负'}),el('table',{class:'detail-table'},[
          el('thead',{},[el('tr',{},['模式','场次','胜','负','平'].map(text=>el('th',{scope:'col',text})))]),
          el('tbody',{},RATED_FORMATS.map(mode=>{const value=stats[mode]||{};return el('tr',{'data-mode':mode},[
            el('th',{scope:'row',text:MODE_LABELS[mode]}),...[value.sessions??value.games??0,value.wins??0,value.losses??0,value.draws??0].map(text=>el('td',{text}))
          ]);}))
        ]),el('p',{class:'detail-meta',text:stats.note||'仅记录真实牌局结果。'}),el('p',{class:'detail-meta',text:stats.sampleSufficient?'已有可用实战样本；不同模式分别记录。':'实战样本不足，暂不把当前胜率当作稳定强度。'})]);
      }

      function skillsSection(){
        const section=el('section',{class:'surface-card','aria-label':'完整技能'},[el('h3',{text:'武将技能'})]);
        if(!card.skills?.length)section.append(el('p',{class:'muted',text:'当前版本未提供技能说明。'}));
        for(const skill of card.skills||[])section.append(el('section',{class:'detail-skill'},[el('h4',{text:skill.name||skill.id}),el('p',{text:skill.description||'暂无技能说明。'}),
          skill.descriptionVariants?.length?el('details',{},[el('summary',{text:'补充与其他状态说明'}),...skill.descriptionVariants.map(v=>el('section',{},[el('h4',{text:v.name}),el('p',{text:v.description})]))]):null]));
        section.append(button(sourceVisible?'收起技能源码':'查看技能源码',()=>{
          if(sourceVisible){sourceVisible=false;render();return;}
          sourceVisible=true;if(sourceState==='idle')loadSource();else render();
        },{class:'button button--ghost','aria-expanded':String(sourceVisible),disabled:sourceState==='loading'}));
        if(sourceVisible){
          const source=el('div',{class:'detail-source-panel','aria-label':'技能源码'});
          if(sourceState==='loading')source.append(el('p',{class:'detail-source-status',text:'正在读取技能源码…'}));
          else if(sourceState==='failed')source.append(el('p',{class:'detail-source-status',text:'源码读取失败：'+sourceError}),button('重试加载技能源码',()=>loadSource()));
          else if(sourceState==='loaded')source.append(el('pre',{class:'detail-source',tabindex:0,text:sourceText}));
          section.append(source);
        }
        return section;
      }

      async function loadSource(){
        if(sourceState==='loading'||!surface.active())return;
        const version=++sourceVersion;sourceState='loading';sourceError=null;render();
        try{
          const response=await ctx.query('catalog.detail',{cardKey,includeCode:true});
          if(!surface.active()||version!==sourceVersion)return;
          if(!response.ok)throw response.error;
          if(response.data.skillSourceAvailable===false)throw Error('未能读取当前技能源文件，请稍后重试。');
          const sources=(response.data.skills||[]).filter(skill=>typeof skill.code==='string'&&skill.code.trim());
          sourceText=sources.length?sources.map(skill=>'// '+(skill.name||skill.id)+'\n'+skill.code).join('\n\n'):'当前技能未提供源码。';sourceState='loaded';
        }catch(error){if(version===sourceVersion){sourceState='failed';sourceError=error.message||String(error);}}
        if(surface.active()&&version===sourceVersion)render();
      }

      async function loadDetail({clear=false}={}){
        const version=++detailVersion;loading=true;if(clear)card=null;render();
        try{
          const response=await ctx.query('catalog.detail',{cardKey});
          if(!surface.active()||version!==detailVersion)return;
          if(!response.ok)throw response.error;card=response.data;
          if(!card.copies?.some(copy=>copy.inventoryRef===draft.selectedCopy))draft.selectedCopy=null;
        }catch(error){if(version===detailVersion){card=null;report(error);}}
        finally{if(surface.active()&&version===detailVersion){loading=false;render();}}
      }

      async function finish(result){
        if(!surface.active())return;busy=false;
        if(result?.ok){surface.setMessage('实物保护状态已更新。','success');await loadDetail();}
        else if(result?.error){report(result.error);if(['ITEM_LOCKED','OUT_OF_STOCK','STALE_OPERATION'].includes(result.error.code))await loadDetail({clear:true});}
        render();
      }

      async function protect(copy){
        if(!usable()||!card?.copies?.some(current=>current.inventoryRef===copy.inventoryRef&&!current.locked))return;
        draft.selectedCopy=copy.inventoryRef;busy=true;render();
        try{await finish(await performOperation(app,ctx,draft,{type:'inventory.setProtection',payload:{inventoryRef:copy.inventoryRef,protected:!copy.protected}}));}
        catch(error){busy=false;report(error);if(surface.active())render();}
      }

      async function resolveOperation(retry){
        if(busy||draft.operation?.status!=='unknown')return;busy=true;render();
        try{await finish(await (retry?retryOperation(app,ctx,draft):recoverOperation(app,ctx,draft)));}
        catch(error){busy=false;report(error);if(surface.active())render();}
      }

      const off=app.host.subscribe(event=>{
        if(event.type!=='worldReset'||!surface.active())return;
        ++sourceVersion;sourceState='idle';sourceVisible=false;sourceText='';sourceError=null;draft.selectedCopy=null;
        surface.setMessage('存档已切换，旧实物引用和源码缓存已清除。');loadDetail({clear:true});
      });surface.onDispose(off);await loadDetail({clear:true});
    }
  });
}
