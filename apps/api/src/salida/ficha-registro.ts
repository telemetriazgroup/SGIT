export const MOTIVO_FICHA_REGISTRO = 'Falta sede, motivo, fecha, conductor, placa del tracto o id del registro.';

export type FichaRegistro = {
  sede: string;
  motivo: string;
  fecha: string;
  hora: string;
  fechaHora: string;
  placaTracto: string;
  placaCarreta: string;
  conductor: string;
  empresa: string;
  ruc: string;
  brevete: string;
  telefono: string;
  codigoEquipo: string;
  estado: string;
  observaciones: string;
  id: string;
};

export function leerRegistro(entrada: unknown): { ficha: FichaRegistro } | { error: string } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { error: MOTIVO_FICHA_REGISTRO };
  const origen = entrada as Record<string, unknown>;
  const fecha = campo(origen, ['fecha'], 20);
  const hora = campo(origen, ['hora'], 12);
  const junto = campo(origen, ['fechaHora', 'fecha_hora'], 40);
  const ficha: FichaRegistro = {
    sede: campo(origen, ['sede'], 40),
    motivo: campo(origen, ['motivo'], 80),
    fecha: junto || fecha,
    hora: junto ? '' : hora,
    fechaHora: junto || [fecha, hora].filter(Boolean).join(' '),
    placaTracto: campo(origen, ['placaTracto', 'placa_tracto'], 20),
    placaCarreta: campo(origen, ['placaCarreta', 'placa_carreta'], 20, 'NO INDICADO'),
    conductor: campo(origen, ['conductor'], 120),
    empresa: campo(origen, ['empresa'], 80, 'NO INDICADO'),
    ruc: campo(origen, ['ruc'], 20, 'NO INDICADO'),
    brevete: campo(origen, ['brevete'], 20, 'NO INDICADO'),
    telefono: campo(origen, ['telefono', 'teléfono'], 20, 'NO INDICADO'),
    codigoEquipo: campo(origen, ['codigoEquipo', 'codigo_equipo'], 40, 'NO INDICADO'),
    estado: campo(origen, ['estado'], 40, 'REGISTRADO'),
    observaciones: campo(origen, ['observaciones', 'observacion'], 500, 'SIN OBSERVACIONES'),
    id: campo(origen, ['id'], 40),
  };
  if (!ficha.sede || !ficha.motivo || !ficha.fechaHora || !ficha.conductor || !ficha.placaTracto || !ficha.id) {
    return { error: MOTIVO_FICHA_REGISTRO };
  }
  return { ficha };
}

export function asuntoRegistro(ficha: FichaRegistro): string {
  return `[${ficha.sede}] ${ficha.motivo} | ${ficha.placaTracto}`.slice(0, 180);
}

export function textoRegistro(ficha: FichaRegistro): string {
  return [
    'NUEVO REGISTRO DE CONDUCTOR',
    'CONTROL DE INGRESO',
    '',
    `SEDE: ${ficha.sede}`,
    `MOTIVO DE VISITA: ${ficha.motivo}`,
    `FECHA Y HORA: ${ficha.fechaHora}`,
    `ESTADO: ${ficha.estado}`,
    '',
    `PLACA TRACTO: ${ficha.placaTracto}`,
    `PLACA CARRETA: ${ficha.placaCarreta}`,
    `CONDUCTOR: ${ficha.conductor}`,
    '',
    `EMPRESA: ${ficha.empresa}`,
    `RUC: ${ficha.ruc}`,
    `BREVETE: ${ficha.brevete}`,
    `TELÉFONO: ${ficha.telefono}`,
    `CÓDIGO DE EQUIPO: ${ficha.codigoEquipo}`,
    '',
    `OBSERVACIONES: ${ficha.observaciones}`,
    `ID DE REGISTRO: ${ficha.id}`,
  ].join('\n');
}

export function mensajeWhatsappRegistro(ficha: FichaRegistro): string {
  const linea = (etiqueta: string, valor: string) => `*${etiqueta}:* ${valor.replace(/\*/g, '')}`;
  return [
    '*NUEVO REGISTRO DE CONDUCTOR*',
    'Control de ingreso',
    '',
    linea('Sede', ficha.sede),
    linea('Motivo', ficha.motivo),
    linea('Fecha y hora', ficha.fechaHora),
    linea('Estado', ficha.estado),
    '',
    linea('Placa tracto', ficha.placaTracto),
    linea('Placa carreta', ficha.placaCarreta),
    linea('Conductor', ficha.conductor),
    '',
    linea('Empresa', ficha.empresa),
    linea('RUC', ficha.ruc),
    linea('Brevete', ficha.brevete),
    linea('Teléfono', ficha.telefono),
    linea('Código de equipo', ficha.codigoEquipo),
    '',
    linea('Observaciones', ficha.observaciones),
    linea('ID de registro', ficha.id),
  ].join('\n');
}

