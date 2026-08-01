import * as THREE from 'three'

/**
 * Shared builder for the low-poly props. Flat shading and cached materials keep
 * the landmarks in the same visual language as the planet, and let a diorama of
 * a few hundred meshes run on a handful of materials.
 */
export class PartFactory {
  private readonly materials = new Map<string, THREE.MeshLambertMaterial>()
  private readonly owned: { dispose(): void }[] = []

  material(color: number, options: MaterialOptions = {}): THREE.MeshLambertMaterial {
    const emissive = options.emissive ?? 0x000000
    const doubleSided = options.doubleSided ?? false
    const key = `${color}|${emissive}|${doubleSided}`

    const cached = this.materials.get(key)
    if (cached) return cached

    const material = new THREE.MeshLambertMaterial({
      color,
      emissive,
      emissiveIntensity: options.emissiveIntensity ?? 1,
      flatShading: true,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    })

    this.materials.set(key, material)
    this.owned.push(material)
    return material
  }

  /** Creates a mesh, parents it, and takes ownership of the geometry. */
  add(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: number,
    position: Triple = [0, 0, 0],
    rotation: Triple = [0, 0, 0],
    options: MaterialOptions = {}
  ): THREE.Mesh {
    this.owned.push(geometry)

    const mesh = new THREE.Mesh(geometry, this.material(color, options))
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    parent.add(mesh)
    return mesh
  }

  own<T extends { dispose(): void }>(resource: T): T {
    this.owned.push(resource)
    return resource
  }

  dispose(): void {
    for (const resource of this.owned) resource.dispose()
    this.owned.length = 0
    this.materials.clear()
  }
}

export type Triple = [number, number, number]

export interface MaterialOptions {
  emissive?: number
  emissiveIntensity?: number
  /** Needed for open surfaces like the Opera House shells. */
  doubleSided?: boolean
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

export const cyl = (radiusTop: number, radiusBottom: number, height: number, segments = 12) =>
  new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)

export const cone = (radius: number, height: number, segments = 12) =>
  new THREE.ConeGeometry(radius, height, segments)

export const ball = (radius: number, segments = 10) =>
  new THREE.SphereGeometry(radius, segments, Math.max(6, segments - 2))

export const rock = (radius: number) => new THREE.IcosahedronGeometry(radius, 0)

/**
 * Revolves a 2D profile, which is by far the cheapest way to get onion domes,
 * temple spires and the Eiffel Tower's flare. Low segment counts keep the
 * result faceted.
 */
export const lathe = (profile: [number, number][], segments = 10) =>
  new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    segments
  )

/**
 * An orange-slice wedge of a sphere: pointed at the top, widening downward.
 * Centred on +Z. This is the Opera House shell.
 */
export const sail = (radius: number, phiLength: number, thetaLength: number) =>
  new THREE.SphereGeometry(radius, 16, 10, Math.PI / 2 - phiLength / 2, phiLength, 0, thetaLength)
