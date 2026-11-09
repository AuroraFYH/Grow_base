import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type KnowledgeOrbProps = {
  nodeCount?: number
  theme?: 'tech' | 'piggy'
}

/** A restrained 3D node field for the workspace header. It is decorative, but interactive. */
export default function KnowledgeOrb({ nodeCount = 7, theme = 'tech' }: KnowledgeOrbProps) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0, 4.4)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      mount.classList.add('knowledge-orb-unavailable')
      return () => mount.classList.remove('knowledge-orb-unavailable')
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const graph = new THREE.Group()
    scene.add(graph)

    const colors = theme === 'piggy'
      ? { shell: 0xf05a91, orbit: 0x63365f, point: 0xff9fbd, link: 0xb73c78 }
      : { shell: 0x6ee7f9, orbit: 0xa78bfa, point: 0x8be9fd, link: 0x6ee7f9 }

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, 2),
      new THREE.MeshBasicMaterial({ color: colors.shell, wireframe: true, transparent: true, opacity: 0.16 }),
    )
    graph.add(shell)

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.008, 8, 96),
      new THREE.MeshBasicMaterial({ color: colors.orbit, transparent: true, opacity: 0.55 }),
    )
    orbit.rotation.set(0.9, 0.2, 0.35)
    graph.add(orbit)

    const pointCount = Math.max(24, Math.min(64, nodeCount * 8))
    const pointPositions: number[] = []
    const pointGeometry = new THREE.BufferGeometry()
    for (let index = 0; index < pointCount; index += 1) {
      const y = 1 - (index / (pointCount - 1)) * 2
      const radius = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = Math.PI * (3 - Math.sqrt(5)) * index
      pointPositions.push(radius * Math.cos(theta) * 1.3, y * 1.3, radius * Math.sin(theta) * 1.3)
    }
    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3))
    const points = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({ color: colors.point, size: 0.045, transparent: true, opacity: 0.9, sizeAttenuation: true }),
    )
    graph.add(points)

    const links: number[] = []
    for (let index = 0; index < pointCount; index += 4) {
      const next = (index + Math.max(3, Math.floor(pointCount / 7))) % pointCount
      links.push(
        pointPositions[index * 3], pointPositions[index * 3 + 1], pointPositions[index * 3 + 2],
        pointPositions[next * 3], pointPositions[next * 3 + 1], pointPositions[next * 3 + 2],
      )
    }
    const linkGeometry = new THREE.BufferGeometry()
    linkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(links, 3))
    const linkLines = new THREE.LineSegments(
      linkGeometry,
      new THREE.LineBasicMaterial({ color: colors.link, transparent: true, opacity: 0.18 }),
    )
    graph.add(linkLines)

    let pointerX = 0
    let pointerY = 0
    const handlePointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect()
      pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    }
    mount.addEventListener('pointermove', handlePointerMove)

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    let frame = 0
    const animate = () => {
      graph.rotation.y += 0.0028
      graph.rotation.x += (pointerY * 0.12 - graph.rotation.x) * 0.02
      graph.rotation.z += (pointerX * 0.08 - graph.rotation.z) * 0.02
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mount.removeEventListener('pointermove', handlePointerMove)
      pointGeometry.dispose()
      linkGeometry.dispose()
      shell.geometry.dispose()
      orbit.geometry.dispose()
      shell.material.dispose()
      orbit.material.dispose()
      points.material.dispose()
      linkLines.material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [nodeCount, theme])

  return <div ref={mountRef} className="knowledge-orb" aria-hidden="true" />
}
