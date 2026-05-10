export const _debugLog = [];

export function dbg(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  _debugLog.push(line);
  if (_debugLog.length > 2000) _debugLog.shift();
}

export function downloadDebugLog() {
  const content = _debugLog.join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
  a.download = 'sketchtool-debug.log';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
