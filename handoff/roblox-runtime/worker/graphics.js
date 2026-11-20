// These are the public application names selected by the inspected player.
// Keep platform-specific settings; never substitute another platform's flags.
export const graphicsSettingsPath = /^\/v2\/settings\/application\/(?:WebClientApp|iOSWebClientApp|AndroidWebClientApp|MacWebClientApp|WindowsWebClientApp)(?:\/bucket\/[^/]+)?$/;

// Keep the mobile drawing budget inside the engine's existing pixel-ratio
// policy. The game document and its input coordinates retain their full CSS
// viewport; its ordinary resize path reads this ratio for the drawing buffer.
// This function is serialized into the inspected provider hook.
export function mobileCanvasPixelRatio(ratio, width, height, mobile, resolution) {
  if (mobile !== true || resolution === 'full' ||
      !Number.isFinite(ratio) || ratio <= 0 ||
      !Number.isFinite(width) || width <= 0 ||
      !Number.isFinite(height) || height <= 0) return ratio;
  const capped = Math.min(ratio, 1, 1024 / width, 1024 / height,
    Math.sqrt((1024 * 576) / (width * height)));
  return Number.isFinite(capped) && capped > 0 ? capped : ratio;
}

// Serialized into the provider's existing WebGPU error listener. Its first
// validation error must remain inspectable locally when the provider's
// diagnostic endpoint is unavailable. Never retain or transmit the raw error.
export function reportLocalWebGPUError(error) {
  try {
    const kinds=['GPUValidationError','GPUOutOfMemoryError','GPUInternalError'];
    const kind=kinds.includes(error?.constructor?.name)?error.constructor.name:
      kinds.includes(error?.name)?error.name:'GPUError';
    let detail=typeof error?.message==='string'?error.message.slice(0,8192):'';
    if(/\b(?:authorization|bearer|password|passwd|cookie|token|ticket|credentials?|secret|session(?:id|[_-]id)?|account(?:id|[_-]id|name|[_-]name)?|user(?:id|[_-]id|name|[_-]name)|api[_-]?key)\b|\.ROBLOSECURITY|x[-_]csrf/i.test(detail)){
      detail='Details omitted because the message contains sensitive fields.';
    }else{
      detail=detail
        .replace(/\b(?:https?|wss?|file|blob|data):[^\s<>"'`]+/gi,'[URL]')
        .replace(/\[(Texture|TextureView|Buffer|Sampler|ShaderModule|RenderPipeline|ComputePipeline|BindGroup|BindGroupLayout|PipelineLayout|CommandEncoder|CommandBuffer|Device|Queue)\b[^\]]*\]/g,'[$1]')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,value=>{
          const inner=value.slice(1,-1);
          return /^(?:rgba8unorm(?:-srgb)?|bgra8unorm(?:-srgb)?|rgba16float|rgba32float|rg11b10ufloat|depth24plus|depth24plus-stencil8|depth32float|COPY_SRC|COPY_DST|TEXTURE_BINDING|STORAGE_BINDING|RENDER_ATTACHMENT)$/.test(inner)?inner:'[label]';
        })
        .replace(/["'`][^\r\n]*/g,'[label]')
        .replace(/(^|[\s(])(?:\/|[A-Za-z]:\\)[^\s)]+/g,'$1[path]')
        .replace(/\b[0-9a-f]{16,}\b/gi,'[opaque]')
        .replace(/[A-Za-z0-9_-]{32,}={0,2}/g,'[opaque]')
        .slice(0,1600);
      if(!detail)detail='Details unavailable.';
    }
    console.error('[Kkeep WebGPU]',kind,detail);
  } catch { /* Local inspection must never interrupt the existing listener. */ }
}

export function graphicsSettingsRequest(url) {
  const path = /^\/_\/([A-Za-z0-9_-]+)(\/.*)$/.exec(url.pathname);
  if (!path || !graphicsSettingsPath.test(path[2])) return null;
  let host;
  try { host = atob(path[1].replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  if (host !== 'clientsettingscdn.roblox.com') return null;
  const values = url.searchParams.getAll('rbxgpu');
  const performance = url.searchParams.getAll('rbxperf');
  const frameRates = url.searchParams.getAll('rbxfps');
  // The inspected iOS endpoint ignores the provider's performance query.
  // Apply only the requested scheduler cap, retaining the iOS platform flags.
  const iosFps = /^\/v2\/settings\/application\/iOSWebClientApp(?:\/bucket\/[^/]+)?$/.test(path[2]) &&
    performance.length === 1 && performance[0] === 'performance' &&
    frameRates.length === 1 && /^(30|60)$/.test(frameRates[0]) ? frameRates[0] : null;
  return {renderer:values.length === 1 && /^(webgl|webgpu)$/.test(values[0]) ? values[0] : null, iosFps};
}

export function applyGraphicsPreference(text, renderer, iosFps = null) {
  const hasRenderer = renderer === 'webgl' || renderer === 'webgpu';
  const hasFrameRate = iosFps === '30' || iosFps === '60';
  if (!hasRenderer && !hasFrameRate) return text;
  let data;
  try { data = JSON.parse(text); } catch { return text; }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !data.applicationSettings || typeof data.applicationSettings !== 'object' || Array.isArray(data.applicationSettings)) return text;
  const applicationSettings = {...data.applicationSettings};
  if (hasRenderer) applicationSettings.FFlagWasmPreferWebGPU = renderer === 'webgpu' ? 'True' : 'False';
  if (hasFrameRate) applicationSettings.DFIntTaskSchedulerTargetFps = iosFps;
  return JSON.stringify({...data, applicationSettings});
}
