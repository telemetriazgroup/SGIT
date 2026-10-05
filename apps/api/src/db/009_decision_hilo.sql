CREATE TABLE IF NOT EXISTS decision_hilo (
  gmail_thread_id text PRIMARY KEY,
  destino text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decision_hilo_destino CHECK (destino IN ('otros', 'interna', 'archivado'))
);
