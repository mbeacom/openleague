-- Backfill one active default surface for legacy venues that predate multi-surface rink management.
INSERT INTO "ice_surfaces" (
    "id",
    "name",
    "surfaceType",
    "isDefault",
    "isActive",
    "displayOrder",
    "createdAt",
    "updatedAt",
    "venueId"
)
SELECT
    'cl' || left(md5(v."id" || ':default_surface'), 23),
    'Main Surface',
    v."surfaceType",
    true,
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    v."id"
FROM "venues" v
WHERE NOT EXISTS (
    SELECT 1
    FROM "ice_surfaces" s
    WHERE s."venueId" = v."id"
);
