import test from 'node:test';
import assert from 'node:assert/strict';
import {installGamepadCompatibility} from '../lib/games/gamepad-compat.mjs';

test('an iPad frame denied gamepad permission can continue using touch',()=>{
 const navigator={getGamepads(){throw new DOMException('Feature-Policy (gamepad)','SecurityError');}};
 installGamepadCompatibility(navigator);
 assert.deepEqual(navigator.getGamepads(),[]);
 assert.deepEqual(navigator.getGamepads(),[]);
});
test('connected controllers and native receiver are preserved',()=>{
 const pads=[{id:'Controller',connected:true}];
 const navigator={getGamepads(){assert.equal(this,navigator);return pads;}};
 installGamepadCompatibility(navigator);assert.equal(navigator.getGamepads(),pads);
});
test('unrelated engine exceptions remain visible',()=>{
 const navigator={getGamepads(){throw new TypeError('broken engine');}};
 installGamepadCompatibility(navigator);assert.throws(()=>navigator.getGamepads(),TypeError);
});
test('old browsers without the optional API are left alone',()=>{const navigator={};installGamepadCompatibility(navigator);assert.equal('getGamepads' in navigator,false);});

import {installIsolatedWorkerCompatibility} from '../lib/games/gamepad-compat.mjs';
test('denied optional offline cache does not crash a sandboxed game',async()=>{
 const navigator={get serviceWorker(){throw new DOMException('Sandboxed','SecurityError');}};
 installIsolatedWorkerCompatibility(navigator);
 assert.equal(navigator.serviceWorker,undefined);
});
test('native allowed service workers are not modified',()=>{
 const worker={controller:{}};const navigator={serviceWorker:worker};
 installIsolatedWorkerCompatibility(navigator);assert.equal(navigator.serviceWorker,worker);
});
