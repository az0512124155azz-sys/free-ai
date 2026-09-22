const assert=require('node:assert/strict');
const {apiTransportUrl}=require('../electron/research.cjs');

function allowed(url,key=''){
  return apiTransportUrl(url,key);
}
function blocked(url,key,pattern){
  assert.throws(()=>apiTransportUrl(url,key),pattern);
}

assert.equal(allowed('https://api.example.com/v1','secret'),'https://api.example.com/v1');
assert.equal(allowed('http://localhost:11434/v1','local-key'),'http://localhost:11434/v1');
assert.equal(allowed('http://127.0.0.1:1234/v1','local-key'),'http://127.0.0.1:1234/v1');
assert.equal(allowed('http://127.42.0.9:1234/v1','local-key'),'http://127.42.0.9:1234/v1');
assert.equal(allowed('http://[::1]:11434/v1','local-key'),'http://[::1]:11434/v1');
assert.equal(allowed('http://192.168.1.20:11434/v1',''),'http://192.168.1.20:11434/v1');

blocked('http://api.example.com/v1','secret',/API keys require HTTPS/);
blocked('http://192.168.1.20:11434/v1','secret',/API keys require HTTPS/);
blocked('ftp://api.example.com/v1','secret',/must start with http:\/\/ or https:\/\//);
blocked('https://user:pass@api.example.com/v1','secret',/Do not put API credentials/);

console.log('API transport security checks passed.');
