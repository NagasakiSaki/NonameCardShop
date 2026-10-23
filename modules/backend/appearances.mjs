import {BAND_APPEARANCES,BANDS} from '../../data/band-appearances.mjs';
export const CUSTOMER_APPEARANCES=BAND_APPEARANCES.map(c=>c.id);
export const PLAYER_SKINS=[
  {appearanceId:'owner',name:'经典店长'},
  ...BAND_APPEARANCES.map(c=>({appearanceId:c.id,name:c.characterName,group:BANDS.find(b=>b.id===c.band).name})),
  {appearanceId:'rookie',name:'棕发星饰'},
  {appearanceId:'collector',name:'银紫长发'},
  {appearanceId:'competitor',name:'红挑染短发'},
  {appearanceId:'passerby',name:'灰绿短发'},
  {appearanceId:'regular',name:'粉色双马尾'},
  {appearanceId:'bigspender',name:'金发红披肩'}
];