export function htmlFichaConductor(ficha: FichaRegistro): string {
  const registrado = ficha.estado.toUpperCase() === 'REGISTRADO';
  const marcaEstado = registrado ? `✓ ${escapar(ficha.estado)}` : escapar(ficha.estado);
  const fondoEstado = registrado ? '#e7f6ec' : '#eef5fb';
  const colorEstado = registrado ? '#1b7a43' : '#12375a';
  const fecha = ficha.hora ? `${escapar(ficha.fecha)}<br>${escapar(ficha.hora)}` : escapar(ficha.fecha);
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:16px;background:#f4f7fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d5e0ea;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#12375a;">
<tr>
<td width="42%" valign="middle" style="padding:18px 16px;background:#ffffff;">
<div style="font-size:28px;line-height:1;font-weight:800;letter-spacing:1px;color:#16324f;">ZGROUP</div>
<div style="margin-top:4px;font-size:10px;letter-spacing:1.6px;color:#16324f;">INGENIERÍA EN FRÍO</div>
</td>
<td width="58%" align="right" valign="middle" style="padding:22px 20px;background:#0e3d66;color:#ffffff;">
<div style="font-size:16px;line-height:1.3;font-weight:700;letter-spacing:0.4px;">NUEVO REGISTRO DE CONDUCTOR</div>
<div style="margin-top:6px;font-size:12px;letter-spacing:0.6px;">CONTROL DE INGRESO</div>
</td>
</tr>
<tr><td colspan="2" style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
<tr>
${dato('SEDE', escapar(ficha.sede), '18%')}
${dato('MOTIVO DE VISITA', escapar(ficha.motivo), '34%')}
${dato('FECHA Y HORA', fecha, '26%')}
<td width="22%" align="center" valign="middle" style="padding:14px 8px;background:${fondoEstado};border-top:1px solid #d5e0ea;border-left:1px solid #d5e0ea;">
<div style="font-size:13px;line-height:1.3;font-weight:700;color:${colorEstado};">${marcaEstado}</div>
</td>
</tr>
</table>
</td></tr>
<tr><td colspan="2" style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
<tr>
${dato('PLACA TRACTO', escapar(ficha.placaTracto), '28%')}
${dato('PLACA CARRETA', escapar(ficha.placaCarreta), '28%')}
${dato('CONDUCTOR', escapar(ficha.conductor), '44%')}
</tr>
</table>
</td></tr>
<tr>
<td colspan="2" style="padding:10px 16px;background:#e7f1f8;border-top:1px solid #d5e0ea;font-size:13px;font-weight:700;letter-spacing:0.4px;color:#12375a;">DETALLE DEL REGISTRO</td>
</tr>
<tr><td colspan="2" style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
<tr>${par('EMPRESA', ficha.empresa)}${par('RUC', ficha.ruc)}</tr>
<tr>${par('BREVETE', ficha.brevete)}${par('TELÉFONO', ficha.telefono)}</tr>
<tr>${par('CÓDIGO DE EQUIPO', ficha.codigoEquipo)}${par('ESTADO', ficha.estado)}</tr>
</table>
</td></tr>
<tr>
<td colspan="2" style="padding:12px 16px;border-top:1px solid #d5e0ea;font-size:13px;line-height:1.4;font-weight:700;color:#12375a;">OBSERVACIONES: ${escapar(ficha.observaciones)}</td>
</tr>
<tr>
<td colspan="2" align="center" style="padding:12px 16px;background:#e7f1f8;border-top:1px solid #d5e0ea;font-size:13px;font-weight:700;letter-spacing:0.3px;color:#12375a;">ID DE REGISTRO: ${escapar(ficha.id)}</td>
</tr>
</table>
</body>
</html>`;
}

function dato(etiqueta: string, valorHtml: string, ancho: string): string {
  return `<td width="${ancho}" valign="top" style="padding:12px 14px;background:#eef5fb;border-top:1px solid #d5e0ea;border-left:1px solid #d5e0ea;">
<div style="font-size:11px;letter-spacing:0.4px;color:#6b849c;font-weight:700;">${etiqueta}</div>
<div style="margin-top:4px;font-size:15px;line-height:1.35;color:#12375a;font-weight:700;">${valorHtml}</div>
</td>`;
}

function par(etiqueta: string, valor: string): string {
  return `<td width="50%" valign="top" style="padding:12px 16px;background:#f8fbfe;border-top:1px solid #d5e0ea;border-left:1px solid #d5e0ea;">
<div style="font-size:11px;letter-spacing:0.4px;color:#6b849c;font-weight:700;">${etiqueta}</div>
<div style="margin-top:4px;font-size:15px;line-height:1.35;color:#12375a;font-weight:700;">${escapar(valor)}</div>
</td>`;
}

function campo(origen: Record<string, unknown>, claves: string[], limite: number, defecto = ''): string {
  for (const clave of claves) {
    const valor = origen[clave];
    if (valor === undefined || valor === null) continue;
    const limpio = String(valor).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!limpio) continue;
    return limpio.slice(0, limite);
  }
  return defecto;
}

function escapar(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
