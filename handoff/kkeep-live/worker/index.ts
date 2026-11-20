import {smashBall} from './smash-ball';
import {compressedGame} from './compressed-game';
import {packedGameEntry} from './packed-game-entry';
import {ropeStreaming} from './rope-streaming';
import {hunterFile} from './hunter-file';
import {zombieStreaming} from './zombie-streaming';
import {bobStreaming} from './bob-streaming';
import {zombieBuild,zombieAsset} from './zombie';
import {hgolaStreaming} from './hgola-streaming';
import {teamAuth} from './team-auth';
import {announcements} from './announcements';
import {proxyEngineAsset} from './proxy-engine-asset';
import {partyBuild,partyAsset} from './party';
import {roomBuild,roomAsset,roomPlay,roomContent} from './room';
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { relay, socketRelay } from "./proxy";
import {browserData,type BrowserDB} from './browser-data';
import {xboxStatus} from './xbox-diagnostics';
import {collectAnalytics,analyticsReport,analyticsPreference,analyticsDocument,hotGames,type AnalyticsEnv} from './analytics';
import {stickBuild,stickAsset} from './stick';
import {stickRooms} from './stick-rooms';
import {hgolaBuild,hgolaAsset} from './hgola';
import {hgolaFile} from './hgola-files';
import {profileMedia} from './profile-media';
import {googleProfile} from './profile-google';
import {communityAuth} from './community-auth';
import {profileApi} from './profile';
import {hgolaSave} from './hgola-saves';
import {gameAsset,type GameAssetEnv} from './game-assets';
import {hillEngine} from './hill-engine';
import {movieApi} from './movies';
import {gameSaveApi} from './game-saves';
import {gameContent} from './game-content';
import {kkeepYoutube,type VideoEnv} from './kkeep-youtube';

