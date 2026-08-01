import * as THREE from 'three'
import { ball, box, cone, cyl, lathe, PartFactory, sail } from './parts'

/**
 * Seven landmarks, each assembled from primitives in the same faceted style as
 * the planet. They are silhouette studies rather than models — at diorama scale
 * the outline is all that carries, so detail goes into proportion and colour.
 *
 * Every builder puts its base at y = 0 and keeps within roughly 4 units.
 */

export type LandmarkBuilder = (factory: PartFactory) => THREE.Group

/** Profile for a Russian onion dome, revolved around Y. */
const ONION_PROFILE: [number, number][] = [
  [0, 0],
  [0.5, 0.1],
  [0.72, 0.28],
  [0.68, 0.5],
  [0.46, 0.72],
  [0.22, 0.88],
  [0.07, 0.98],
  [0, 1.02],
]

/** Statue of Liberty — pedestal, robe, crown, torch arm. */
const statueOfLiberty: LandmarkBuilder = (f) => {
  const group = new THREE.Group()
  const stone = 0xa8a093
  const patina = 0x74c0a8

  f.add(group, box(2.1, 0.45, 2.1), stone, [0, 0.22, 0])
  f.add(group, cyl(0.62, 0.95, 1.5, 4), stone, [0, 1.2, 0], [0, Math.PI / 4, 0])
  f.add(group, box(1.15, 0.16, 1.15), stone, [0, 2.0, 0])

  // Robe: a tapered eight-sided drum reads as drapery at this scale.
  f.add(group, cyl(0.3, 0.55, 1.6, 8), patina, [0, 2.85, 0])
  f.add(group, cyl(0.24, 0.3, 0.22, 8), patina, [0, 3.74, 0])
  f.add(group, ball(0.21, 10), patina, [0, 3.98, 0])

  // Crown spikes, radiating from just above the head.
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI / 2 + (i / 6) * Math.PI
    f.add(
      group,
      cone(0.045, 0.3, 5),
      patina,
      [Math.sin(angle) * 0.23, 4.12, Math.cos(angle) * 0.23],
      [0.42 * Math.cos(angle), angle, 0.42 * Math.sin(angle)]
    )
  }

  // Raised right arm, leaning out from the shoulder.
  f.add(group, cyl(0.075, 0.095, 1.15, 6), patina, [0.42, 4.0, 0], [0, 0, -0.42])
  f.add(group, cyl(0.13, 0.09, 0.2, 8), 0xd9b45a, [0.66, 4.6, 0])
  f.add(group, cone(0.13, 0.28, 8), 0xffd97a, [0.66, 4.82, 0], [0, 0, 0], {
    emissive: 0xffb020,
    emissiveIntensity: 0.9,
  })

  // Tablet held against the left side.
  f.add(group, box(0.34, 0.46, 0.14), patina, [-0.42, 3.1, 0.16], [0, 0, 0.35])

  return group
}

/** St Basil's Cathedral — a tent-roofed core ringed by onion domes. */
const stBasils: LandmarkBuilder = (f) => {
  const group = new THREE.Group()
  const brick = 0xc65a45
  const stone = 0xf0e7d8

  f.add(group, cyl(1.75, 1.95, 0.5, 8), stone, [0, 0.25, 0])

  f.add(group, cyl(0.45, 0.62, 1.9, 8), brick, [0, 1.45, 0])
  f.add(group, cone(0.62, 1.25, 8), 0xdca94d, [0, 3.02, 0])
  f.add(group, ball(0.13, 8), 0xe8c766, [0, 3.72, 0])

  // Four satellite towers, each with a differently coloured dome.
  const domeColors = [0x4f9d69, 0x3d7bbf, 0xd8b845, 0xb8473a]
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(angle) * 1.15
    const z = Math.sin(angle) * 1.15

    f.add(group, cyl(0.34, 0.4, 1.3, 8), brick, [x, 1.15, z])

    // Wide enough to bulge past the tower below it, or it reads as a lid.
    const dome = f.own(lathe(ONION_PROFILE, 8))
    const mesh = new THREE.Mesh(dome, f.material(domeColors[i]))
    mesh.position.set(x, 1.75, z)
    mesh.scale.setScalar(0.72)
    group.add(mesh)

    f.add(group, cyl(0.02, 0.02, 0.26, 4), 0xe8c766, [x, 2.62, z])
    f.add(group, box(0.14, 0.03, 0.03), 0xe8c766, [x, 2.68, z])
  }

  return group
}

