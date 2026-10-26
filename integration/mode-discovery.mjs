const NATIVE_FORMATS=['doudizhu-bo3','versus2v2-bo3'];
export async function discoverModeCapabilities(readJson){
  try{
    const runtime=await readJson('/api/runtime');
    if(!runtime.ready||!runtime.engineOrigin)throw Error('引擎服务未就绪');
    const report=await readJson(new URL('/shop-integration/modes/capabilities.json',runtime.engineOrigin));
    if(!NATIVE_FORMATS.every(id=>report?.items?.some(p=>p.formatId===id&&typeof p.supported==='boolean'&&p.profileId)))throw Error('模式能力接口不完整');
    return report.items;
  }catch{
    return NATIVE_FORMATS.map(formatId=>({formatId,supported:false,reason:'游戏服务未更新或引擎连接失败，请重新运行「一键启动游戏.cmd」后刷新页面。'}));
  }
}
