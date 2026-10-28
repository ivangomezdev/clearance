import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
// Resolve the app's extensionless TypeScript import for Node's test runner.
const source=(await fs.readFile(new URL('../lib/staffspicks-session.ts',import.meta.url),'utf8')).replace("'./staffspicks'",JSON.stringify(new URL('../lib/staffspicks.ts',import.meta.url).href));
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {clearanceToken}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('renews only against Clerk, deduplicates requests and keeps JWTs server-side',async()=>{
 const keys=['CE_CLIENT_TOKEN','CE_SESSION_ID','CE_ACCESS_TOKEN'],saved=keys.map(k=>process.env[k]),fetchOriginal=globalThis.fetch;
 try{
  process.env.CE_CLIENT_TOKEN='test-client';process.env.CE_SESSION_ID='sess_test';
  const token='header.'+Buffer.from(JSON.stringify({iss:'https://clerk.clearanceexplorer.com',exp:Math.floor(Date.now()/1000)+60})).toString('base64url')+'.signature';let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://clerk.clearanceexplorer.com/v1/client/sessions/sess_test/tokens');assert.equal(options.method,'POST');assert.equal(options.headers.Cookie,'__client=test-client');assert.equal(options.redirect,'error');return Response.json({response:{jwt:token}});};
  assert.deepEqual(await Promise.all([clearanceToken(),clearanceToken()]),[token,token]);assert.equal(calls,1);assert.equal(await clearanceToken(),token);assert.equal(calls,1);
  process.env.CE_CLIENT_TOKEN='rejected-client';globalThis.fetch=async()=>Response.json({error:'private upstream data'},{status:401});await assert.rejects(clearanceToken(),e=>!e.message.includes('private upstream')&&e.message.includes('renovar'));
  process.env.CE_CLIENT_TOKEN='invalid\r\nCookie: other';await assert.rejects(clearanceToken(),/Configura/);
 }finally{globalThis.fetch=fetchOriginal;keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
