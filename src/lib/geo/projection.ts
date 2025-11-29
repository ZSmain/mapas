/**
 * Web Mercator Projection Module
 *
 * Converts between geographic coordinates (longitude/latitude) and
 * world coordinates used for rendering.
 *
 * World coordinates:
 * - Origin (0, 0) at lon=0, lat=0
 * - X increases eastward
 * - Y increases northward
 * - At zoom 0, the entire world fits in a 1x1 square (0 to 1)
 *
 * Reference: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 */

/** Geographic coordinates (longitude, latitude in degrees) */
export interface LngLat {
    lng: number;
    lat: number;
}

/** World coordinates (Mercator projection, 0-1 range at zoom 0) */
export interface WorldCoord {
    x: number;
    y: number;
}

/** Tile coordinates (z = zoom level, x/y = tile indices) */
export interface TileCoord {
    z: number;
    x: number;
    y: number;
}

// Maximum latitude for Web Mercator (approximately ±85.05°)
export const MAX_LATITUDE = 85.051128779806604;

// Earth's circumference in meters at the equator
export const EARTH_CIRCUMFERENCE = 40075016.686;

/**
 * Convert longitude/latitude to world coordinates
 *
 * Uses Web Mercator (EPSG:3857) projection formula:
 * - x = (lng + 180) / 360
 * - y = (1 - ln(tan(lat) + sec(lat)) / π) / 2
 *
 * @param lngLat - Geographic coordinates
 * @returns World coordinates in range [0, 1]
 */
export function lngLatToWorld(lngLat: LngLat): WorldCoord {
    const { lng, lat } = lngLat;

    // Clamp latitude to valid Mercator range
    const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));

    // Convert longitude to x (simple linear mapping)
    const x = (lng + 180) / 360;

    // Convert latitude to y (Mercator formula)
    const latRad = (clampedLat * Math.PI) / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;

    return { x, y };
}

/**
 * Convert world coordinates back to longitude/latitude
 *
 * Inverse of lngLatToWorld
 *
 * @param world - World coordinates
 * @returns Geographic coordinates
 */
export function worldToLngLat(world: WorldCoord): LngLat {
    const { x, y } = world;

    // Convert x to longitude
    const lng = x * 360 - 180;

    // Convert y to latitude (inverse Mercator)
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
    const lat = (latRad * 180) / Math.PI;

    return { lng, lat };
}

/**
 * Convert longitude/latitude to tile coordinates at a given zoom level
 *
 * @param lngLat - Geographic coordinates
 * @param zoom - Zoom level (0-22)
 * @returns Tile coordinates
 */
export function lngLatToTile(lngLat: LngLat, zoom: number): TileCoord {
    const world = lngLatToWorld(lngLat);
    const scale = Math.pow(2, zoom);

    return {
        z: Math.floor(zoom),
        x: Math.floor(world.x * scale),
        y: Math.floor(world.y * scale)
    };
}

/**
 * Convert tile coordinates to the tile's center in world coordinates
 *
 * @param tile - Tile coordinates
 * @returns World coordinates of tile center
 */
export function tileToWorld(tile: TileCoord): WorldCoord {
    const scale = Math.pow(2, tile.z);
    return {
        x: (tile.x + 0.5) / scale,
        y: (tile.y + 0.5) / scale
    };
}

/**
 * Get the bounding box of a tile in world coordinates
 *
 * @param tile - Tile coordinates
 * @returns { min: WorldCoord, max: WorldCoord }
 */
export function getTileBounds(tile: TileCoord): { min: WorldCoord; max: WorldCoord } {
    const scale = Math.pow(2, tile.z);
    return {
        min: {
            x: tile.x / scale,
            y: tile.y / scale
        },
        max: {
            x: (tile.x + 1) / scale,
            y: (tile.y + 1) / scale
        }
    };
}

/**
 * Get the bounding box of a tile in longitude/latitude
 *
 * @param tile - Tile coordinates
 * @returns { min: LngLat, max: LngLat } (min = SW corner, max = NE corner)
 */
export function getTileBoundsLngLat(tile: TileCoord): { min: LngLat; max: LngLat } {
    const bounds = getTileBounds(tile);
    return {
        min: worldToLngLat(bounds.min),
        max: worldToLngLat(bounds.max)
    };
}

/**
 * Calculate the scale factor at a given latitude
 * (Mercator projection distorts areas away from equator)
 *
 * @param lat - Latitude in degrees
 * @returns Scale factor (1.0 at equator)
 */
export function getLatitudeScale(lat: number): number {
    const latRad = (lat * Math.PI) / 180;
    return 1 / Math.cos(latRad);
}

/**
 * Calculate meters per pixel at a given latitude and zoom level
 *
 * @param lat - Latitude in degrees
 * @param zoom - Zoom level
 * @returns Meters per pixel
 */
export function getMetersPerPixel(lat: number, zoom: number, tileSize: number = 512): number {
    const latRad = (lat * Math.PI) / 180;
    const numTiles = Math.pow(2, zoom);
    const worldSize = numTiles * tileSize;
    return (EARTH_CIRCUMFERENCE * Math.cos(latRad)) / worldSize;
}

/**
 * Calculate the appropriate zoom level for a given scale in meters per pixel
 *
 * @param metersPerPixel - Desired scale
 * @param lat - Latitude in degrees
 * @returns Zoom level
 */
export function getZoomForMetersPerPixel(
    metersPerPixel: number,
    lat: number,
    tileSize: number = 512
): number {
    const latRad = (lat * Math.PI) / 180;
    const worldSizeAtZoom0 = tileSize;
    return Math.log2((EARTH_CIRCUMFERENCE * Math.cos(latRad)) / (metersPerPixel * worldSizeAtZoom0));
}

/**
 * Convert our camera coordinates to world coordinates
 *
 * Our camera uses a coordinate system where:
 * - Origin is at the center
 * - Range is roughly -1 to 1 (depending on zoom)
 *
 * World coordinates use:
 * - Origin at top-left (0, 0)
 * - Range is 0 to 1
 *
 * @param cameraX - Camera X coordinate
 * @param cameraY - Camera Y coordinate
 * @returns World coordinates
 */
export function cameraToWorld(cameraX: number, cameraY: number): WorldCoord {
    // Camera (0,0) = World (0.5, 0.5)
    // Camera Y is up, World Y is down
    return {
        x: cameraX + 0.5,
        y: 0.5 - cameraY
    };
}

/**
 * Convert world coordinates to camera coordinates
 *
 * @param world - World coordinates
 * @returns Camera coordinates { x, y }
 */
export function worldToCamera(world: WorldCoord): { x: number; y: number } {
    return {
        x: world.x - 0.5,
        y: 0.5 - world.y
    };
}

/**
 * Convert longitude/latitude to camera coordinates
 */
export function lngLatToCamera(lngLat: LngLat): { x: number; y: number } {
    const world = lngLatToWorld(lngLat);
    return worldToCamera(world);
}

/**
 * Convert camera coordinates to longitude/latitude
 */
export function cameraToLngLat(cameraX: number, cameraY: number): LngLat {
    const world = cameraToWorld(cameraX, cameraY);
    return worldToLngLat(world);
}
