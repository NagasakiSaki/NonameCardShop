// An uncertain command remains owned by its original requestId across window closes/reopens.
const error=(code,message)=>({ok:false,error:{code,message,retryable:false}});
const identity=app=>({worldId:app.snapshot().worldId,branchId:app.snapshot().branchId});
const sameBranch=(app,op)=>{const now=identity(app);return now.worldId===op.worldId&&now.branchId===op.branchId;};
async function send(app,ctx,draft,op){
  if(!sameBranch(app,op)){op.status='stale';return op.result=error('STALE_OPERATION','该操作属于读档前的世界或分支，请刷新后重新确认。');}
  op.status='submitting';
  try{
    const result=await ctx.submit(op.request);
    if(!sameBranch(app,op)){op.status='stale';return op.result=error('STALE_OPERATION','操作返回时进度分支已变化，请刷新当前世界。');}
    op.result=result;op.status=result.ok?'succeeded':result.error?.code==='RESULT_UNKNOWN'?'unknown':'failed';return result;
  }catch(e){if(!sameBranch(app,op)){op.status='stale';return op.result=error('STALE_OPERATION','进度分支已变化，请重新确认当前库存。');}op.status='unknown';return op.result=error('RESULT_UNKNOWN','尚未收到确定结果，请查询原操作：'+e.message);}
}
export async function performOperation(app,ctx,draft,request){
  if(['submitting','unknown'].includes(draft.operation?.status))return error('RESULT_UNKNOWN','上一次操作尚未确认，请先查询结果或使用原操作号重试。');
  if(!ctx.canSubmit())return error('NOT_PAUSED','窗口尚未获得暂停令牌，或已经关闭。');
  const full=structuredClone({...request,requestId:request.requestId||'trade-'+crypto.randomUUID()}),op={request:full,...identity(app),status:'submitting'};
  draft.operation=op;return send(app,ctx,draft,op);
}
export async function recoverOperation(app,ctx,draft){
  const op=draft.operation;if(!op)return error('NO_OPERATION','没有待确认的操作。');
  if(!sameBranch(app,op)){op.status='stale';return op.result=error('STALE_OPERATION','读档前的操作不可在新分支重放。');}
  const response=await ctx.query('operations.get',{requestId:op.request.requestId});if(!response.ok)return response;
  if(!sameBranch(app,op)){op.status='stale';return op.result=error('STALE_OPERATION','查询期间进度分支已变化。');}
  if(response.data.status==='stale'){op.status='stale';return op.result=error('STALE_OPERATION','该操作属于另一条进度分支。');}
  if(response.data.status==='succeeded'||response.data.status==='failed'){
    const result=response.data.result;
    if(!result||typeof result.ok!=='boolean')return error('VIEW_CONTRACT','操作查询缺少原始结果，不能认定交易已完成。');
    op.result=result;op.status=result.ok?'succeeded':'failed';return result;
  }
  op.status='unknown';return error('RESULT_UNKNOWN','尚无已提交记录；可以稍后查询，或用原操作号重试。');
}
export async function retryOperation(app,ctx,draft){
  const op=draft.operation;if(!op||op.status!=='unknown')return error('NO_OPERATION','当前没有需要原号重试的操作。');
  if(!ctx.canSubmit())return error('NOT_PAUSED','请重新打开工作区后再重试。');
  return send(app,ctx,draft,op);
}
