const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const apiPath='app/src/lib/api.ts'
const source=fs.readFileSync(apiPath,'utf8')
const ast=ts.createSourceFile(apiPath,source,ts.ScriptTarget.Latest,true)
const names=['getNextPagePathFromLink','getNextPagePathWithIncreasingPageSize']
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(ast).replace(/^export\s+/,''))
assert.equal(functions.length,2,'Test extracts exact two production pagination functions')
const compiled=ts.transpileModule(functions.join('\n')+'\nexport { '+names.join(',')+' }',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const exportsObject={};let legacyCalls=0
const urlNamespace={...require('node:url'),parse(){legacyCalls++;throw Error('Deprecated URL.parse called')}}
vm.runInNewContext(compiled,{exports:exportsObject,URL:urlNamespace,URLSearchParams,Response,Headers})
const grow=exportsObject.getNextPagePathWithIncreasingPageSize
const next=exportsObject.getNextPagePathFromLink
const response=link=>new Response(null,{headers:link===undefined?{}:{Link:link}})
const link=value=>response(`<${value}>; rel="next"`)
let count=0
function check(label,fn){fn();count++;console.log('PASS '+label)}
function query(value){return new URL(value,'https://pagination.test').searchParams}
check('no Link or non-next relation terminates pagination',()=>{assert.equal(next(response()),null);assert.equal(grow(response()),null);assert.equal(next(response('</items?page=2>; rel="last"')),null)})
check('absolute enterprise URL preserves pathname/query and strips origin/fragment',()=>assert.equal(next(link('https://enterprise.test/api/v3/repos/owner/repo/issues?page=2&state=all#fragment')),'/api/v3/repos/owner/repo/issues?page=2&state=all'))
check('root-relative next link retains raw query encoding when unchanged',()=>assert.equal(grow(link('/items?per_page=10&page=2&q=a%20b%2Bc%2F&empty=')),'/items?per_page=10&page=2&q=a%20b%2Bc%2F&empty='))
check('relative link resolves to an API path',()=>assert.equal(next(link('items?page=2')),'/items?page=2'))
check('protocol-relative link yields API pathname',()=>assert.equal(next(link('//enterprise.test/api/v3/items?page=2')),'/api/v3/items?page=2'))
check('query-only link remains usable',()=>assert.equal(next(link('?page=2')),'/?page=2'))
check('fragment-only and whitespace-only links have no next request path',()=>{for(const value of ['#fragment',' '])assert.equal(next(link(value)),null)})
check('commas inside next targets remain part of the query',()=>assert.equal(next(link('/items?labels=one,two&page=2')),'/items?labels=one,two&page=2'))
check('double slash API pathname is never reinterpreted as an authority',()=>{const result=grow(link('https://enterprise.test//api/v3/items?per_page=10&page=3'));assert.ok(result.startsWith('//api/v3/items?'));assert.match(result,/per_page=20/);assert.match(result,/page=2/)})
check('first matching next relation is selected',()=>assert.equal(next(response('</items?page=1>; rel="prev", </items?page=3>; rel="next", </items?page=8>; rel="last"')),'/items?page=3'))
check('malformed absolute and opaque links terminate safely',()=>{for(const value of ['https://[invalid/path','mailto:user@example.test','javascript:alert(1)','data:text/plain,test'])assert.equal(next(link(value)),null)})
check('growth preserves duplicate unrelated query values and decoded encoding',()=>{const result=grow(link('/api/v3/items?per_page=10&page=3&q=a%20b%2Bc%2F&label=one&label=two&empty='));const params=query(result);assert.equal(new URL(result,'https://pagination.test').pathname,'/api/v3/items');assert.equal(params.get('per_page'),'20');assert.equal(params.get('page'),'2');assert.equal(params.get('q'),'a b+c/');assert.deepEqual(params.getAll('label'),['one','two']);assert.equal(params.get('empty'),'')})
check('duplicate pagination keys skip growth',()=>{for(const value of ['/items?per_page=10&per_page=20&page=3','/items?per_page=10&page=3&page=5'])assert.equal(grow(link(value)),value)})
check('missing and invalid pagination values skip growth',()=>{for(const value of ['/items?page=2','/items?per_page=10','/items?per_page=oops&page=3','/items?per_page=10&page=0','/items?per_page=&page=3'])assert.equal(grow(link(value)),value)})
check('growth schedule and cap preserve item alignment',()=>{for(const [size,page,newSize,newPage] of [[10,2,10,2],[10,3,20,2],[20,3,40,2],[40,3,80,2],[80,5,80,5],[80,6,100,5],[100,9,100,9],[5,3,10,2],[1,3,2,2],[32,3,64,2]]){const params=query(grow(link(`/items?per_page=${size}&page=${page}`)));assert.equal(params.get('per_page'),String(newSize));assert.equal(params.get('page'),String(newPage))}})
check('pagination never invokes deprecated parser',()=>assert.equal(legacyCalls,0))
console.log(`${count} production pagination contracts passed`)
