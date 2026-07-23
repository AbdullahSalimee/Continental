-- CreateTable
CREATE TABLE "DiscoverRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inputHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredBy" TEXT NOT NULL,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "raw" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AIDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sourceItemIds" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "reasoning" TEXT,
    "confidence" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'ai',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "targetProjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiscoverRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);