function encode(bytes) { let out=''; for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384)); return btoa(out); }
export default { async fetch(request, env) {
 const values={}; for(const key of ['launch_sites_v1','placeover','placecat','places']) values[key]=await env.PLACES.get(key,'json');
 const plain=new TextEncoder().encode(JSON.stringify({captured_at:new Date().toISOString(),values}));
 const rsa=await crypto.subtle.importKey('spki',Uint8Array.from(atob('MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAj1JseYC2pzAZx45DdlHYujPDpFxN8TFdJUIpIv+1y9MhwLp5qwdoqveC8DZ0UY+pWwPt9ktsy9TL+xBbZfDwagjP0bsngGii9Q9FnpIXdSGlRthlf/qX9rAdEEI14EEjr1SAp6iZ+XbAWJM0K3+Y6O5wlX+maZPGroTlrukQQAvJ9vOpe5ayNA67IUM3a7C95lj+OF7GGNlLebGPwo/zi2DoxNQK0BwPmvCX7FoillUrr/44o0NOWlnFrX5U7mW6SCQRmZqQzjG+wftHbuoCiCyaFQXnkSpR9ixtUWnxC1Kg94oOvg50JhsWCiDb9mp/rx2WwFQRoJFnqmJG0HLSo6Tc7QOklA8noK955wkyoPpzHewIyDnh7xjgYVXboO18torX5D4NilsOf7JKll5p6u903mS6NWspvBGxJNq5/i/1zwoU2CQJyx4COqe+g5r+al6JZ5I6ZYn5WrmXf+pE3pahV1GOM28pMqMdWQwbbs7i1c+WxF/PlkhbCvJCiar/AgMBAAE='),x=>x.charCodeAt(0)),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,plain);
 const wrappedKey=await crypto.subtle.encrypt({name:'RSA-OAEP'},rsa,await crypto.subtle.exportKey('raw',aes));
 return Response.json({iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext)),wrappedKey:encode(new Uint8Array(wrappedKey))},{headers:{'Cache-Control':'no-store'}});
}};
