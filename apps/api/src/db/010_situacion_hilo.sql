CREATE TABLE IF NOT EXISTS situacion_hilo (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  mensaje_id uuid NOT NULL UNIQUE REFERENCES mensaje_correo (id),
  tipo text NOT NULL,
  resumen text NOT NULL DEFAULT '',
  cita_anterior jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT situacion_hilo_tipo CHECK (tipo IN ('origen', 'informativa', 'reprogramacion'))
);

CREATE INDEX IF NOT EXISTS situacion_hilo_tarea ON situacion_hilo (tarea_id, creado_en);
CREATE UNIQUE INDEX IF NOT EXISTS situacion_hilo_mensaje ON situacion_hilo (mensaje_id);

ALTER TABLE tarea ADD COLUMN IF NOT EXISTS campos_corregidos text[] NOT NULL DEFAULT '{}';

ALTER TABLE decision_hilo DROP CONSTRAINT IF EXISTS decision_hilo_destino;
ALTER TABLE decision_hilo ADD CONSTRAINT decision_hilo_destino
  CHECK (destino IN ('otros', 'interna', 'archivado', 'evento', 'resuelto'));
