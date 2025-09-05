DROP DATABASE IF EXISTS skycare;
CREATE DATABASE skycare CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE skycare;

-- =========================
-- ROLES
-- =========================
CREATE TABLE IF NOT EXISTS roles (
  id   TINYINT UNSIGNED PRIMARY KEY,
  slug VARCHAR(30) NOT NULL UNIQUE,   -- 'admin', 'customer'
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO roles (id, slug, name) VALUES
  (1, 'admin',    'Administrador'),
  (2, 'customer', 'Cliente');

-- =========================
-- USERS (con rol)
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100)  NOT NULL,
  email          VARCHAR(150)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255)  NOT NULL,
  role_id        TINYINT UNSIGNED NOT NULL DEFAULT 2,  -- 2 = customer
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role_id),
  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- COMPANIES (propietario user)
-- =============================
CREATE TABLE IF NOT EXISTS companies (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT           NOT NULL,
  name       VARCHAR(200)  NOT NULL,
  activity   VARCHAR(200)  NOT NULL,
  address    VARCHAR(255)  NULL,
  lat        DECIMAL(10,7) NOT NULL,
  lon        DECIMAL(10,7) NOT NULL,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_companies_user (user_id),
  INDEX idx_companies_lat_lon (lat, lon),
  CONSTRAINT fk_companies_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================
-- HISTORIAL (consultas IA)
-- ==========================
CREATE TABLE IF NOT EXISTS historial (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT         NOT NULL,
  company_id  INT         NOT NULL,
  ts          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  prompt      LONGTEXT    NOT NULL,
  schedule    JSON        NULL,   -- si usas MariaDB sin JSON: usar LONGTEXT
  response    LONGTEXT    NOT NULL,
  INDEX idx_hist_user_company_ts (user_id, company_id, ts),
  CONSTRAINT fk_hist_user
    FOREIGN KEY (user_id)    REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hist_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================
-- SEED: Admin quemado
--   email:    admin@gmail.com
--   password: admin123
-- ==========================
INSERT INTO users (name, email, password_hash, role_id)
VALUES (
  'Admin',
  'admin@gmail.com',
  '$2b$12$NK7bRgnSzedNOWr38JrtkeSulp.wS6JnSERC9N.WQoEuAj6gayA/y', -- bcrypt de "admin123"
  1  -- admin
);
