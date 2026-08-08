USE campaign;

CREATE TABLE IF NOT EXISTS image_library (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    advertiser_id INT NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    description TEXT,
    tags VARCHAR(500),
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_image_library_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
    INDEX idx_image_library_advertiser_date (advertiser_id, uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    advertiser_id INT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    campaign_id VARCHAR(12),
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    CONSTRAINT fk_notifications_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
    INDEX idx_notifications_advertiser_date (advertiser_id, created_at),
    INDEX idx_notifications_unread (advertiser_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervisor_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    campaign_id VARCHAR(12),
    advertiser_id INT,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    INDEX idx_supervisor_notifications_date (created_at),
    INDEX idx_supervisor_notifications_unread (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP FUNCTION IF EXISTS fn_decrypt;
DROP FUNCTION IF EXISTS fn_encrypt;

DELIMITER ;;
CREATE DEFINER='advertiser'@'localhost' FUNCTION fn_decrypt(p_data TEXT)
RETURNS TEXT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          CONVERT(AES_DECRYPT(FROM_BASE64(p_data), SHA2('change_me_encrypt_key', 256)) USING utf8mb4));;

CREATE DEFINER='advertiser'@'localhost' FUNCTION fn_encrypt(p_data TEXT)
RETURNS TEXT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          TO_BASE64(AES_ENCRYPT(p_data, SHA2('change_me_encrypt_key', 256))));;
DELIMITER ;