interface Env extends AnalyticsEnv,GameAssetEnv,VideoEnv {
  DB?: BrowserDB;
  KKEEP_ROBLOX_HANDOFF_KEY?: string;
  KKEEP_GOOGLE_CLIENT_ID?: string;
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
    const packedEntry=await packedGameEntry(request,env.ASSETS);if(packedEntry)return packedEntry;
    if(url.pathname.startsWith('/api/smash-ball/'))return smashBall(request);
    if(['/games/among-us-old/Build/game.data','/api/game-public/games/among-us-old/Build/game.data','/games/among-us-old/Build/game.wasm','/api/game-public/games/among-us-old/Build/game.wasm'].includes(url.pathname)&&['GET','HEAD'].includes(request.method))return compressedGame(request,env.ASSETS);
    // Old bookmarks and cached page links must never reopen retired ad frames.
    if (/^\/ads(?:\/|$)/.test(url.pathname)) {
      return new Response(null, {status:410,headers:{'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'X-Robots-Tag':'noindex, nofollow'}});
    }
    if(/^\/(?:chat|sports)(?:\/|$)/.test(url.pathname)) {
      return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><title>Page removed · Kkeep fun</title></head><body style="background:#08080b;color:#eee;font:18px/1.6 system-ui;padding:8vw"><h1>This page was removed</h1><a style="color:#c8bcff" href="/">Back to Kkeep fun</a></body></html>',{status:410,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, follow'}});
    }
    if(/^\/api\/(?:private|sports)(?:\/|$)/.test(url.pathname))return Response.json({error:'This feature has been removed.'},{status:410});
    if(url.pathname==='/'&&(url.searchParams.has('launch')||url.searchParams.has('cloud')))return Response.redirect(url.origin+'/browser'+url.search,302);
    if (url.pathname === "/api/announcements/auth") return teamAuth(request,env.DB);
    if (url.pathname === "/announcements" || url.pathname === "/announcements/" || url.pathname === "/api/announcements" || url.pathname === "/api/announcements/access") return announcements(request,env);
    if(url.pathname.startsWith('/api/rope-streaming/'))return ropeStreaming(request,fetch,ctx);
    if(url.pathname.startsWith('/api/hunter-file/'))return hunterFile(request,fetch,env,ctx);
    if(url.pathname.startsWith('/api/zombie-streaming/'))return zombieStreaming(request,fetch,ctx);
    if(url.pathname.startsWith('/api/bob-streaming/'))return bobStreaming(request,fetch,ctx);
    if(url.pathname==='/api/zombie-build')return zombieBuild(request);
    if(url.pathname==='/api/zombie-asset')return zombieAsset(request);
    if(url.pathname==='/api/room-play')return roomPlay(request);
    if(url.pathname.startsWith('/api/room-content/'))return roomContent(request);
    if(url.pathname==='/api/room-build')return roomBuild(request);
    if(url.pathname==='/api/room-asset')return roomAsset(request);
    if(url.pathname==='/api/party-build')return partyBuild(request);
    if(url.pathname==='/api/party-asset')return partyAsset(request);
    if (url.pathname.startsWith('/api/kkeep-youtube/')) return kkeepYoutube(request,env,ctx);
    if (url.pathname.startsWith('/api/movies/')) return movieApi(request,ctx);
    if (url.pathname==='/api/game-save') return gameSaveApi(request,env.DB);
    if (/^\/api\/(?:game-entry|game-resource|game-public)\//.test(url.pathname)) return gameContent(request,env,ctx);
    // The retired project download must not fall through to the application shell.
    if (url.pathname === '/source/kha-proxy-source.zip') {
      return new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
    if (url.pathname === '/api/stick-build') return stickBuild(request);
    if (url.pathname === '/api/stick-asset') return stickAsset(request);
    if (url.pathname === '/api/stick-rooms') return stickRooms(request,env.DB);
    if (url.pathname === '/api/hgola-asset') return hgolaAsset(request);
    if (url.pathname === '/api/hgola-build') return hgolaBuild(request);
    if (url.pathname.startsWith('/api/hgola-streaming/')) return hgolaStreaming(request);
    if (url.pathname.startsWith('/api/hgola-files/')) return hgolaFile(request,env,fetch,ctx);
    if (url.pathname === '/api/profile-media') return profileMedia(request,env);
    if (url.pathname === '/api/profile/google') return googleProfile(request,env);
    if (url.pathname.startsWith('/api/community-auth')) return communityAuth(request,env.DB,env.KKEEP_ROBLOX_HANDOFF_KEY);
    if (url.pathname === '/api/profile') return profileApi(request,env.DB);
    if (url.pathname === '/api/hgola-save') return hgolaSave(request,env.DB);
    if (url.pathname.startsWith('/api/hill-engine/')) return hillEngine(request,env);
    if (url.pathname.startsWith('/api/game-assets/')) {const asset=await gameAsset(request,env,ctx);const response=new Response(asset.body,asset);response.headers.set('Access-Control-Allow-Origin','*');return response;}
    if (url.pathname === '/analytics' || url.pathname === '/analytics/') return analyticsDocument(request,env);
    if (url.pathname === '/api/analytics/collect') return collectAnalytics(request,env);
    if (url.pathname === '/api/analytics/report') return analyticsReport(request,env);
    if (url.pathname === '/api/analytics/preference') return analyticsPreference(request,env);
    if (url.pathname === '/api/games/hot') return hotGames(request,env);
    if (url.pathname === '/api/browser-data') return browserData(request,env.DB);

    if (url.pathname === "/api/relay") return relay(request);
    if (url.pathname === "/api/socket") return socketRelay(request);
    if (url.pathname === '/api/xbox-status') return xboxStatus(request);
    if (url.pathname === "/api/health") return Response.json({ relay: true }, { headers: { "Cache-Control": "no-store" } });
    // Retired app routes and assets are gone, including old installed launchers.
    if (/^\/(?:gta5|games\/gta5|games\/packed\/gta5-32|apps|cloud|cloud-gaming|app-proxy|compat|manifests)(?:\/|$)/.test(url.pathname)||['/api/party','/api/india-target','/api/india-proxies','/api/proxy-target'].includes(url.pathname)) {
      return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Removed · Kkeep</title><body style="background:#08080b;color:#eee;font:18px/1.6 system-ui;padding:8vw"><h1>This page was removed</h1><a style="color:#c8bcff" href="/">Back to Kkeep</a></body></html>',{status:410,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
    const engineAsset=proxyEngineAsset(url.pathname);
    if(engineAsset&&['GET','HEAD'].includes(request.method))return env.ASSETS.fetch(new Request(new URL(engineAsset,url.origin),{method:request.method}));
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
    if(url.pathname==='/roblox'||url.pathname==='/roblox/'){
      // Both this top-level document and the dedicated runtime use require-corp.
      // Scope isolation to Roblox; other games and account flows are unchanged.
      const launcher=new Response(response.body,response);
      launcher.headers.set('Cache-Control','no-store');
      launcher.headers.set('Cross-Origin-Opener-Policy','same-origin');
      launcher.headers.set('Cross-Origin-Embedder-Policy','require-corp');
      launcher.headers.set('Permissions-Policy','cross-origin-isolated=(self "https://kkeep-roblox-runtime.kha971.chatgpt.site")');
      return launcher;
    }
    // The sandboxed game frame may read only public game assets, never Profile APIs.
    if(url.pathname.startsWith('/games/')||url.pathname.startsWith('/api/game-assets/')){
      const publicAsset=new Response(response.body,response);
      publicAsset.headers.set('Access-Control-Allow-Origin','*');
      publicAsset.headers.set('Cross-Origin-Resource-Policy','cross-origin');
      return publicAsset;
    }
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
