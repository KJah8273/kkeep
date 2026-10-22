import {createGeForceInput} from './touch-input.mjs';
import {mountController} from '../touch/controller.js';
let input=createGeForceInput(),overlay;
window.KkeepGeForceControls={
  register(realm,url){try{input.register(realm,url);}catch{}},
  open(frame,onClose){
    if(overlay){overlay.show();return;}
    input.enable(true);
    overlay=mountController({frame,name:'GeForce NOW',profile:'cod',storageKey:'kkeep-gfn-touch-v1',controller:input.controller,attachGamepad:input.attach,
      onClose(){overlay=undefined;input.enable(false);onClose?.();}});
    if(!overlay)input.enable(false);
  },
  close(){overlay?.destroy();overlay=undefined;input.enable(false);},
  reset(){this.close();input.destroy();input=createGeForceInput();}
};
