import type { OrbitBridge } from './index'

declare global {
  interface Window {
    orbit: OrbitBridge
  }
}

export {}
