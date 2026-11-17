// Actual renderer/preload in an isolated offline Electron fixture host; NOT packaged or payment validation.
// WMUSIC_QA_PYTHON must name a Python with Pillow and zxing-cpp for rendered-QR decoding.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'electron';
import { _electron as launcher } from 'playwright-core';
import { DEFAULT_SETTINGS } from '../src/main/settings.mjs';

const root = resolve('.');
const scratch = process.env.HERMES_QA_SCRATCH || (process.platform === 'win32' ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : process.env.TMPDIR || tmpdir());
const python = process.env.WMUSIC_QA_PYTHON;
assert.ok(python, 'Set WMUSIC_QA_PYTHON to the offline QR-verification Python environment');
await mkdir(scratch, { recursive: true });
const output = await mkdtemp(join(scratch, 'wmusic-donation-evidence-'));
const runtime = join(output, 'runtime');
const profile = join(runtime, 'profile');
const files = ['package.json', 'package-lock.json', 'src/renderer/App.tsx', 'src/renderer/PadScreens.tsx',
  'src/renderer/DonationPanel.tsx', 'src/renderer/DonationScreen.tsx', 'src/renderer/donation-assets.ts',
  'src/renderer/donation.css', 'src/renderer/desktop.css', 'src/renderer/pad.css', 'src/renderer/styles.css',
  'src/renderer/PadIcons.tsx', 'src/renderer/DesktopGlyphs.tsx', 'src/renderer/desktop-controls.ts',
  'src/renderer/assets/donation-wechat.png', 'src/renderer/assets/donation-alipay.png',
  'src/preload/index.ts', 'build/donation-assets.json', 'tools/check-donation-render.py', 'tools/test-wmusic-donation.mjs'];
const fingerprint = async () => Object.fromEntries(await Promise.all(files.map(async file => [file,
  await readFile(join(root, file)).then(bytes => createHash('sha256').update(bytes).digest('hex'), error => {
    if (error.code === 'ENOENT' && file === 'src/renderer/DonationScreen.tsx') return null;
    throw error;
  })])));
const evidence = { scope: 'real current renderer + preload, isolated fixture host, logged out, HTTP(S) blocked', output,
  passed: [], screenshots: [], errors: [], packaged: false, paymentAttempted: false, recipientIdentityVerified: false };
