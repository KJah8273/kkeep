// Verified against the Player action map in sharedassets0.assets, revision
// 3e0dbe9fd91c74dd77b3b493564d7c295d6af9e7. Q is PlayerDrop, not G.
export const actions=[
 {id:'cast',label:'Cast / Aim',code:'Mouse2',look:true},
 {id:'reel',label:'Reel / Use',code:'Mouse0',look:true},
 {id:'throw',label:'Throw',code:'KeyQ',look:true},
 {id:'use',label:'Pick up',code:'KeyE'},
 {id:'jump',label:'Jump',code:'Space'},
 {id:'run',label:'Run',code:'ShiftLeft',toggle:true},
 {id:'bag',label:'Bag',code:'Tab',menu:true},
 {id:'menu',label:'Pause',code:'Escape',menu:true},
 {id:'bait',label:'Bait',code:'KeyB',extra:true},
 {id:'hands',label:'Hands',code:'KeyX',extra:true},
 {id:'inspect',label:'Inspect',code:'KeyF',extra:true},
 {id:'reload',label:'Reload',code:'KeyR',extra:true},
 {id:'crouch',label:'Crouch',code:'ControlLeft',extra:true,toggle:true},
];

// Each finger keeps its role until release, including when it crosses another
// control. A finger on Cast, Reel or Throw may aim at the same time.
export class FingerLook {
 constructor(send){this.send=send;this.points=new Map();this.owner=null;}
 start(id,x,y){this.points.set(id,{x,y});if(this.owner===null)this.owner=id;}
 move(id,x,y,sensitivity=1){const p=this.points.get(id);if(!p)return;const dx=x-p.x,dy=y-p.y;p.x=x;p.y=y;if(this.owner===id&&(dx||dy))this.send(dx*sensitivity,dy*sensitivity);}
 end(id){this.points.delete(id);if(this.owner===id)this.owner=this.points.keys().next().value??null;}
 reset(){this.points.clear();this.owner=null;}
}
