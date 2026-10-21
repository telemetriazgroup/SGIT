import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { AlmacenCorreo } from '../buzon/almacen';
import type { Conexiones } from '../conexiones';
import { leerConfiguracion, type LecturaOdoo } from '../configuracion';
import { hiloListo, listarHilos } from '../tareas/hilos';
import { aplicarSeleccion, completarNombres, confirmarOrden, estadoDeOrden, marcarConsumido, pdfDeOrden, registrarConstancia, tomarOrden } from './odoo';
import { ejecutorDe, huellaConsumidos, notaInsumos, notasRegistro, textoMateriales, type MaterialPedido } from './reglas';

export type FabricacionPublica = {
  orden: string;
  cot: string;
  estado: string;
  chip: string;
  imei: string;
  modemSerie: string;
  materiales: MaterialPedido[];
};

type Fila = {
  id: string;
  hilo_id: string;
  tarea_id: string;
  odoo_id: number | null;
  nombre: string;
  estado: string;
  token: string;
  materiales: MaterialPedido[];
  chip_celular: string;
  chip_imei: string;
  modem_serie: string;
  ejecutor: string;
  reutilizada: boolean;
  telefono: string;
  reporte_clave?: string;
  reporte_huella?: string;
};

export class FabricacionServicio {
  constructor(private readonly conexiones: Conexiones) {}

  async pedir(hiloId: string, telefono: string, autor: { correo: string; nombre: string }, porWhatsapp = false): Promise<{ mensaje: string; enlace: string; orden: string }> {
    const hilo = (await listarHilos(this.conexiones.pg, await this.tareaDe(hiloId))).find((item) => item.id === hiloId);
    if (!hilo) throw new BadRequestException('Ese hilo ya no está.');
    const juicio = hiloListo(hilo);
    if (!juicio.listo) throw new BadRequestException(`El hilo no está listo para fabricar: ${juicio.falta.join('; ')}.`);
    const destino = telefono || (await this.telefonoDe(hilo.tarea_id));
    const previa = await this.porHilo(hiloId);
    if (previa && previa.estado !== 'incidente' && previa.odoo_id) {
      const enlace = this.enlace(previa.token);
      if (porWhatsapp) {
        const aviso = { ...previa, telefono: destino || previa.telefono };
        await this.avisarEnlace(aviso, `La orden ${previa.nombre} sigue en borrador.\nEl enlace para marcar los materiales va en el siguiente mensaje.`, enlace);
        await this.charla(destino || previa.telefono, previa);
      }
      return { mensaje: porWhatsapp ? 'La orden ya está abierta. Te reenvié el enlace.' : 'La orden ya está abierta.', enlace, orden: previa.nombre };
    }
    const tarea = await this.conexiones.pg.query<{ cot: string }>(`SELECT cot FROM tarea WHERE id = $1`, [hilo.tarea_id]);
    const cot = (tarea.rows[0]?.cot ?? '').split('#')[0].split('+')[0];
    const ejecutor = ejecutorDe(autor.nombre);
    const config = await this.config();
    if (!config) throw new BadRequestException('Odoo no está conectado.');
    const tomada = await tomarOrden(config, { cot, ejecutor, contenedor: hilo.contenedor ?? '', maquina: hilo.maquina ?? '' });
    if (!tomada.ok) {
      await this.nota(hilo.tarea_id, autor, 'incidente', `No se pudo abrir la orden de fabricación.\n${tomada.incidente}`);
      if (previa) await this.conexiones.pg.query(`UPDATE fabricacion SET estado = 'incidente', telefono = $2 WHERE id = $1`, [previa.id, destino]);
      throw new BadRequestException(tomada.incidente);
    }
    const token = previa?.token ?? randomUUID();
    const id = previa?.id ?? randomUUID();
    await this.conexiones.pg.query(
      `INSERT INTO fabricacion (id, hilo_id, tarea_id, odoo_id, nombre, estado, token, materiales, chip_celular, chip_imei, ejecutor, reutilizada, telefono)
       VALUES ($1, $2, $3, $4, $5, 'borrador', $6, $7::jsonb, $8, $9, $10, $11, $12)
       ON CONFLICT (hilo_id) DO UPDATE
         SET odoo_id = EXCLUDED.odoo_id, nombre = EXCLUDED.nombre, estado = 'borrador', materiales = EXCLUDED.materiales,
             chip_celular = EXCLUDED.chip_celular, chip_imei = EXCLUDED.chip_imei, ejecutor = EXCLUDED.ejecutor,
             reutilizada = EXCLUDED.reutilizada, telefono = EXCLUDED.telefono`,
      [id, hiloId, hilo.tarea_id, tomada.odooId, tomada.nombre, token, JSON.stringify(tomada.materiales), hilo.chip_celular ?? '', hilo.chip_imei ?? '', ejecutor, tomada.reutilizada, destino],
    );
    const fila = await this.porHilo(hiloId);
    const enlace = this.enlace(token);
    const origen = tomada.reutilizada ? 'Tomé un borrador de GPNDND0002 que no tenía cotización ni series.' : 'No había un borrador libre. Odoo creó la orden.';
    const texto = `${origen}\nOrden ${tomada.nombre}. Ejecutor ${ejecutor}.\nEl chip y el módem ya vienen marcados.\nEl enlace para pedir los insumos va en el siguiente mensaje.`;
    await this.nota(hilo.tarea_id, autor, 'seguimiento', `${texto}\n${enlace}`);
    if (fila && porWhatsapp) {
      await this.avisarEnlace(fila, texto, enlace);
      await this.charla(destino, fila);
    }
    return { mensaje: texto, enlace, orden: tomada.nombre };
  }

