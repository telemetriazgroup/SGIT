CREATE TABLE IF NOT EXISTS genset_dispositivo (
  imei text PRIMARY KEY,
  estado integer NOT NULL DEFAULT 0,
  fecha timestamptz,
  tipo text NOT NULL DEFAULT '',
  ultimo_dato timestamptz,
  last_ip text,
  secured boolean NOT NULL DEFAULT false,
  presente boolean NOT NULL DEFAULT true,
  visto_en timestamptz NOT NULL DEFAULT now(),
  consultado_en timestamptz,
  consultado_por text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS genset_dispositivo_ultimo ON genset_dispositivo (ultimo_dato DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS genset_trama (
  id uuid PRIMARY KEY,
  imei text NOT NULL REFERENCES genset_dispositivo (imei) ON DELETE CASCADE,
  firma text NOT NULL,
  consultado_en timestamptz NOT NULL DEFAULT now(),
  consultado_por text NOT NULL DEFAULT '',
  crudo jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS genset_trama_imei ON genset_trama (imei, consultado_en DESC);

CREATE TABLE IF NOT EXISTS genset_lista (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  consultado_en timestamptz,
  coleccion text NOT NULL DEFAULT '',
  mes integer,
  anio integer,
  total integer NOT NULL DEFAULT 0,
  aviso text NOT NULL DEFAULT ''
);
