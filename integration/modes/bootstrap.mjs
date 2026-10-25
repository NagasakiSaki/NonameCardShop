import {validateRoundPlan} from './round-plan.mjs';
import {nativeProfile} from './profiles.mjs';
import {installNativeRound} from './native-engine.mjs';

export async function prepareNativeRound(context,params,notify,seedConfig){
  const raw=params.get('nativePlan');if(!raw||raw.length>24000)throw Error('原生牌局参数缺失或过大。');
  const plan=validateRoundPlan(JSON.parse(raw)),profile=nativeProfile(plan.formatId);
  if(params.get('match')!==plan.gameId||!/^[a-f0-9]{32}$/.test(params.get('nativeToken')||''))throw Error('原生牌局会话参数无效。');
  const response=await fetch('/shop-integration/modes/capabilities.json',{cache:'no-store'});
  if(!response.ok)throw Error('无法核对原生适配版本。');
  const capability=(await response.json()).items?.find(p=>p.profileId===profile.id);
  if(!capability?.supported)throw Error(capability?.reason||'原生模式适配尚未就绪。');
  const {lib,game}=context;
  const config={mode:profile.engineMode,show_splash:'off',new_tutorial:true,version:'1.11.6',extensions:[],hiddenCharacterPack:[],
    characters:Object.keys((await import('/game/package.js'),window.noname_package.character)),cards:['standard','extra'],
    background_music:'music_off',confirm_exit:false,test_game:false,connect_mode:false,card_style:'default',game_speed:'fast',
    continue_name:[],show_handcardbutton:false,video:0,
    [`${profile.engineMode}_mode_mode_config_${profile.engineMode}`]:profile.nativeVariant};
  for(const key of ['double_character','change_identity','change_choice','free_choose','dierestart','continue_game','revive'])config[`${key}_mode_config_${profile.engineMode}`]=false;
  config[`swap_mode_config_${profile.engineMode}`]=false;
  config[`change_card_mode_config_${profile.engineMode}`]='disabled';
  Object.assign(config,profile.engineMode==='doudizhu'?{
    feiyang_version_mode_config_doudizhu:'online',enhance_nongmin_mode_config_doudizhu:'mobile',enhance_dizhu_mode_config_doudizhu:'disabled',
  }:{two_assign_mode_config_versus:false,two_phaseswap_mode_config_versus:false,replace_character_two_mode_config_versus:false,replace_handcard_two_mode_config_versus:false,olfeiyang_four_mode_config_versus:false});
  await seedConfig(lib.configprefix,config);
  game.reload=()=>notify('restart-request');
  localStorage.removeItem(lib.configprefix+'playback');localStorage.setItem(lib.configprefix+'directstart','true');
  const adapter=await installNativeRound(context,plan,notify),parentOrigin=params.get('parentOrigin'),token=params.get('nativeToken');
  const receive=event=>{
    const m=event.data;
    if(event.source!==parent||event.origin!==parentOrigin||m?.channel!=='noname-shop-native-control'||m.token!==token||['worldId','branchId','matchId','gameId','roundId','profileId','reserveDigest'].some(k=>m[k]!==plan[k])||m.planHash!==adapter.planHash)return;
    adapter.requestControl(m);
  };
  window.addEventListener('message',receive);window.addEventListener('pagehide',()=>window.removeEventListener('message',receive),{once:true});
}
