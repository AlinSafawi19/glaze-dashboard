-- CreateTable
CREATE TABLE "TickerItem" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TickerItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TickerItem_slug_key" ON "TickerItem"("slug");

-- CreateIndex
CREATE INDEX "TickerItem_archivedAt_idx" ON "TickerItem"("archivedAt");

-- CreateIndex
CREATE INDEX "TickerItem_sortIndex_idx" ON "TickerItem"("sortIndex");
