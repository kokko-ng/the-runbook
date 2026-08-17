import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/play', name: 'play', component: () => import('@/views/PlayView.vue') },
    { path: '/account', name: 'account', component: () => import('@/views/AccountView.vue') },
    {
      path: '/reset/:uid/:token',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
    },
    { path: '/privacy', name: 'privacy', component: () => import('@/views/PrivacyView.vue') },
    { path: '/terms', name: 'terms', component: () => import('@/views/TermsView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
