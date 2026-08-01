import {
  DEMO_DOCUMENT_NOTICE,
  IS_DEMO_ENVIRONMENT,
} from '@/src/lib/demo-environment'

export function getDemoHtmlWatermark() {
  if (!IS_DEMO_ENVIRONMENT) {
    return { styles: '', markup: '' }
  }

  return {
    styles: `.demo-watermark{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;pointer-events:none}.demo-watermark-inner{transform:rotate(-12deg);border:4px solid rgba(225,29,72,.2);padding:28px 44px;text-align:center;color:rgba(225,29,72,.22);font-family:Arial,sans-serif}.demo-watermark-title{font-size:42px;font-weight:900;letter-spacing:.16em}.demo-watermark-subtitle{max-width:620px;margin-top:10px;font-size:17px;font-weight:700;letter-spacing:.06em}`,
    markup: `<div class="demo-watermark"><div class="demo-watermark-inner"><div class="demo-watermark-title">AMBIENTE DEMO</div><div class="demo-watermark-subtitle">${DEMO_DOCUMENT_NOTICE}</div></div></div>`,
  }
}
