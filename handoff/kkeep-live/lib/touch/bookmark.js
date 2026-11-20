import {mountController} from './controller.js';

// Existing saved bookmarks take the same managed path as newly copied ones.
const event=new Event('kkeep-controls-bookmark',{cancelable:true});
if(window.dispatchEvent(event))mountController();
