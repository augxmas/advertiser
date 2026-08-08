import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  database:           process.env.DB_NAME     || 'campaign',
  user:               process.env.DB_USER     || 'advertiser',
  password:           process.env.DB_PASSWORD || '',
  charset:            'utf8mb4',
  timezone:           '+09:00',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
});

export default pool;
