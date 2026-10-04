export function htmlSeguro(html: string, urlDeCid: (cid: string) => string | null): string {
  const sinScript = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '');
  return sinScript.replace(/src\s*=\s*(['"])cid:([^'"]+)\1/gi, (_coincidencia, comilla: string, cid: string) => {
    const limpio = cid.replace(/[<>]/g, '');
    const url = urlDeCid(limpio);
    return `src=${comilla}${url ?? ''}${comilla}`;
  });
}
