import http from 'node:http';
import {readFile} from 'node:fs/promises';
import worker from '../worker/index.js';
import {responseHeaders} from '../worker/gateway.js';
import {engineFailurePreview} from './engine-failure-preview.mjs';
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{
  try{
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers});
    if(new URL(request.url).pathname==='/__controlled/games/start'){
      const headers=responseHeaders({'Content-Type':'text/html; charset=utf-8'},new URL(request.url).origin);
      res.writeHead(200,Object.fromEntries(headers));
      res.end(engineFailurePreview(new URL(request.url).origin));
      return;
    }
    // Development-only UI fixture. This route is never part of the Worker build.
    if(new URL(request.url).pathname==='/__qa/games/start'){
      const headers=responseHeaders({'Content-Type':'text/html; charset=utf-8'},new URL(request.url).origin);
      res.writeHead(200,Object.fromEntries(headers));
      res.end(await readFile(new URL('../tests/fixtures/recovery.html',import.meta.url)));
      return;
    }
    const response=await worker.fetch(request,{},{});
    const headers=new Headers(response.headers);
    // Node fetch decodes upstream compression; the Worker runtime handles this itself.
    headers.delete('content-encoding');headers.delete('content-length');
    res.writeHead(response.status,Object.fromEntries(headers));
    if(response.body)for await(const chunk of response.body)res.write(chunk);
    res.end();
  }catch(error){res.writeHead(500);res.end('Preview error');console.error(error.message)}
}).listen(port,'0.0.0.0',()=>console.log('Kkeep Roblox runtime preview on '+port));
