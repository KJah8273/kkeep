/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { relay, socketRelay } from "./proxy";
import {browserData,type BrowserDB} from './browser-data';
import {xboxStatus} from './xbox-diagnostics';
import {collectAnalytics,analyticsReport,analyticsPreference,analyticsDocument,type AnalyticsEnv} from './analytics';
import {stickBuild,stickAsset} from './stick';
import {stickRooms} from './stick-rooms';
import {hgolaBuild,hgolaAsset} from './hgola';
import {hgolaFile} from './hgola-files';
import {profileMedia} from './profile-media';
import {profileApi} from './profile';
import {hgolaSave} from './hgola-saves';
import {gameAsset,type GameAssetEnv} from './game-assets';

interface Env extends AnalyticsEnv,GameAssetEnv {
  DB?: BrowserDB;
  ASSETS: { fetch(request: Request): Promise<Response> };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // The retired project download must not fall through to the application shell.
    if (url.pathname === '/source/kha-proxy-source.zip') {
      return new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
    if (url.pathname === '/api/stick-build') return stickBuild(request);
    if (url.pathname === '/api/stick-asset') return stickAsset(request);
    if (url.pathname === '/api/stick-rooms') return stickRooms(request,env.DB);
    if (url.pathname === '/api/hgola-asset') return hgolaAsset(request);
    if (url.pathname === '/api/hgola-build') return hgolaBuild(request);
    if (url.pathname.startsWith('/api/hgola-files/')) return hgolaFile(request,env);
    if (url.pathname === '/api/profile-media') return profileMedia(request,env);
    if (url.pathname === '/api/profile') return profileApi(request,env.DB);
    if (url.pathname === '/api/hgola-save') return hgolaSave(request,env.DB);
    if (url.pathname.startsWith('/api/game-assets/')) return gameAsset(request,env,ctx);
    if (url.pathname === '/analytics' || url.pathname === '/analytics/') return analyticsDocument(request,env);
    if (url.pathname === '/api/analytics/collect') return collectAnalytics(request,env);
    if (url.pathname === '/api/analytics/report') return analyticsReport(request,env);
    if (url.pathname === '/api/analytics/preference') return analyticsPreference(request,env);
    if (url.pathname === '/api/browser-data') return browserData(request,env.DB);

    if (url.pathname === "/api/relay") return relay(request);
    if (url.pathname === "/api/socket") return socketRelay(request);
    if (url.pathname === '/api/xbox-status') return xboxStatus(request);
    if (url.pathname === "/api/health") return Response.json({ relay: true }, { headers: { "Cache-Control": "no-store" } });
    // Retired app routes and assets are gone, including old installed launchers.
    if (/^\/(?:gta5|games\/gta5|games\/packed\/gta5-32|apps|cloud|cloud-gaming|app-proxy|compat|manifests)(?:\/|$)/.test(url.pathname)||['/api/party','/api/india-target','/api/india-proxies','/api/proxy-target'].includes(url.pathname)) {
      return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Removed · Kkeep</title><body style="background:#08080b;color:#eee;font:18px/1.6 system-ui;padding:8vw"><h1>This page was removed</h1><a style="color:#c8bcff" href="/">Back to Kkeep</a></body></html>',{status:410,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
    if (url.pathname.startsWith("/browse/")||url.pathname.startsWith("/gfn/browse/")||url.pathname.startsWith("/xbox/browse/")) {
      if(request.mode==='navigate'||['document','iframe'].includes(request.headers.get('sec-fetch-dest')||''))return Response.redirect(new URL('/recover.html?from='+encodeURIComponent(url.pathname+url.search),url.origin).href,302);
      return new Response('Proxy session ended. Reopen the page.',{status:410,headers:{'Cache-Control':'no-store'}});
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    // A cached shell can reference asset hashes removed by the next deployment.
    // Keep documents and RSC responses fresh; versioned assets keep their own caching.
    if (/text\/(html|x-component)/i.test(response.headers.get('content-type') || '')) {
      const fresh = new Response(response.body, response);
      fresh.headers.set('Cache-Control', 'no-store');
      return fresh;
    }
    return response;
  },
};

export default worker;