  async publica(token: string): Promise<FabricacionPublica> {
    const fila = await this.porToken(token);
    if (!fila) throw new BadRequestException('Ese enlace ya no está.');
    const tarea = await this.conexiones.pg.query<{ cot: string }>(`SELECT cot FROM tarea WHERE id = $1`, [fila.tarea_id]);
    return {
      orden: fila.nombre,
      cot: (tarea.rows[0]?.cot ?? '').split('#')[0],
      estado: fila.estado,
      chip: fila.chip_celular,
      imei: fila.chip_imei,
      modemSerie: fila.modem_serie,
      materiales: await this.nombresVisibles(fila),
    };
  }

  async proponer(token: string, entrada: { materiales?: MaterialPedido[]; modemSerie?: string }): Promise<string> {
    const fila = await this.porToken(token);
    if (!fila) throw new BadRequestException('Ese enlace ya no está.');
    if (fila.estado === 'confirmada') throw new BadRequestException('Esa orden ya está confirmada.');
    if (fila.estado === 'incidente' || !fila.odoo_id) throw new BadRequestException('Esta orden no está lista para pedir insumos.');
    const mezclados = mezclar(fila.materiales, entrada.materiales ?? []);
    const modem = (entrada.modemSerie ?? '').trim();
    const ficha = await this.fichaNota(fila.tarea_id, fila.hilo_id);
    const config = await this.config();
    if (!config || !fila.odoo_id) throw new BadRequestException('Odoo no está conectado.');
    const conNombre = await completarNombres(config, mezclados).catch(() => mezclados);
    const materiales = await aplicarSeleccion(config, fila.odoo_id, {
      cot: ficha.cot,
      ejecutor: fila.ejecutor,
      contenedor: ficha.contenedor,
      maquina: ficha.maquina,
      materiales: conNombre,
    });
    await this.conexiones.pg.query(
      `UPDATE fabricacion SET materiales = $2::jsonb, modem_serie = $3, estado = 'propuesta' WHERE id = $1`,
      [fila.id, JSON.stringify(materiales), modem],
    );
    const linea = (material: MaterialPedido) => {
      const titulo = [material.codigo, material.nombre].filter(Boolean).join(' ');
      return `${titulo}: ${material.cantidad} ${material.unidad}`.trim();
    };
    const datosNota = {
      contenedor: ficha.contenedor,
      maquina: ficha.maquina,
      chip: fila.chip_celular,
      imei: fila.chip_imei,
      modem,
      cotizacion: ficha.cotizacion,
      tecnico: fila.ejecutor,
      pedidos: materiales.filter((material) => material.pedido && material.cantidad > 0).map(linea),
    };
    const notas = notasRegistro(datosNota);
    const nota = notaInsumos(datosNota);
    try {
      await registrarConstancia(config, fila.odoo_id, {
        materiales,
        chip: { celular: fila.chip_celular, imei: fila.chip_imei },
        modemSerie: modem,
        equipo: notas.equipo,
        cotizacion: notas.cotizacion,
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No pude registrar el chip en Odoo.';
      throw new BadRequestException(mensaje);
    }
    const resumen = textoMateriales(materiales, fila.chip_celular, modem);
    const texto = `${nota}\n\n${resumen}\nEscribe ok para confirmar la orden.\nEscribe enlace si quieres modificar.`;
    await this.nota(fila.tarea_id, { correo: '', nombre: fila.ejecutor || 'Técnico' }, 'seguimiento', nota);
    await this.avisar({ ...fila, materiales, modem_serie: modem }, texto);
    await this.charla(fila.telefono, fila);
    return texto;
  }

  async asimilar(hiloId: string, odooId: number, nombre: string, autor: { correo: string; nombre: string }): Promise<string> {
    const hilos = await listarHilos(this.conexiones.pg, await this.tareaDe(hiloId));
    const hilo = hilos.find((item) => item.id === hiloId);
    if (!hilo) return 'Ese hilo ya no está.';
    const config = await this.config();
    if (!config) return 'Odoo no está conectado.';
    const ficha = await this.fichaNota(hilo.tarea_id, hiloId);
    const notas = notasRegistro({
      contenedor: ficha.contenedor,
      maquina: ficha.maquina,
      chip: hilo.chip_celular ?? '',
      imei: hilo.chip_imei ?? '',
      modem: hilo.modem_serie ?? '',
      cotizacion: ficha.cotizacion,
      tecnico: autor.nombre,
      pedidos: [],
    });
    try {
      await registrarConstancia(config, odooId, {
        materiales: [],
        chip: { celular: hilo.chip_celular ?? '', imei: hilo.chip_imei ?? '' },
        modemSerie: hilo.modem_serie ?? '',
        equipo: notas.equipo,
        cotizacion: notas.cotizacion,
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'Odoo no guardó las notas.';
      return `El chip coincide, pero no pude dejar las notas en ${nombre}.\n${mensaje}`;
    }
    const previa = await this.porHilo(hiloId);
    if (!previa) {
      await this.conexiones.pg.query(
        `INSERT INTO fabricacion (id, hilo_id, tarea_id, odoo_id, nombre, estado, token, materiales, chip_celular, chip_imei, modem_serie, ejecutor, reutilizada, telefono)
         VALUES ($1, $2, $3, $4, $5, 'confirmada', $6, '[]'::jsonb, $7, $8, $9, $10, false, $11)`,
        [randomUUID(), hiloId, hilo.tarea_id, odooId, nombre, randomUUID(), hilo.chip_celular ?? '', hilo.chip_imei ?? '', hilo.modem_serie ?? '', autor.nombre, ''],
      );
    }
    const texto = `Se asimiló ${nombre}. El chip ${hilo.chip_celular || hilo.chip_imei} coincide con la orden. La aprobación quedó en las notas.`;
    await this.nota(hilo.tarea_id, autor, 'seguimiento', `${notas.equipo}\n\n${notas.cotizacion}\n\n${texto}`);
    return texto;
  }

  async confirmar(fabricacionId: string): Promise<string> {
    const fila = await this.porId(fabricacionId);
    if (!fila) return 'Esa orden ya no está.';
    if (fila.estado === 'confirmada') return `La orden ${fila.nombre} ya está confirmada.`;
    if (!fila.odoo_id || fila.estado === 'incidente') return 'Esta orden no se puede confirmar.';
    if (fila.estado !== 'propuesta') return 'Primero abre el enlace y marca los materiales.';
    const config = await this.config();
    if (!config) return 'Odoo no está conectado.';
    try {
      await confirmarOrden(config, fila.odoo_id, fila.materiales, { celular: fila.chip_celular, imei: fila.chip_imei }, fila.modem_serie);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'Odoo no confirmó la orden.';
      return `No pude confirmar ${fila.nombre}.\n${mensaje}\nEscribe enlace si quieres revisar los materiales.`;
    }
    await this.conexiones.pg.query(`UPDATE fabricacion SET estado = 'confirmada' WHERE id = $1`, [fila.id]);
    const pedidos = fila.materiales.filter((material) => material.pedido && material.cantidad > 0).map((material) => material.moveId);
    try {
      await marcarConsumido(config, pedidos);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No pude marcar los componentes.';
      return `La orden ${fila.nombre} quedó confirmada.\n${mensaje}`;
    }
    const texto = `La orden ${fila.nombre} quedó confirmada.\nLos componentes que pediste quedaron marcados como consumidos. No se produjo.`;
    await this.nota(fila.tarea_id, { correo: '', nombre: 'Técnico' }, 'seguimiento', texto);
    return texto;
  }

  async pedirReporte(hiloId: string): Promise<string> {
    const fila = await this.porHilo(hiloId);
    if (!fila?.odoo_id || fila.estado === 'incidente') return 'Todavía no hay una orden de fabricación. Pide el insumo con 1.';
    const telefono = fila.telefono || (await this.telefonoDe(fila.tarea_id));
    if (!telefono) return `La orden ${fila.nombre} está, pero no hay un WhatsApp del técnico para mandar el reporte.`;
    const huella = huellaConsumidos(fila.materiales);
    const destino = await this.enlazarReportePrevio({ ...fila, telefono }, huella);
    if (await this.reporteGuardado(destino, huella)) {
      await this.publicarPdf(destino, destino.reporte_clave ?? '');
      const texto = `Te mando el reporte de ${fila.nombre} que ya está guardado.`;
      await this.nota(fila.tarea_id, { correo: '', nombre: fila.ejecutor || 'Técnico' }, 'seguimiento', texto);
      return texto;
    }
    const config = await this.config();
    if (!config?.sesion) return 'Falta el usuario y la clave normal de Odoo para bajar el reporte. Se cargan en Odoo, en Usuario del reporte y Clave del reporte.';
    try {
      const estado = await estadoDeOrden(config, fila.odoo_id);
      if (estado === 'draft') return `La orden ${fila.nombre} sigue en borrador. Confírmala con 3 y después pide el PDF con 4.`;
      if (!estado || estado === 'cancel') return `La orden ${fila.nombre} no está confirmada.`;
      if (estado === 'confirmed' || estado === 'progress') {
        const pedidos = fila.materiales.filter((material) => material.pedido && material.cantidad > 0).map((material) => material.moveId);
        await marcarConsumido(config, pedidos);
      }
      const pdf = await pdfDeOrden(config, fila.odoo_id);
      const clave = `fabricacion/${fila.id}/reporte.pdf`;
      await new AlmacenCorreo(this.conexiones).guardar(clave, pdf, 'application/pdf');
      await this.conexiones.pg.query(`UPDATE fabricacion SET reporte_clave = $2, reporte_huella = $3 WHERE id = $1`, [fila.id, clave, huella]);
      await this.publicarPdf(destino, clave);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No pude bajar el reporte.';
      return `No pude bajar el reporte de ${fila.nombre}.\n${mensaje}`;
    }
    const texto = `Te mando el reporte de ${fila.nombre}.`;
    await this.nota(fila.tarea_id, { correo: '', nombre: fila.ejecutor || 'Técnico' }, 'seguimiento', texto);
    return texto;
  }

  async reenviar(fabricacionId: string): Promise<string> {
    const fila = await this.porId(fabricacionId);
    if (!fila) return 'Esa orden ya no está.';
    if (fila.estado === 'confirmada') return `La orden ${fila.nombre} ya está confirmada.`;
    const enlace = this.enlace(fila.token);
    const texto = `Te dejo otra vez el enlace de ${fila.nombre}. Va en el siguiente mensaje.`;
    await this.avisarEnlace(fila, texto, enlace);
    return texto;
  }

  async vista(hiloId: string): Promise<{ nombre: string; estado: string; borrador: boolean; lineas: string[] } | null> {
    const fila = await this.porHilo(hiloId);
    if (!fila?.odoo_id || fila.estado === 'incidente') return null;
    const lineas = fila.materiales
      .filter((material) => material.pedido && material.cantidad > 0)
      .map((material) => `${material.codigo}${material.nombre ? ` ${material.nombre}` : ''} × ${material.cantidad}`);
    return { nombre: fila.nombre, estado: fila.estado, borrador: fila.estado === 'borrador' || fila.estado === 'propuesta', lineas };
  }

  async deTarea(tareaId: string): Promise<Array<{ hiloId: string; orden: string; estado: string; enlace: string; ejecutor: string }>> {
    const filas = await this.conexiones.pg.query<{ hilo_id: string; nombre: string; estado: string; token: string; ejecutor: string }>(
      `SELECT hilo_id, nombre, estado, token, ejecutor FROM fabricacion WHERE tarea_id = $1`,
      [tareaId],
    );
    return filas.rows.map((fila) => ({ hiloId: fila.hilo_id, orden: fila.nombre, estado: fila.estado, enlace: this.enlace(fila.token), ejecutor: fila.ejecutor }));
  }

  private async nombresVisibles(fila: Fila): Promise<MaterialPedido[]> {
    const config = await this.config();
    if (!config) return fila.materiales;
    try {
      return await completarNombres(config, fila.materiales);
    } catch {
      return fila.materiales;
    }
  }

  private async fichaNota(tareaId: string, hiloId: string): Promise<{ cot: string; contenedor: string; maquina: string; cotizacion: string[] }> {
    const fila = await this.conexiones.pg.query<{
      cot: string;
      cliente: string | null;
      lugar: string | null;
      producto: string | null;
      temperatura: string | null;
      cantidad: number | null;
      cita_fecha: string | null;
      cita_hora: string | null;
      cita_direccion: string | null;
      comercial_nombre: string | null;
      descripcion: string | null;
      contenedor: string | null;
      maquina: string | null;
    }>(
      `SELECT t.cot, t.cliente, t.lugar, t.producto, t.temperatura, t.cantidad,
              to_char(t.cita_fecha, 'DD/MM/YYYY') AS cita_fecha, t.cita_hora, t.cita_direccion,
              t.comercial_nombre, t.descripcion, h.contenedor, h.maquina
       FROM tarea t
       LEFT JOIN hilo_atencion h ON h.id = $2
       WHERE t.id = $1`,
      [tareaId, hiloId],
    );
    const tarea = fila.rows[0];
    const cot = (tarea?.cot ?? '').split('#')[0].split('+')[0];
    const cita = [tarea?.cita_fecha, tarea?.cita_hora].filter(Boolean).join(' ');
    const cotizacion = [
      cot ? `Cotización ${cot}` : '',
      tarea?.cliente ? `Cliente ${tarea.cliente}` : '',
      tarea?.lugar ? `Lugar ${tarea.lugar}` : '',
      tarea?.cita_direccion ? `Dirección ${tarea.cita_direccion}` : '',
      cita ? `Cita ${cita}` : '',
      tarea?.producto ? `Producto ${tarea.producto}` : '',
      tarea?.temperatura ? `Temperatura ${tarea.temperatura}` : '',
      tarea?.cantidad ? `Cantidad ${tarea.cantidad}` : '',
      tarea?.comercial_nombre ? `Comercial ${tarea.comercial_nombre}` : '',
      tarea?.descripcion ? `Detalle ${tarea.descripcion}` : '',
    ].filter(Boolean);
    return { cot, contenedor: tarea?.contenedor ?? '', maquina: tarea?.maquina ?? '', cotizacion };
  }

  private enlace(token: string): string {
    return `${leerConfiguracion().webOrigin}/?materiales=${token}`;
  }

  private async config(): Promise<LecturaOdoo | null> {
    const fila = await this.conexiones.pg.query<{ url: string; db: string; usuario: string; clave: string; sesion_usuario: string; sesion_clave: string }>(
      `SELECT url, db, usuario, clave, sesion_usuario, sesion_clave FROM configuracion_odoo WHERE id = true`,
    );
    const guardada = fila.rows[0];
    if (guardada?.clave) {
      const sesionUsuario = (guardada.sesion_usuario ?? '').trim();
      const sesionClave = (guardada.sesion_clave ?? '').trim();
      return {
        url: guardada.url.replace(/\/$/, ''),
        db: guardada.db,
        usuario: guardada.usuario,
        clave: guardada.clave,
        venta: { modelo: 'sale.order', campo: 'name' },
        tarea: { modelo: 'project.task' },
        ...(sesionUsuario && sesionClave ? { sesion: { usuario: sesionUsuario, clave: sesionClave } } : {}),
      };
    }
    return leerConfiguracion().odoo;
  }

  private async telefonoDe(tareaId: string): Promise<string> {
    const fila = await this.conexiones.pg.query<{ telefono: string | null }>(
      `SELECT usuario.telefono FROM tarea JOIN usuario ON usuario.correo = tarea.responsable_correo WHERE tarea.id = $1`,
      [tareaId],
    );
    return (fila.rows[0]?.telefono ?? '').trim();
  }

  private async tareaDe(hiloId: string): Promise<string> {
    const fila = await this.conexiones.pg.query<{ tarea_id: string }>(`SELECT tarea_id FROM hilo_atencion WHERE id = $1`, [hiloId]);
    return fila.rows[0]?.tarea_id ?? '';
  }

  private async porHilo(hiloId: string): Promise<Fila | null> {
    return this.una(`SELECT * FROM fabricacion WHERE hilo_id = $1`, [hiloId]);
  }

  private async porToken(token: string): Promise<Fila | null> {
    return this.una(`SELECT * FROM fabricacion WHERE token = $1`, [token]);
  }

  private async porId(id: string): Promise<Fila | null> {
    return this.una(`SELECT * FROM fabricacion WHERE id = $1`, [id]);
  }

  private async una(sql: string, valores: unknown[]): Promise<Fila | null> {
    const filas = await this.conexiones.pg.query<Fila>(sql, valores);
    const fila = filas.rows[0];
    if (!fila) return null;
    const materiales = Array.isArray(fila.materiales) ? fila.materiales : [];
    return { ...fila, materiales };
  }

  private async nota(tareaId: string, autor: { correo: string; nombre: string }, tipo: 'seguimiento' | 'incidente', texto: string): Promise<void> {
    await this.conexiones.pg.query(
      `INSERT INTO nota_bitacora (id, tarea_id, tipo, canal, texto, autor_correo, autor_nombre) VALUES ($1, $2, $3, 'web', $4, $5, $6)`,
      [randomUUID(), tareaId, tipo, texto, autor.correo, autor.nombre],
    );
  }

  private async avisarEnlace(fila: Fila, texto: string, enlace: string): Promise<void> {
    await this.avisar(fila, texto);
    await this.avisar(fila, enlace.replace('://localhost:', '://127.0.0.1:').replace('://localhost/', '://127.0.0.1/'));
  }

  private async enlazarReportePrevio(fila: Fila, huella: string): Promise<Fila> {
    if (fila.reporte_clave?.trim()) return fila;
    const previa = await this.conexiones.pg.query<{ clave: string }>(
      `SELECT a.clave
       FROM aviso_adjunto a
       JOIN aviso v ON v.id = a.aviso_id
       WHERE a.mime = 'application/pdf' AND a.clave LIKE $1
       ORDER BY v.creado_en DESC
       LIMIT 1`,
      [`fabricacion/${fila.id}/%`],
    );
    const clave = previa.rows[0]?.clave ?? '';
    if (!clave) return fila;
    await this.conexiones.pg.query(
      `UPDATE fabricacion SET reporte_clave = $2, reporte_huella = $3 WHERE id = $1 AND reporte_clave = ''`,
      [fila.id, clave, huella],
    );
    return { ...fila, reporte_clave: clave, reporte_huella: huella };
  }

  private async reporteGuardado(fila: Fila, huella: string): Promise<boolean> {
    const clave = fila.reporte_clave?.trim() ?? '';
    if (!clave || fila.reporte_huella !== huella) return false;
    try {
      const bytes = await new AlmacenCorreo(this.conexiones).leer(clave);
      return bytes.subarray(0, 5).toString() === '%PDF-';
    } catch {
      return false;
    }
  }

  private async publicarPdf(fila: Fila, clave: string): Promise<void> {
    const avisoId = randomUUID();
    const nombre = `Produccion - ${fila.nombre.replaceAll('/', '-')}.pdf`;
    await this.conexiones.pg.query(
      `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes) VALUES ($1, 'fabricacion', $2, $3, $4, 'pendiente', now())`,
      [avisoId, fila.tarea_id, fila.telefono, `Reporte de orden de producción ${fila.nombre}.`],
    );
    await this.conexiones.pg.query(
      `INSERT INTO aviso_adjunto (id, aviso_id, clave, mime, nombre, orden) VALUES ($1, $2, $3, 'application/pdf', $4, 0)`,
      [randomUUID(), avisoId, clave, nombre],
    );
  }

  private async avisar(fila: Fila, texto: string): Promise<void> {
    if (!fila.telefono) return;
    await this.conexiones.pg.query(
      `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes) VALUES ($1, 'fabricacion', $2, $3, $4, 'pendiente', now())`,
      [randomUUID(), fila.tarea_id, fila.telefono, texto],
    );
  }

  private async charla(telefono: string, fila: Fila): Promise<void> {
    if (!telefono) return;
    await this.conexiones.pg.query(
      `INSERT INTO charla (telefono, paso, tarea_id, lista, pendiente, actualizado_en)
       VALUES ($1, 'fabricacion', $2, '[]'::jsonb, $3::jsonb, now())
       ON CONFLICT (telefono) DO UPDATE
         SET paso = 'fabricacion', tarea_id = EXCLUDED.tarea_id, lista = '[]'::jsonb, pendiente = EXCLUDED.pendiente, actualizado_en = now()`,
      [telefono, fila.tarea_id, JSON.stringify({ hiloId: fila.hilo_id, fabricacionId: fila.id })],
    );
  }
}

function mezclar(actuales: MaterialPedido[], recibidos: MaterialPedido[]): MaterialPedido[] {
  const porId = new Map(recibidos.map((material) => [material.moveId, material]));
  return actuales.map((material) => {
    const nuevo = porId.get(material.moveId);
    if (!nuevo) return material;
    const cantidad = Number(nuevo.cantidad);
    return { ...material, pedido: Boolean(nuevo.pedido), cantidad: Number.isFinite(cantidad) && cantidad >= 0 ? cantidad : material.cantidad };
  });
}