/** Eiffel Tower — four splayed legs under a lathed, flaring shaft. */
const eiffelTower: LandmarkBuilder = (f) => {
  const group = new THREE.Group()
  const iron = 0x9c8464

  // Legs kept separate so the arch underneath stays open.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(angle)
    const z = Math.sin(angle)
    const lean = 0.36

    f.add(
      group,
      cyl(0.1, 0.21, 1.95, 4),
      iron,
      [x * 0.78, 0.96, z * 0.78],
      [z * lean, -angle, -x * lean]
    )
  }

  f.add(group, box(1.7, 0.11, 1.7), iron, [0, 1.92, 0])

  // Flaring shaft: a four-segment lathe gives the square section and the curve.
  // Kept thin — a fat shaft turns the silhouette into a derrick.
  const shaft = f.own(
    lathe(
      [
        [0.42, 0],
        [0.29, 0.65],
        [0.2, 1.3],
        [0.13, 1.95],
        [0.085, 2.5],
        [0.06, 2.95],
      ],
      4
    )
  )
  const shaftMesh = new THREE.Mesh(shaft, f.material(iron))
  shaftMesh.position.y = 1.96
  shaftMesh.rotation.y = Math.PI / 4
  group.add(shaftMesh)

  f.add(group, box(0.5, 0.09, 0.5), iron, [0, 3.72, 0])
  f.add(group, cyl(0.075, 0.12, 0.38, 4), iron, [0, 5.06, 0], [0, Math.PI / 4, 0])
  f.add(group, cyl(0.025, 0.04, 0.5, 6), iron, [0, 5.48, 0])
  f.add(group, ball(0.055, 8), 0xffd97a, [0, 5.76, 0], [0, 0, 0], {
    emissive: 0xffb020,
    emissiveIntensity: 0.8,
  })

  return group
}

/** Wat Arun — a central prang on stepped terraces, with four satellites. */
const watArun: LandmarkBuilder = (f) => {
  const group = new THREE.Group()
  const cream = 0xefe4cd
  const gold = 0xdcb455

  f.add(group, cyl(1.85, 2.05, 0.35, 8), cream, [0, 0.17, 0])
  f.add(group, cyl(1.35, 1.6, 0.4, 8), cream, [0, 0.55, 0])

  // The prang's profile: a tapering tower with a stepped, slightly convex waist.
  const prangProfile: [number, number][] = [
    [0.78, 0],
    [0.74, 0.4],
    [0.66, 0.75],
    [0.7, 0.85],
    [0.56, 1.25],
    [0.6, 1.35],
    [0.44, 1.8],
    [0.34, 2.2],
    [0.24, 2.6],
    [0.13, 3.0],
    [0.06, 3.3],
    [0, 3.5],
  ]

  const prang = f.own(lathe(prangProfile, 8))
  const central = new THREE.Mesh(prang, f.material(cream))
  central.position.y = 0.75
  group.add(central)
  f.add(group, cone(0.07, 0.4, 6), gold, [0, 4.4, 0])

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(angle) * 1.45
    const z = Math.sin(angle) * 1.45

    const satellite = new THREE.Mesh(prang, f.material(cream))
    satellite.position.set(x, 0.75, z)
    satellite.scale.setScalar(0.42)
    group.add(satellite)

    f.add(group, cone(0.04, 0.22, 6), gold, [x, 2.35, z])
  }

  return group
}

