/**
 * Camera Controls Module
 * Handles mouse and touch interactions for pan/zoom
 */

import { type Camera2D, clampZoom, screenToWorld } from './transform.js';

export interface PointerState {
    isDown: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
}

/**
 * Create initial camera state
 */
export function createCamera(x: number = 0, y: number = 0, zoom: number = 1): Camera2D {
    return { x, y, zoom };
}

/**
 * Create initial pointer state
 */
export function createPointerState(): PointerState {
    return {
        isDown: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0
    };
}

/**
 * Handle pointer down (mouse/touch start)
 */
export function handlePointerDown(pointer: PointerState, x: number, y: number): PointerState {
    return {
        ...pointer,
        isDown: true,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y
    };
}

/**
 * Handle pointer up (mouse/touch end)
 */
export function handlePointerUp(pointer: PointerState): PointerState {
    return {
        ...pointer,
        isDown: false
    };
}

/**
 * Handle pointer move for panning
 * Returns new camera position
 */
export function handlePointerMove(
    pointer: PointerState,
    x: number,
    y: number,
    camera: Camera2D,
    canvasWidth: number,
    canvasHeight: number
): { pointer: PointerState; camera: Camera2D } {
    if (!pointer.isDown) {
        return { pointer, camera };
    }

    // Calculate delta in screen pixels
    const deltaX = x - pointer.lastX;
    const deltaY = y - pointer.lastY;

    // Convert pixel delta to world units
    const aspectRatio = canvasWidth / canvasHeight;
    const scaleX = (aspectRatio > 1 ? aspectRatio : 1) / camera.zoom;
    const scaleY = (aspectRatio < 1 ? 1 / aspectRatio : 1) / camera.zoom;

    // Pan is inverse of mouse movement (drag right = camera moves left)
    const worldDeltaX = (-deltaX / canvasWidth) * 2 * scaleX;
    const worldDeltaY = (deltaY / canvasHeight) * 2 * scaleY; // Flip Y

    return {
        pointer: {
            ...pointer,
            lastX: x,
            lastY: y
        },
        camera: {
            ...camera,
            x: camera.x + worldDeltaX,
            y: camera.y + worldDeltaY
        }
    };
}

/**
 * Handle wheel event for zooming
 * Zooms toward the mouse position
 */
export function handleWheel(
    deltaY: number,
    mouseX: number,
    mouseY: number,
    camera: Camera2D,
    canvasWidth: number,
    canvasHeight: number,
    zoomSpeed: number = 0.001,
    minZoom: number = 0.1,
    maxZoom: number = 100
): Camera2D {
    // Get world position under mouse before zoom
    const worldBefore = screenToWorld(mouseX, mouseY, canvasWidth, canvasHeight, camera);

    // Calculate new zoom
    const zoomDelta = -deltaY * zoomSpeed * camera.zoom;
    const newZoom = clampZoom(camera.zoom + zoomDelta, minZoom, maxZoom);

    // If zoom didn't change, return original camera
    if (newZoom === camera.zoom) {
        return camera;
    }

    // Get world position under mouse after zoom (with same camera position)
    const tempCamera = { ...camera, zoom: newZoom };
    const worldAfter = screenToWorld(mouseX, mouseY, canvasWidth, canvasHeight, tempCamera);

    // Adjust camera position so the world point stays under the mouse
    return {
        x: camera.x + (worldBefore.x - worldAfter.x),
        y: camera.y + (worldBefore.y - worldAfter.y),
        zoom: newZoom
    };
}

/**
 * Handle pinch zoom for touch devices
 */
export function handlePinchZoom(
    touch1: { x: number; y: number },
    touch2: { x: number; y: number },
    prevDistance: number,
    camera: Camera2D,
    canvasWidth: number,
    canvasHeight: number,
    minZoom: number = 0.1,
    maxZoom: number = 100
): { camera: Camera2D; distance: number } {
    // Calculate current distance between touches
    const dx = touch2.x - touch1.x;
    const dy = touch2.y - touch1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (prevDistance === 0) {
        return { camera, distance };
    }

    // Calculate zoom change
    const scale = distance / prevDistance;
    const newZoom = clampZoom(camera.zoom * scale, minZoom, maxZoom);

    // Get center point between touches
    const centerX = (touch1.x + touch2.x) / 2;
    const centerY = (touch1.y + touch2.y) / 2;

    // Get world position under center before zoom
    const worldBefore = screenToWorld(centerX, centerY, canvasWidth, canvasHeight, camera);

    // Get world position under center after zoom
    const tempCamera = { ...camera, zoom: newZoom };
    const worldAfter = screenToWorld(centerX, centerY, canvasWidth, canvasHeight, tempCamera);

    return {
        camera: {
            x: camera.x + (worldBefore.x - worldAfter.x),
            y: camera.y + (worldBefore.y - worldAfter.y),
            zoom: newZoom
        },
        distance
    };
}

/**
 * Reset camera to default view
 */
export function resetCamera(): Camera2D {
    return createCamera(0, 0, 1);
}

/**
 * Fit camera to show a bounding box
 */
export function fitToBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    canvasWidth: number,
    canvasHeight: number,
    padding: number = 0.1
): Camera2D {
    const width = maxX - minX;
    const height = maxY - minY;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const aspectRatio = canvasWidth / canvasHeight;
    const boundsAspect = width / height;

    // Calculate zoom to fit bounds with padding
    let zoom: number;
    if (boundsAspect > aspectRatio) {
        // Bounds are wider than canvas - fit to width
        zoom = (2 * (1 - padding)) / width;
    } else {
        // Bounds are taller than canvas - fit to height
        zoom = (2 * (1 - padding)) / height;
    }

    return {
        x: centerX,
        y: centerY,
        zoom
    };
}
