import {unzipSync} from 'fflate';
window.kkeepUnzip=async(blob,name)=>{
 if(blob.size>32*1024*1024)throw Error('Game archive is too large.');
 const files=unzipSync(new Uint8Array(await blob.arrayBuffer()),{filter:entry=>entry.name.endsWith(name)&&entry.originalSize<=128*1024*1024});
 const found=Object.entries(files).find(([path])=>path.endsWith(name));
 if(!found)throw Error('Game file is missing from its archive.');
 return found[1];
};
