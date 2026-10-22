import {createPad} from '../touch/gamepad.mjs';

// Installed by Scramjet's client-init hook before the game's scripts can cache
// getGamepads. Inactive until the visitor explicitly opens Kkeep Controls.
export function createGeForceInput(){
  const controller=createPad(),entries=new Map();let enabled=false,disposed=false;
  function release(){controller.reset();}
  function register(realm,url){
    if(disposed)return;prune();
    if(new URL(url).origin!=='https://play.geforcenow.com')return;
    let doc;try{doc=realm.document;}catch{return;}
    if(entries.get(realm)?.doc===doc)return;
    const old=entries.get(realm);if(old){release();old.destroy();entries.delete(realm);}
    const nav=realm.navigator,policy=doc.permissionsPolicy||doc.featurePolicy;
    try{
      if(policy?.allowsFeature&&!policy.allowsFeature('gamepad'))return;
      if(typeof nav.getGamepads!=='function')return;
      const own=Object.getOwnPropertyDescriptor(nav,'getGamepads'),native=nav.getGamepads.bind(nav);
      const free=devices=>{const empty=devices.findIndex(p=>!p);return empty<0?devices.length:empty;};
      let slot=free(Array.from(native()||[])),announced=false,dead=false,listener=()=>{};
      let pad;
      function sample(connected){
        const state=controller.pad;
        // GeForce retains its previous axes array for change detection. Never
        // expose createPad's mutable arrays: that would silently rewrite the
        // previous sample and suppress stick-only movement and release packets.
        const axes=pad&&pad.axes.every((value,index)=>value===state.axes[index])
          ?pad.axes:Object.freeze([...state.axes]);
        const buttons=pad&&pad.buttons.every((button,index)=>{
          const next=state.buttons[index];return button.value===next.value&&button.pressed===next.pressed&&button.touched===next.touched;
        })?pad.buttons:Object.freeze(state.buttons.map(button=>Object.freeze({...button})));
        if(!pad||pad.axes!==axes||pad.buttons!==buttons||pad.index!==slot||pad.connected!==connected||pad.timestamp!==state.timestamp)
          pad=Object.freeze({...state,index:slot,connected,axes,buttons});
        return pad;
      }
      function event(type){const e=new realm.Event(type);Object.defineProperty(e,'gamepad',{value:pad});realm.dispatchEvent(e);}
      function disconnect(){if(!announced)return;announced=false;sample(false);event('gamepaddisconnected');}
      function read(count=true){
        const devices=Array.from(native()||[]);
        if(dead||!enabled)return devices;
        // Real controllers keep their native slots. Move only our virtual pad.
        if(devices[slot]){disconnect();slot=free(devices);}
        devices[slot]=sample(true);
        if(!announced){announced=true;event('gamepadconnected');}
        if(count)listener(realm);
        return devices;
      }
      const wrapped=()=>read(true);
      Object.defineProperty(nav,'getGamepads',{configurable:true,writable:true,value:wrapped});
      const cleanup=()=>{release();};
      realm.addEventListener('pagehide',cleanup);
      doc.addEventListener('visibilitychange',cleanup);
      const entry={doc,
        listen(fn){listener=fn;},
        announce(){if(enabled&&!dead)read(false);},
        disconnect,
        destroy(){if(dead)return;disconnect();dead=true;listener=()=>{};
          realm.removeEventListener('pagehide',cleanup);doc.removeEventListener('visibilitychange',cleanup);
          if(nav.getGamepads===wrapped){if(own)Object.defineProperty(nav,'getGamepads',own);else delete nav.getGamepads;}
        }
      };
      entries.set(realm,entry);if(enabled)entry.announce();
    }catch{/* Preserve browser permission denials and fail closed. */}
  }
  function prune(){for(const [realm,entry]of entries){let current=false;try{current=realm.document===entry.doc&&!realm.closed;}catch{}if(!current){release();entry.destroy();entries.delete(realm);}}}
  return {controller,register,
    enable(value){if(disposed)return;release();enabled=!!value;prune();for(const entry of entries.values())enabled?entry.announce():entry.disconnect();},
    attach(realm,pad,onRead){prune();const entry=entries.get(realm);if(!entry||entry.doc!==realm.document)throw Error('Waiting for GeForce controller input');entry.listen(onRead);
      return {announce:()=>entry.announce(),destroy(){entry.listen(()=>{});}};
    },
    destroy(){if(disposed)return;release();enabled=false;disposed=true;for(const entry of entries.values())entry.destroy();entries.clear();}
  };
}
