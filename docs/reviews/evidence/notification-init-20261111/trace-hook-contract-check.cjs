const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const source = ts.transpileModule(fs.readFileSync('app/src/lib/logging/deprecation-trace.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
function setup({flag,tracePath='trace.jsonl',processType='browser',writeError,writeThrow,consoleThrows=false,readonlyTraceValue,preventExtensions=false,sourceOverride=source}={}) {
  const writes=[],errors=[]; const proc=new EventEmitter();proc.type=processType;proc.pid=101;proc.env={DESKTOP_TRACE_DEPRECATIONS:flag,DESKTOP_DEPRECATION_TRACE_FILE:tracePath}
  const exports={};let originalWarnings=0;proc.on('warning',()=>originalWarnings++)
  if(readonlyTraceValue !== undefined)Object.defineProperty(proc,'traceDeprecation',{value:readonlyTraceValue,writable:false,configurable:false,enumerable:true})
  if(preventExtensions)Object.preventExtensions(proc)
  vm.runInNewContext(sourceOverride,{exports,process:proc,console:{error:(...args)=>{errors.push(args);if(consoleThrows)throw Error('closed console')}},require(name){if(name==='fs')return {appendFile(file,data,callback){if(writeThrow)throw writeThrow;writes.push({file,data:JSON.parse(data)});callback(writeError)}};throw Error(name)}})
  return {api:exports,proc,writes,errors,originalWarnings:()=>originalWarnings}
}
let count=0
function check(label,fn){fn();count++;console.log('PASS '+label)}
check('only trimmed case-insensitive true enables trace',()=>{const {api}=setup();for(const value of [undefined,null,'',' ','null','false','FALSE','0','1','yes','invalid'])assert.equal(api.isDeprecationTracingEnabled(value),false);for(const value of ['true','TRUE',' True '])assert.equal(api.isDeprecationTracingEnabled(value),true)})
check('disabled trace leaves process warnings and filesystem untouched',()=>{for(const flag of [undefined,'false','null','','invalid']){const {proc,writes}=setup({flag});assert.equal(writes.length,0);assert.equal(proc.listenerCount('warning'),1);assert.equal(proc.traceDeprecation,undefined)}})
check('missing/empty trace path remains inactive',()=>{for(const tracePath of [undefined,'',' ']){const options={flag:'true',tracePath};if(tracePath===undefined)options.tracePath='';const {writes,proc}=setup(options);assert.equal(writes.length,0);assert.equal(proc.listenerCount('warning'),1)}})
check('main and renderer write startup markers without changing process flags',()=>{for(const processType of ['browser','renderer']){const {writes,proc}=setup({flag:'true',processType});assert.equal(Object.hasOwn(proc,'traceDeprecation'),false);assert.equal(writes[0].data.event,'trace-started');assert.equal(writes[0].data.process,processType);assert.equal(writes[0].data.pid,101)}})
check('DEP0169 captures exact stack without replacing existing listeners',()=>{const {writes,proc,originalWarnings}=setup({flag:'true'});proc.emit('warning',{code:'DEP0169',stack:'warning stack caller'});assert.equal(writes.length,2);assert.equal(writes[1].data.stack,'warning stack caller');assert.equal(originalWarnings(),1)})
check('unrelated warnings stay visible without extra trace capture',()=>{const {writes,proc,originalWarnings}=setup({flag:'true'});proc.emit('warning',{code:'OTHER',stack:'other'});assert.equal(writes.length,1);assert.equal(originalWarnings(),1)})
check('asynchronous append failures remain non-fatal',()=>{const {errors,proc}=setup({flag:'true',writeError:Error('write denied')});proc.emit('warning',{code:'DEP0169',stack:'stack'});assert.equal(errors.length,2)})
check('synchronous append failures remain non-fatal',()=>{assert.doesNotThrow(()=>setup({flag:'true',writeThrow:Error('invalid trace path')}))})
check('closed console cannot turn write failure into startup failure',()=>{assert.doesNotThrow(()=>setup({flag:'true',writeError:Error('write denied'),consoleThrows:true}))})
for(const readonlyTraceValue of [true,false])check(`read-only traceDeprecation=${readonlyTraceValue} preserves descriptor and records warnings`,()=>{
  const {proc,writes,originalWarnings}=setup({flag:'true',readonlyTraceValue})
  assert.deepEqual(Object.getOwnPropertyDescriptor(proc,'traceDeprecation'),{value:readonlyTraceValue,writable:false,configurable:false,enumerable:true})
  proc.emit('warning',{code:'DEP0169',stack:'readonly process warning caller'})
  assert.equal(writes.length,2);assert.equal(writes[1].data.stack,'readonly process warning caller');assert.equal(originalWarnings(),1)
})
check('non-extensible process needs no extra process properties',()=>{
  const {proc,writes}=setup({flag:'true',preventExtensions:true})
  proc.emit('warning',{code:'DEP0169',stack:'non-extensible process caller'})
  assert.equal(Object.hasOwn(proc,'traceDeprecation'),false);assert.equal(writes[1].data.stack,'non-extensible process caller')
})
check('read-only regression fixture rejects the earlier assignment',()=>{
  const oldSource=source.replace('tracePath) {', 'tracePath) { process.traceDeprecation = true;')
  assert.notEqual(oldSource,source)
  for(const readonlyTraceValue of [true,false])assert.throws(()=>setup({flag:'true',readonlyTraceValue,sourceOverride:oldSource}),/Cannot assign to read only property/)
})
console.log(`${count} opt-in diagnostic checks passed`)
