
CREATE DATABASE IF NOT EXISTS noticehub;
USE noticehub;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student',
    department VARCHAR(80) NULL,
    year TINYINT UNSIGNED NULL,
    semester TINYINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(80) NOT NULL,
    priority ENUM('Normal', 'Important', 'Urgent')
        NOT NULL DEFAULT 'Normal',
    audience VARCHAR(100) NOT NULL DEFAULT 'All Students',
    target_department VARCHAR(80) NULL,
    target_year TINYINT UNSIGNED NULL,
    target_semester TINYINT UNSIGNED NULL,
    expiry_date DATE NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notice_reads (
    user_id INT NOT NULL,
    notice_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, notice_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE
);
