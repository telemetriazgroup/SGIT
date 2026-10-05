ALTER TABLE usuario ADD COLUMN IF NOT EXISTS telefono text;

CREATE UNIQUE INDEX IF NOT EXISTS usuario_telefono
  ON usuario (telefono)
  WHERE telefono IS NOT NULL AND telefono <> '';

CREATE TABLE IF NOT EXISTS aviso (
  id uuid PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('tarea_nueva', 'reprogramacion')),
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  destino text NOT NULL,
  cuerpo text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('pendiente', 'enviado')),
  no_enviar_antes timestamptz NOT NULL,
  enviado_en timestamptz,
  mensaje_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS aviso_tarea_nueva
  ON aviso (tarea_id, destino)
  WHERE tipo = 'tarea_nueva';

CREATE UNIQUE INDEX IF NOT EXISTS aviso_reprogramacion
  ON aviso (mensaje_id, destino)
  WHERE tipo = 'reprogramacion' AND mensaje_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sesion_bot (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estado text NOT NULL CHECK (estado IN ('esperando_qr', 'listo', 'desconectado')),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_en timestamptz
);

INSERT INTO sesion_bot (id, estado)
VALUES (1, 'desconectado')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS lider_bot (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dueno text NOT NULL,
  vence_en timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS charla (
  telefono text PRIMARY KEY,
  paso text NOT NULL CHECK (paso IN ('menu', 'recientes', 'busca', 'confirma', 'resultados', 'cot', 'pregunta_imagen', 'espera_imagen', 'nota', 'pregunta_resumen', 'resumen', 'detalle')),
  tarea_id uuid,
  lista jsonb NOT NULL DEFAULT '[]',
  pendiente jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
