import * as THREE from 'three'

/**
 * A faceted, cartoon Earth. The continents come from a real land/sea mask, so
 * the shape stays recognisable, but everything else — flat facets, stepped
 * coastlines, hand-picked colours — is stylised.
 *
 * The mask is the only asset the globe needs; there is no surface texture.
 */

/** Mask values above this count as land. The source is near-binary already. */
const LAND_THRESHOLD = 0.5

/** Angular radius of the neighbour probes used to find coastlines. */
const COAST_PROBE = 0.02

/** Above this |y| on the unit sphere, faces are drawn as ice. */
const ICE_LATITUDE = 0.87

const COLORS = {
  deepOcean: 0x1a6ba6,
  shallowOcean: 0x2a8dbe,
  sand: 0xdcc78d,
  ice: 0xeaf3fb,
  grass: [0x4da657, 0x3f8f4a, 0x63bb61, 0x57a94a],
} as const

/** Per-face radii. The small steps between them are what make the coast read. */
const ELEVATION = {
  deepOcean: 0.994,
  shallowOcean: 1.0,
  sand: 1.006,
  land: 1.013,
  ice: 1.017,
} as const

/** Deterministic PRNG, so the planet and clouds look identical on every load. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type LandSampler = (x: number, y: number, z: number) => number

/**
 * Reads the mask into an ImageData buffer once and returns a sampler over
 * directions on the unit sphere. Same-origin, so getImageData is allowed.
 */
export async function loadLandMask(url: string): Promise<LandSampler> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error(`could not load ${url}`))
    element.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d canvas context unavailable')
  ctx.drawImage(image, 0, 0)

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  return (x, y, z) => {
    // Equirectangular, matching three.js's own sphere convention: polar angle
    // measured from +Y, azimuth starting at -X.
    const polar = Math.acos(THREE.MathUtils.clamp(y, -1, 1))
    const azimuth = Math.atan2(z, -x)

    const u = (azimuth / (Math.PI * 2) + 1) % 1
    const px = Math.min(width - 1, (u * width) | 0)
    const py = Math.min(height - 1, ((polar / Math.PI) * height) | 0)

    return data[(py * width + px) * 4] / 255
  }
}

type Terrain = 'deepOcean' | 'shallowOcean' | 'sand' | 'land' | 'ice'

/**
 * Classifies a face by sampling its centre plus four neighbours. The neighbour
 * probes are what produce beaches and shallows — a coast is simply a face whose
 * surroundings disagree with it.
 */
function classify(centre: THREE.Vector3, isLand: LandSampler): Terrain {
  if (Math.abs(centre.y) > ICE_LATITUDE) return 'ice'

  const centreIsLand = isLand(centre.x, centre.y, centre.z) > LAND_THRESHOLD

  // Any vector not parallel to the centre works as a seed for the tangent frame.
  const seed = Math.abs(centre.y) > 0.9 ? UNIT_X : UNIT_Y
  const tangent = new THREE.Vector3().crossVectors(seed, centre).normalize()
  const bitangent = new THREE.Vector3().crossVectors(centre, tangent)

  const probe = new THREE.Vector3()
  let disagrees = false

  for (const [axis, sign] of PROBE_DIRECTIONS) {
    probe
      .copy(centre)
      .addScaledVector(axis === 0 ? tangent : bitangent, sign * COAST_PROBE)
      .normalize()

    if (isLand(probe.x, probe.y, probe.z) > LAND_THRESHOLD !== centreIsLand) {
      disagrees = true
      break
    }
  }

  if (centreIsLand) return disagrees ? 'sand' : 'land'
  return disagrees ? 'shallowOcean' : 'deepOcean'
}

const UNIT_X = new THREE.Vector3(1, 0, 0)
const UNIT_Y = new THREE.Vector3(0, 1, 0)
const PROBE_DIRECTIONS: [0 | 1, number][] = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
]

