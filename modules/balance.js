/* Shared, deterministic rules for browser gameplay and offline economy audits. */
(function(root){
  const ORDER=['C','U','R','SR','UR'];
  let config=null,catalog=null,index=null;
  function currentConfig(){const live=root.ShopModules?.get('balance')?.config;if(live)config=live;return config;}
  const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
  // Integer max-flow assigns each fixed rarity quota to compatible pack slots.
  function collate(spec,slots){
    const n=12,flow=Array.from({length:n},()=>Array(n).fill(0)),edge=(a,b,c)=>flow[a][b]=c;
    ORDER.forEach((r,i)=>{edge(0,i+1,spec.counts[r]);slots.forEach((s,j)=>{if(s[r]>0)edge(i+1,j+6,spec.packs);});});
    for(let j=0;j<5;j++)edge(j+6,11,spec.packs);
    let total=0;
    for(;;){const prev=Array(n).fill(-1),queue=[0];prev[0]=0;for(let k=0;k<queue.length&&prev[11]<0;k++)for(let b=1;b<n;b++)if(prev[b]<0&&flow[queue[k]][b]>0){prev[b]=queue[k];queue.push(b);}
      if(prev[11]<0)break;let amount=Infinity;for(let b=11;b;b=prev[b])amount=Math.min(amount,flow[prev[b]][b]);for(let b=11;b;b=prev[b]){flow[prev[b]][b]-=amount;flow[b][prev[b]]+=amount;}total+=amount;
    }
    return total===spec.packs*5?Array.from({length:5},(_,j)=>ORDER.flatMap((r,i)=>Array(flow[j+6][i+1]).fill(r))):null;
  }
  function validBox(spec){return spec&&typeof spec==='object'&&Number.isInteger(spec.packs)&&spec.packs>=1&&spec.packs<=100&&Number.isInteger(spec.shelfUnits)&&spec.shelfUnits>=1&&spec.shelfUnits<=36&&spec.counts&&Object.keys(spec.counts).length===5&&ORDER.every(r=>Number.isSafeInteger(spec.counts[r])&&spec.counts[r]>=0)&&sum(spec.counts)===spec.packs*5&&spec.counts.UR>=1;}
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
    if(c.boxCustomer!==undefined)check(c.boxCustomer&&Number.isFinite(c.boxCustomer.chance)&&c.boxCustomer.chance>=0&&c.boxCustomer.chance<=1&&Number.isSafeInteger(c.boxCustomer.budget)&&c.boxCustomer.budget>0,'boxCustomer 需要0—1的chance及正整数budget');
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
    if(c.boxes!==undefined){
      check(object(c.boxes),'boxes 必须为档位到整盒配额的对象');
      if(object(c.boxes))for(const [grade,spec] of Object.entries(c.boxes)){
        const valid=validBox(spec);check(valid,`${grade} 卡盒需要1—100包、五档非负整数合计5×包数、至少1UR以及1—36货架位`);
        const slots=c.recipes?.[grade]?.slots;check(Array.isArray(slots),`卡盒引用未知档位 ${grade}`);
        if(valid&&Array.isArray(slots)&&slots.length===5&&slots.every(s=>object(s)))check(!!collate(spec,slots),`${grade} 盒内定额无法满足五槽限制与每包小保底`);
      }
    }
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
  function recipe(pack){currentConfig();const grade=config.packGrades[pack.id]||'standard';return {grade,...config.recipes[grade]};}
  function probabilities(pack){const out=Object.fromEntries(ORDER.map(r=>[r,0]));for(const slot of recipe(pack).slots)for(const [r,p] of Object.entries(slot))out[r]+=p;return out;}
  function quote(pack,prices){const expected=probabilities(pack),ev=ORDER.reduce((s,r)=>s+expected[r]*prices[r],0),unit=config.pricing.roundTo;
    const wholesale=Math.ceil(ev/config.pricing.openingReturn/unit)*unit,retail=Math.ceil(wholesale/(1-config.pricing.sealedMargin)/unit)*unit;
    return {grade:recipe(pack).grade,name:recipe(pack).name,expected,ev,wholesale,retail,margin:(retail-wholesale)/retail,legendChance:1-recipe(pack).slots.reduce((p,s)=>p*(1-(s.UR||0)),1)};
  }
  function pool(pack,rarity){const local=index.local.get(pack.id)?.[rarity];if(local?.length)return{cards:local,source:'本包'};const related=index.lineage.get(pack.lineage)?.[rarity];if(related?.length)return{cards:related,source:'同谱系补位'};return{cards:index.global[rarity],source:'全卡池补位'};}
  function roll(slot,random){let x=random(),last;for(const [r,p] of Object.entries(slot)){if(p<=0)continue;last=r;x-=p;if(x<0)return r;}return last;}
  function draw(pack,random=Math.random){if(!index||!config)throw new Error('卡包规则尚未载入');return recipe(pack).slots.map(slot=>{const rarity=roll(slot,random),p=pool(pack,rarity),card=p.cards[Math.min(p.cards.length-1,Math.floor(random()*p.cards.length))];return{card,rarity,source:p.source};});}
  function boxSpec(pack){const r=recipe(pack),s=config.boxes?.[r.grade];return s?JSON.parse(JSON.stringify({...s,name:r.name.replace(/包$/,'')+'卡盒',grade:r.grade,slots:r.slots})):null;}
  function quoteBox(pack,prices,spec=boxSpec(pack)){
    if(!spec)return null;currentConfig();const ev=ORDER.reduce((n,r)=>n+spec.counts[r]*prices[r],0),unit=config.pricing.roundTo,wholesale=Math.ceil(ev/config.pricing.openingReturn/unit)*unit,retail=Math.ceil(wholesale/(1-config.pricing.sealedMargin)/unit)*unit;
    return {...spec,ev,wholesale,retail,margin:(retail-wholesale)/retail};
  }
  function shuffle(a,random){for(let i=a.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function manufacture(pack,spec=boxSpec(pack),random=Math.random){
    if(!validBox(spec))throw new Error('整盒配置不合法');const columns=collate(spec,spec.slots);if(!columns)throw new Error('整盒配额无法排包');columns.forEach(c=>shuffle(c,random));
    return Array.from({length:spec.packs},(_,i)=>columns.map(column=>{const rarity=column[i],p=pool(pack,rarity),card=p.cards[Math.min(p.cards.length-1,Math.floor(random()*p.cards.length))];return {cardId:card.id,rarity,source:p.source};}));
  }
  function describeBox(pack,prices,spec=boxSpec(pack)){const q=quoteBox(pack,prices,spec);return q?`${q.name} · ${q.packs} 包 / 盒 · ${q.packs*5} 张\n整盒固定：${ORDER.map(r=>`${r} ${q.counts[r]}`).join(' / ')}；每包至少1张R+。\n整盒进 ¥${q.wholesale} / 建议售 ¥${q.retail} · 参考卡值总额 ¥${q.ev}。稀有度数量固定，武将随机且可重复。大保底覆盖原盒全部卡包；拆卖后余包不重新保底。`:'当前自定义规则未配置卡盒；可在模块编辑器添加 boxes 或恢复项目默认。';}
  function describe(pack,prices){const q=quote(pack,prices),expected=q.expected,missing=ORDER.filter(r=>expected[r]>0&&pool(pack,r).source!=='本包');return `${q.name} · 5 张 / 包 · UR ${+(q.legendChance*100).toFixed(2)}% / 包 · 进 ¥${q.wholesale} / 建议售 ¥${q.retail} · 单卡参考总值期望 ¥${q.ev.toFixed(1)}\n平均张数：${ORDER.map(r=>`${r} ${expected[r].toFixed(2)}`).join(' / ')}。${missing.length?'本包缺档：'+missing.map(r=>`${r} → ${pool(pack,r).source}`).join('、')+'。':'五档均从本包抽取。'}允许重复。散包仅保底1张R+，独立购买不累计整盒大保底。`;}
  const api={ORDER,validate,configure,setCatalog,recipe,probabilities,quote,pool,draw,describe,boxSpec,quoteBox,manufacture,describeBox,get config(){return currentConfig();}};
  root.ShopBalance=api;if(typeof module!=='undefined')module.exports=api;
  if(root.ShopModules)root.ShopModules.register({id:'balance',title:'出货概率与进售价',version:1,file:'data/balance.json',defaults:()=>({rulesVersion:1}),validate,
    ready({catalog}){setCatalog(catalog);configure(root.ShopModules.get('balance').config);},
    queries:{'balance.rules'({config:c},old){configure(c);return c;}}
  });
})(typeof window!=='undefined'?window:globalThis);
