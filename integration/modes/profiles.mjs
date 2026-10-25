// Deliberately pinned to the installed engine. A new hash requires adapter review,
// not a tool silently accepting whichever upstream files happen to be installed.
export const NATIVE_PROTOCOL='card-shop-native-round/1';
const shared={
  'noname/library/element/player.js':'cd1a7ae31f4442486391aecfc0fa86b89d7ba9f09ba3e659d57c0fc996b1cc87',
  'noname/library/element/content.js':'7a11e998cb163a2dddbcce1f5fb1217a20978bc351cdb3bd5f0eb80596f87096',
  'noname/game/index.js':'42a73756d3c6e8c84af3c0a84244fe0439862e640a2ad902fd704325c16cf42b',
};
export const NATIVE_PROFILES=Object.freeze({
  'doudizhu-bo3':Object.freeze({id:'noname-1.11.6-doudizhu-normal-shop-1',engineVersion:'1.11.6',engineMode:'doudizhu',nativeVariant:'normal',seats:3,
    hashes:Object.freeze({...shared,'mode/doudizhu.js':'7f9ab889ff9793a63fe3ef5bf69c9672abf26de8b06e81d1c26a4e07daa93bdd'}),
    rules:Object.freeze({landlordHpBonus:1,feiyangVersion:'online',farmerLegacy:'mobile',enhancedLandlord:'disabled',nativeSharedTeamHandVisibility:true,optionalAllyTakeover:true,persistEngineVideos:false,seedScope:'initial-seat-order',exactMidRoundResume:false})}),
  'versus2v2-bo3':Object.freeze({id:'noname-1.11.6-versus-two-shop-1',engineVersion:'1.11.6',engineMode:'versus',nativeVariant:'two',seats:4,
    hashes:Object.freeze({...shared,'mode/versus.js':'ad57477a3529519ebeb73818405e944e22bdc663519dcef5cbcc5b0ab8bd72f5'}),
    rules:Object.freeze({twoPhaseSwap:false,replacements:false,lastSeatExtraCard:false,nativeFirstDrawPenalty:true,nativeSharedTeamHandVisibility:true,optionalAllyTakeover:true,persistEngineVideos:false,seedScope:'initial-seat-order',exactMidRoundResume:false})}),
});
export const nativeProfile=formatId=>NATIVE_PROFILES[formatId]||null;
