'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildDiorama, type Diorama } from './diorama'
import { latLonToVector3, LOCATIONS, rotationFacing, type LocationDef } from './locations'
import { buildClouds, buildPlanetGeometry, loadLandMask, seededRandom } from './planet'
import { buildPins, isPinFacingCamera } from './pins'

/** Direction the sun shines from, in world space. Fixed — only the globe turns. */
const SUN_DIRECTION = new THREE.Vector3(1, 0.28, 0.55).normalize()

/** Radians per second while idle. Roughly one rotation every 50s. */
const AUTO_SPIN_SPEED = 0.125

/** How much a dragged pixel turns the globe. */
const DRAG_SENSITIVITY = 0.0055

/** Keeps the poles from swinging past vertical. */
const MAX_PITCH = Math.PI / 2 - 0.25

/** Share of drag momentum retained per second after release. */
const SPIN_DAMPING = 0.06

/** Globe radius plus breathing room, used to frame the camera. */
const FRAMED_RADIUS = 1.18

/** Below this aspect the globe is framed by width and lifted clear of the copy. */
const PORTRAIT_ASPECT = 0.9

/** Extra margin in portrait, where the overlaid text needs the lower half. */
const PORTRAIT_FRAMED_RADIUS = 1.5

/** Upward shift in portrait, as a fraction of camera distance. */
const PORTRAIT_LIFT = 0.13

const LAND_MASK_URL = '/earth-land-mask.jpg'

/**
 * Icosahedron subdivisions. three.js splits each edge into `detail + 1`
 * segments, so this is 20 · (detail + 1)² faces — 4500, not the 20 · 4^detail
 * the name suggests.
 */
const PLANET_DETAIL = 14

/** Fraction of the framed distance the camera dives to when entering a pin. */
const ZOOM_IN_SCALE = 0.46

/** Must match the overlay's CSS transition, or the swap shows through. */
const FADE_MS = 480

/** Pointer travel, in pixels, above which a press counts as a drag not a click. */
const CLICK_SLOP = 6

/** Half-height of the isometric view, in world units. */
const DIORAMA_EXTENT = 5.9

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform vec3 glowColor;

  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vec3 normal = normalize(vWorldNormal);

    float fresnel = pow(1.0 - abs(dot(normal, vViewDirection)), 2.6);
    float daylight = smoothstep(-0.5, 0.3, dot(normal, sunDirection));

    gl_FragColor = vec4(glowColor, fresnel * (0.1 + 0.9 * daylight) * 0.7);
  }
