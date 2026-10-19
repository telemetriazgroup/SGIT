export function normalizarImei(valor: string): string | null {
  const texto = valor.trim();
  if (!texto || /e/i.test(texto) || texto.includes('.')) return null;
  const digitos = texto.replace(/\D/g, '');
  if (digitos.length < 14 || digitos.length > 22 || digitos !== texto.replace(/[\s-]/g, '')) return null;
  return digitos;
}

export function normalizarCelular(valor: string): string | null {
  const texto = valor.trim();
  let digitos: string;
  if (/e/i.test(texto)) {
    const numero = Number(texto);
    if (!Number.isSafeInteger(numero)) return null;
    digitos = String(numero);
  } else {
    digitos = texto.replace(/\D/g, '');
    if (!digitos || digitos !== texto.replace(/[\s+-]/g, '')) return null;
  }
  if (digitos.startsWith('51') && digitos.length === 11) digitos = digitos.slice(2);
  if (digitos.startsWith('0') && digitos.length === 10) digitos = digitos.slice(1);
  if (digitos.length !== 9) return null;
  return digitos;
}

export function textoPlano(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ');
}
