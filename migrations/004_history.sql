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
