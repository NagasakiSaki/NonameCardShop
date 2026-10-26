// One WindowManager dialog per facility; children own pages, never global pause/input.
export function fitPanel(ctx){
  ctx.element.classList.add('facility-window');
  ctx.foot.replaceChildren();if(ctx.element.querySelector('[data-facility-style]'))return;
  const style=document.createElement('style');style.dataset.facilityStyle='true';style.textContent=`
    .facility-window{width:min(1160px,calc(100vw - 20px));height:min(820px,calc(100dvh - 24px));max-height:calc(100dvh - 24px);display:flex;flex-direction:column}
    .facility-window>.window__head{flex:none}.facility-window>.window__body{flex:1;min-height:0;padding:8px;overflow:hidden;display:flex;flex-direction:column}
    .facility-window>.window__foot{flex:none;min-height:0;padding:4px 10px}.facility-window>.window__foot:empty{display:none}
    .facility-window .f6-head__title{display:none}.facility-window [data-facility-root]{flex:1;min-height:0;height:100%}
    .facility-window .battle-mount{min-height:0;flex:1;height:100%;display:flex;flex-direction:column}.facility-window .battle-mount iframe{min-height:0!important;flex:1}
    .facility-window .f6-main{overflow:hidden;display:flex;flex-direction:column}.facility-window .f6-catalog{min-height:0;flex:1;display:flex;flex-direction:column}
    .facility-window .f6-grid{min-height:0}.facility-window .f6-foot{gap:6px;padding:6px 10px;min-height:48px}
    .facility-window .f6-scope{display:flex;flex-direction:column;flex:1;min-height:0}.facility-window .f6-stage{flex:1;min-height:0;grid-template-rows:repeat(2,minmax(0,1fr))}
    .facility-window .f6-frame{min-height:0}.facility-window .f6-frame .pbc-art{min-height:0;flex:1;max-height:none;aspect-ratio:auto}.facility-window .f6-scope>.pbc-card{padding:6px 10px;flex:none}
    .facility-window .f6-note{font-size:12px}.facility-window .f6-head{padding:6px 10px}
    .facility-window .pbc-body{overflow:hidden;display:flex;flex-direction:column;gap:8px;padding:8px;min-height:0}.facility-window .pbc-toolbar{flex:none}
    .facility-window .pbc-market{flex:1;min-height:0;align-items:stretch;grid-template-columns:minmax(0,1fr) 280px}.facility-window .pbc-market>div:first-child{min-height:0;display:flex;flex-direction:column}
    .facility-window .pbc-card-grid{flex:1;min-height:0;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}.facility-window .pbc-card-tile{min-height:0;display:flex;flex-direction:column}
    .facility-window .pbc-card-tile__img{min-height:0;aspect-ratio:auto;flex:1}.facility-window .pbc-detail{position:static;min-height:0;max-height:none;overflow:hidden;gap:5px}
    .facility-window .pbc-detail[data-detail-page="overview"] .pbc-detail__art{min-height:0;width:100%;aspect-ratio:auto;flex:1}
    @media(max-width:700px){.facility-window .pbc-market{grid-template-columns:1fr}.facility-window .pbc-card-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}
      .facility-window .pbc-body[data-mobile-view="cards"] .pbc-detail{display:none}.facility-window .pbc-body[data-mobile-view="detail"] .pbc-market>div:first-child{display:none}
    }
    .facility-window .fast07-picker__body,.facility-window .fast07-card-grid-container,.facility-window .fast07-card-grid{min-height:0}
    .facility-window .fast07-card-tile{min-height:0}.facility-window .fast07-card-tile>.fast07-art{flex:1;min-height:0;aspect-ratio:auto}
    .facility-window .fast07-skill-panel{min-height:0;overflow:hidden}.facility-window .fast07-selected-bar{flex-direction:column;align-items:stretch;gap:5px}.facility-window .fast07-selected-slots{width:100%;min-width:0;overflow:visible;max-height:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));flex:none}
    .facility-window .fast07-slot-card{min-width:0;flex-wrap:wrap;gap:3px}.facility-window .fast07-skill-toggle{display:none}
    .facility-window .fast07-lobby__left-col,.facility-window .fast07-lobby__right-col,.facility-window .fast07-lobby__main{min-height:0;overflow:hidden}
    .facility-window[data-lobby-page="fees"] .fast07-lobby__left-col,.facility-window[data-lobby-page="fees"] .fast07-lobby__right-col>.fast07-panel:not(.fast07-fee-config){display:none}
    .facility-window[data-lobby-page="tables"] .fast07-fee-config{display:none}.facility-window[data-lobby-page="fees"] .fast07-lobby__main{grid-template-columns:1fr}
    @media(max-width:600px){.facility-window .fast07-picker__head{padding:6px}.facility-window .fast07-skill-toggle{display:inline-flex}.facility-window .fast07-picker__body{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr);padding:6px}
      .facility-window .fast07-picker:not([data-subview="skills"]) .fast07-skill-panel{display:none}.facility-window .fast07-picker[data-subview="skills"] .fast07-card-grid-container{display:none}
      .facility-window .fast07-selected-bar{padding:6px}.facility-window .fast07-slot-card__index{font-size:10px}.facility-window .fast07-slot-card__name{flex-basis:100%}
      .facility-window[data-lobby-page="tables"] .fast07-lobby__right-col{display:none}.facility-window[data-lobby-page="lineup"] .fast07-lobby__left-col{display:none}.facility-window[data-lobby-page="lineup"] .fast07-fee-config{display:none}
      .facility-window .fast07-lobby__main{grid-template-columns:1fr;overflow:hidden}
    }
    @media(max-height:760px){.facility-window .f6-main{padding:6px 10px}.facility-window .f6-tile{padding:6px;gap:3px}.facility-window .f6-tile .f6-artframe{height:52px!important}.facility-window .pbc-btn{min-height:34px;padding:4px 9px}.facility-window .f6-scope{gap:6px}}
  `;
  // Natural-height content and one scrollable body supersede the old clipped page layout.
  style.textContent+=`
    .facility-window>.window__body{overflow:auto;display:block;overscroll-behavior:contain;scrollbar-gutter:stable}
    .facility-window>.window__foot{padding:8px 12px;max-height:35dvh;overflow:auto}
    .facility-window [data-facility-root]{height:auto;min-height:0}
    .facility-window .f6-root,.facility-window .pbc-root,.facility-window .pbc-body,.facility-window .fast07-root{height:auto!important;max-height:none;overflow:visible}
    .facility-window .f6-main,.facility-window .f6-catalog,.facility-window .f6-scope,.facility-window .pbc-market,.facility-window .fast07-lobby__main{height:auto;min-height:0;max-height:none;overflow:visible;flex:none}
    .facility-window .f6-main{display:block;padding:12px}.facility-window .f6-grid,.facility-window .f6-stage,.facility-window .pbc-card-grid{height:auto;flex:none;grid-template-rows:none;grid-auto-rows:auto}
    .facility-window .f6-foot,.facility-window .fast07-picker__foot{position:sticky;bottom:-8px;z-index:3;background:#292132;box-shadow:0 -3px 10px #0006;flex-wrap:wrap;height:auto;min-height:52px;padding:10px}
    .facility-window .f6-frame{height:auto;min-height:0}.facility-window .f6-frame .pbc-art{height:220px;min-height:180px;flex:none;aspect-ratio:5/7;max-height:none}
    .facility-window .pbc-card-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.facility-window .pbc-card-tile{height:auto;min-height:0}
    .facility-window .pbc-card-tile__img{height:170px;flex:none;aspect-ratio:5/7}.facility-window .pbc-detail{max-height:none;overflow:visible;position:sticky;top:0}
    .facility-window .fast07-picker,.facility-window .fast07-picker__body,.facility-window .fast07-card-grid-container,.facility-window .fast07-card-grid,.facility-window .fast07-skill-panel,.facility-window .fast07-lobby__left-col,.facility-window .fast07-lobby__right-col{height:auto;min-height:0;max-height:none;overflow:visible}
    .facility-window .fast07-card-tile>.fast07-art{height:180px;min-height:0;aspect-ratio:5/7;flex:none}.facility-window .fast07-selected-bar{flex-wrap:wrap;height:auto}.facility-window .fast07-selected-slots{max-height:none;overflow:visible;flex-wrap:wrap}
    .facility-window .f6-product-detail{grid-template-columns:1fr!important}.facility-window .f6-product-detail .f6-artframe{width:min(260px,80%)!important;height:300px!important;margin:8px auto}
    .facility-window .f6-grid:has(.f6-product-detail){display:block}.facility-window .f6-product-detail>.f6-tile__head{flex-direction:column;align-items:stretch}.facility-window .f6-product-detail .f6-tile__name{white-space:normal}
    .facility-window .product-album{margin-top:18px;min-width:0}.facility-window .album-rates{width:100%;border-collapse:collapse;font-size:13px}.facility-window .album-rates td,.facility-window .album-rates th{padding:9px 4px;text-align:left;border-bottom:1px solid #746548}
    .facility-window .album-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;margin-top:12px}.facility-window .album-card{display:flex;flex-direction:column;gap:6px;align-items:center;background:#30283b;color:#f5e5d1;border:1px solid #74627c;border-radius:6px;padding:8px;min-width:0}.facility-window .album-card .pbc-art{width:100%;height:150px;min-height:150px;flex:none;aspect-ratio:5/7}.facility-window .album-card img{width:100%;height:100%;object-fit:contain}.facility-window .album-card small{font-size:11px;color:#d0c3ad}.facility-window .album-card strong{white-space:normal}
    @media(max-width:700px){.facility-window .pbc-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.facility-window .pbc-market{grid-template-columns:1fr}.facility-window .pbc-detail{position:static}.facility-window .fast07-picker__body,.facility-window .fast07-lobby__main{grid-template-columns:1fr}.facility-window .f6-main{padding:6px}}
  `;ctx.element.append(style);
}