/** Mount Fuji with a torii gate in the foreground. */
const mountFuji: LandmarkBuilder = (f) => {
  const group = new THREE.Group()
  const slope = 0x5d6d99
  const vermilion = 0xd8452f

  // Steep and narrow. A wide cone spreads across the whole island and stops
  // reading as a mountain at all.
  const height = 3.5
  const base = 2.15
  f.add(group, cone(base, height, 14), slope, [0, height / 2, 0])

  // Snow cap sized to sit exactly on the cone's slope.
  const capHeight = 1.1
  const capBase = base * (capHeight / height)
  f.add(group, cone(capBase, capHeight, 14), 0xf4f8ff, [0, height - capHeight / 2, 0])

  const torii = new THREE.Group()
  torii.position.set(0, 0, 2.55)
  group.add(torii)

  for (const side of [-1, 1]) {
    f.add(torii, cyl(0.085, 0.105, 1.35, 8), vermilion, [side * 0.72, 0.67, 0])
  }
  f.add(torii, box(2.05, 0.13, 0.24), vermilion, [0, 1.4, 0])
  f.add(torii, box(1.78, 0.1, 0.17), vermilion, [0, 1.12, 0])
  f.add(torii, box(0.12, 0.28, 0.15), vermilion, [0, 1.26, 0])

  return group
}

/** Temple of Heaven — three blue roofs on a white marble terrace. */
const templeOfHeaven: LandmarkBuilder = (f) => {
  const group = new THREE.Group()
  const marble = 0xf2eee4
  const lacquer = 0xb8402f
  const roof = 0x33619f

  f.add(group, cyl(2.05, 2.25, 0.26, 16), marble, [0, 0.13, 0])
  f.add(group, cyl(1.75, 1.9, 0.24, 16), marble, [0, 0.38, 0])
  f.add(group, cyl(1.45, 1.6, 0.22, 16), marble, [0, 0.61, 0])

  const tiers: [number, number, number, number][] = [
    // drum radius, drum height, roof radius, roof height
    [1.15, 0.6, 1.52, 0.52],
    [0.92, 0.5, 1.2, 0.46],
    [0.68, 0.42, 0.9, 0.46],
  ]

  let y = 0.72
  for (const [drumRadius, drumHeight, roofRadius, roofHeight] of tiers) {
    f.add(group, cyl(drumRadius, drumRadius, drumHeight, 16), lacquer, [0, y + drumHeight / 2, 0])
    y += drumHeight
    f.add(group, cone(roofRadius, roofHeight, 16), roof, [0, y + roofHeight / 2, 0])
    y += roofHeight
  }

  f.add(group, ball(0.15, 10), 0xe8c766, [0, y + 0.1, 0])
  f.add(group, cone(0.07, 0.22, 8), 0xe8c766, [0, y + 0.3, 0])

  return group
}

/** Sydney Opera House — overlapping sphere wedges on a sandstone podium. */
const operaHouse: LandmarkBuilder = (f) => {
  const group = new THREE.Group()
  const shell = 0xfaf7f0
  const podium = 0xe0d5bd

  f.add(group, box(4.0, 0.42, 2.3), podium, [0, 0.21, 0])
  f.add(group, box(4.4, 0.18, 2.7), podium, [0, 0.09, 0])

  /**
   * One cluster of shells, marching back and shrinking. Narrow in phi and deep
   * in theta: a wide wedge reads as a dome, and the whole point is the sail.
   */
  const cluster = (offsetX: number, offsetZ: number, scale: number, flip: number) => {
    const sizes = [1.65, 1.3, 0.95]

    sizes.forEach((radius, index) => {
      const geometry = f.own(sail(radius, 1.05, 1.4))
      const mesh = new THREE.Mesh(geometry, f.material(shell, { doubleSided: true }))

      // Leaning back and stepping away, so each shell clears the one in front.
      mesh.position.set(offsetX + flip * index * 0.22, 0.34, offsetZ - index * 0.78)
      mesh.rotation.set(-0.5 - index * 0.06, flip * (0.2 + index * 0.1), 0)
      mesh.scale.set(scale, scale, scale)
      group.add(mesh)
    })
  }

  cluster(-1.0, 0.85, 1, 1)
  cluster(1.15, 0.3, 0.72, -1)

  return group
}

export const LANDMARKS: Record<string, LandmarkBuilder> = {
  statueOfLiberty,
  stBasils,
  eiffelTower,
  watArun,
  mountFuji,
  templeOfHeaven,
  operaHouse,
}
