const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const cp = require('node:child_process')
const ts = require('typescript')
const evidence=path.resolve('docs/reviews/evidence/runtime-findings-20261111')
const fixture=path.join(evidence,`git-fixture-${process.pid}`)
fs.mkdirSync(fixture,{recursive:true});fs.writeFileSync(path.join(fixture,'.owned-qa-fixture'),'runtime-findings QA')
const repo=path.join(fixture,'repo');fs.mkdirSync(repo)
const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(fixture,'empty-global-config'),GIT_TERMINAL_PROMPT:'0'}
for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE'])delete env[key]
fs.writeFileSync(env.GIT_CONFIG_GLOBAL,'')
function raw(args,cwd=repo,options={}){const resolved=path.resolve(cwd);assert.ok(resolved.startsWith(fixture+path.sep),'Git may run only inside owned disposable fixture');const result=cp.spawnSync('git',args,{cwd:resolved,encoding:'utf8',env:{...env,...options.env},input:options.stdin});if(result.error)throw result.error;return {stdout:result.stdout||'',stderr:result.stderr||'',exitCode:result.status}}
function ok(args,cwd=repo,options={}){const result=raw(args,cwd,options);assert.equal(result.exitCode,0,result.stderr);return result.stdout.trim()}
class GitError extends Error{constructor(result,args,output){super(output||result.stderr);this.result=result;this.args=args}}
let beforeFetch=null;let forcedFailure=null;let enumerationFailure=null;let sandboxRules=[];let fetchCalls=0;let worktreeCalls=0
async function git(args,cwd,label,options={}){if(args[0]==='worktree'&&args[1]==='list'){worktreeCalls++;if(enumerationFailure)throw enumerationFailure}if(args[0]==='fetch'){fetchCalls++;if(beforeFetch){const action=beforeFetch;beforeFetch=null;action()};if(forcedFailure){const result=forcedFailure;forcedFailure=null;if(!(options.successExitCodes||new Set([0])).has(result.exitCode))throw new GitError(result,args,result.stderr);return result}}const result=raw(args,cwd,options);if(!(options.successExitCodes||new Set([0])).has(result.exitCode))throw new GitError(result,args,result.stderr);return result}
function load(file,deps){const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};vm.runInNewContext(output,{exports,Buffer,Set,Map,process,console,require(name){if(Object.hasOwn(deps,name))return deps[name];throw Error(`Unexpected dependency ${name} from ${file}`)}});return exports}
const worktree=load('app/src/lib/git/worktree.ts',{'path':path,'./core':{git},'../path-exists':{pathExists:async value=>fs.existsSync(value)}})
const parser=load('app/src/lib/git/git-delimiter-parser.ts',{'../split-buffer':{splitBuffer(){throw Error('unused buffer parser')}}})
const refs=load('app/src/lib/git/for-each-ref.ts',{'./core':{git},'dugite':{GitError:{NotAGitRepository:999}},'../../models/branch':{Branch:class {},BranchType:{Local:0,Remote:1}},'./git-delimiter-parser':parser})
const fetch=load('app/src/lib/git/fetch.ts',{'./core':{git,GitError},'../progress':{},'./environment':{},'../sandbox-rule':{readSandboxRules:async()=>sandboxRules},'./worktree':worktree})
let count=0
async function check(label,fn){await fn();count++;console.log('PASS '+label)}
async function main(){
  ok(['init','-b','main']);ok(['config','user.name','Synthetic QA']);ok(['config','user.email','qa@example.test']);ok(['commit','--allow-empty','-m','initial'])
  const old=ok(['rev-parse','HEAD']);const tree=ok(['rev-parse','HEAD^{tree}']);const latest=ok(['commit-tree',tree,'-p',old,'-m','next']);ok(['update-ref','refs/remotes/origin/next',latest]);ok(['config','remote.origin.url','.']);ok(['config','remote.origin.fetch','+refs/heads/*:refs/remotes/origin/*'])
  function branch(name){ok(['branch',name,old]);ok(['config',`branch.${name}.remote`,'origin']);ok(['config',`branch.${name}.merge`,'refs/heads/next']);return {ref:`refs/heads/${name}`,sha:old,upstreamRef:'refs/remotes/origin/next',upstreamSha:latest}}
  function ref(name){return ok(['rev-parse',`refs/heads/${name}`])}
  const current={ref:'refs/heads/main',sha:old,upstreamRef:'refs/remotes/origin/next',upstreamSha:latest}
  const linked=branch('linked-held');const linkedPath=path.join(fixture,'linked-held');ok(['worktree','add',linkedPath,'linked-held'])
  const available=branch('available');const sandbox=branch('sandbox-held')
  await check('candidate discovery excludes every checked-out worktree',async()=>{ok(['config','branch.main.remote','origin']);ok(['config','branch.main.merge','refs/heads/next']);const found=await refs.getBranchesDifferingFromUpstream({path:repo});assert.ok(!found.some(entry=>entry.ref===current.ref));assert.ok(!found.some(entry=>entry.ref===linked.ref));assert.ok(found.some(entry=>entry.ref===available.ref))})
  await check('boundary preserves checked-out main/linked refs and advances eligible branch',async()=>{const file=path.join(repo,'.git','FETCH_HEAD');fs.writeFileSync(file,'owned sentinel\n');await fetch.fastForwardBranches({path:repo},[current,linked,available]);assert.equal(ref('main'),old);assert.equal(ref('linked-held'),old);assert.equal(ref('available'),latest);assert.equal(fs.readFileSync(file,'utf8'),'owned sentinel\n')})
  await check('all checked-out candidates cause no fetch',async()=>{const before=fetchCalls;await fetch.fastForwardBranches({path:repo},[current,linked]);assert.equal(fetchCalls,before)})
  await check('sandbox protection remains authoritative',async()=>{sandboxRules=[{branch:sandbox.ref}];const before=fetchCalls;await fetch.fastForwardBranches({path:repo},[sandbox]);assert.equal(ref('sandbox-held'),old);assert.equal(fetchCalls,before);sandboxRules=[]})
  await check('worktree inventory failure stops before local update',async()=>{const target=branch('inventory-failure');const before=fetchCalls;enumerationFailure=Error('worktree inventory unavailable');await assert.rejects(fetch.fastForwardBranches({path:repo},[target]),/inventory unavailable/);assert.equal(fetchCalls,before);assert.equal(ref('inventory-failure'),old);enumerationFailure=null})
  await check('checkout race preserves held branch and retries other eligible updates',async()=>{const racing=branch('racing-held');const other=branch('race-other');const before=fetchCalls;beforeFetch=()=>ok(['worktree','add',path.join(fixture,'racing-held'),'racing-held']);await fetch.fastForwardBranches({path:repo},[racing,other]);assert.equal(ref('racing-held'),old);assert.equal(ref('race-other'),latest);assert.equal(fetchCalls-before,2)})
  await check('genuine exit128 remains an error',async()=>{const target=branch('genuine-error');forcedFailure={exitCode:128,stdout:'',stderr:'fatal: invalid object name\n'};await assert.rejects(fetch.fastForwardBranches({path:repo},[target]),/invalid object name/);assert.equal(ref('genuine-error'),old)})
  await check('unsubmitted checked-out refusal is not silently ignored',async()=>{const target=branch('unsubmitted-error');forcedFailure={exitCode:128,stdout:'',stderr:`fatal: refusing to fetch into branch 'refs/heads/not-submitted' checked out at '${linkedPath}'\n`};await assert.rejects(fetch.fastForwardBranches({path:repo},[target]),/refusing to fetch/);assert.equal(ref('unsubmitted-error'),old)})
  await check('mixed stderr cannot masquerade as harmless checkout race',async()=>{const target=branch('mixed-error');forcedFailure={exitCode:128,stdout:'',stderr:`fatal: refusing to fetch into branch '${target.ref}' checked out at '${linkedPath}'\nfatal: unrelated corruption\n`};await assert.rejects(fetch.fastForwardBranches({path:repo},[target]),/refusing to fetch/);assert.equal(ref('mixed-error'),old)})
  console.log(`${count} worktree fast-forward contracts passed; ${fetchCalls} local-only fetch attempts, ${worktreeCalls} inventories`)
  const resolved=path.resolve(fixture);assert.ok(resolved.startsWith(evidence+path.sep));assert.equal(fs.readFileSync(path.join(resolved,'.owned-qa-fixture'),'utf8'),'runtime-findings QA');fs.rmSync(resolved,{recursive:true,force:true})
}
main().catch(error=>{console.error(error);console.error('Owned disposable fixture retained:',fixture);process.exitCode=1})
