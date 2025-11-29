/**
 * Tile Coordinate System Module
 *
 * Calculates which tiles are visible given a camera state,
 * and provides utilities for working with tile coordinates.
 *
 * Tile numbering follows the XYZ (Slippy Map) convention:
 * - Zoom 0: 1 tile covering the entire world
 * - Zoom N: 2^N × 2^N tiles
 * - X increases eastward (0 to 2^N - 1)
 * - Y increases southward (0 to 2^N - 1)
 */

import type { Camera2D } from '../gpu/transform.js';
import {
    cameraToWorld,
    getTileBounds,
    worldToCamera,
    type TileCoord,
    type WorldCoord
} from './projection.js';

/** Bounding box in world coordinates */
export interface WorldBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** Bounding box in camera coordinates */
export interface CameraBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * Get the visible bounds in world coordinates from camera state
 *
 * @param camera - Camera state (position and zoom)
 * @param aspectRatio - Canvas width / height
 * @returns World coordinate bounds of visible area
 */
export function getVisibleWorldBounds(camera: Camera2D, aspectRatio: number): WorldBounds {
    // Calculate half-extent in camera coordinates
    const halfWidth = (aspectRatio > 1 ? aspectRatio : 1) / camera.zoom;
    const halfHeight = (aspectRatio < 1 ? 1 / aspectRatio : 1) / camera.zoom;

    // Camera bounds
    const cameraMinX = camera.x - halfWidth;
    const cameraMaxX = camera.x + halfWidth;
    const cameraMinY = camera.y - halfHeight;
    const cameraMaxY = camera.y + halfHeight;

    // Convert to world coordinates
    const minWorld = cameraToWorld(cameraMinX, cameraMaxY); // Top-left in screen = min Y in camera
    const maxWorld = cameraToWorld(cameraMaxX, cameraMinY); // Bottom-right in screen = max Y in camera

    return {
        minX: minWorld.x,
        minY: minWorld.y,
        maxX: maxWorld.x,
        maxY: maxWorld.y
    };
}

/**
 * Calculate the appropriate tile zoom level for current camera zoom
 *
 * Maps camera zoom to tile zoom:
 * - Camera zoom 1 = shows world 0-1 in roughly 2 units = zoom 0 (1 tile)
 * - Camera zoom 2 = shows 0.5 units = zoom 1 (4 tiles)
 * - Camera zoom 4 = shows 0.25 units = zoom 2 (16 tiles)
 *
 * The formula: tileZoom = log2(cameraZoom) + 1
 *
 * @param cameraZoom - Current camera zoom level
 * @param minZoom - Minimum tile zoom (default 0)
 * @param maxZoom - Maximum tile zoom (default 18)
 * @returns Integer tile zoom level
 */
export function getTileZoom(cameraZoom: number, minZoom: number = 0, maxZoom: number = 18): number {
    // At camera zoom 1, we see approximately 2 world units
    // At camera zoom 2, we see approximately 1 world unit
    // For nice tile sizes, we want about 2-4 tiles visible
    const rawZoom = Math.log2(cameraZoom) + 1;
    return Math.max(minZoom, Math.min(maxZoom, Math.floor(rawZoom)));
}

/**
 * Get all tiles visible in the current view
 *
 * @param camera - Camera state
 * @param aspectRatio - Canvas width / height
 * @param minZoom - Minimum tile zoom
 * @param maxZoom - Maximum tile zoom
 * @returns Array of visible tile coordinates
 */
export function getVisibleTiles(
    camera: Camera2D,
    aspectRatio: number,
    minZoom: number = 0,
    maxZoom: number = 18
): TileCoord[] {
    const tileZoom = getTileZoom(camera.zoom, minZoom, maxZoom);
    const bounds = getVisibleWorldBounds(camera, aspectRatio);

    return getTilesInBounds(bounds, tileZoom);
}

/**
 * Get all tiles that intersect with a bounding box
 *
 * @param bounds - World coordinate bounds
 * @param zoom - Tile zoom level
 * @returns Array of tile coordinates
 */
export function getTilesInBounds(bounds: WorldBounds, zoom: number): TileCoord[] {
    const scale = Math.pow(2, zoom);
    const tiles: TileCoord[] = [];

    // Convert bounds to tile indices
    const minTileX = Math.max(0, Math.floor(bounds.minX * scale));
    const maxTileX = Math.min(scale - 1, Math.floor(bounds.maxX * scale));
    const minTileY = Math.max(0, Math.floor(bounds.minY * scale));
    const maxTileY = Math.min(scale - 1, Math.floor(bounds.maxY * scale));

    // Note: For now we don't handle wrapping around the antimeridian
    // A full implementation would handle bounds.minX < 0 or bounds.maxX > 1

    // Collect all tiles
    for (let y = minTileY; y <= maxTileY; y++) {
        for (let x = minTileX; x <= maxTileX; x++) {
            tiles.push({ z: zoom, x, y });
        }
    }

    return tiles;
}

