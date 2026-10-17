-- Move-In Ready schema (MySQL 8.0+ / 9.x / 26.x).
-- Run inside the target database, e.g.:
--   mysqlsh --sql -u root -h 127.0.0.1 --database=furnishflow -f server/schema.sql
-- `npm run db:init` runs this file automatically.

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL,
    email         VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM ('admin', 'volunteer', 'donor', 'user') NOT NULL,
    phone         VARCHAR(40)  NULL,
    area          VARCHAR(120) NULL,
    -- Street address (optional). When it geocodes, lat/lng are exact and geo_precise = 1;
    -- otherwise lat/lng are the area center.
    address       VARCHAR(200) NULL,
    lat           DECIMAL(9, 6) NULL,
    lng           DECIMAL(9, 6) NULL,
    geo_precise   TINYINT(1)   NOT NULL DEFAULT 0,
    active        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_role (role)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id    INT      NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Every furniture item belongs to the donor who gave it (donor_id is required).
CREATE TABLE IF NOT EXISTS furniture (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    donor_id         INT          NOT NULL,
    name             VARCHAR(100) NOT NULL,
    category         VARCHAR(40)  NOT NULL,
    item_condition   VARCHAR(40)  NOT NULL DEFAULT 'Unverified',
    dimensions       VARCHAR(100) NOT NULL DEFAULT 'Not supplied',
    weight_kg        DECIMAL(6, 1) NOT NULL DEFAULT 0,
    pickup_area      VARCHAR(120) NOT NULL,
    pickup_address   VARCHAR(200) NULL,
    lat              DECIMAL(9, 6) NOT NULL,
    lng              DECIMAL(9, 6) NOT NULL,
    geo_precise      TINYINT(1)   NOT NULL DEFAULT 0,
    notes            VARCHAR(400) NOT NULL DEFAULT '',
    photo            MEDIUMTEXT   NULL,
    -- Review state set by an admin
    status           ENUM ('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    -- Physical lifecycle once approved
    inventory_status ENUM ('pledged', 'in_stock', 'delivered', 'rejected') NOT NULL DEFAULT 'pledged',
    screening_flags  TEXT         NULL,
    -- OCI photo scan (JSON): {status: 'scanning' | 'done' | 'error', ...}; see server/vision.cjs
    vision_result    TEXT         NULL,
    review_reason    VARCHAR(300) NULL,
    reviewed_by      INT          NULL,
    reviewed_at      DATETIME     NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_furniture_donor (donor_id),
    INDEX idx_furniture_status (status, inventory_status),
    CONSTRAINT fk_furniture_donor FOREIGN KEY (donor_id) REFERENCES users (id),
    CONSTRAINT fk_furniture_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- A recipient ("user") asks to receive a specific furniture item.
CREATE TABLE IF NOT EXISTS requests (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    furniture_id  INT          NOT NULL,
    message       VARCHAR(400) NOT NULL DEFAULT '',
    status        ENUM ('pending', 'approved', 'rejected', 'cancelled', 'fulfilled') NOT NULL DEFAULT 'pending',
    decision_note VARCHAR(300) NULL,
    decided_by    INT          NULL,
    decided_at    DATETIME     NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_requests_user (user_id),
    INDEX idx_requests_furniture (furniture_id, status),
    CONSTRAINT fk_requests_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_requests_furniture FOREIGN KEY (furniture_id) REFERENCES furniture (id) ON DELETE CASCADE,
    CONSTRAINT fk_requests_decider FOREIGN KEY (decided_by) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Pickup (donor -> warehouse) and delivery (warehouse -> recipient) jobs assigned to volunteers by an admin.
CREATE TABLE IF NOT EXISTS tasks (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    furniture_id  INT          NOT NULL,
    request_id    INT          NULL,
    volunteer_id  INT          NOT NULL,
    type          ENUM ('pickup', 'delivery') NOT NULL,
    status        ENUM ('assigned', 'completed', 'cancelled') NOT NULL DEFAULT 'assigned',
    scheduled_for DATE         NULL,
    notes         VARCHAR(300) NOT NULL DEFAULT '',
    assigned_by   INT          NOT NULL,
    completed_at  DATETIME     NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tasks_volunteer (volunteer_id, status),
    INDEX idx_tasks_furniture (furniture_id),
    CONSTRAINT fk_tasks_furniture FOREIGN KEY (furniture_id) REFERENCES furniture (id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_request FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE SET NULL,
    CONSTRAINT fk_tasks_volunteer FOREIGN KEY (volunteer_id) REFERENCES users (id),
    CONSTRAINT fk_tasks_assigner FOREIGN KEY (assigned_by) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    actor_id   INT          NULL,
    text       VARCHAR(255) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Convenience view: each donor with the furniture stored under them.
CREATE OR REPLACE VIEW donor_furniture AS
SELECT u.id    AS donor_id,
       u.name  AS donor_name,
       u.email AS donor_email,
       f.id    AS furniture_id,
       f.name  AS furniture_name,
       f.category,
       f.status,
       f.inventory_status,
       f.created_at
FROM users u
         JOIN furniture f ON f.donor_id = u.id
WHERE u.role = 'donor';
