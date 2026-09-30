// Usage: NATIVE_SCREENS_DIR=<dir holding project/ and shots/> node measure.cjs <board> [...]
// playwright resolves from the repo root node_modules.
const { chromium } = require('playwright');
const dir = process.env.NATIVE_SCREENS_DIR || process.cwd();
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:900}});
  for (const f of process.argv.slice(2)){
    await p.goto('file://'+dir+'/project/'+f+'.dc.html'); await p.waitForTimeout(1500);
    const r=await p.evaluate(()=>{const root=document.querySelector('x-dc > div')||document.querySelector('body div[style*="844px"]');
      const top=root.getBoundingClientRect().top; let max=0;
      root.querySelectorAll('*').forEach(e=>{const bb=e.getBoundingClientRect(); if(bb.height>0) max=Math.max(max,bb.bottom-top)});
      const btns=[...root.querySelectorAll('a,button')].map(e=>e.textContent.trim().slice(0,20)+':'+Math.round(e.getBoundingClientRect().bottom-top));
      return {max:Math.round(max), fonts:document.fonts.status, btns};});
    console.log(f, JSON.stringify(r));
    await p.screenshot({path:dir+'/shots/'+f+'.png', clip:{x:0,y:0,width:390,height:844}});
  }
  await b.close();})();
