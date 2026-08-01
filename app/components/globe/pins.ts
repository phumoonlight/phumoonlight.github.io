import * as THREE from 'three'
import { latLonToVector3, type LocationDef } from './locations'

/**
 * Map pins standing on the globe. Each pin is its own group so a raycast hit
 * can walk up to it and read the location id.
 */

const PIN_COLOR = 0xff5f7e
const PIN_HEAD = 0xffd0da

/** Where the pin's tip touches down, just clear of the tallest land facet. */
const SURFACE_RADIUS = 1.02

export interface PinField {
  group: THREE.Group
  /** Every pin, in LOCATIONS order, for raycasting and facing checks. */
  pins: THREE.Group[]
  dispose(): void
}

export function buildPins(locations: LocationDef[]): PinField {
  const group = new THREE.Group()

  // One geometry and material set for all pins.
  const spikeGeometry = new THREE.ConeGeometry(0.028, 0.1, 8)
  const headGeometry = new THREE.SphereGeometry(0.038, 12, 10)
  const ringGeometry = new THREE.RingGeometry(0.045, 0.068, 18)

  const spikeMaterial = new THREE.MeshBasicMaterial({ color: PIN_COLOR })
  const headMaterial = new THREE.MeshBasicMaterial({ color: PIN_HEAD })
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: PIN_COLOR,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  const up = new THREE.Vector3(0, 1, 0)

  const pins = locations.map((location) => {
    const pin = new THREE.Group()
    pin.userData.locationId = location.id

    const direction = latLonToVector3(location.lat, location.lon, 1)
    pin.position.copy(direction).multiplyScalar(SURFACE_RADIUS)
    // Stand the pin along the surface normal rather than the world's up.
    pin.quaternion.setFromUnitVectors(up, direction)

    // Cone points down, so the tip meets the ground.
    const spike = new THREE.Mesh(spikeGeometry, spikeMaterial)
    spike.position.y = 0.05
    spike.rotation.x = Math.PI
    pin.add(spike)

    const head = new THREE.Mesh(headGeometry, headMaterial)
    head.position.y = 0.12
    pin.add(head)

    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.002
    pin.add(ring)

    group.add(pin)
    return pin
  })

  return {
    group,
    pins,
    dispose() {
      spikeGeometry.dispose()
      headGeometry.dispose()
      ringGeometry.dispose()
      spikeMaterial.dispose()
      headMaterial.dispose()
      ringMaterial.dispose()
    },
  }
}

/**
 * True when a pin is on the hemisphere facing the camera. Depth testing hides
 * the far ones visually, but a raycast would still reach them.
 */
export function isPinFacingCamera(pin: THREE.Object3D, camera: THREE.Camera): boolean {
  const worldPosition = pin.getWorldPosition(new THREE.Vector3())
  const toCamera = camera.position.clone().sub(worldPosition)
  // The pin sits on the surface, so its position doubles as its normal.
  return worldPosition.dot(toCamera) > 0
}
