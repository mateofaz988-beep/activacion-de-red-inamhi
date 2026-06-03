-- =====================================================
-- MÓDULO FIRMA ELECTRÓNICA - TABLAS NUEVAS
-- Base de datos: inamhi_liberacion_web
-- =====================================================

USE inamhi_liberacion_web;

-- =====================================================
-- TABLA: firmas_digitales
-- Registro de cada firma criptográfica aplicada a un PDF
-- =====================================================

CREATE TABLE IF NOT EXISTS firmas_digitales (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id    INT NOT NULL,
    documento_id    INT NULL,
    usuario_id      INT NOT NULL,
    rol_firmante    VARCHAR(50) NOT NULL,
    etapa           VARCHAR(50) NOT NULL,
    modo_firma      ENUM('pyhanko','firmaec') NOT NULL DEFAULT 'pyhanko',

    -- Certificado
    subject_cn      VARCHAR(255) NULL,
    subject_o       VARCHAR(255) NULL,
    issuer_cn       VARCHAR(255) NULL,
    numero_serie    VARCHAR(255) NULL,
    fecha_emision   DATE NULL,
    fecha_expiracion DATE NULL,

    -- Documento
    nombre_pdf_entrada  VARCHAR(255) NOT NULL,
    nombre_pdf_firmado  VARCHAR(255) NOT NULL,
    ruta_pdf_firmado    VARCHAR(512) NOT NULL,
    hash_sha256_antes   VARCHAR(64) NULL,
    hash_sha256_despues VARCHAR(64) NULL,

    -- Resultado
    firma_valida        TINYINT(1) NOT NULL DEFAULT 0,
    resultado_validacion TEXT NULL,
    observacion         VARCHAR(1000) NULL,
    ip_cliente          VARCHAR(45) NULL,

    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_solicitud   (solicitud_id),
    INDEX idx_usuario     (usuario_id),
    INDEX idx_etapa       (etapa),
    INDEX idx_modo        (modo_firma)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- TABLA: auditoria_firmas
-- Log completo e inmutable de cada operación de firma
-- =====================================================

CREATE TABLE IF NOT EXISTS auditoria_firmas (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id    INT NOT NULL,
    firma_id        INT NULL,
    usuario_id      INT NOT NULL,
    rol             VARCHAR(50) NOT NULL,
    ip_cliente      VARCHAR(45) NULL,
    accion          VARCHAR(100) NOT NULL,

    -- Certificado
    subject_cn      VARCHAR(255) NULL,
    numero_serie    VARCHAR(255) NULL,
    issuer_cn       VARCHAR(255) NULL,

    -- Hashes
    hash_sha256_antes   VARCHAR(64) NULL,
    hash_sha256_despues VARCHAR(64) NULL,

    -- Resultado
    resultado       ENUM('exito','error','rechazado') NOT NULL DEFAULT 'exito',
    detalle         TEXT NULL,
    observacion     VARCHAR(1000) NULL,

    fecha           DATE NOT NULL,
    hora            TIME NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_solicitud   (solicitud_id),
    INDEX idx_usuario     (usuario_id),
    INDEX idx_accion      (accion),
    INDEX idx_resultado   (resultado),
    INDEX idx_fecha       (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- TABLA: versiones_documento
-- Versionamiento completo: nunca se sobrescribe un PDF
-- =====================================================

CREATE TABLE IF NOT EXISTS versiones_documento (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id    INT NOT NULL,
    firma_id        INT NULL,
    usuario_id      INT NULL,
    version         INT NOT NULL DEFAULT 1,
    etapa           VARCHAR(50) NOT NULL,
    rol_firmante    VARCHAR(50) NULL,
    tipo            VARCHAR(50) NOT NULL,
    nombre_archivo  VARCHAR(255) NOT NULL,
    ruta_archivo    VARCHAR(512) NOT NULL,
    hash_sha256     VARCHAR(64) NULL,
    tamano_bytes    INT NULL,
    es_version_actual TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_solicitud   (solicitud_id),
    INDEX idx_version     (version),
    INDEX idx_actual      (es_version_actual)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