/**
 * Get the tile at a specific world coordinate
 *
 * @param world - World coordinates
 * @param zoom - Tile zoom level
 * @returns Tile coordinate
 */
export function getTileAtPoint(world: WorldCoord, zoom: number): TileCoord {
    const scale = Math.pow(2, zoom);
    return {
        z: zoom,
        x: Math.floor(world.x * scale),
        y: Math.floor(world.y * scale)
    };
}

/**
 * Generate vertices for a tile grid
 *
 * Creates line geometry for rendering tile boundaries.
 * Each line is defined by 2 vertices (start, end).
 *
 * @param tiles - Array of tiles to create grid for
 * @returns Float32Array of vertex positions (x, y pairs in camera coordinates)
 */
export function createTileGridVertices(tiles: TileCoord[]): Float32Array {
    if (tiles.length === 0) {
        return new Float32Array(0);
    }

    // Collect unique edges to avoid drawing duplicates
    const edges = new Set<string>();
    const vertices: number[] = [];

    for (const tile of tiles) {
        const bounds = getTileBounds(tile);
        const min = worldToCamera(bounds.min);
        const max = worldToCamera(bounds.max);

        // Four edges per tile (left, right, top, bottom)
        // We use a string key to deduplicate shared edges
        const left = `${min.x.toFixed(6)},${min.y.toFixed(6)}-${min.x.toFixed(6)},${max.y.toFixed(6)}`;
        const right = `${max.x.toFixed(6)},${min.y.toFixed(6)}-${max.x.toFixed(6)},${max.y.toFixed(6)}`;
        const top = `${min.x.toFixed(6)},${max.y.toFixed(6)}-${max.x.toFixed(6)},${max.y.toFixed(6)}`;
        const bottom = `${min.x.toFixed(6)},${min.y.toFixed(6)}-${max.x.toFixed(6)},${min.y.toFixed(6)}`;

        if (!edges.has(left)) {
            edges.add(left);
            vertices.push(min.x, min.y, min.x, max.y);
        }
        if (!edges.has(right)) {
            edges.add(right);
            vertices.push(max.x, min.y, max.x, max.y);
        }
        if (!edges.has(top)) {
            edges.add(top);
            vertices.push(min.x, max.y, max.x, max.y);
        }
        if (!edges.has(bottom)) {
            edges.add(bottom);
            vertices.push(min.x, min.y, max.x, min.y);
        }
    }

    return new Float32Array(vertices);
}

/**
 * Generate vertices for tile labels (tile coordinates as text would go here)
 * For now, returns center points of each tile for potential label placement
 *
 * @param tiles - Array of tiles
 * @returns Array of { tile, center } for label placement
 */
export function getTileCenters(tiles: TileCoord[]): Array<{ tile: TileCoord; center: { x: number; y: number } }> {
    return tiles.map((tile) => {
        const bounds = getTileBounds(tile);
        const centerWorld: WorldCoord = {
            x: (bounds.min.x + bounds.max.x) / 2,
            y: (bounds.min.y + bounds.max.y) / 2
        };
        const center = worldToCamera(centerWorld);
        return { tile, center };
    });
}

/**
 * Convert tile coordinates to a string key (for caching, Maps, etc.)
 */
export function tileKey(tile: TileCoord): string {
    return `${tile.z}/${tile.x}/${tile.y}`;
}

/**
 * Parse a tile key back to coordinates
 */
export function parseTileKey(key: string): TileCoord {
    const [z, x, y] = key.split('/').map(Number);
    return { z, x, y };
}

/**
 * Get the parent tile (one zoom level up)
 */
export function getParentTile(tile: TileCoord): TileCoord | null {
    if (tile.z === 0) return null;
    return {
        z: tile.z - 1,
        x: Math.floor(tile.x / 2),
        y: Math.floor(tile.y / 2)
    };
}

/**
 * Get the four child tiles (one zoom level down)
 */
export function getChildTiles(tile: TileCoord): TileCoord[] {
    const z = tile.z + 1;
    const x = tile.x * 2;
    const y = tile.y * 2;
    return [
        { z, x, y },
        { z, x: x + 1, y },
        { z, x, y: y + 1 },
        { z, x: x + 1, y: y + 1 }
    ];
}

/**
 * Check if a tile is within valid bounds
 */
export function isValidTile(tile: TileCoord): boolean {
    const maxIndex = Math.pow(2, tile.z) - 1;
    return (
        tile.z >= 0 &&
        tile.x >= 0 &&
        tile.y >= 0 &&
        tile.x <= maxIndex &&
        tile.y <= maxIndex
    );
}
