export const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function stickVector(x,y,radius,deadzone=.12){
  const distance=Math.hypot(x,y);
  if(!distance||radius<=0)return [0,0];
  const length=Math.min(1,distance/radius);
  if(length<=deadzone)return [0,0];
  const strength=(length-deadzone)/(1-deadzone);
  return [x/distance*strength,y/distance*strength];
}

// Each finger owns its input. Releasing one finger must not release another.
export function createPad(now=()=>performance.now()){
  const held=new Map();
  const pad={id:'Kkeep Touch Controller (STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',timestamp:now(),axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),vibrationActuator:null,hapticActuators:[]};
  function refresh(){
    pad.axes.fill(0);
    for(const button of pad.buttons){button.value=0;button.pressed=false;button.touched=false;}
    for(const input of held.values()){
      if(input.button!==undefined){const button=pad.buttons[input.button];if(button)button.value=Math.max(button.value,input.value);}
      if(input.stick!==undefined){pad.axes[input.stick*2]=input.x;pad.axes[input.stick*2+1]=input.y;}
    }
    for(const button of pad.buttons){button.pressed=button.value>.01;button.touched=button.value>0;}
    pad.timestamp=now();
  }
  return {pad,
    button(owner,index,value=1){if(!Number.isInteger(index)||index<0||index>16)return;held.set(owner,{button:index,value:clamp(value,0,1)});refresh();},
    stick(owner,index,x,y){if(index!==0&&index!==1)return;held.set(owner,{stick:index,x:clamp(x,-1,1),y:clamp(y,-1,1)});refresh();},
    release(owner){held.delete(owner);refresh();},
    reset(){held.clear();refresh();},
  };
}

// Only the current page and same-origin frames are eligible. Browser origin
// boundaries and Permissions Policy remain intact.
export function attachGamepad(realm,pad,onRead=()=>{}){
  const nav=realm.navigator;
  const policy=realm.document.permissionsPolicy||realm.document.featurePolicy;
  if(policy?.allowsFeature&&!policy.allowsFeature('gamepad'))throw new Error('This player does not allow controller input.');
  const original=Object.getOwnPropertyDescriptor(nav,'getGamepads');
  const native=typeof nav.getGamepads==='function'?nav.getGamepads.bind(nav):()=>[];
  native(); // Do not replace a browser API which is blocked by Permissions Policy.
  let disconnected=false,enabled=true;
  const snapshot={...pad,index:0};
  function read(){
    const devices=Array.from(native()||[]);
    if(!enabled||disconnected)return devices;
    onRead(realm);
    // Keep a real controller in slot zero; never hijack its input.
    let index=devices.findIndex(device=>!device);
    if(index<0)index=devices.length;
    snapshot.index=index;snapshot.timestamp=pad.timestamp;snapshot.connected=pad.connected;
    devices[index]=snapshot;
    return devices;
  }
  Object.defineProperty(nav,'getGamepads',{configurable:true,writable:true,value:read});
  function event(type){
    const event=new realm.Event(type);
    Object.defineProperty(event,'gamepad',{value:snapshot});
    realm.dispatchEvent(event);
  }
  return {native,read,
    announce(){if(!disconnected&&enabled)event('gamepadconnected');},
    enable(value){if(enabled===value||disconnected)return;enabled=value;event(value?'gamepadconnected':'gamepaddisconnected');},
    destroy(){if(disconnected)return;disconnected=true;
      if(nav.getGamepads===read){if(original)Object.defineProperty(nav,'getGamepads',original);else delete nav.getGamepads;}
      event('gamepaddisconnected');
    }
  };
}
