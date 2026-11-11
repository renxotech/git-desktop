const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const identitySource = ts.transpileModule(fs.readFileSync('app/src/lib/find-toast-activator-clsid.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const mainSource = ts.transpileModule(fs.readFileSync('app/src/main-process/notifications.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const goodIdentity = {toastActivatorClsid:'{27D44D0C-A542-5B90-BCDB-AC3126048BA2}',appUserModelId:'com.squirrel.GitDesktop.GitDesktop'}
function lookup(shortcuts) {
  const probes=[]; const exports={}
  vm.runInNewContext(identitySource, {exports,require(name){
    if(name==='path')return path
    if(name==='electron')return {app:{getPath:name=>name==='appData'?'redirected-appdata':'redirected-desktop'},shell:{readShortcutLink(file){probes.push(file);const entry=shortcuts[probes.length-1];if(entry instanceof Error || entry===undefined)throw entry || Error('missing');return entry}}}
    throw Error(name)
  }})
  return {identity:exports.findWindowsNotificationIdentity(),probes}
}
function mainFixture({identity=goodIdentity,result=true,darwin=false,linux=false}={}) {
  const calls=[];const exports={}
  const native={initializeNotifications(opts){calls.push(['init',opts]);return result},terminateNotifications(){calls.push(['terminate'])},onNotificationEvent(){}}
  vm.runInNewContext(mainSource,{exports,__DARWIN__:darwin,__LINUX__:linux,log:{info:msg=>calls.push(['info',msg]),warn:msg=>calls.push(['warn',msg])},require(name){
    if(name==='desktop-notifications')return native
    if(name==='electron')return {app:{setAppUserModelId:id=>calls.push(['appId',id])}}
    if(name.includes('find-toast-activator'))return {findWindowsNotificationIdentity:()=>identity === null ? undefined : identity}
    if(name.includes('ipc-webcontents'))return {send(){}}
    throw Error(name)
  }})
  return {api:exports,calls}
}
let count=0
function check(label,fn){fn();count++;console.log('PASS '+label)}
check('missing shortcuts produce no invented identity',()=>assert.equal(lookup([]).identity,undefined))
check('known folder values drive both shortcut locations',()=>{const {probes}=lookup([]);assert.ok(probes[0].startsWith('redirected-appdata'));assert.ok(probes[1].startsWith('redirected-desktop'))})
check('matching valid fork identity accepted',()=>assert.equal(lookup([goodIdentity]).identity.appUserModelId,goodIdentity.appUserModelId))
check('upstream identity rejected without adoption',()=>assert.equal(lookup([{...goodIdentity,appUserModelId:'com.squirrel.GitHubDesktop.GitHubDesktop'}]).identity,undefined))
check('missing and empty appId rejected',()=>{assert.equal(lookup([{toastActivatorClsid:goodIdentity.toastActivatorClsid}]).identity,undefined);assert.equal(lookup([{...goodIdentity,appUserModelId:''}]).identity,undefined)})
check('malformed CLSID rejected',()=>assert.equal(lookup([{...goodIdentity,toastActivatorClsid:'invalid'}]).identity,undefined))
check('failed first shortcut can use valid second shortcut',()=>assert.equal(lookup([Error('unreadable'),goodIdentity]).identity.toastActivatorClsid,goodIdentity.toastActivatorClsid))
check('valid first shortcut ends probing',()=>assert.equal(lookup([goodIdentity]).probes.length,1))
check('portable mode skips identity/native init and emits unavailable message',()=>{const {api,calls}=mainFixture({identity:null});api.initializeDesktopNotifications();assert.deepEqual(calls.map(x=>x[0]),['info']);assert.match(calls[0][1],/unavailable/)})
check('installed init sets matching identity before native init',()=>{const {api,calls}=mainFixture();api.initializeDesktopNotifications();assert.deepEqual(calls.map(x=>x[0]),['appId','init']);assert.equal(calls[0][1],goodIdentity.appUserModelId);assert.equal(calls[1][1].toastActivatorClsid,goodIdentity.toastActivatorClsid)})
check('successful init is idempotent',()=>{const {api,calls}=mainFixture();api.initializeDesktopNotifications();api.initializeDesktopNotifications();assert.equal(calls.filter(x=>x[0]==='init').length,1)})
check('failed init logs unavailable and can retry',()=>{const {api,calls}=mainFixture({result:false});api.initializeDesktopNotifications();api.initializeDesktopNotifications();assert.equal(calls.filter(x=>x[0]==='init').length,2);assert.equal(calls.filter(x=>x[0]==='warn').length,2)})
check('mac initialization skips Windows identity setup',()=>{const {api,calls}=mainFixture({darwin:true});api.initializeDesktopNotifications();assert.deepEqual(calls.map(x=>x[0]),['init']);assert.equal(Object.keys(calls[0][1]).length,0)})
check('Linux skips native initialization',()=>{const {api,calls}=mainFixture({linux:true});api.initializeDesktopNotifications();assert.equal(calls.length,0)})
check('terminate permits fresh main-process initialization',()=>{const {api,calls}=mainFixture();api.initializeDesktopNotifications();api.terminateDesktopNotifications();api.initializeDesktopNotifications();assert.deepEqual(calls.map(x=>x[0]),['appId','init','terminate','appId','init'])})
console.log(`${count} identity/main-process checks passed`)
