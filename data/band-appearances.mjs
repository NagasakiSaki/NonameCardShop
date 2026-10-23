// Appearance only. Never use this registry to decide wallets, personalities or card preferences.
// Official visual references were inspected on 2026-10-24; the PNGs are redrawn/composed pixel studies.
export const BANDS=[
  {id:'mygo',name:'MyGO!!!!!'}, {id:'avemujica',name:'Ave Mujica'},
  {id:'yumemita',name:'梦限大みゅーたいぷ'}, {id:'millsage',name:'millsage'},
  {id:'ikka-dumb-rock',name:'一家Dumb Rock!'}
];
const p=(id,band,characterName,slug,hair,iris,base,front,back,clothes,cloth,walkStyle,accessory,features,extra={})=>({
  id:'bd-'+id,band,characterName,name:characterName,role:'顾客',
  reference:`https://bang-dream.com/artist/${band}/${slug}/`,
  base,front,back,clothes,eyes:'female01',mouth:'neutral02',hair,cloth,iris,
  secondary:['#fff7ee','#d4d6dc','#777e94'],walkHair:'hair-silver',walkStyle,accessory,features,...extra
});
export const BAND_APPEARANCES=[
  p('tomori','mygo','高松灯','takamatsu-tomori',['#a5a2a5','#6e6872','#393641'],['#e6a1ae','#a55e76','#543b53'],'female10','female06','short01','female11',['#f3f5ef','#b5c7c9','#5c768a'],'bob',null,'灰褐短鲍勃、细碎刘海、粉红眼、白灰青色外套'),
  p('anon','mygo','千早爱音','chihaya-anon',['#ffd1e1','#e393b6','#8e567e'],['#bde5ee','#7496b4','#3b526e'],'female02','female05','long02','female04',['#46444c','#2c2d38','#171f2b'],'long','clip','粉色长直发、侧分长刘海、蓝灰眼、黑色外套'),
  p('rana','mygo','要乐奈','kaname-rana',['#fcfcf3','#c8c9c8','#7b8291'],['#e4c879','#ad8e43','#6e583c'],'female10','female01','short01','female07',['#43464e','#292e38','#171d2a'],'bob',null,'白银短发、轻侧分、左金右蓝异色瞳、黑色无袖上衣',{otherEye:['#95d3e1','#5685aa','#334e74']}),
  p('soyo','mygo','长崎素世','nagasaki-soyo',['#d7b99f','#ad8876','#6a5252'],['#c0e1ef','#7b9ab9','#4a5475'],'female02','female05','long03','female06',['#f0f3ee','#a9c1c5','#566d81'],'wavy',null,'浅棕长发、侧分、柔和卷尾、浅蓝眼、白青外套'),
  p('taki','mygo','椎名立希','shiina-taki',['#70616d','#4c3f51','#2b263b'],['#caaddb','#9367b4','#563d78'],'female08','female06','long01','female11',['#f0f3ed','#a0cbd0','#507e91'],'long',null,'深棕黑长发、整齐刘海、紫眼、白色青肩外套'),
  p('uika','avemujica','三角初华','misumi-uika',['#fff0cc','#dbc69e','#99846f'],['#cfb6ed','#9b75bf','#5f4b83'],'female10','female06','medium01','female12',['#46424d','#282630','#191c28'],'medium','ribbon','浅金中短发、齐刘海、紫眼、黑金服饰与红袖口'),
  p('mutsumi','avemujica','若叶睦','wakaba-mutsumi',['#ddedd5','#afc9a4','#6f8878'],['#e4d795','#af9f5d','#6a654a'],'female08','female06','long01','female12',['#542f3f','#351e2e','#1d1b29'],'long','beret','浅绿长发、齐刘海、金眼、酒红贝雷帽与黑红裙'),
  p('umiri','avemujica','八幡海铃','yahata-umiri',['#747c76','#424c49','#272e32'],['#a7d7d2','#5d9997','#335c67'],'female02','female10','medium03','female04',['#513946','#302834','#1a1e2b'],'medium','red-ties','黑绿中长发、两侧束发、青绿眼、暗红披肩'),
  p('nyamu','avemujica','祐天寺若麦','yutenji-nyamu',['#c9bddc','#9589b2','#5e547b'],['#e7a8bd','#b75a83','#71385f'],'female10','female06','short01','female07',['#b34c5c','#7f2d43','#412039'],'bob','earrings','紫灰短鲍勃、红粉眼、红黑服饰与红耳坠'),
  p('sakiko','avemujica','丰川祥子','togawa-sakiko',['#c3e9f4','#80afc6','#47718f'],['#efcf95','#b59255','#75613f'],'female02','female05','pigtails01','female12',['#b24d56','#793044','#3e2539'],'twins','black-bows','浅蓝长双马尾、金眼、黑蝴蝶结、红黑礼服'),
  p('arale','yumemita','仲町亚罗蕾','nakamachi-arale',['#fff0bc','#e8b66f','#aa795c'],['#e8aad8','#b66bb6','#6c417f'],'female07','female01','pigtails01','female07',['#c6ecf7','#83c6e0','#4c7f9e'],'twins','cat-yellow','金色双马尾、粉色发尾、猫耳耳机、黄蓝白服饰',{streak:'#ef93b6',accent:'#f3d76e'}),
  p('nonoka','yumemita','宫永乃乃花','miyanaga-nonoka',['#f7f6ff','#cad4e8','#7f94b5'],['#b0d9eb','#749bad','#4d627f'],'female02','female05','long02','female12',['#f0a3b9','#cf708d','#8f496e'],'long','bunny','银蓝长发、辫侧发、兔耳发饰、粉白格纹衣饰',{accent:'#f49fbc'}),
  p('ritsu','yumemita','峰月律','minetsuki-ritsu',['#d6f5ff','#96c6e4','#547da8'],['#d1c8ec','#9b88bd','#5a4a7f'],'female10','female06','short01','female11',['#f0f6ff','#9ed0ee','#527fac'],'bob','bear-blue','冰蓝短发、蓝色圆耳耳机、蓝白机能风衣饰'),
  p('miyako','yumemita','藤都子','fuji-miyako',['#9b8cc4','#5a497f','#332c54'],['#c5b7ef','#8b79bf','#4d426f'],'female10','female06','short01','female12',['#806d9d','#554267','#302a49'],'bob','veil','深紫短发、白色头带与薄纱、淡紫眼、黑紫裙'),
  p('yuno','yumemita','千石优乃','sengoku-yuno',['#575464','#2e2b3e','#1b1c2b'],['#eba0bb','#b95383','#6c315e'],'female02','female01','long01','female11',['#ec709e','#b64476','#70304f'],'long','cat-pink','黑色长发、粉红挑染、粉色猫耳耳机、玫红外套',{streak:'#ef91b8'}),
  p('nagi','millsage','琴平凪','kotohira-nagi',['#bdb49b','#8c836b','#565449'],['#c5d2a1','#8c9d6d','#56664e'],'female02','female05','long03','female06',['#f7f8f3','#ced4d1','#929da6'],'wavy','flower-right','橄榄褐色长发、右侧白花、草绿眼、白色花边上衣'),
  p('mahoro','millsage','滨崎真幌','hamasaki-mahoro',['#b1bfdc','#697da6','#414e78'],['#bde3ec','#79aac0','#496983'],'female10','female06','short01','female12',['#f6f8ff','#c1cddb','#7b8caa'],'bob','pearl-band','蓝灰短鲍勃、白珠头带、蓝眼、白色荷叶边领'),
  p('hotaru','millsage','汐见萤','shiomi-hotaru',['#ffffff','#dce5ed','#99adbd'],['#dedbff','#a5a1d9','#6c6d9a'],'female08','female05','long01','female12',['#ffffff','#d7dfe4','#8c9dab'],'long','flower-left','白银长发、左侧白花簇、淡紫眼、白衬衣黑领带'),
  p('houka','millsage','和泉朋花','izumi-houka',['#f6dce1','#d9a9bb','#a87896'],['#d6c1c8','#9e8a99','#695d78'],'female08','female06','long02','female07',['#ffffff','#dbe0e5','#9aa5b3'],'long','flower-left','浅粉长直发、齐刘海、左侧白花、白色露肩上衣'),
  p('natsume','millsage','伊泽夏芽','izawa-natsume',['#c7d7bf','#94b099','#5d7e78'],['#d8b6f0','#ab7fc4','#655080'],'female02','female05','medium02','female06',['#fcfcf7','#d4ddd4','#8ca09b'],'wavy-medium','flower-left','鼠尾草绿中长卷发、侧分、左侧白花、紫眼与白裙'),
  p('raika','ikka-dumb-rock','须贺蕾叶','suga-raika',['#6d6d70','#3b3e46','#222936'],['#e2d989','#aaa64f','#62603b'],'female08','female05','long01','female11',['#6f708f','#434765','#2a3048'],'long','gold-pins','黑长直发、金色内层挑染与发夹、黄绿眼、蓝紫夹克',{streak:'#d7bd71'}),
  p('miku','ikka-dumb-rock','马桥心玖','mahashi-miku',['#ffffff','#d6e1e4','#90a8af'],['#b8e3e7','#78acba','#4c727f'],'female02','female05','medium03','female04',['#77b8b3','#4f8c8c','#345f70'],'medium','cross-pins','白色中长发、侧边黑发夹、青蓝眼、绿格纹外套',{accent:'#dabe62'}),
  p('yomogi','ikka-dumb-rock','矢仓蓬咲','yakura-yomogi',['#b8b5c9','#827f9b','#51506d'],['#c6d8ae','#8ca579','#53674f'],'female10','female02','short01','female11',['#6b8094','#3c5268','#293b51'],'asym-bob','earrings','灰紫不对称短鲍勃、长侧刘海、浅绿眼、蓝条纹宽外套'),
  p('chieri','ikka-dumb-rock','梅里千绘里','umezato-chieri',['#f8b9b8','#d78b96','#955d77'],['#e4d7a8','#ab9f71','#6f6b53'],'female07','female01','pigtails01','female07',['#ed9acb','#bc6ba0','#7f477b'],'braids','star-clips','珊瑚粉双辫、黑色交叉夹与星星夹、粉紫短上衣'),
  p('shizuku','ikka-dumb-rock','四宫宁月','shinomiya-shizuku',['#fff0d5','#e7c3a7','#ac877e'],['#d4b9e9','#a27db8','#665084'],'female08','female06','pigtails01','female11',['#a6a7a9','#747b88','#474e65'],'twins','cross-pins','浅金粉双马尾、交叉发夹、紫眼、灰衣黄背带与条纹袖',{accent:'#e6dc7c'})
];
