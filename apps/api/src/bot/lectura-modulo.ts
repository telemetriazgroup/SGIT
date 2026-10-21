export type EtiquetaModulo = { sn: string; imei: string; modelo: string };

export function etiquetaDeModulo(texto: string): EtiquetaModulo | null {
  const modelo = /ZTRACK\s*-?\s*V\s*2/i.test(texto) ? 'ZTRACK-V2' : '';
  const sns: string[] = [];
  const imeis: string[] = [];
  const anotar = (lista: string[], valor: string) => {
    if (valor && !lista.includes(valor)) lista.push(valor);
  };
  for (const hallazgo of texto.matchAll(/SN[:\s.-]*(\d{16,22})/gi)) anotar(sns, snDe(hallazgo[1]));
  for (const hallazgo of texto.matchAll(/IMEI[:\s.-]*(\d{14,18})/gi)) anotar(imeis, imeiDe(hallazgo[1]));
  for (const linea of texto.split(/\n+/)) {
    const digitos = linea.replace(/\D/g, '');
    anotar(sns, snDe(digitos));
    anotar(imeis, imeiDe(digitos));
  }
  const sn = sns.find(Boolean) ?? '';
  const imei = imeis.find(Boolean) ?? '';
  if (!sn && !imei) return null;
  return { sn, imei, modelo };
}

export function snDe(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  const hallazgo = digitos.match(/005010\d{12,16}/);
  if (!hallazgo) return '';
  return hallazgo[0].length >= 18 && hallazgo[0].length <= 22 ? hallazgo[0] : '';
}

export function imeiDe(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (digitos.startsWith('005010') || digitos.startsWith('8951')) return '';
  const hallazgo = digitos.match(/86\d{13}/);
  if (!hallazgo || hallazgo[0].length !== 15 || hallazgo[0].startsWith('8951')) return '';
  return hallazgo[0];
}

export function esImeiDeSenal(digitos: string): boolean {
  return /^86\d{13}$/.test(digitos) && !digitos.startsWith('8951');
}