/**
 * Builds the planet as a single flat-shaded mesh with per-vertex colours.
 *
 * `IcosahedronGeometry` is already non-indexed, so each triangle owns its three
 * vertices and can be pushed to its own radius and painted its own colour
 * without splitting anything.
 */
export function buildPlanetGeometry(detail: number, isLand: LandSampler): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, detail)
  const position = geometry.getAttribute('position') as THREE.BufferAttribute

  const vertexCount = position.count
  const colors = new Float32Array(vertexCount * 3)

  const random = seededRandom(0x5eed)
  const centre = new THREE.Vector3()
  const vertex = new THREE.Vector3()
  const color = new THREE.Color()

  for (let i = 0; i < vertexCount; i += 3) {
    centre.set(0, 0, 0)
    for (let v = 0; v < 3; v++) {
      centre.x += position.getX(i + v)
      centre.y += position.getY(i + v)
      centre.z += position.getZ(i + v)
    }
    centre.normalize()

    const terrain = classify(centre, isLand)

    let radius: number = ELEVATION[terrain]
    if (terrain === 'land') {
      // Enough variation to break up large landmasses into visible facets.
      radius += random() * 0.009
      color.setHex(COLORS.grass[(random() * COLORS.grass.length) | 0])
    } else {
      color.setHex(COLORS[terrain])
    }

    // Slight per-face brightness jitter, so flat areas still have texture.
    color.multiplyScalar(0.94 + random() * 0.12)

    for (let v = 0; v < 3; v++) {
      vertex
        .set(position.getX(i + v), position.getY(i + v), position.getZ(i + v))
        .normalize()
        .multiplyScalar(radius)
      position.setXYZ(i + v, vertex.x, vertex.y, vertex.z)

      colors[(i + v) * 3] = color.r
      colors[(i + v) * 3 + 1] = color.g
      colors[(i + v) * 3 + 2] = color.b
    }
  }

  position.needsUpdate = true
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  return geometry
}

export interface CloudLayer {
  group: THREE.Group
  dispose(): void
}

/**
 * Chunky cloud puffs instead of a texture: each cluster is a handful of
 * overlapping, squashed icospheres, which reads as cartoon cumulus once flat
 * shaded.
 */
export function buildClouds(clusterCount: number): CloudLayer {
  const group = new THREE.Group()
  const random = seededRandom(0xc10d)

  const geometry = new THREE.IcosahedronGeometry(1, 1)
  // Emissive floor so the underside of a puff never darkens to the hemisphere
  // light's ground colour, which turns white clouds into grey rocks.
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0xd2e2f2,
    emissiveIntensity: 0.72,
    flatShading: true,
    transparent: true,
    opacity: 0.95,
  })

  for (let i = 0; i < clusterCount; i++) {
    const cluster = new THREE.Group()

    // Even spread over the sphere: uniform in cos(latitude), uniform in longitude.
    const y = random() * 2 - 1
    const ring = Math.sqrt(1 - y * y)
    const angle = random() * Math.PI * 2
    const direction = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring)

    // Close to the surface. Any higher and they detach into orbiting debris.
    cluster.position.copy(direction).multiplyScalar(1.035 + random() * 0.02)
    // lookAt puts local -Z along the radius, so local XY is the tangent plane.
    cluster.lookAt(0, 0, 0)
    group.add(cluster)

    const puffCount = 3 + ((random() * 3) | 0)
    for (let p = 0; p < puffCount; p++) {
      const puff = new THREE.Mesh(geometry, material)
      const size = 0.05 + random() * 0.045

      // Spread across the tangent plane, overlapping enough to fuse into one
      // shape, and squashed along local Z — the radial axis.
      puff.position.set((random() - 0.5) * 0.13, (random() - 0.5) * 0.075, (random() - 0.5) * 0.012)
      puff.scale.set(size, size * 0.8, size * 0.42)
      // Only spin in the tangent plane; tumbling would undo the squash.
      puff.rotation.z = random() * Math.PI
      cluster.add(puff)
    }
  }

  return {
    group,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
