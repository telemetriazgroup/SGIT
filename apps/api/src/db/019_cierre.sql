ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_estado;
ALTER TABLE tarea ADD CONSTRAINT tarea_estado
  CHECK (estado IN ('detectada', 'en_seguimiento', 'en_validacion', 'resuelta'));

ALTER TABLE nota_bitacora DROP CONSTRAINT IF EXISTS nota_bitacora_tipo_check;
ALTER TABLE nota_bitacora ADD CONSTRAINT nota_bitacora_tipo_check
  CHECK (tipo IN ('seguimiento', 'incidente', 'anulacion', 'cierre'));

ALTER TABLE nota_bitacora ADD COLUMN IF NOT EXISTS gmail_thread_id text;

ALTER TABLE decision_hilo DROP CONSTRAINT IF EXISTS decision_hilo_destino;
ALTER TABLE decision_hilo ADD CONSTRAINT decision_hilo_destino
  CHECK (destino IN ('otros', 'interna', 'archivado', 'evento', 'resuelto'));

ALTER TABLE decision_hilo ADD COLUMN IF NOT EXISTS motivo text NOT NULL DEFAULT '';
ALTER TABLE decision_hilo ADD COLUMN IF NOT EXISTS archivo_clave text;
ALTER TABLE decision_hilo ADD COLUMN IF NOT EXISTS archivo_nombre text;
ALTER TABLE decision_hilo ADD COLUMN IF NOT EXISTS archivo_mime text;

ALTER TABLE asunto_interno ADD COLUMN IF NOT EXISTS archivo_clave text;
ALTER TABLE asunto_interno ADD COLUMN IF NOT EXISTS archivo_nombre text;
ALTER TABLE asunto_interno ADD COLUMN IF NOT EXISTS archivo_mime text;

ALTER TABLE asunto_interno DROP CONSTRAINT IF EXISTS asunto_interno_estado;
ALTER TABLE asunto_interno ADD CONSTRAINT asunto_interno_estado
  CHECK (estado IN ('por_atender', 'atendido', 'resuelto'));
