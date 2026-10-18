CREATE TABLE IF NOT EXISTS habilitado (
  clase text NOT NULL CHECK (clase IN ('tarea', 'interno', 'decision')),
  clave text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clase, clave)
);