`

function createStarfield(count: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  const random = seededRandom(0x57a5)

  for (let i = 0; i < count; i++) {
    const z = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const ring = Math.sqrt(1 - z * z)
    const distance = 45 + random() * 30

    positions[i * 3] = Math.cos(angle) * ring * distance
    positions[i * 3 + 1] = Math.sin(angle) * ring * distance
    positions[i * 3 + 2] = z * distance
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })

  return new THREE.Points(geometry, material)
}

/** Shortest signed angular distance from `from` to `to`. */
function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

interface Controls {
  open(location: LocationDef): void
  close(): void
}

export default function World() {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<Controls | null>(null)
  const timersRef = useRef<number[]>([])

  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState<LocationDef | null>(null)
  const [covered, setCovered] = useState(false)

  const later = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay)
    timersRef.current.push(id)
  }, [])

  // Clearing the hash drives the close; see the hash-sync effect below.
  const close = useCallback(() => {
    window.location.hash = ''
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const disposables: { dispose(): void }[] = []
    // The mask load is async, so teardown can beat setup to the finish.
    let cancelled = false
    let teardown: (() => void) | null = null

    const start = async () => {
      let isLand
      try {
        isLand = await loadLandMask(LAND_MASK_URL)
      } catch {
        if (!cancelled) setFailed(true)
        return
      }
      if (cancelled) return

      let renderer: THREE.WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        })
      } catch {
        setFailed(true)
        return
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(container.clientWidth, container.clientHeight)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
      renderer.domElement.style.display = 'block'
      renderer.domElement.style.touchAction = 'none'
      container.appendChild(renderer.domElement)

      // --- Globe scene -----------------------------------------------------

      const globeScene = new THREE.Scene()
      const globeCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)

      // Planet and halo together, so portrait layouts can lift both as one unit.
      const world = new THREE.Group()
      globeScene.add(world)

      const globe = new THREE.Group()
      world.add(globe)

      const planetGeometry = buildPlanetGeometry(PLANET_DETAIL, isLand)
      const planetMaterial = new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
      })
      disposables.push(planetGeometry, planetMaterial)
      globe.add(new THREE.Mesh(planetGeometry, planetMaterial))

      const clouds = buildClouds(26)
      disposables.push(clouds)
      globe.add(clouds.group)

      const pinField = buildPins(LOCATIONS)
      disposables.push(pinField)
      globe.add(pinField.group)

      const atmosphereGeometry = new THREE.SphereGeometry(1.05, 64, 64)
      const atmosphereMaterial = new THREE.ShaderMaterial({
        uniforms: {
          sunDirection: { value: SUN_DIRECTION },
          glowColor: { value: new THREE.Color(0x6fc0ff) },
        },
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
      disposables.push(atmosphereGeometry, atmosphereMaterial)
      world.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial))

      const stars = createStarfield(1200)
      disposables.push(stars.geometry, stars.material as THREE.Material)
      globeScene.add(stars)

      const sun = new THREE.DirectionalLight(0xfff2df, 2.6)
      sun.position.copy(SUN_DIRECTION).multiplyScalar(10)
      globeScene.add(sun)
      globeScene.add(new THREE.HemisphereLight(0x9fd4ff, 0x16204a, 1.05))

      // --- Diorama scene ---------------------------------------------------

      const dioramaScene = new THREE.Scene()
      const dioramaCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
      // Classic isometric three-quarter, looking down the diagonal.
      dioramaCamera.position.set(11, 9.5, 11)
      dioramaCamera.lookAt(0, 0.4, 0)

      const dioramaPivot = new THREE.Group()
      dioramaScene.add(dioramaPivot)

      const dioramaSun = new THREE.DirectionalLight(0xfff4e6, 2.5)
      dioramaSun.position.set(6, 10, 4)
      dioramaScene.add(dioramaSun)
      // Ground colour kept well off black: the island's underside faces away from
      // every light, and a dark one reads as a hole rather than as rock.
      dioramaScene.add(new THREE.HemisphereLight(0xbcd8ff, 0x5a5375, 1.2))

      // Built on first visit, then kept — rebuilding on every open would stall.
      const dioramaCache = new Map<string, Diorama>()

      const showDiorama = (location: LocationDef) => {
        let diorama = dioramaCache.get(location.id)
        if (!diorama) {
          diorama = buildDiorama(location)
          dioramaCache.set(location.id, diorama)
        }

        dioramaPivot.clear()
        dioramaPivot.add(diorama.group)
        dioramaPivot.rotation.y = 0
      }

      // --- Framing ---------------------------------------------------------

      let framedDistance = 3.2

      const fitCamera = (width: number, height: number) => {
        const aspect = width / height

        globeCamera.aspect = aspect
        const verticalHalfAngle = THREE.MathUtils.degToRad(globeCamera.fov) / 2
        const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect)

        const halfAngle = Math.min(verticalHalfAngle, horizontalHalfAngle)
        const portrait = aspect < PORTRAIT_ASPECT

        framedDistance = (portrait ? PORTRAIT_FRAMED_RADIUS : FRAMED_RADIUS) / Math.sin(halfAngle)
        globeCamera.updateProjectionMatrix()

        world.position.y = portrait ? framedDistance * PORTRAIT_LIFT : 0

        // Orthographic: widen the frustum rather than moving the camera.
        const extent = Math.max(DIORAMA_EXTENT, DIORAMA_EXTENT / aspect)
        dioramaCamera.left = -extent * aspect
        dioramaCamera.right = extent * aspect
        dioramaCamera.top = extent
        dioramaCamera.bottom = -extent
        dioramaCamera.updateProjectionMatrix()
      }

      fitCamera(container.clientWidth, container.clientHeight)

      // --- Interaction state ----------------------------------------------

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      let mode: 'globe' | 'diorama' = 'globe'
      let yaw = -0.9
      let pitch = 0.3
      let yawVelocity = 0
      let pitchVelocity = 0
      let dragging = false
      let dragMoved = 0
      let lastPointer = { x: 0, y: 0 }
      let cloudOffset = 0

      /** Set while diving into a pin: overrides auto-spin and drag momentum. */
      let focus: { yaw: number; pitch: number } | null = null
      let zoomScale = 1
      let zoomTarget = 1

      let dioramaYaw = 0
      let dioramaYawVelocity = 0

      let hovered: THREE.Group | null = null

      const canvas = renderer.domElement
      const raycaster = new THREE.Raycaster()
      const pointerNdc = new THREE.Vector2()

      const pinAt = (event: PointerEvent): THREE.Group | null => {
        const bounds = canvas.getBoundingClientRect()
        pointerNdc.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
        pointerNdc.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1

        raycaster.setFromCamera(pointerNdc, globeCamera)
        const hits = raycaster.intersectObjects(pinField.group.children, true)

        for (const hit of hits) {
          let node: THREE.Object3D | null = hit.object
          while (node && !node.userData.locationId) node = node.parent
          // Depth hides far-side pins, but the ray still reaches them.
          if (node && isPinFacingCamera(node, globeCamera)) return node as THREE.Group
        }
        return null
      }

      const setHovered = (pin: THREE.Group | null) => {
        if (hovered === pin) return
        if (hovered) hovered.scale.setScalar(1)
        hovered = pin
        if (hovered) hovered.scale.setScalar(1.35)

        const tooltip = tooltipRef.current
        if (!tooltip) return

        if (!pin) {
          tooltip.style.opacity = '0'
          return
        }

        const location = LOCATIONS.find((entry) => entry.id === pin.userData.locationId)
        tooltip.textContent = location ? `${location.label} · ${location.landmarkName}` : ''
        tooltip.style.opacity = '1'
      }

      const onPointerDown = (event: PointerEvent) => {
        dragging = true
        dragMoved = 0
        lastPointer = { x: event.clientX, y: event.clientY }
        canvas.setPointerCapture(event.pointerId)
        container.style.cursor = 'grabbing'
      }

      const onPointerMove = (event: PointerEvent) => {
        const deltaX = event.clientX - lastPointer.x
        const deltaY = event.clientY - lastPointer.y

        if (dragging) {
          dragMoved += Math.abs(deltaX) + Math.abs(deltaY)
          lastPointer = { x: event.clientX, y: event.clientY }

          if (mode === 'diorama') {
            dioramaYaw -= deltaX * DRAG_SENSITIVITY
            dioramaYawVelocity = -deltaX * DRAG_SENSITIVITY
          } else if (!focus) {
            yaw += deltaX * DRAG_SENSITIVITY
            pitch = THREE.MathUtils.clamp(pitch + deltaY * DRAG_SENSITIVITY, -MAX_PITCH, MAX_PITCH)
            yawVelocity = deltaX * DRAG_SENSITIVITY
            pitchVelocity = deltaY * DRAG_SENSITIVITY
          }
          return
        }

        if (mode !== 'globe' || focus) return

        const pin = pinAt(event)
        setHovered(pin)
        container.style.cursor = pin ? 'pointer' : 'grab'

        const tooltip = tooltipRef.current
        if (tooltip && pin) {
          const bounds = container.getBoundingClientRect()
          tooltip.style.transform = `translate(${event.clientX - bounds.left}px, ${
            event.clientY - bounds.top
          }px)`
        }
      }

      const endDrag = (event: PointerEvent) => {
        if (!dragging) return
        dragging = false
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        container.style.cursor = mode === 'globe' ? 'grab' : 'default'

        // A press that barely moved is a click, not the end of a drag.
        if (dragMoved > CLICK_SLOP || mode !== 'globe' || focus) return

        const pin = pinAt(event)
        if (!pin) return

        // Route through the hash rather than calling open directly, so the
        // URL, the browser's Back button and the scene never disagree.
        const location = LOCATIONS.find((entry) => entry.id === pin.userData.locationId)
        if (location) window.location.hash = location.id
      }

      const onPointerLeave = () => setHovered(null)

      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', endDrag)
      canvas.addEventListener('pointercancel', endDrag)
      canvas.addEventListener('pointerleave', onPointerLeave)
      container.style.cursor = 'grab'

      // Tracked here rather than read from React state, so the hash sync can
      // call open/close idempotently without the transition restarting.
      let currentId: string | null = null

      controlsRef.current = {
        open(location) {
          if (currentId === location.id) return
          currentId = location.id

          setHovered(null)
          // Aim at the pin and dive; the fade covers the actual scene swap.
          focus = rotationFacing(latLonToVector3(location.lat, location.lon, 1))
          zoomTarget = ZOOM_IN_SCALE
          yawVelocity = 0
          pitchVelocity = 0

          setCovered(true)
          later(() => {
            showDiorama(location)
            mode = 'diorama'
            dioramaYaw = 0
            dioramaYawVelocity = 0
            container.style.cursor = 'default'
            setActive(location)
            setCovered(false)
          }, FADE_MS)
        },

        close() {
          if (currentId === null) return
          currentId = null

          setCovered(true)
          later(() => {
            mode = 'globe'
            // Pull back out, but stay looking at wherever they just were.
            zoomTarget = 1
            focus = null
            container.style.cursor = 'grab'
            setActive(null)
            setCovered(false)
          }, FADE_MS)
        },
      }

      // Timer, not the deprecated Clock. Connecting it to the document enables
      // the Page Visibility API, so a backgrounded tab reports a zero delta
      // instead of the whole time it spent hidden.
      const timer = new THREE.Timer()
      timer.connect(document)

      renderer.setAnimationLoop((time) => {
        // rAF's timestamp shares performance.now()'s origin, so handing it over
        // is both cheaper and steadier than letting Timer sample the clock again.
        timer.update(time)

        // Still clamped: visibility covers backgrounding, but a long main-thread
        // stall can hand back a large delta on a visible tab too.
        const delta = Math.min(timer.getDelta(), 0.1)
        // Frame-rate independent easing toward the current target.
        const ease = 1 - Math.pow(0.005, delta)

        zoomScale += (zoomTarget - zoomScale) * ease

        if (focus) {
          yaw += angleDelta(yaw, focus.yaw) * ease
          pitch += (focus.pitch - pitch) * ease
        } else if (!dragging) {
          yaw += yawVelocity
          pitch = THREE.MathUtils.clamp(pitch + pitchVelocity, -MAX_PITCH, MAX_PITCH)

          const decay = Math.pow(SPIN_DAMPING, delta)
          yawVelocity *= decay
          pitchVelocity *= decay

          if (!prefersReducedMotion && mode === 'globe') yaw += AUTO_SPIN_SPEED * delta
        }

        globe.rotation.y = yaw
        globe.rotation.x = pitch
        globeCamera.position.z = framedDistance * zoomScale

        if (!prefersReducedMotion) cloudOffset += delta * 0.018
        clouds.group.rotation.y = cloudOffset
        stars.rotation.y += delta * 0.004

        // Pins ride the globe, so they must undo its spin to stay upright-ish
        // relative to the viewer; scaling is handled on hover instead.
        if (mode === 'diorama') {
          if (!dragging) {
            dioramaYaw += dioramaYawVelocity
            dioramaYawVelocity *= Math.pow(SPIN_DAMPING, delta)
            if (!prefersReducedMotion) dioramaYaw += 0.09 * delta
          }
          dioramaPivot.rotation.y = dioramaYaw
          renderer.render(dioramaScene, dioramaCamera)
        } else {
          renderer.render(globeScene, globeCamera)
        }
      })

      setReady(true)

      const resizeObserver = new ResizeObserver(() => {
        const { clientWidth, clientHeight } = container
        if (clientWidth === 0 || clientHeight === 0) return

        fitCamera(clientWidth, clientHeight)
        renderer.setSize(clientWidth, clientHeight)
      })
      resizeObserver.observe(container)

      teardown = () => {
        resizeObserver.disconnect()
        renderer.setAnimationLoop(null)
        // connect() registered a visibilitychange listener on the document.
        timer.dispose()

        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', endDrag)
        canvas.removeEventListener('pointercancel', endDrag)
        canvas.removeEventListener('pointerleave', onPointerLeave)

        for (const diorama of dioramaCache.values()) diorama.dispose()
        dioramaCache.clear()
        for (const item of disposables) item.dispose()
        renderer.dispose()
        canvas.remove()
        controlsRef.current = null
      }
    }

    void start()

    const timers = timersRef.current
    return () => {
      cancelled = true
      for (const id of timers) window.clearTimeout(id)
      timers.length = 0
      teardown?.()
    }
  }, [later])

  /**
   * The hash is the single source of truth for which view is showing: `#japan`
   * opens that diorama. Pin clicks and the back button only write to it, which
   * makes every location linkable and browser Back work as expected.
   */
  useEffect(() => {
    if (!ready) return

    const sync = () => {
      const id = window.location.hash.replace(/^#/, '')
      const location = LOCATIONS.find((entry) => entry.id === id)
      if (location) controlsRef.current?.open(location)
      else controlsRef.current?.close()
    }

    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [ready])

  // Escape is the expected way out of a full-screen detail view.
  useEffect(() => {
    if (!active) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, close])

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div
          aria-hidden
          className="size-64 rounded-full bg-[radial-gradient(circle_at_32%_28%,#3f7fd4,#132a52_58%,#050b18)] shadow-[0_0_90px_-10px_rgba(79,157,255,0.5)]"
        />
      </div>
    )
  }

  return (
    // isolate keeps the backdrop's negative z-index inside this component.
    <div className="relative isolate h-full w-full">
      {/* Backdrop swaps to the location's palette while its diorama is open.
          Explicitly behind: it is positioned and the canvas container is not,
          so without -z-10 it would paint over the canvas entirely. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 transition-[background] duration-700"
        style={{
          background: active
            ? `radial-gradient(ellipse 80% 70% at 50% 40%, ${active.palette.skyFrom}, ${active.palette.skyTo})`
            : 'transparent',
        }}
      />

      <div
        ref={containerRef}
        role="img"
        aria-label={
          active
            ? `Isometric diorama of ${active.landmarkName} in ${active.place}. Drag to rotate.`
            : 'Interactive low-poly globe of Earth. Drag to rotate, or click a pin to visit a landmark.'
        }
        className={`h-full w-full transition-opacity duration-1000 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={tooltipRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -translate-y-full rounded-md border border-white/15 bg-background/85 px-2.5 py-1 font-mono text-xs whitespace-nowrap opacity-0 backdrop-blur-sm transition-opacity duration-150"
        style={{ marginTop: '-12px' }}
      />

      {/* Covers the scene swap. Duration must match FADE_MS. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-background transition-opacity duration-480 ${
          covered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Nothing else signals that the pins do anything. */}
      {!active && (
        <p className="pointer-events-none absolute right-8 bottom-8 text-right font-mono text-xs leading-relaxed text-muted sm:right-12 sm:bottom-12">
          drag to rotate
          <br />
          click a pin to explore
        </p>
      )}

      {active && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-8 sm:p-12">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] text-muted uppercase">
              {active.label} · {active.place}
            </p>
            <h2 className="mt-2 text-2xl font-light sm:text-3xl">{active.landmarkName}</h2>
          </div>

          <button
            type="button"
            onClick={close}
            className="pointer-events-auto rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm whitespace-nowrap backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          >
            ← Back to Earth
          </button>
        </div>
      )}
    </div>
  )
}
