-- Adds ProjectSource: one row per (project, platform, account), so a
-- project seen on multiple platforms/accounts keeps each platform's own
-- url/region/status instead of squashing everything into Project's fixed
-- columns.
CREATE TABLE "ProjectSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "url" TEXT,
    "region" TEXT,
    "status" TEXT,
    "description" TEXT,
    "databaseRef" TEXT,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectSource_projectId_platform_accountLabel_key"
    ON "ProjectSource"("projectId", "platform", "accountLabel");
