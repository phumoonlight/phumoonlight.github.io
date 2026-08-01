import * as THREE from 'three'

/**
 * The seven pinned places. Each one owns a landmark, a ground palette for its
 * diorama, and a backdrop gradient the page swaps to while you are there.
 */

export type TreeKind = 'conifer' | 'broadleaf' | 'palm' | 'none'

export interface LocationDef {
  id: string
  /** Shown in the hover label and the diorama caption. */
  label: string
  place: string
  landmarkName: string
  lat: number
  lon: number
  /** Key into LANDMARKS. */
  landmark: string
  /** Props keep outside this radius, leaving room for the landmark's footprint. */
  clearance: number
  trees: TreeKind
  palette: {
    grass: number
    soil: number
    rock: number
    /** CSS gradient stops for the page backdrop behind the diorama. */
    skyFrom: string
    skyTo: string
  }
}

export const LOCATIONS: LocationDef[] = [
  {
    id: 'us',
    label: 'United States',
    place: 'New York',
    landmarkName: 'Statue of Liberty',
    lat: 40.69,
    lon: -74.04,
    landmark: 'statueOfLiberty',
    clearance: 2.2,
    trees: 'broadleaf',
    palette: {
      grass: 0x5aa35e,
      soil: 0x6d5a48,
      rock: 0x7c7468,
      skyFrom: '#2d4f7c',
      skyTo: '#0a1226',
    },
  },
  {
    id: 'russia',
    label: 'Russia',
    place: 'Moscow',
    landmarkName: "St Basil's Cathedral",
    lat: 55.75,
    lon: 37.62,
    landmark: 'stBasils',
    clearance: 2.5,
    trees: 'conifer',
    palette: {
      grass: 0xdfe8f2,
      soil: 0x7b8398,
      rock: 0x8e97a8,
      skyFrom: '#3b4a72',
      skyTo: '#0b0f22',
    },
  },
  {
    id: 'europe',
    label: 'Europe',
    place: 'Paris',
    landmarkName: 'Eiffel Tower',
    lat: 48.86,
    lon: 2.29,
    landmark: 'eiffelTower',
    clearance: 2.1,
    trees: 'broadleaf',
    palette: {
      grass: 0x6ba85f,
      soil: 0x7a6349,
      rock: 0x89806f,
      skyFrom: '#4a4270',
      skyTo: '#0d0d22',
    },
  },
  {
    id: 'thailand',
    label: 'Thailand',
    place: 'Bangkok',
    landmarkName: 'Wat Arun',
    lat: 13.74,
    lon: 100.49,
    landmark: 'watArun',
    clearance: 2.8,
    trees: 'palm',
    palette: {
      grass: 0x63ac57,
      soil: 0x8a6b45,
      rock: 0x9c8a66,
      skyFrom: '#7a4a5c',
      skyTo: '#170c1e',
    },
  },
  {
    id: 'japan',
    label: 'Japan',
    place: 'Honshu',
    landmarkName: 'Mount Fuji',
    lat: 35.36,
    lon: 138.73,
    landmark: 'mountFuji',
    clearance: 3.4,
    trees: 'conifer',
    palette: {
      grass: 0x5f9b62,
      soil: 0x6f5d52,
      rock: 0x7f7a76,
      skyFrom: '#6b3f60',
      skyTo: '#120c22',
    },
  },
  {
    id: 'china',
    label: 'China',
    place: 'Beijing',
    landmarkName: 'Temple of Heaven',
    lat: 39.88,
    lon: 116.41,
    landmark: 'templeOfHeaven',
    clearance: 2.9,
    trees: 'broadleaf',
    palette: {
      grass: 0x6a9f52,
      soil: 0x87694a,
      rock: 0x938773,
      skyFrom: '#5b3f5f',
      skyTo: '#110c20',
    },
  },
  {
    id: 'australia',
    label: 'Australia',
    place: 'Sydney',
    landmarkName: 'Opera House',
    lat: -33.86,
    lon: 151.21,
    landmark: 'operaHouse',
    clearance: 3.1,
    trees: 'broadleaf',
    palette: {
      grass: 0x77a860,
      soil: 0x9c6f45,
      rock: 0xa88b68,
      skyFrom: '#1f5878',
      skyTo: '#07131f',
    },
  },
]

/**
 * Places a latitude/longitude on the unit sphere.
 *
 * This has to invert exactly what the land-mask sampler does, or pins drift off
 * their coastlines: the sampler reads `azimuth = atan2(z, -x)` and treats
 * `u = (lon + 180) / 360` as the equirectangular column.
 */
export function latLonToVector3(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const polar = THREE.MathUtils.degToRad(90 - lat)
  const azimuth = ((lon + 180) / 360) * Math.PI * 2
  const sinPolar = Math.sin(polar)

  return new THREE.Vector3(
    -Math.cos(azimuth) * sinPolar,
    Math.cos(polar),
    Math.sin(azimuth) * sinPolar
  ).multiplyScalar(radius)
}

/**
 * Globe rotation that brings a surface point to face the camera down +Z.
 *
 * Yaw swings the point into the YZ plane; pitch then lifts it to the equator.
 */
export function rotationFacing(point: THREE.Vector3): { yaw: number; pitch: number } {
  const horizontal = Math.sqrt(point.x * point.x + point.z * point.z)
  return {
    yaw: Math.atan2(-point.x, point.z),
    pitch: Math.atan2(point.y, horizontal),
  }
}
