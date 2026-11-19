import type { RouteRecordRaw } from 'vue-router'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: '/gift-registry',
    name: 'gift-registry',
    component: () => import('./views/WorkspaceView.vue'),
    meta: { permission: 'gift-registry:query', title: '电子礼簿' },
  },
]

export const independentRoutes: RouteRecordRaw[] = [
  {
    path: '/gift-registry/display/:eventId',
    name: 'gift-display',
    component: () => import('./views/DisplayView.vue'),
    meta: { public: true, standalone: true },
  },
]
