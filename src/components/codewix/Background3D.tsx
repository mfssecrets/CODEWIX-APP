"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

function NeuralNodes() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 80;
  const connectionsRef = useRef<THREE.LineSegments>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    return pos;
  }, []);

  const basePositions = useMemo(() => new Float32Array(positions), [positions]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime();
    const dummy = new THREE.Object3D();
    const connectionPoints: number[] = [];

    for (let i = 0; i < count; i++) {
      const bx = basePositions[i * 3];
      const by = basePositions[i * 3 + 1];
      const bz = basePositions[i * 3 + 2];

      dummy.position.set(
        bx + Math.sin(time * 0.3 + i * 0.5) * 0.3,
        by + Math.cos(time * 0.2 + i * 0.3) * 0.25,
        bz + Math.sin(time * 0.25 + i * 0.4) * 0.2
      );
      dummy.scale.setScalar(0.04 + Math.sin(time * 0.5 + i) * 0.015);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      for (let j = i + 1; j < count; j++) {
        const bx2 = basePositions[j * 3];
        const by2 = basePositions[j * 3 + 1];
        const bz2 = basePositions[j * 3 + 2];
        const x1 = bx + Math.sin(time * 0.3 + i * 0.5) * 0.3;
        const y1 = by + Math.cos(time * 0.2 + i * 0.3) * 0.25;
        const z1 = bz + Math.sin(time * 0.25 + i * 0.4) * 0.2;
        const x2 = bx2 + Math.sin(time * 0.3 + j * 0.5) * 0.3;
        const y2 = by2 + Math.cos(time * 0.2 + j * 0.3) * 0.25;
        const z2 = bz2 + Math.sin(time * 0.25 + j * 0.4) * 0.2;
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
        if (dist < 3.5) {
          connectionPoints.push(x1, y1, z1, x2, y2, z2);
        }
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;

    if (connectionsRef.current && connectionPoints.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(connectionPoints, 3));
      connectionsRef.current.geometry.dispose();
      connectionsRef.current.geometry = geo;
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#A78BFA" transparent opacity={0.5} />
      </instancedMesh>
      <lineSegments ref={connectionsRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#C4B5FD" transparent opacity={0.12} />
      </lineSegments>
    </>
  );
}

function FloatingOrb({ position, color, scale, speed }: {
  position: [number, number, number];
  color: string;
  scale: number;
  speed: number;
}) {
  return (
    <Float speed={speed} rotationIntensity={0.3} floatIntensity={0.8}>
      <mesh position={position} scale={scale}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial
          color={color}
          transparent
          opacity={0.15}
          distort={0.4}
          speed={2}
          roughness={0.2}
        />
      </mesh>
    </Float>
  );
}

function ParticleField() {
  const ref = useRef<THREE.Points>(null);
  const count = 200;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const time = state.clock.getElapsedTime();
    const posArr = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      posArr[i * 3 + 1] += Math.sin(time * 0.3 + i) * 0.001;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
    ref.current.rotation.y = time * 0.015;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#DDD6FE"
        size={0.04}
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

export default function Background3D() {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "linear-gradient(145deg, #F8F9FC 0%, #EEF0F8 30%, #F0ECFA 60%, #F8F9FC 100%)" }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={0.4} color="#E9D5FF" />
        <NeuralNodes />
        <ParticleField />
        <FloatingOrb position={[-4, 2, -3]} color="#C4B5FD" scale={1.8} speed={1.2} />
        <FloatingOrb position={[5, -1.5, -4]} color="#DDD6FE" scale={1.4} speed={0.9} />
        <FloatingOrb position={[-2, -3, -2]} color="#EDE9FE" scale={2.2} speed={1.5} />
        <FloatingOrb position={[3, 3, -5]} color="#A78BFA" scale={1.1} speed={1.0} />
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/30 pointer-events-none" />
    </div>
  );
}