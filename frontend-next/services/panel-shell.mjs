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
  `;ctx.element.append(style);
}
