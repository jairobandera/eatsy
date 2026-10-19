-- Esquema de AutoPedido 2.0 (MySQL 8 / MariaDB 10.4+)
-- utf8mb4_unicode_ci: comparaciones y búsquedas sin distinguir mayúsculas ni tildes.
-- Las fechas se guardan en la hora local del negocio (APP_TIMEZONE).

CREATE TABLE IF NOT EXISTS usuarios (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  contrasena  VARCHAR(255) NOT NULL,
  rol         ENUM('Administrador', 'Cajero', 'Cocina', 'Cliente') NOT NULL,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  INDEX idx_usuarios_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(50)  NOT NULL,
  apellido    VARCHAR(50)  NOT NULL,
  cedula      VARCHAR(20)  NOT NULL,
  telefono    VARCHAR(20)  NULL,
  puntos      INT          NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  UNIQUE KEY uq_clientes_cedula (cedula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingredientes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  descripcion VARCHAR(500) NOT NULL DEFAULT '',
  precio_extra DECIMAL(10,2) NULL,              -- precio por unidad extra (NULL = no se ofrece)
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(255)  NOT NULL,
  descripcion TEXT          NOT NULL,
  precio      DECIMAL(10,2) NOT NULL,
  imagen      VARCHAR(500)  NOT NULL,
  activo      TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL,
  updated_at  DATETIME      NOT NULL,
  CONSTRAINT chk_productos_precio CHECK (precio >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categoria_producto (
  producto_id  INT UNSIGNED NOT NULL,
  categoria_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (producto_id, categoria_id),
  CONSTRAINT fk_cp_producto  FOREIGN KEY (producto_id)  REFERENCES productos(id)  ON DELETE CASCADE,
  CONSTRAINT fk_cp_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingrediente_producto (
  producto_id    INT UNSIGNED NOT NULL,
  ingrediente_id INT UNSIGNED NOT NULL,
  es_obligatorio TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (producto_id, ingrediente_id),
  CONSTRAINT fk_ip_producto    FOREIGN KEY (producto_id)    REFERENCES productos(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ip_ingrediente FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promociones (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(255)  NOT NULL,
  tipo_descuento ENUM('porcentaje', 'monto') NOT NULL DEFAULT 'porcentaje',
  descuento      DECIMAL(10,2) NOT NULL,
  codigo         VARCHAR(50)   NULL,
  fecha_inicio   DATE          NULL,
  fecha_fin      DATE          NULL,
  activo         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at     DATETIME      NOT NULL,
  updated_at     DATETIME      NOT NULL,
  CONSTRAINT chk_promociones_descuento CHECK (descuento >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS producto_promocion (
  producto_id  INT UNSIGNED NOT NULL,
  promocion_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (producto_id, promocion_id),
  CONSTRAINT fk_pp_producto  FOREIGN KEY (producto_id)  REFERENCES productos(id)   ON DELETE CASCADE,
  CONSTRAINT fk_pp_promocion FOREIGN KEY (promocion_id) REFERENCES promociones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pedidos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED  NOT NULL,
  cliente_id  INT UNSIGNED  NULL,
  promocion_id    INT UNSIGNED  NULL,            -- cupón aplicado (promoción con código)
  cupon_codigo    VARCHAR(30)   NULL,
  descuento_cupon DECIMAL(10,2) NOT NULL DEFAULT 0,
  origen      ENUM('Caja', 'Kiosco') NOT NULL,
  total       DECIMAL(10,2) NOT NULL DEFAULT 0,
  metodo_pago ENUM('Efectivo', 'Tarjeta') NOT NULL,
  estado      ENUM('Cancelado', 'Recibido', 'En Preparacion', 'Listo', 'Entregado') NOT NULL,
  codigo      VARCHAR(20)   NOT NULL,
  created_at  DATETIME      NOT NULL,
  updated_at  DATETIME      NOT NULL,
  UNIQUE KEY uq_pedidos_codigo (codigo),
  INDEX idx_pedidos_estado (estado),
  INDEX idx_pedidos_created (created_at),
  INDEX idx_pedidos_updated (updated_at),
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id       INT UNSIGNED  NOT NULL,
  producto_id     INT UNSIGNED  NOT NULL,
  cantidad        INT UNSIGNED  NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  descuento       DECIMAL(10,2) NOT NULL DEFAULT 0,
  subtotal        DECIMAL(10,2) NOT NULL,
  created_at      DATETIME      NOT NULL,
  CONSTRAINT fk_dp_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedidos(id)   ON DELETE CASCADE,
  CONSTRAINT fk_dp_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT chk_dp_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS detalle_pedido_ingrediente_quitado (
  detalle_pedido_id INT UNSIGNED NOT NULL,
  ingrediente_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (detalle_pedido_id, ingrediente_id),
  CONSTRAINT fk_dpiq_detalle     FOREIGN KEY (detalle_pedido_id) REFERENCES detalle_pedido(id) ON DELETE CASCADE,
  CONSTRAINT fk_dpiq_ingrediente FOREIGN KEY (ingrediente_id)    REFERENCES ingredientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS detalle_pedido_ingrediente_extra (
  detalle_pedido_id INT UNSIGNED  NOT NULL,
  ingrediente_id    INT UNSIGNED  NOT NULL,
  cantidad          INT UNSIGNED  NOT NULL,
  precio_unitario   DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (detalle_pedido_id, ingrediente_id),
  CONSTRAINT fk_dpie_detalle     FOREIGN KEY (detalle_pedido_id) REFERENCES detalle_pedido(id) ON DELETE CASCADE,
  CONSTRAINT fk_dpie_ingrediente FOREIGN KEY (ingrediente_id)    REFERENCES ingredientes(id),
  CONSTRAINT chk_dpie_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id   INT UNSIGNED  NOT NULL,
  tipo        ENUM('Efectivo', 'Tarjeta') NOT NULL,
  monto       DECIMAL(10,2) NOT NULL,
  fecha       DATETIME      NOT NULL,
  estado      ENUM('Completado', 'Pendiente', 'Fallido') NOT NULL,
  created_at  DATETIME      NOT NULL,
  updated_at  DATETIME      NOT NULL,
  UNIQUE KEY uq_pagos_pedido (pedido_id),
  INDEX idx_pagos_fecha (fecha),
  CONSTRAINT fk_pagos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS punto_pedido (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id  INT UNSIGNED NOT NULL,
  pedido_id   INT UNSIGNED NOT NULL,
  cantidad    INT          NOT NULL,
  tipo        ENUM('Canjeo', 'Redencion') NOT NULL,
  fecha       DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL,
  UNIQUE KEY uq_punto_pedido (pedido_id, tipo),
  CONSTRAINT fk_ptp_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_ptp_pedido  FOREIGN KEY (pedido_id)  REFERENCES pedidos(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reglas_puntos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  monto_min   DECIMAL(10,2) NOT NULL,
  monto_max   DECIMAL(10,2) NOT NULL,
  puntos_base INT UNSIGNED  NOT NULL,
  created_at  DATETIME      NOT NULL,
  updated_at  DATETIME      NOT NULL,
  CONSTRAINT chk_reglas_rango CHECK (monto_max > monto_min AND monto_min >= 0),
  CONSTRAINT chk_reglas_puntos CHECK (puntos_base >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
