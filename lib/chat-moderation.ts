export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u0640]/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/[013457@$!]/g, c => ({"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","@":"a","$":"s","!":"i"}[c] || c));
}
const english = ["fuck", "fucking", "fucker", "motherfucker", "shit", "shitty", "bullshit", "bitch", "bitches", "asshole", "bastard", "cunt", "dick", "cock", "pussy", "porn", "porno", "nigger", "nigga", "faggot", "whore", "slut", "retard", "retarded"];
const arabic = ["كس", "كسمك", "كسامك", "كسم", "كسختك", "كسام", "زب", "زبي", "زبك", "طيز", "طيزك", "شرموط", "شرموطة", "شرموطه", "قحبة", "قحبه", "عاهرة", "عاهره", "منيوك", "منيوكة", "منيوكه", "متناك", "متناكة", "نيك", "انيك", "يلعن", "يلعنكم", "لعنة", "خرا", "خري", "خراء", "كلب", "حمار", "احمق", "غبي"];
const words = [...english, ...arabic].map(normalizeText);
const escape = (s:string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalPatterns = words.map(w=>new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(w)}(?:$|[^\\p{L}\\p{N}])`, "u"));
const obfuscated = words.filter(w=>w.length>=3).map(w=>new RegExp(`(?:^|[^\\p{L}\\p{N}])${[...w].map(c=>escape(c)+"+").join("[\\s._*\\-/]*")}(?:$|[^\\p{L}\\p{N}])`, "u"));
export function hasProfanity(value: string): boolean {
  const normalized = normalizeText(value);
  return normalPatterns.some(r=>r.test(normalized)) || obfuscated.some(r=>r.test(normalized));
}
export function validGuestName(name:string): boolean {
  const normalized = normalizeText(name).replace(/[^\p{L}\p{N}]/gu, "");
  return name.length>=2 && name.length<=24 && /^[\p{L}\p{N} _.-]+$/u.test(name)
    && !hasProfanity(name) && !/owner|helper|مساعد|هيلبر|admin|moderator|kkeep|المالك|الاداره|ادمن|اونر|صاحبالموقع/u.test(normalized);
}
export function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if(bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return "image/jpeg";
  if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)) return "image/png";
  if(String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "image/webp";
  return null;
}
