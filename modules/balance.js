/* Shared, deterministic rules for browser gameplay and offline economy audits. */
(function(root){
  const ORDER=['C','U','R','SR','UR'];
  let config=null,catalog=null,index=null;
  const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
  function validate(c,data){
    const errors=[],check=(ok,msg)=>{if(!ok)errors.push(msg);};
    const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    if(!object(c))return ['平衡配置必须为对象'];
    check(c?.version===1,'平衡配置 version 必须为 1');
    check(object(c.packGrades),'packGrades 必须为卡包ID到产品档位的对象');
    check(object(c.recipes),'recipes 必须为产品档位对象');
    check(c?.pricing?.openingReturn>0&&c.pricing.openingReturn<=1.2,'拆包参考回报须在 0—1.2 之间');
    check(c?.pricing?.sealedMargin>=.1&&c.pricing.sealedMargin<=.6,'整包毛利率须在 10%—60% 之间');
    check(Number.isFinite(c?.pricing?.roundTo)&&c.pricing.roundTo>=1,'价格取整单位至少为 1');
    for(const [id,p] of Object.entries(c?.recipes||{})){
      if(!object(p)){errors.push(`产品档位 ${id} 必须为对象`);continue;}
      check(/^[a-z]+$/.test(id),'产品档位 ID 不合法');
      check(typeof p.name==='string'&&p.name.length>0,'产品档位需要名称');
      check(Array.isArray(p.slots)&&p.slots.length===5,'每包必须配置五个槽位');
      const slots=Array.isArray(p.slots)?p.slots:[];
      for(const s of slots)check(object(s)&&Object.keys(s).length>0&&Object.entries(s).every(([r,v])=>ORDER.includes(r)&&Number.isFinite(v)&&v>=0)&&Math.abs(sum(s)-1)<1e-8,'每槽概率必须是 C/U/R/SR/UR 的非负概率且合计 1');
      check(slots.some(s=>object(s)&&Object.keys(s).length>0&&Object.keys(s).every(r=>ORDER.indexOf(r)>=2)),'每包至少有一个 R 以上槽位');
    }
    check(!!c?.recipes?.standard,'缺少 standard 产品档位');
    for(const [id,grade] of Object.entries(c?.packGrades||{})){
      check(typeof grade==='string'&&Object.hasOwn(c.recipes||{},grade),`未知产品档位：${grade}`);
      if(data)check(data.packs.some(p=>p.id===id),`未知卡包：${id}`);
    }
    return errors;
  }
  function configure(c,data=catalog){const errors=validate(c,data);if(errors.length)throw new Error(errors.join('\n'));config=JSON.parse(JSON.stringify(c));}
  function setCatalog(data){catalog=data;index={local:new Map(),lineage:new Map(),global:{}};const packs=new Map(data.packs.map(p=>[p.id,p]));
    for(const c of data.cards){const l=packs.get(c.pack).lineage;
      if(!index.local.has(c.pack))index.local.set(c.pack,{});if(!index.lineage.has(l))index.lineage.set(l,{});
      for(const pool of [index.local.get(c.pack),index.lineage.get(l),index.global])(pool[c.rarity]||=[]).push(c);
    }
    for(const r of ORDER)if(!index.global[r]?.length)throw new Error(`全卡池缺少 ${r}，无法兑现出货概率`);
  }
  function recipe(pack){const live=root.ShopModules?.get('balance')?.config;if(live)config=live;const grade=config.packGrades[pack.id]||'standard';return {grade,...config.recipes[grade]};}
  function probabilities(pack){const out=Object.fromEntries(ORDER.map(r=>[r,0]));for(const slot of recipe(pack).slots)for(const [r,p] of Object.entries(slot))out[r]+=p;return out;}
  function quote(pack,prices){const expected=probabilities(pack),ev=ORDER.reduce((s,r)=>s+expected[r]*prices[r],0),unit=config.pricing.roundTo;
    const wholesale=Math.ceil(ev/config.pricing.openingReturn/unit)*unit,retail=Math.ceil(wholesale/(1-config.pricing.sealedMargin)/unit)*unit;
    return {grade:recipe(pack).grade,name:recipe(pack).name,expected,ev,wholesale,retail,margin:(retail-wholesale)/retail,legendChance:1-recipe(pack).slots.reduce((p,s)=>p*(1-(s.UR||0)),1)};
  }
  function pool(pack,rarity){const local=index.local.get(pack.id)?.[rarity];if(local?.length)return{cards:local,source:'本包'};const related=index.lineage.get(pack.lineage)?.[rarity];if(related?.length)return{cards:related,source:'同谱系补位'};return{cards:index.global[rarity],source:'全卡池补位'};}
  function roll(slot,random){let x=random(),last;for(const [r,p] of Object.entries(slot)){if(p<=0)continue;last=r;x-=p;if(x<0)return r;}return last;}
  function draw(pack,random=Math.random){if(!index||!config)throw new Error('卡包规则尚未载入');return recipe(pack).slots.map(slot=>{const rarity=roll(slot,random),p=pool(pack,rarity),card=p.cards[Math.min(p.cards.length-1,Math.floor(random()*p.cards.length))];return{card,rarity,source:p.source};});}
  function describe(pack,prices){const q=quote(pack,prices),expected=q.expected,missing=ORDER.filter(r=>expected[r]>0&&pool(pack,r).source!=='本包');return `${q.name} · 5 张 / 包 · UR ${+(q.legendChance*100).toFixed(2)}% / 包 · 进 ¥${q.wholesale} / 建议售 ¥${q.retail} · 单卡参考总值期望 ¥${q.ev.toFixed(1)}\n平均张数：${ORDER.map(r=>`${r} ${expected[r].toFixed(2)}`).join(' / ')}。${missing.length?'本包缺档：'+missing.map(r=>`${r} → ${pool(pack,r).source}`).join('、')+'。':'五档均从本包抽取。'}允许重复。独立抽取，无整盒保底。`;}
  const api={ORDER,validate,configure,setCatalog,recipe,probabilities,quote,pool,draw,describe,get config(){return config;}};
  root.ShopBalance=api;if(typeof module!=='undefined')module.exports=api;
  if(root.ShopModules)root.ShopModules.register({id:'balance',title:'出货概率与进售价',version:1,file:'data/balance.json',defaults:()=>({rulesVersion:1}),validate,
    ready({catalog}){setCatalog(catalog);configure(root.ShopModules.get('balance').config);},
    queries:{'balance.rules'({config:c},old){configure(c);return c;}}
  });
})(typeof window!=='undefined'?window:globalThis);
