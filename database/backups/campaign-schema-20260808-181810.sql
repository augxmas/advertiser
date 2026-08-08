-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: campaign
-- ------------------------------------------------------
-- Server version	8.0.46-0ubuntu0.24.04.3

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `advertisers`
--

DROP TABLE IF EXISTS `advertisers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advertisers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '회사명',
  `business_no` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '사업자등록번호',
  `ceo_name` text COLLATE utf8mb4_unicode_ci COMMENT '대표자명(암호화)',
  `address1` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '주소1',
  `address2` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '주소2',
  `postal_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '우편번호',
  `contact_name` text COLLATE utf8mb4_unicode_ci COMMENT '담당자명(암호화)',
  `contact_mobile` text COLLATE utf8mb4_unicode_ci COMMENT '담당자 모바일(암호화)',
  `contact_phone` text COLLATE utf8mb4_unicode_ci COMMENT '담당자 일반전화(암호화)',
  `contact_email` text COLLATE utf8mb4_unicode_ci COMMENT '담당자 이메일(암호화)',
  `email_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '이메일 해시(로그인 조회용)',
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '비밀번호(bcrypt)',
  `push_consent` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Push 알림 동의',
  `email_consent` tinyint(1) NOT NULL DEFAULT '0' COMMENT '이메일 수신 동의',
  `terms_consent` tinyint(1) NOT NULL DEFAULT '0' COMMENT '이용약관 동의',
  `privacy_consent` tinyint(1) NOT NULL DEFAULT '0' COMMENT '개인정보 동의',
  `biz_cert_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '사업자등록증명원 파일경로',
  `biz_cert_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '사업자등록증명원 원본파일명',
  `status` enum('pending','approved','rejected','terminated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '상태',
  `status_reason` text COLLATE utf8mb4_unicode_ci COMMENT '상태변경 사유',
  `bank_account` text COLLATE utf8mb4_unicode_ci COMMENT '계좌번호(암호화)',
  `email_verified` tinyint(1) NOT NULL DEFAULT '0' COMMENT '이메일 인증여부',
  `last_login_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '마지막 로그인 IP',
  `last_login_at` datetime DEFAULT NULL COMMENT '마지막 로그인 시각',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `password_reset_required` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `business_no` (`business_no`),
  UNIQUE KEY `email_hash` (`email_hash`),
  KEY `idx_advertisers_status` (`status`),
  KEY `idx_advertisers_email` (`email_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='광고주';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `campaign_sequences`
--

DROP TABLE IF EXISTS `campaign_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_sequences` (
  `seq_date` date NOT NULL,
  `last_seq` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`seq_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='캠페인 ID 일련번호';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `campaigns`
--

DROP TABLE IF EXISTS `campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaigns` (
  `id` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '캠페인ID (yymmdd_dddd)',
  `advertiser_id` int NOT NULL,
  `campaign_name` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '캠페인명',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '캠페인 설명',
  `has_image` tinyint(1) NOT NULL DEFAULT '0',
  `has_html` tinyint(1) NOT NULL DEFAULT '0',
  `has_youtube` tinyint(1) NOT NULL DEFAULT '0',
  `image_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '이미지 URL',
  `image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '이미지 파일 경로',
  `image_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '이미지 원본파일명',
  `image_width` int DEFAULT NULL COMMENT '이미지 가로(px)',
  `image_height` int DEFAULT NULL COMMENT '이미지 세로(px)',
  `html_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'HTML URL',
  `html_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'HTML 파일 경로',
  `html_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'HTML 원본파일명',
  `youtube_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'YouTube URL',
  `from_date` date NOT NULL COMMENT '광고 시작일',
  `to_date` date NOT NULL COMMENT '광고 종료일',
  `ad_days` int NOT NULL DEFAULT '0' COMMENT '광고일수',
  `base_fee` decimal(15,0) NOT NULL DEFAULT '0' COMMENT '기본 광고료',
  `vat` decimal(15,0) NOT NULL DEFAULT '0' COMMENT '부가세',
  `total_fee` decimal(15,0) NOT NULL DEFAULT '0' COMMENT '총 광고료',
  `status` enum('입금전','입금확인','광고중','광고종료','취소') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '입금전',
  `quotation_sent_at` datetime DEFAULT NULL COMMENT '견적서 발송 시각',
  `quotation_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '견적서 읽음 추적 토큰',
  `quotation_read_at` datetime DEFAULT NULL COMMENT '견적서 읽음 시각',
  `payment_confirmed_at` datetime DEFAULT NULL COMMENT '입금 확인 시각',
  `payment_confirmed_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '입금 확인자',
  `files_backed_up` tinyint(1) NOT NULL DEFAULT '0' COMMENT '파일 백업 완료여부',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approved_at` datetime DEFAULT NULL COMMENT '승인일 (광고중 전환 시각)',
  `approved_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '승인자 (supervisor 또는 batch)',
  `cancelled_at` datetime DEFAULT NULL COMMENT '취소일',
  `cancelled_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '취소자 (supervisor, advertiser 또는 batch)',
  PRIMARY KEY (`id`),
  KEY `idx_campaigns_advertiser` (`advertiser_id`),
  KEY `idx_campaigns_status` (`status`),
  KEY `idx_campaigns_dates` (`from_date`,`to_date`),
  CONSTRAINT `1` FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='캠페인';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `email_logs`
--

DROP TABLE IF EXISTS `email_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `template_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '템플릿 키',
  `to_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '수신자',
  `subject` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '제목',
  `campaign_id` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '관련 캠페인 ID',
  `advertiser_id` int DEFAULT NULL COMMENT '관련 광고주 ID',
  `status` enum('sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent',
  `error_msg` text COLLATE utf8mb4_unicode_ci COMMENT '발송 실패 메세지',
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_logs_campaign` (`campaign_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='이메일 발송 이력';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `email_verifications`
--

DROP TABLE IF EXISTS `email_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '인증 대상 이메일',
  `code` varchar(6) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '6자리 인증코드',
  `verified` tinyint(1) NOT NULL DEFAULT '0',
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='이메일 인증코드';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `image_library`
--

DROP TABLE IF EXISTS `image_library`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `image_library` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `advertiser_id` int NOT NULL,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stored_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NOT NULL,
  `width` int NOT NULL,
  `height` int NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `tags` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_image_library_advertiser_date` (`advertiser_id`,`uploaded_at`),
  CONSTRAINT `fk_image_library_advertiser` FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `login_histories`
--

DROP TABLE IF EXISTS `login_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_histories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_type` enum('advertiser','supervisor') COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '광고주 id 또는 supervisor',
  `login_ip` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `login_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `logout_at` datetime DEFAULT NULL COMMENT '로그아웃 시각',
  `session_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '세션 ID',
  PRIMARY KEY (`id`),
  KEY `idx_login_hist_user` (`user_type`,`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='로그인 이력';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `advertiser_id` int NOT NULL,
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_id` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_advertiser_date` (`advertiser_id`,`created_at`),
  KEY `idx_notifications_unread` (`advertiser_id`,`is_read`),
  CONSTRAINT `fk_notifications_advertiser` FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='세션';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `supervisor_notifications`
--

DROP TABLE IF EXISTS `supervisor_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supervisor_notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_id` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `advertiser_id` int DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_supervisor_notifications_date` (`created_at`),
  KEY `idx_supervisor_notifications_unread` (`is_read`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_config`
--

DROP TABLE IF EXISTS `system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_config` (
  `config_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='시스템 설정';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'campaign'
--

--
-- Dumping routines for database 'campaign'
--
/*!50003 DROP FUNCTION IF EXISTS `fn_decrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`advertiser`@`localhost` FUNCTION `fn_decrypt`(p_data TEXT) RETURNS text CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
    DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          CONVERT(AES_DECRYPT(FROM_BASE64(p_data), SHA2('change_me_encrypt_key', 256)) USING utf8mb4)) ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_encrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`advertiser`@`localhost` FUNCTION `fn_encrypt`(p_data TEXT) RETURNS text CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
    DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          TO_BASE64(AES_ENCRYPT(p_data, SHA2('change_me_encrypt_key', 256)))) ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-08  9:18:11
