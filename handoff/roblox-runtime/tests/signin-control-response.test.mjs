import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../worker/index.js';

const origin = 'https://runtime.example';
const initial = '/~/sj/controller123/frame456/' + Buffer.from('https://www.roblox.com/login').toString('base64url');

async function withoutNetwork(work) {
  const fetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Account routes must stay in the browser'); };
  try { await work(); assert.equal(calls, 0); }
  finally { globalThis.fetch = fetch; }
}

test('a missing initial iframe interception returns only a local, uncached recovery notice', async () => {
  await withoutNetwork(async () => {
    const response = await worker.fetch(new Request(origin + initial, {headers:{
      'Sec-Fetch-Dest':'iframe',
      Cookie:'test-cookie=not-a-real-session',
      Authorization:'Bearer not-a-real-token'
    }}));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('location'), null);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/kkeep\.fun/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(response.headers.get('content-security-policy'), /form-action 'none'/);
    const html = await response.text();
    assert.match(html, /id="kkeep-signin-control-missing"/);
    for (const value of [initial, 'controller123', 'frame456', 'not-a-real-session', 'not-a-real-token', 'www.roblox.com']) {
      assert.ok(!html.includes(value), 'the notice must not echo account, URL, or routing data');
    }
    assert.ok(!/<(?:input|form|iframe|link)\b/i.test(html));
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    const sent = [];
    vm.runInNewContext(script, {
      window:{},
      parent:{postMessage:(message, target) => sent.push({message:JSON.parse(JSON.stringify(message)), target})},
      location:{origin}
    });
    assert.deepEqual(sent, [{message:{type:'kkeep:signin-control-missing'}, target:origin}]);
    const top = {postMessage(){throw new Error('A top-level page must not notify itself');}};
    vm.runInNewContext(script, {window:top, parent:top, location:{origin}});
  });
});

test('the controller default codec receives the same narrow initial-GET notice', async () => {
  await withoutNetwork(async () => {
    const path = '/~/sj/controller123/frame456/' + encodeURIComponent('https://www.roblox.com/login');
    const response = await worker.fetch(new Request(origin + path, {headers:{'Sec-Fetch-Dest':'iframe'}}));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /id="kkeep-signin-control-missing"/);
  });
});

test('subresources, non-GET requests, and ambiguous navigation headers remain fail closed', async () => {
  await withoutNetwork(async () => {
    for (const destination of ['', 'document', 'script', 'image', 'style', 'worker', 'empty']) {
      const response = await worker.fetch(new Request(origin + initial, {headers:{'Sec-Fetch-Dest':destination}}));
      assert.equal(response.status, 404, destination);
      assert.doesNotMatch(await response.text(), /<script>|kkeep:signin-control-missing/);
    }
    for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await worker.fetch(new Request(origin + initial, {method, headers:{'Sec-Fetch-Dest':'iframe'}}));
      assert.equal(response.status, 404, method);
      assert.doesNotMatch(await response.text(), /kkeep:signin-control-missing/);
    }
    const response = await worker.fetch(new Request(origin + initial));
    assert.equal(response.status, 404);
  });
});

test('only the fixed initial Roblox login address can request the control notice', async () => {
  await withoutNetwork(async () => {
    const prefix = '/~/sj/controller123/frame456/';
    const rejected = [
      initial + '?unexpected=1',
      initial + '/',
      initial.replace('controller123', 'CONTROLLER123'),
      initial.replace('frame456', 'a'.repeat(33)),
      prefix + encodeURIComponent('https://www.roblox.com/login?returnUrl=account'),
      prefix + encodeURIComponent('https://www.roblox.com/two-step-verification'),
      prefix + encodeURIComponent('https://auth.roblox.com/v2/login'),
      prefix + encodeURIComponent('https://elsewhere.example/login'),
      prefix + Buffer.from('https://www.roblox.com/login?returnUrl=account').toString('base64url'),
      prefix + Buffer.from('https://www.roblox.com/two-step-verification').toString('base64url'),
      prefix + Buffer.from('https://auth.roblox.com/v2/login').toString('base64url'),
      prefix + 'https://www.roblox.com/login',
      prefix + encodeURIComponent(encodeURIComponent('https://www.roblox.com/login'))
    ];
    for (const path of rejected) {
      const response = await worker.fetch(new Request(origin + path, {headers:{'Sec-Fetch-Dest':'iframe'}}));
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(await response.text(), /kkeep:signin-control-missing/);
    }
    for (const path of ['/_rbx/api/session', '/_rbx/api/login', '/_/' + btoa('auth.roblox.com') + '/v2/login']) {
      const response = await worker.fetch(new Request(origin + path, {headers:{'Sec-Fetch-Dest':'iframe'}}));
      assert.equal(response.status, 503, path);
      assert.doesNotMatch(await response.text(), /kkeep:signin-control-missing/);
    }
  });
});
