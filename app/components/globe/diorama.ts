import * as THREE from 'three'
import { LANDMARKS } from './landmarks'
import type { LocationDef, TreeKind } from './locations'
import { ball, cone, cyl, PartFactory, rock } from './parts'
import { seededRandom } from './planet'

/**
 * A floating island carrying one landmark, viewed isometrically.
 *
 * The island reads better than a flat plane: the terraced underside gives the
 * orthographic camera something to describe depth with, which a ground plane
 * cannot do without a horizon.
 */

/** Radius of the walkable top surface. */
const ISLAND_RADIUS = 4.8

/** Nine sides: chunky enough to read as faceted, round enough to read as land. */
const ISLAND_SIDES = 9

export interface Diorama {
  group: THREE.Group
  dispose(): void
}

function addTree(f: PartFactory, parent: THREE.Object3D, kind: TreeKind, scale: number) {
  const tree = new THREE.Group()
  parent.add(tree)
  tree.scale.setScalar(scale)

  if (kind === 'conifer') {
    f.add(tree, cyl(0.06, 0.09, 0.36, 6), 0x6b4f3a, [0, 0.18, 0])
    f.add(tree, cone(0.38, 0.62, 7), 0x2f7a4a, [0, 0.62, 0])
    f.add(tree, cone(0.3, 0.55, 7), 0x368852, [0, 1.0, 0])
    f.add(tree, cone(0.2, 0.45, 7), 0x3d945a, [0, 1.34, 0])
    return
  }

  if (kind === 'palm') {
    // Trunk leans, and the fronds fan out from wherever it ends up.
    const lean = 0.16
    f.add(tree, cyl(0.05, 0.09, 1.15, 6), 0x8a6a45, [0, 0.58, 0], [0, 0, lean])

    const crown = new THREE.Group()
    crown.position.set(-Math.sin(lean) * 1.15, Math.cos(lean) * 1.15, 0)
    tree.add(crown)

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      f.add(
        crown,
        cone(0.14, 0.62, 4),
        i % 2 === 0 ? 0x3f9455 : 0x4aa35f,
        [Math.cos(angle) * 0.26, 0.02, Math.sin(angle) * 0.26],
        [Math.sin(angle) * 1.25, -angle, -Math.cos(angle) * 1.25]
      )
    }
    return
  }

  f.add(tree, cyl(0.07, 0.1, 0.34, 6), 0x74563d, [0, 0.17, 0])
  f.add(tree, ball(0.42, 8), 0x4c9a4f, [0, 0.7, 0])
  f.add(tree, ball(0.3, 8), 0x57a95a, [0.22, 0.98, -0.12])
}

export function buildDiorama(location: LocationDef): Diorama {
  const f = new PartFactory()
  const group = new THREE.Group()
  const { grass, soil, rock: rockColor } = location.palette

  // Terraced underside, narrowing to a point — the island's floating profile.
  f.add(group, cyl(ISLAND_RADIUS, ISLAND_RADIUS - 0.2, 0.5, ISLAND_SIDES), grass, [0, -0.25, 0])
  f.add(
    group,
    cyl(ISLAND_RADIUS - 0.25, ISLAND_RADIUS - 1.0, 1.0, ISLAND_SIDES),
    soil,
    [0, -1.0, 0]
  )
  f.add(
    group,
    cyl(ISLAND_RADIUS - 1.1, ISLAND_RADIUS - 2.6, 1.3, ISLAND_SIDES),
    rockColor,
    [0, -2.15, 0]
  )
  f.add(
    group,
    cone(ISLAND_RADIUS - 2.7, 1.6, ISLAND_SIDES),
    rockColor,
    [0, -3.6, 0],
    [Math.PI, 0, 0]
  )

  const landmark = LANDMARKS[location.landmark]?.(f)
  if (landmark) group.add(landmark)

  // Props: seeded so a location looks identical every time it is opened.
  const random = seededRandom(
    location.id.split('').reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7)
  )

  // Landmarks differ hugely in footprint — Fuji's base is wider than the Eiffel
  // Tower's whole diorama — so the exclusion radius comes from the location.
  const clearance = Math.min(location.clearance, ISLAND_RADIUS - 1.0)

  const propCount = 26
  for (let i = 0; i < propCount; i++) {
    const angle = random() * Math.PI * 2
    const radius = clearance + random() * (ISLAND_RADIUS - clearance - 0.5)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius

    if (location.trees !== 'none' && random() < 0.62) {
      const holder = new THREE.Group()
      holder.position.set(x, 0, z)
      holder.rotation.y = random() * Math.PI * 2
      group.add(holder)
      addTree(f, holder, location.trees, 0.7 + random() * 0.55)
      continue
    }

    const stone = f.add(
      group,
      rock(0.16 + random() * 0.22),
      rockColor,
      [x, 0.05, z],
      [random() * Math.PI, random() * Math.PI, random() * Math.PI]
    )
    stone.scale.y = 0.7
  }

  return {
    group,
    dispose() {
      f.dispose()
    },
  }
}