let instance, child;
try {
  evidence.inputs = await fingerprint();
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  await build({ configFile: false, root: join(root, 'src/renderer'), base: './', plugins: [react()], logLevel: 'warn',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) }, build: { outDir: join(runtime, 'renderer'), emptyOutDir: true } });
  await build({ configFile: false, root, logLevel: 'warn', build: { outDir: join(runtime, 'preload'), emptyOutDir: true,
    lib: { entry: join(root, 'src/preload/index.ts'), formats: ['cjs'], fileName: () => 'index.cjs' }, rollupOptions: { external: ['electron'] } } });
  const bootstrap = join(runtime, 'fixture-main.cjs');
  await writeFile(bootstrap, `const {app,BrowserWindow,ipcMain,session}=require('electron');
app.setPath('userData',${JSON.stringify(profile)});
app.setPath('sessionData',${JSON.stringify(join(profile, 'session'))});
app.commandLine.appendSwitch('disable-background-networking');
app.whenReady().then(()=>{
 globalThis.__donationNetwork=[]; globalThis.__donationLoginCalls=0;
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{globalThis.__donationNetwork.push(new URL(details.url).origin);callback({cancel:true});});
 const ok=data=>({ok:true,data});
 ipcMain.handle('auth:status',()=>ok({authenticated:false}));
 ipcMain.handle('auth:login',()=>{globalThis.__donationLoginCalls++;return ok({authenticated:false});});
 ipcMain.handle('settings:get',()=>ok(${JSON.stringify(DEFAULT_SETTINGS)}));
 ipcMain.handle('queue:load',()=>ok(null));
 ipcMain.handle('updates:get',()=>ok({status:'development',currentVersion:${JSON.stringify(pkg.version)},message:'离线渲染器验收'}));
 ipcMain.handle('window:maximized',()=>false);
 const window=new BrowserWindow({width:1320,height:840,frame:false,webPreferences:{preload:${JSON.stringify(join(runtime, 'preload/index.cjs'))},sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.setMenuBarVisibility(false); window.loadFile(${JSON.stringify(join(runtime, 'renderer/index.html'))});
});app.on('window-all-closed',()=>app.quit());`);
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  instance = await launcher.launch({ executablePath: electron, args: [bootstrap], cwd: root, env, timeout: 30000 });
  child = instance.process();
  const page = await instance.firstWindow({ timeout: 20000 });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.locator('.desktop-app').waitFor();
  assert.equal(resolve(await instance.evaluate(({app}) => app.getPath('userData'))), resolve(profile));
  const originalUrl = page.url();
  const nav = page.getByRole('navigation', { name: '主导航', exact: true });
  await nav.getByRole('button', { name: '我的', exact: true }).click();
  const entry = page.getByRole('button', { name: '请维护者喝杯咖啡', exact: true });
  assert.equal(await entry.count(), 1, 'Mine must expose the working voluntary support page before login');
  await entry.click();
  const panel = page.getByRole('region', { name: '自愿支持维护者', exact: true });
  await panel.waitFor();
  assert.ok((await panel.innerText()).includes('打赏完全自愿，不影响任何功能使用'));
  assert.equal(await page.locator('.pad-main[data-pad-page="donation"]').count(), 1);
  assert.equal(await panel.locator('form,iframe,a[href^="http"]').count(), 0);
  evidence.passed.push('real Mine entry opens the voluntary support route without account login or a payment API');
  evidence.geometry = [];
  for (const [width, height] of [[960,640], [1320,840]]) {
    await instance.evaluate(({BrowserWindow}, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width,height]);
    await page.locator('.pad-main').evaluate(element => { element.scrollTop = 0; });
    for (const method of ['wechat','alipay']) {
      const label = method === 'wechat' ? '微信' : '支付宝';
      await panel.getByRole('tab', { name: label, exact: true }).click();
      const image = panel.getByRole('img', { name: `${label}收款码`, exact: true });
      await page.waitForFunction(alt => { const image = document.querySelector(`img[alt="${alt}"]`); return Boolean(image?.complete && image.naturalWidth > 0); }, `${label}收款码`);
      await image.scrollIntoViewIfNeeded();
      const bounds = await image.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
      const qrPath = join(output, `${method}-${width}-rendered.png`);
      evidence.currentImage = await image.evaluate(element => ({ ratio: devicePixelRatio, naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
        rendering: getComputedStyle(element).imageRendering, opacity: getComputedStyle(element).opacity,
        ancestors: [...function*(node) { while (node) { yield { tag: node.tagName, className: node.className,
          transform: getComputedStyle(node).transform, opacity: getComputedStyle(node).opacity }; node = node.parentElement; } }(element.parentElement)] }));
      await image.screenshot({path:qrPath});
      const decoded = JSON.parse(execFileSync(python, [join(root,'tools/check-donation-render.py'),method,qrPath], {cwd:root,encoding:'utf8'}));
      assert.equal(decoded.renderedPayloadMatches,true);
      evidence.geometry.push({width,height,method,bounds,renderedPayloadMatches:true});
      const shot = `${method}-${width}.png`; await page.screenshot({path:join(output,shot)}); evidence.screenshots.push(shot);
    }
  }
  evidence.passed.push('both actual rendered QR images decode to the original supplied payment data at minimum and normal window sizes');
  const wechat = panel.getByRole('tab',{name:'微信',exact:true});
  const alipay = panel.getByRole('tab',{name:'支付宝',exact:true});
  await wechat.focus(); await wechat.press('ArrowRight');
  assert.equal(await alipay.getAttribute('aria-selected'),'true');
  assert.ok(await alipay.evaluate(element=>element===document.activeElement));
  await alipay.press('Home'); assert.equal(await wechat.getAttribute('aria-selected'),'true');
  await wechat.press('End'); assert.equal(await alipay.getAttribute('aria-selected'),'true');
  evidence.passed.push('method tabs support mouse, arrows, Home/End and real focus movement');
  await panel.getByRole('img',{name:'支付宝收款码',exact:true}).evaluate(image=>image.dispatchEvent(new Event('error')));
  await panel.getByRole('alert').waitFor(); assert.equal(await panel.locator('img').count(),0);
  await wechat.click(); await panel.getByRole('img',{name:'微信收款码',exact:true}).waitFor();
  assert.equal(await panel.getByRole('alert').count(),0);
  evidence.passed.push('image failure is visible, never substitutes a made-up code and recovers on method switch');
  await page.getByRole('button',{name:'返回我的',exact:true}).click();
  assert.equal(await entry.count(),1);
  assert.equal(await instance.evaluate(()=>globalThis.__donationLoginCalls),0);
  assert.deepEqual(await instance.evaluate(()=>globalThis.__donationNetwork),[]);
  assert.equal(page.url(),originalUrl);
  assert.equal(await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  assert.deepEqual(await page.evaluate(()=>({node:typeof process,invoke:typeof window.desktop.invoke})),{node:'undefined',invoke:'undefined'});
  assert.deepEqual(evidence.errors,[]);
  assert.deepEqual(await fingerprint(),evidence.inputs,'governed input bytes changed during the probe');
  evidence.passed.push('Back returns to Mine; no login, remote requests, popup, navigation, Node or generic IPC');
  evidence.ok=true;
} catch (error) {
  evidence.ok=false; evidence.failure=error.stack; process.exitCode=1;
  if(instance){const page=await instance.firstWindow().catch(()=>null);if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});}
} finally {
  if(instance)await instance.close().catch(()=>{});
  if(child && child.exitCode===null && child.signalCode===null){
    await new Promise(done=>{const timer=setTimeout(done,3000);child.once('exit',()=>{clearTimeout(timer);done();});});
    if(child.exitCode===null && child.signalCode===null){
      if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
      else child.kill('SIGKILL');
      await new Promise(done=>setTimeout(done,300));
    }
  }
  await rm(runtime,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  evidence.cleanup={runtimeRemoved:await stat(runtime).then(()=>false,error=>error.code==='ENOENT'),profileRemoved:await stat(profile).then(()=>false,error=>error.code==='ENOENT'),childExited:!child || child.exitCode!==null || child.signalCode!==null};
  if(!Object.values(evidence.cleanup).every(Boolean)){evidence.ok=false;process.exitCode=1;}
  await writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({...evidence,inputs:undefined},null,2));
}
