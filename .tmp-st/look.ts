import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  const skinTypes = await prisma.skinType.findMany({
    orderBy: { sortIndex: "asc" },
    select: {
      id: true, slug: true, title: true, archivedAt: true,
      _count: { select: { products: true } },
    },
  });

  for (const s of skinTypes) {
    console.log(
      `${s.title.padEnd(16)} slug=${s.slug.padEnd(16)} products=${s._count.products}` +
        (s.archivedAt ? " ARCHIVED" : "")
    );
  }
  console.log("total skin types:", skinTypes.length);
  console.log("total products:", await prisma.product.count());

  await prisma.$disconnect();
}
main();
