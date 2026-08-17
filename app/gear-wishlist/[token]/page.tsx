import { notFound } from "next/navigation";
import { GearPledgeForm } from "@/components/features/gear/GearPledgeForm";
import { PublicGearWishlist } from "@/components/features/gear/PublicGearWishlist";
import { createPublicGearPledge } from "@/lib/actions/gear-pledges";
import { getPublicGearWishlist } from "@/lib/actions/gear-wishlist";

export default async function PublicGearWishlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const wishlist = await getPublicGearWishlist(token).catch(() => null);
  if (!wishlist) notFound();

  return (
    <main>
      <PublicGearWishlist
        data={{
          associationName: wishlist.associationName,
          title: wishlist.title,
          description: wishlist.description,
          items: wishlist.items.map((item) => ({
            id: item.id,
            name: item.nameSnapshot,
            category: item.categorySnapshot,
            size: item.sizeSnapshot,
            description: item.description,
            targetQty: item.targetQty,
            pledgedQty: item.pledgedQty,
            receivedQty: item.receivedQty,
          })),
        }}
      />
      <GearPledgeForm
        token={token}
        items={wishlist.items.map((item) => ({
          id: item.id,
          name: item.nameSnapshot,
          targetQty: item.targetQty,
          pledgedQty: item.pledgedQty,
          receivedQty: item.receivedQty,
        }))}
        submit={createPublicGearPledge}
      />
    </main>
  );
}
