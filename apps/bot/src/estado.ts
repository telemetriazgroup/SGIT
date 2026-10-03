export type EstadoBot = 'esperando_qr' | 'listo' | 'desconectado';

export type SumideroEstado = {
  actualizar(estado: EstadoBot, qr?: string): Promise<void> | void;
};

type Emisor = {
  on(evento: 'qr', oyente: (qr: string) => void): void;
  on(evento: 'ready', oyente: () => void): void;
  on(evento: 'disconnected', oyente: () => void): void;
};

export function enlazarEstado(cliente: Emisor, sumidero: SumideroEstado): void {
  cliente.on('qr', (qr) => {
    void sumidero.actualizar('esperando_qr', qr);
  });
  cliente.on('ready', () => {
    void sumidero.actualizar('listo');
  });
  cliente.on('disconnected', () => {
    void sumidero.actualizar('desconectado');
  });
}
