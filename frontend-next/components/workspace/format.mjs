// PLAY-B 展示层：金额与数量展示。默认只做整数千分位，不带任何货币符号；
// 真实接入时由调用方传入正式 formatMoney，绝不写死人民币或其他币种。
export function createFormatter(format) {
  if (typeof format === 'function') return format;
  return amount => (Number.isSafeInteger(amount) ? amount.toLocaleString('zh-CN') : '—');
}
