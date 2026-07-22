-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Person_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "restrictedReason" TEXT,
    "successMetric" TEXT,
    CONSTRAINT "Department_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "isOutOfDomain" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    CONSTRAINT "Client_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vaultReference" TEXT,
    "ownerPersonId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalAccount_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalAccountAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalAccountId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalAccountAccess_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExternalAccountAccess_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "departmentId" TEXT,
    "liveUrl" TEXT,
    "previewUrls" TEXT,
    "hostingPlatform" TEXT,
    "externalAccountId" TEXT,
    "repoUrl" TEXT,
    "databaseRef" TEXT,
    "status" TEXT NOT NULL,
    "clientId" TEXT,
    "deliveryModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastKnownUpdateAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "source" TEXT NOT NULL,
    CONSTRAINT "Project_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "reachable" BOOLEAN,
    CONSTRAINT "SyncStamp_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "linkedProjectId" TEXT,
    "externalAccountId" TEXT,
    "googleRefreshToken" TEXT,
    "lastPolledAt" DATETIME,
    CONSTRAINT "InboxAccount_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InboxAccount_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "inferredProjectId" TEXT,
    "gmailMessageId" TEXT,
    CONSTRAINT "InboxMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InboxAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InboxMessage_inferredProjectId_fkey" FOREIGN KEY ("inferredProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProfitEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByPersonId" TEXT NOT NULL,
    "verified" TEXT NOT NULL DEFAULT 'self_reported',
    CONSTRAINT "ProfitEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProfitEntry_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BranchFocusNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedByPersonId" TEXT NOT NULL,
    CONSTRAINT "BranchFocusNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BranchFocusNote_updatedByPersonId_fkey" FOREIGN KEY ("updatedByPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "vaultReference" TEXT,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedByPersonId" TEXT NOT NULL,
    "expiresAt" DATETIME,
    CONSTRAINT "AccessGrant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessGrant_grantedByPersonId_fkey" FOREIGN KEY ("grantedByPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorPersonId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetDescription" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AuditLogEntry_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadFlowLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ownerPersonId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadFlowLead_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ProjectOwners" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ProjectOwners_A_fkey" FOREIGN KEY ("A") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ProjectOwners_B_fkey" FOREIGN KEY ("B") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_PersonBranches" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PersonBranches_A_fkey" FOREIGN KEY ("A") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PersonBranches_B_fkey" FOREIGN KEY ("B") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_PersonDepartments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PersonDepartments_A_fkey" FOREIGN KEY ("A") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PersonDepartments_B_fkey" FOREIGN KEY ("B") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccountAccess_externalAccountId_personId_key" ON "ExternalAccountAccess"("externalAccountId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_gmailMessageId_key" ON "InboxMessage"("gmailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchFocusNote_branchId_key" ON "BranchFocusNote"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectOwners_AB_unique" ON "_ProjectOwners"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectOwners_B_index" ON "_ProjectOwners"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PersonBranches_AB_unique" ON "_PersonBranches"("A", "B");

-- CreateIndex
CREATE INDEX "_PersonBranches_B_index" ON "_PersonBranches"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PersonDepartments_AB_unique" ON "_PersonDepartments"("A", "B");

-- CreateIndex
CREATE INDEX "_PersonDepartments_B_index" ON "_PersonDepartments"("B");
