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